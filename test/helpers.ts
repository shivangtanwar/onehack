import { ethers } from "hardhat";
import type { Contract, ContractTransactionReceipt, Signer } from "ethers";

export const DOMAIN_A = 10_001n;
export const DOMAIN_B = 20_002n;

export const Action = {
  INVALID: 0n,
  LOCK: 1n,
  PLEDGE_CONFIRMED: 2n,
  RELEASE: 3n,
  LIQUIDATE: 4n
} as const;

export const CollateralState = {
  NONE: 0n,
  LOCKED: 1n,
  PLEDGED: 2n,
  RELEASED: 3n,
  LIQUIDATED: 4n
} as const;

export const LoanState = {
  NONE: 0n,
  ACTIVE: 1n,
  REPAID: 2n,
  DEFAULTED: 3n,
  LIQUIDATED: 4n
} as const;

export type Envelope = {
  sourceChainId: bigint;
  destinationChainId: bigint;
  sourceSender: string;
  destinationReceiver: string;
  nonce: bigint;
  payloadHash: string;
  createdAt: bigint;
  validUntil: bigint;
};

export const envelopeTypes = {
  Envelope: [
    { name: "sourceChainId", type: "uint64" },
    { name: "destinationChainId", type: "uint64" },
    { name: "sourceSender", type: "address" },
    { name: "destinationReceiver", type: "address" },
    { name: "nonce", type: "uint64" },
    { name: "payloadHash", type: "bytes32" },
    { name: "createdAt", type: "uint64" },
    { name: "validUntil", type: "uint64" }
  ]
};

export const lockTuple =
  "tuple(uint8 action,bytes32 collateralId,address borrower,address collateralAsset,uint256 collateralAmount,uint256 requestedPrincipal,uint64 lockNonce,uint64 createdAt,uint64 validUntil)";

export const outcomeTuple =
  "tuple(uint8 action,bytes32 collateralId,uint256 loanId,address borrower,address collateralAsset,uint256 collateralAmount,uint64 lockNonce)";

export type Fixture = Awaited<ReturnType<typeof deployFixture>>;

export async function deployFixture(options?: { annualInterestBps?: number; duration?: number }) {
  const [owner, borrower, attestor, submitter, treasury, attacker] = await ethers.getSigners();
  const duration = options?.duration ?? 3_600;
  const annualInterestBps = options?.annualInterestBps ?? 0;

  const CollateralToken = await ethers.getContractFactory("MockCollateralToken");
  const LoanToken = await ethers.getContractFactory("MockLoanToken");
  const Messenger = await ethers.getContractFactory("SignedRelayerMessenger");
  const Vault = await ethers.getContractFactory("CollateralVault");
  const Pool = await ethers.getContractFactory("LendingPool");

  const collateralToken: any = await CollateralToken.deploy();
  const loanToken: any = await LoanToken.deploy();
  const messengerA: any = await Messenger.deploy(DOMAIN_A, attestor.address, owner.address);
  const messengerB: any = await Messenger.deploy(DOMAIN_B, attestor.address, owner.address);
  const vault: any = await Vault.deploy(
    await collateralToken.getAddress(),
    await messengerA.getAddress(),
    DOMAIN_A,
    treasury.address,
    owner.address
  );
  const pool: any = await Pool.deploy(
    await loanToken.getAddress(),
    await messengerB.getAddress(),
    DOMAIN_B,
    duration,
    5_000,
    annualInterestBps,
    owner.address
  );

  await vault.configurePeer(DOMAIN_B, await pool.getAddress());
  await pool.setTrustedVault(DOMAIN_A, await vault.getAddress(), true);

  const collateralFunding = ethers.parseEther("1000");
  const poolLiquidity = ethers.parseEther("1000000");
  await collateralToken.mint(borrower.address, collateralFunding);
  await collateralToken.connect(borrower).approve(await vault.getAddress(), ethers.MaxUint256);
  await loanToken.mint(await pool.getAddress(), poolLiquidity);

  return {
    owner,
    borrower,
    attestor,
    submitter,
    treasury,
    attacker,
    collateralToken,
    loanToken,
    messengerA,
    messengerB,
    vault,
    pool,
    duration
  };
}

