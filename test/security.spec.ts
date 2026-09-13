import { expect } from "chai";
import { ethers } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";
import {
  Action,
  CollateralState,
  DOMAIN_A,
  DOMAIN_B,
  LoanState,
  deployFixture,
  deliverLock,
  deliverOutcome,
  findEvent,
  issueAndPledge,
  lockCollateral,
  lockTuple,
  makeEnvelope,
  signEnvelope
} from "./helpers";

describe("Replay, freshness, routing, and state security", function () {
  it("rejects exact proof replay at the messenger", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const issued = await deliverLock(fixture, lock);
    const messageId = await fixture.messengerB.getMessageId(issued.envelope);

    await expect(fixture.messengerB.deliver(issued.envelope, lock.payload, issued.signature))
      .to.be.revertedWithCustomError(fixture.messengerB, "MessageAlreadyProcessed")
      .withArgs(messageId);
    expect(await fixture.pool.loanCount()).to.equal(1n);
  });

  it("rejects a new, validly signed envelope for already-used collateral at the pool", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const issued = await deliverLock(fixture, lock);
    const now = await currentTime();
    const secondEnvelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      2n,
      lock.payload,
      now,
      now + 600n
    );
    const secondSignature = await signEnvelope(
      fixture.attestor,
      fixture.messengerB,
      secondEnvelope
    );

    await expect(fixture.messengerB.deliver(secondEnvelope, lock.payload, secondSignature))
      .to.be.revertedWithCustomError(fixture.pool, "CollateralAlreadyUsed")
      .withArgs(lock.collateralId, issued.loanId);
    expect(await fixture.pool.loanCount()).to.equal(1n);
    expect(
      await fixture.messengerB.latestNonce(DOMAIN_A, await fixture.vault.getAddress())
    ).to.equal(1n);
  });

  it("rejects an expired outer attestation on-chain", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const now = await currentTime();
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      now - 100n,
      now - 1n
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);

    await expect(
      fixture.messengerB.deliver(envelope, lock.payload, signature)
    ).to.be.revertedWithCustomError(fixture.messengerB, "MessageExpired");
  });

  it("rejects an expired embedded lock even inside a fresh signed envelope", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture, undefined, undefined, 60n);
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);
    const now = await currentTime();
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      now,
      now + 600n
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);

    await expect(
      fixture.messengerB.deliver(envelope, lock.payload, signature)
    ).to.be.revertedWithCustomError(fixture.pool, "LockMessageExpired");
  });

  it("rejects future and malformed validity windows", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const now = await currentTime();
    const future = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      now + 600n,
      now + 1_200n
    );
    const futureSignature = await signEnvelope(fixture.attestor, fixture.messengerB, future);
    await expect(
      fixture.messengerB.deliver(future, lock.payload, futureSignature)
    ).to.be.revertedWithCustomError(fixture.messengerB, "MessageNotYetValid");

    const malformed = { ...future, createdAt: now, validUntil: now };
    const malformedSignature = await signEnvelope(fixture.attestor, fixture.messengerB, malformed);
    await expect(fixture.messengerB.deliver(malformed, lock.payload, malformedSignature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidValidityWindow")
      .withArgs(now, now);
  });

  it("requires the exact next nonce and rejects skipped state", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      2n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);

    await expect(fixture.messengerB.deliver(envelope, lock.payload, signature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidNonce")
      .withArgs(2n, 1n);
  });

  it("rejects a valid signature claiming the wrong source chain", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const envelope = await makeEnvelope(
      99_999n,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);

    await expect(fixture.messengerB.deliver(envelope, lock.payload, signature))
      .to.be.revertedWithCustomError(fixture.pool, "UnauthorizedSource")
      .withArgs(99_999n, await fixture.vault.getAddress());
  });

  it("rejects a valid signature claiming an unauthorized source contract", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      fixture.attacker.address,
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);

    await expect(fixture.messengerB.deliver(envelope, lock.payload, signature))
      .to.be.revertedWithCustomError(fixture.pool, "UnauthorizedSource")
      .withArgs(DOMAIN_A, fixture.attacker.address);
  });

  it("binds proof to destination chain, destination contract, and messenger", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const correct = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, correct);

    const wrongChain = { ...correct, destinationChainId: DOMAIN_A };
    await expect(fixture.messengerB.deliver(wrongChain, lock.payload, signature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidDestinationChain")
      .withArgs(DOMAIN_A, DOMAIN_B);

    const wrongContract = {
      ...correct,
      destinationReceiver: await fixture.vault.getAddress()
    };
    await expect(fixture.messengerB.deliver(wrongContract, lock.payload, signature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidSignature")
      .withArgs(fixture.attestor.address);

    const wrongMessengerSignature = await signEnvelope(
      fixture.attestor,
      fixture.messengerA,
      correct
    );
    await expect(fixture.messengerB.deliver(correct, lock.payload, wrongMessengerSignature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidSignature")
      .withArgs(fixture.attestor.address);
  });

  it("rejects payload alteration and signatures from unauthorized keys", async function () {
    const fixture = await deployFixture();
    const lock = await lockCollateral(fixture);
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);
    const alteredPayload = `${lock.payload.slice(0, -2)}01`;
    await expect(
      fixture.messengerB.deliver(envelope, alteredPayload, signature)
    ).to.be.revertedWithCustomError(fixture.messengerB, "InvalidPayloadHash");

    const attackerSignature = await signEnvelope(fixture.attacker, fixture.messengerB, envelope);
    await expect(fixture.messengerB.deliver(envelope, lock.payload, attackerSignature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidSignature")
      .withArgs(fixture.attestor.address);
  });

  it("recomputes and rejects a forged collateral identifier", async function () {
    const fixture = await deployFixture();
    const now = await currentTime();
    const forgedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      [lockTuple],
      [
        {
          action: Action.LOCK,
          collateralId: ethers.keccak256(ethers.toUtf8Bytes("forged")),
          borrower: fixture.borrower.address,
          collateralAsset: await fixture.collateralToken.getAddress(),
          collateralAmount: ethers.parseEther("100"),
          requestedPrincipal: ethers.parseEther("50"),
          lockNonce: 1n,
          createdAt: now,
          validUntil: now + 600n
        }
      ]
    );
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      forgedPayload,
      now,
      now + 600n
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);
    await expect(
      fixture.messengerB.deliver(envelope, forgedPayload, signature)
    ).to.be.revertedWithCustomError(fixture.pool, "CollateralIdMismatch");
  });

  it("enforces LTV and amount/expiry boundaries on-chain", async function () {
    const fixture = await deployFixture();
    const now = await currentTime();
    await expect(
      fixture.vault.connect(fixture.borrower).lockCollateral(0, 1, now + 600n)
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidAmount");
    await expect(
      fixture.vault.connect(fixture.borrower).lockCollateral(1, 0, now + 600n)
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidAmount");
    await expect(
      fixture.vault.connect(fixture.borrower).lockCollateral(1, 1, now)
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidProofExpiry");

    const lock = await lockCollateral(
      fixture,
      ethers.parseEther("100"),
      ethers.parseEther("50.000000000000000001")
    );
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);
    await expect(fixture.messengerB.deliver(envelope, lock.payload, signature))
      .to.be.revertedWithCustomError(fixture.pool, "LtvExceeded")
      .withArgs(lock.principal, ethers.parseEther("50"));
  });

  it("blocks direct receiver calls and premature recovery transitions", async function () {
    const fixture = await deployFixture({ duration: 60 });
    const lock = await lockCollateral(fixture);

    await expect(
      fixture.pool
        .connect(fixture.attacker)
        .receiveMessage(
          ethers.ZeroHash,
          DOMAIN_A,
          await fixture.vault.getAddress(),
          1,
          lock.payload
        )
    )
      .to.be.revertedWithCustomError(fixture.pool, "UnauthorizedMessenger")
      .withArgs(fixture.attacker.address);
    await expect(
      fixture.vault
        .connect(fixture.attacker)
        .receiveMessage(ethers.ZeroHash, DOMAIN_B, await fixture.pool.getAddress(), 1, "0x")
    )
      .to.be.revertedWithCustomError(fixture.vault, "UnauthorizedMessenger")
      .withArgs(fixture.attacker.address);

    const issued = await deliverLock(fixture, lock);
    await expect(fixture.pool.liquidate(issued.loanId))
      .to.be.revertedWithCustomError(fixture.pool, "InvalidLoanState")
      .withArgs(issued.loanId, LoanState.ACTIVE, LoanState.DEFAULTED);
  });

  it("makes duplicate terminal delivery harmless at both replay layers", async function () {
    const fixture = await deployFixture();
    const issued = await issueAndPledge(fixture);
    const due = await fixture.pool.amountDue(issued.loanId);
    await fixture.loanToken.connect(fixture.borrower).approve(await fixture.pool.getAddress(), due);
    const repayTx = await fixture.pool.connect(fixture.borrower).repay(issued.loanId);
    const repayReceipt = (await repayTx.wait()) as ContractTransactionReceipt;
    const release = findEvent(repayReceipt, fixture.pool, "OutboundMessagePrepared");
    const delivered = await deliverOutcome(fixture, release);
    const borrowerBalance = await fixture.collateralToken.balanceOf(fixture.borrower.address);

    await expect(
      fixture.messengerA.deliver(delivered.envelope, release.payload, delivered.signature)
    ).to.be.revertedWithCustomError(fixture.messengerA, "MessageAlreadyProcessed");
    expect(await fixture.collateralToken.balanceOf(fixture.borrower.address)).to.equal(
      borrowerBalance
    );

    const now = await currentTime();
    const duplicateEnvelope = await makeEnvelope(
      DOMAIN_B,
      DOMAIN_A,
      await fixture.pool.getAddress(),
      await fixture.vault.getAddress(),
      3n,
      release.payload,
      now,
      now + 600n
    );
    const duplicateSignature = await signEnvelope(
      fixture.attestor,
      fixture.messengerA,
      duplicateEnvelope
    );
    await expect(
      fixture.messengerA.deliver(duplicateEnvelope, release.payload, duplicateSignature)
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidCollateralState");
    expect((await fixture.vault.collaterals(issued.lock.collateralId)).state).to.equal(
      CollateralState.RELEASED
    );
    expect(await fixture.collateralToken.balanceOf(fixture.borrower.address)).to.equal(
      borrowerBalance
    );
  });

  it("restricts signer rotation to the owner and applies it immediately", async function () {
    const fixture = await deployFixture();
    await expect(
      fixture.messengerB.connect(fixture.attacker).setTrustedSigner(fixture.attacker.address)
    ).to.be.revertedWithCustomError(fixture.messengerB, "OwnableUnauthorizedAccount");

    await expect(fixture.messengerB.setTrustedSigner(fixture.attacker.address))
      .to.emit(fixture.messengerB, "TrustedSignerUpdated")
      .withArgs(fixture.attestor.address, fixture.attacker.address);

    const lock = await lockCollateral(fixture);
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      await fixture.vault.getAddress(),
      await fixture.pool.getAddress(),
      1n,
      lock.payload,
      lock.createdAt,
      lock.validUntil
    );
    const oldSignature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);
    await expect(fixture.messengerB.deliver(envelope, lock.payload, oldSignature))
      .to.be.revertedWithCustomError(fixture.messengerB, "InvalidSignature")
      .withArgs(fixture.attacker.address);
  });
});

async function currentTime(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("No latest block");
  return BigInt(block.timestamp);
}
