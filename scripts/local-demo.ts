import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import type { ContractTransactionReceipt, Interface, JsonRpcSigner } from "ethers";

type Deployment = {
  chainId: number;
  contracts: Record<string, { address: string }>;
};

type Envelope = {
  sourceChainId: bigint;
  destinationChainId: bigint;
  sourceSender: string;
  destinationReceiver: string;
  nonce: bigint;
  payloadHash: string;
  createdAt: bigint;
  validUntil: bigint;
};

const envelopeTypes = {
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

const providerA = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const providerB = new ethers.JsonRpcProvider("http://127.0.0.1:9545");

async function main() {
  const chainA = readDeployment("local-a.json");
  const chainB = readDeployment("local-b.json");
  const [ownerA, borrowerA, , submitterA, treasuryA] = await signers(providerA);
  const [ownerB, borrowerB, , submitterB] = await signers(providerB);
  if ((await ownerA.getAddress()) !== (await ownerB.getAddress())) {
    throw new Error("Local nodes must expose the same deterministic Hardhat accounts");
  }

  const collateralArtifact = artifact(
    "contracts/mocks/MockCollateralToken.sol",
    "MockCollateralToken"
  );
  const loanArtifact = artifact("contracts/mocks/MockLoanToken.sol", "MockLoanToken");
  const vaultArtifact = artifact("contracts/CollateralVault.sol", "CollateralVault");
  const poolArtifact = artifact("contracts/LendingPool.sol", "LendingPool");
  const messengerArtifact = artifact(
    "contracts/messaging/SignedRelayerMessenger.sol",
    "SignedRelayerMessenger"
  );

  const collateral: any = new ethers.Contract(
    chainA.contracts.collateralToken.address,
    collateralArtifact.abi,
    borrowerA
  );
  const vault: any = new ethers.Contract(
    chainA.contracts.vault.address,
    vaultArtifact.abi,
    borrowerA
  );
  const messengerA: any = new ethers.Contract(
    chainA.contracts.messenger.address,
    messengerArtifact.abi,
    submitterA
  );
  const loanToken: any = new ethers.Contract(
    chainB.contracts.loanToken.address,
    loanArtifact.abi,
    borrowerB
  );
  const pool: any = new ethers.Contract(chainB.contracts.pool.address, poolArtifact.abi, borrowerB);
  const messengerB: any = new ethers.Contract(
    chainB.contracts.messenger.address,
    messengerArtifact.abi,
    submitterB
  );

  const borrower = await borrowerA.getAddress();
  const treasury = await treasuryA.getAddress();
  const amount = ethers.parseEther("100");
  const principal = ethers.parseEther("50");
  heading("1. LOCK COLLATERAL ON CHAIN A");
  console.log(`Borrower dCOL before: ${ethers.formatEther(await collateral.balanceOf(borrower))}`);
  console.log(
    `Vault dCOL before:    ${ethers.formatEther(await collateral.balanceOf(vault.target))}`
  );
  await (await collateral.approve(vault.target, amount)).wait();
  const aBlock = await providerA.getBlock("latest");
  if (!aBlock) throw new Error("Missing Chain-A head");
  const lockTx = await vault.lockCollateral(amount, principal, BigInt(aBlock.timestamp) + 1_800n);
  const lockReceipt = await lockTx.wait();
  const lockEvent = findEvent(lockReceipt, vault.interface, "CollateralLocked");
  const lockPrepared = findEvent(lockReceipt, vault.interface, "OutboundMessagePrepared");
  const collateralId = lockEvent.collateralId as string;
  console.log(`Lock transaction: ${lockTx.hash}`);
  console.log(`Collateral ID:     ${collateralId}`);
  console.log(`Vault dCOL locked: ${ethers.formatEther(await collateral.balanceOf(vault.target))}`);

  heading("2. AUTHENTICATE AND ISSUE THE LOAN ON CHAIN B");
  const lockEnvelope = envelopeFromEvent(
    BigInt(chainA.chainId),
    vault.target as string,
    lockPrepared
  );
  const lockSignature = await sign(ownerB, providerB, messengerB.target as string, lockEnvelope);
  writeEvidence(lockEnvelope, lockPrepared.payload, lockSignature);
  console.log(`Typed payload hash: ${lockEnvelope.payloadHash}`);
  console.log(`Attestor:           ${await ownerB.getAddress()}`);
  console.log("UI evidence:        frontend/public/local-demo-evidence.json");
  const issueTx = await messengerB.deliver(lockEnvelope, lockPrepared.payload, lockSignature);
  const issueReceipt = await issueTx.wait();
  const issued = findEvent(issueReceipt, pool.interface, "LoanIssued");
  const pledgePrepared = findEvent(issueReceipt, pool.interface, "OutboundMessagePrepared");
  console.log(`Delivery transaction: ${issueTx.hash}`);
  console.log(`Loan ID:              ${issued.loanId}`);
  console.log(`Borrower dUSD:         ${ethers.formatEther(await loanToken.balanceOf(borrower))}`);
  console.log(
    `Vault still holds:     ${ethers.formatEther(await collateral.balanceOf(vault.target))} dCOL`
  );

  const pledgeEnvelope = envelopeFromEvent(
    BigInt(chainB.chainId),
    pool.target as string,
    pledgePrepared
  );
  const pledgeSignature = await sign(
    ownerA,
    providerA,
    messengerA.target as string,
    pledgeEnvelope
  );
  const pledgeTx = await messengerA.deliver(
    pledgeEnvelope,
    pledgePrepared.payload,
    pledgeSignature
  );
  await pledgeTx.wait();
  console.log(`Pledge acknowledgement: ${pledgeTx.hash}`);
  console.log(
    `Chain-A state:           PLEDGED (${(await vault.collaterals(collateralId)).state})`
  );

  heading("3. VISIBLE ATTACK REJECTIONS");
  await showRejected(
    "Exact proof replay",
    messengerB,
    lockEnvelope,
    lockPrepared.payload,
    lockSignature,
    [messengerB.interface, pool.interface]
  );

  const bBlock = await providerB.getBlock("latest");
  if (!bBlock) throw new Error("Missing Chain-B head");
  const doubleEnvelope = {
    ...lockEnvelope,
    nonce: 2n,
    createdAt: BigInt(bBlock.timestamp),
    validUntil: BigInt(bBlock.timestamp) + 600n
  };
  const doubleSignature = await sign(
    ownerB,
    providerB,
    messengerB.target as string,
    doubleEnvelope
  );
  await showRejected(
    "Second signed pledge for same collateral",
    messengerB,
    doubleEnvelope,
    lockPrepared.payload,
    doubleSignature,
    [messengerB.interface, pool.interface]
  );

  const staleEnvelope = {
    ...lockEnvelope,
    nonce: 2n,
    createdAt: BigInt(bBlock.timestamp) - 100n,
    validUntil: BigInt(bBlock.timestamp) - 1n
  };
  const staleSignature = await sign(ownerB, providerB, messengerB.target as string, staleEnvelope);
  await showRejected(
    "Expired proof",
    messengerB,
    staleEnvelope,
    lockPrepared.payload,
    staleSignature,
    [messengerB.interface]
  );

  heading("4. DEFAULT, LIQUIDATE, AND RECOVER ON CHAIN A");
  await providerB.send("evm_increaseTime", [301]);
  await providerB.send("evm_mine", []);
  // Keep independent local chain clocks aligned, as public EVM chains advance in wall-clock time.
  await providerA.send("evm_increaseTime", [301]);
  await providerA.send("evm_mine", []);
  const defaultTx = await pool.connect(submitterB).markDefaulted(issued.loanId);
  await defaultTx.wait();
  const liquidationTx = await pool.connect(submitterB).liquidate(issued.loanId);
  const liquidationReceipt = await liquidationTx.wait();
  const recoveryPrepared = findEvent(liquidationReceipt, pool.interface, "OutboundMessagePrepared");
  console.log(`Default transaction:     ${defaultTx.hash}`);
  console.log(`Liquidation transaction: ${liquidationTx.hash}`);

  const recoveryEnvelope = envelopeFromEvent(
    BigInt(chainB.chainId),
    pool.target as string,
    recoveryPrepared
  );
  const recoverySignature = await sign(
    ownerA,
    providerA,
    messengerA.target as string,
    recoveryEnvelope
  );
  const treasuryBefore = await collateral.balanceOf(treasury);
  const recoveryTx = await messengerA.deliver(
    recoveryEnvelope,
    recoveryPrepared.payload,
    recoverySignature
  );
  await recoveryTx.wait();
  console.log(`Recovery transaction: ${recoveryTx.hash}`);
  console.log(
    `Treasury dCOL delta:   ${ethers.formatEther((await collateral.balanceOf(treasury)) - treasuryBefore)}`
  );
  console.log(
    `Vault dCOL after:      ${ethers.formatEther(await collateral.balanceOf(vault.target))}`
  );
  console.log(
    `Final collateral state: LIQUIDATED (${(await vault.collaterals(collateralId)).state})`
  );

  heading("DEMO COMPLETE");
  console.log("The original dCOL stayed in the Chain-A vault until authenticated recovery.");
  console.log("No dCOL was bridged, wrapped, or minted on Chain B.");
}

async function sign(
  signer: JsonRpcSigner,
  provider: ethers.JsonRpcProvider,
  messenger: string,
  envelope: Envelope
) {
  const network = await provider.getNetwork();
  return signer.signTypedData(
    {
      name: "DatabaesCrossChainMessenger",
      version: "1",
      chainId: network.chainId,
      verifyingContract: messenger
    },
    envelopeTypes,
    envelope
  );
}

function envelopeFromEvent(sourceChainId: bigint, sourceSender: string, event: any): Envelope {
  return {
    sourceChainId,
    destinationChainId: BigInt(event.destinationChainId),
    sourceSender,
    destinationReceiver: event.destinationReceiver as string,
    nonce: BigInt(event.nonce),
    payloadHash: ethers.keccak256(event.payload),
    createdAt: BigInt(event.createdAt),
    validUntil: BigInt(event.validUntil)
  };
}

async function showRejected(
  label: string,
  messenger: ethers.Contract,
  envelope: Envelope,
  payload: string,
  signature: string,
  interfaces: Interface[]
) {
  let decoded = "unknown revert";
  try {
    await messenger.deliver.staticCall(envelope, payload, signature);
    decoded = "UNEXPECTED SUCCESS";
  } catch (error) {
    decoded = decodeError(error, interfaces);
  }

  let transactionEvidence = "RPC rejected before returning a hash";
  try {
    const tx = await messenger.deliver(envelope, payload, signature, { gasLimit: 3_000_000 });
    transactionEvidence = tx.hash;
    await tx.wait();
    decoded = "UNEXPECTED SUCCESS";
  } catch (error: any) {
    transactionEvidence =
      error?.receipt?.hash ?? error?.transactionHash ?? error?.data?.txHash ?? transactionEvidence;
  }
  console.log(`REJECTED — ${label}`);
  console.log(`  on-chain error: ${decoded}`);
  console.log(`  transaction:    ${transactionEvidence}`);
}

function decodeError(error: any, interfaces: Interface[]): string {
  const data = error?.data?.data ?? error?.data ?? error?.error?.data;
  if (typeof data !== "string") return error?.shortMessage ?? error?.message ?? "unknown revert";
  for (const contractInterface of interfaces) {
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed) return parsed.name;
    } catch {
      // Try the next contract ABI.
    }
  }
  return error?.shortMessage ?? "unrecognized custom error";
}

function artifact(source: string, contract: string): { abi: any[] } {
  const target = path.join(process.cwd(), "artifacts", source, `${contract}.json`);
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function readDeployment(filename: string): Deployment {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "deployments", filename), "utf8")
  ) as Deployment;
}

function writeEvidence(envelope: Envelope, payload: string, signature: string) {
  const target = path.join(process.cwd(), "frontend", "public", "local-demo-evidence.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const serializableEnvelope = Object.fromEntries(
    Object.entries(envelope).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value
    ])
  );
  fs.writeFileSync(
    target,
    `${JSON.stringify({ envelope: serializableEnvelope, payload, signature }, null, 2)}\n`
  );
}

async function signers(provider: ethers.JsonRpcProvider): Promise<JsonRpcSigner[]> {
  return Promise.all([0, 1, 2, 3, 4].map((index) => provider.getSigner(index)));
}

function findEvent(
  receipt: ContractTransactionReceipt,
  contractInterface: Interface,
  eventName: string
): any {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args;
    } catch {
      // Another contract emitted this log.
    }
  }
  throw new Error(`Missing ${eventName}`);
}

function heading(value: string) {
  console.log(`\n=== ${value} ===`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
