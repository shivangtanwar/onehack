import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { Action, DOMAIN_A, DOMAIN_B, lockTuple, makeEnvelope } from "./helpers";

describe("LocalMockMessenger adapter", function () {
  it("provides deterministic delivery while enforcing caller, replay, domain, hash, and nonce checks", async function () {
    const [owner, borrower, relayer, attacker] = await ethers.getSigners();
    const MockMessenger = await ethers.getContractFactory("LocalMockMessenger");
    const LoanToken = await ethers.getContractFactory("MockLoanToken");
    const Pool = await ethers.getContractFactory("LendingPool");

    const messenger: any = await MockMessenger.deploy(DOMAIN_B, relayer.address, owner.address);
    const loanToken: any = await LoanToken.deploy();
    const pool: any = await Pool.deploy(
      await loanToken.getAddress(),
      await messenger.getAddress(),
      DOMAIN_B,
      3_600,
      5_000,
      0,
      owner.address
    );
    await pool.setTrustedVault(DOMAIN_A, owner.address, true);
    await loanToken.mint(await pool.getAddress(), ethers.parseEther("1000"));

    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("No latest block");
    const createdAt = BigInt(block.timestamp);
    const amount = ethers.parseEther("100");
    const collateralId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint64", "address", "address", "address", "uint256", "uint64"],
        [DOMAIN_A, owner.address, attacker.address, borrower.address, amount, 1n]
      )
    );
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      [lockTuple],
      [
        {
          action: Action.LOCK,
          collateralId,
          borrower: borrower.address,
          collateralAsset: attacker.address,
          collateralAmount: amount,
          requestedPrincipal: ethers.parseEther("50"),
          lockNonce: 1n,
          createdAt,
          validUntil: createdAt + 600n
        }
      ]
    );
    const envelope = await makeEnvelope(
      DOMAIN_A,
      DOMAIN_B,
      owner.address,
      await pool.getAddress(),
      1n,
      payload,
      createdAt,
      createdAt + 600n
    );

    await expect(messenger.connect(attacker).deliver(envelope, payload, "0x"))
      .to.be.revertedWithCustomError(messenger, "UnauthorizedRelayer")
      .withArgs(attacker.address);
    await expect(messenger.connect(relayer).deliver(envelope, payload, "0x"))
      .to.emit(pool, "LoanIssued")
      .withArgs(
        1n,
        collateralId,
        borrower.address,
        ethers.parseEther("50"),
        anyValue,
        DOMAIN_A,
        owner.address
      );
    expect(await loanToken.balanceOf(borrower.address)).to.equal(ethers.parseEther("50"));
    await expect(
      messenger.connect(relayer).deliver(envelope, payload, "0x")
    ).to.be.revertedWithCustomError(messenger, "MessageAlreadyProcessed");
  });
});
