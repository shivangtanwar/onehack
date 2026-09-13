import { expect } from "chai";
import { ethers } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";
import {
  CollateralState,
  LoanState,
  deployFixture,
  deliverLock,
  deliverOutcome,
  findEvent,
  issueAndPledge,
  lockCollateral
} from "./helpers";

describe("Databaes cross-chain lending lifecycle", function () {
  it("locks collateral on A, issues liquidity on B, and keeps collateral in the vault", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);

    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(
      lock.amount
    );
    expect((await fixture.vault.collaterals(lock.collateralId)).state).to.equal(
      CollateralState.LOCKED
    );

    const issued = await deliverLock(fixture, lock);

    expect(await fixture.loanToken.balanceOf(fixture.borrower.address)).to.equal(lock.principal);
    expect(await fixture.pool.collateralUsed(lock.collateralId)).to.equal(true);
    expect(await fixture.pool.loanByCollateral(lock.collateralId)).to.equal(issued.loanId);
    expect((await fixture.pool.loans(issued.loanId)).state).to.equal(LoanState.ACTIVE);
    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(
      lock.amount
    );

    await deliverOutcome(fixture, issued.outcome);
    const collateral = await fixture.vault.collaterals(lock.collateralId);
    expect(collateral.state).to.equal(CollateralState.PLEDGED);
    expect(collateral.loanId).to.equal(issued.loanId);
    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(
      lock.amount
    );
  });

  it("repays on B and releases the exact collateral to its original owner on A", async function () {
    const fixture = await deployFixture();
    const issued = await issueAndPledge(fixture);
    const borrowerStart = await fixture.collateralToken.balanceOf(fixture.borrower.address);
    const due = await fixture.pool.amountDue(issued.loanId);

    await fixture.loanToken.connect(fixture.borrower).approve(await fixture.pool.getAddress(), due);
    const repayTx = await fixture.pool.connect(fixture.borrower).repay(issued.loanId);
    const repayReceipt = (await repayTx.wait()) as ContractTransactionReceipt;
    const release = findEvent(repayReceipt, fixture.pool, "OutboundMessagePrepared");

    expect((await fixture.pool.loans(issued.loanId)).state).to.equal(LoanState.REPAID);
    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(
      issued.lock.amount
    );

    await deliverOutcome(fixture, release);

    expect((await fixture.vault.collaterals(issued.lock.collateralId)).state).to.equal(
      CollateralState.RELEASED
    );
    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(0n);
    expect(await fixture.collateralToken.balanceOf(fixture.borrower.address)).to.equal(
      borrowerStart + issued.lock.amount
    );
  });

  it("marks an overdue loan defaulted, liquidates on B, and recovers collateral on A", async function () {
    const fixture = await deployFixture({ duration: 3_600 });
    const issued = await issueAndPledge(fixture);

    await expect(fixture.pool.markDefaulted(issued.loanId))
      .to.be.revertedWithCustomError(fixture.pool, "LoanNotOverdue")
      .withArgs(
        issued.loanId,
        (await fixture.pool.loans(issued.loanId)).deadline,
        await currentTime()
      );

    await ethers.provider.send("evm_increaseTime", [fixture.duration + 1]);
    await ethers.provider.send("evm_mine", []);
    await expect(fixture.pool.connect(fixture.attacker).markDefaulted(issued.loanId))
      .to.emit(fixture.pool, "LoanDefaulted")
      .withArgs(issued.loanId, issued.lock.collateralId);
    expect((await fixture.pool.loans(issued.loanId)).state).to.equal(LoanState.DEFAULTED);

    const liquidateTx = await fixture.pool.connect(fixture.attacker).liquidate(issued.loanId);
    const liquidateReceipt = (await liquidateTx.wait()) as ContractTransactionReceipt;
    const recovery = findEvent(liquidateReceipt, fixture.pool, "OutboundMessagePrepared");
    expect((await fixture.pool.loans(issued.loanId)).state).to.equal(LoanState.LIQUIDATED);

    const treasuryStart = await fixture.collateralToken.balanceOf(fixture.treasury.address);
    await deliverOutcome(fixture, recovery);

    expect((await fixture.vault.collaterals(issued.lock.collateralId)).state).to.equal(
      CollateralState.LIQUIDATED
    );
    expect(await fixture.collateralToken.balanceOf(fixture.treasury.address)).to.equal(
      treasuryStart + issued.lock.amount
    );
    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(0n);
  });

  it("accrues configured linear interest without changing collateral custody", async function () {
    const fixture = await deployFixture({ annualInterestBps: 1_000, duration: 31_536_000 });
    const issued = await issueAndPledge(fixture);

    await ethers.provider.send("evm_increaseTime", [31_536_000 / 2]);
    await ethers.provider.send("evm_mine", []);
    const due = await fixture.pool.amountDue(issued.loanId);

    expect(due).to.be.closeTo((issued.lock.principal * 105n) / 100n, 10n ** 13n);
    expect(await fixture.collateralToken.balanceOf(await fixture.vault.getAddress())).to.equal(
      issued.lock.amount
    );
  });

  it("keeps repayment and liquidation mutually exclusive", async function () {
    const fixture = await deployFixture({ duration: 60 });
    const issued = await issueAndPledge(fixture);
    const due = await fixture.pool.amountDue(issued.loanId);
    await fixture.loanToken.connect(fixture.borrower).approve(await fixture.pool.getAddress(), due);
    await fixture.pool.connect(fixture.borrower).repay(issued.loanId);

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);
    await expect(fixture.pool.markDefaulted(issued.loanId))
      .to.be.revertedWithCustomError(fixture.pool, "InvalidLoanState")
      .withArgs(issued.loanId, LoanState.REPAID, LoanState.ACTIVE);
    await expect(fixture.pool.liquidate(issued.loanId))
      .to.be.revertedWithCustomError(fixture.pool, "InvalidLoanState")
      .withArgs(issued.loanId, LoanState.REPAID, LoanState.DEFAULTED);
  });
});

async function currentTime(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("No latest block");
  return BigInt(block.timestamp);
}