export function findEvent(
  receipt: ContractTransactionReceipt,
  contract: Contract,
  eventName: string
): any {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args;
    } catch {
      // This log belongs to another contract in the same transaction.
    }
  }
  throw new Error(`Missing ${eventName} event`);
}

export async function signEnvelope(
  signer: Signer,
  messenger: Contract,
  envelope: Envelope
): Promise<string> {
  const network = await ethers.provider.getNetwork();
  return signer.signTypedData(
    {
      name: "DatabaesCrossChainMessenger",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await messenger.getAddress()
    },
    envelopeTypes,
    envelope
  );
}

export async function lockCollateral(
  fixture: Fixture,
  amount = ethers.parseEther("100"),
  principal = ethers.parseEther("50"),
  lifetime = 1_800n
) {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("No latest block");
  const validUntil = BigInt(block.timestamp) + lifetime;
  const nextNonce = (await fixture.vault.ownerLockNonce(fixture.borrower.address)) + 1n;
  const collateralId = await fixture.vault.computeCollateralId(
    fixture.borrower.address,
    amount,
    nextNonce
  );
  const tx = await fixture.vault
    .connect(fixture.borrower)
    .lockCollateral(amount, principal, validUntil);
  const receipt = (await tx.wait()) as ContractTransactionReceipt;
  const outbound = findEvent(receipt, fixture.vault, "OutboundMessagePrepared");
  return {
    collateralId,
    amount,
    principal,
    payload: outbound.payload as string,
    nonce: outbound.nonce as bigint,
    createdAt: outbound.createdAt as bigint,
    validUntil: outbound.validUntil as bigint
  };
}

export async function makeEnvelope(
  sourceChainId: bigint,
  destinationChainId: bigint,
  sourceSender: string,
  destinationReceiver: string,
  nonce: bigint,
  payload: string,
  createdAt: bigint,
  validUntil: bigint
): Promise<Envelope> {
  return {
    sourceChainId,
    destinationChainId,
    sourceSender,
    destinationReceiver,
    nonce,
    payloadHash: ethers.keccak256(payload),
    createdAt,
    validUntil
  };
}

export async function deliverLock(
  fixture: Fixture,
  lock: Awaited<ReturnType<typeof lockCollateral>>
) {
  const envelope = await makeEnvelope(
    DOMAIN_A,
    DOMAIN_B,
    await fixture.vault.getAddress(),
    await fixture.pool.getAddress(),
    lock.nonce,
    lock.payload,
    lock.createdAt,
    lock.validUntil
  );
  const signature = await signEnvelope(fixture.attestor, fixture.messengerB, envelope);
  const tx = await fixture.messengerB
    .connect(fixture.submitter)
    .deliver(envelope, lock.payload, signature);
  const receipt = (await tx.wait()) as ContractTransactionReceipt;
  const outcome = findEvent(receipt, fixture.pool, "OutboundMessagePrepared");
  const loanId = await fixture.pool.loanByCollateral(lock.collateralId);
  return { envelope, signature, receipt, outcome, loanId };
}

export async function deliverOutcome(fixture: Fixture, outcome: any) {
  const envelope = await makeEnvelope(
    DOMAIN_B,
    DOMAIN_A,
    await fixture.pool.getAddress(),
    await fixture.vault.getAddress(),
    outcome.nonce as bigint,
    outcome.payload as string,
    outcome.createdAt as bigint,
    outcome.validUntil as bigint
  );
  const signature = await signEnvelope(fixture.attestor, fixture.messengerA, envelope);
  const tx = await fixture.messengerA
    .connect(fixture.submitter)
    .deliver(envelope, outcome.payload, signature);
  const receipt = (await tx.wait()) as ContractTransactionReceipt;
  return { envelope, signature, receipt };
}

export async function issueAndPledge(fixture: Fixture) {
  const lock = await lockCollateral(fixture);
  const issued = await deliverLock(fixture, lock);
  await deliverOutcome(fixture, issued.outcome);
  return { lock, ...issued };
}
