import fs from "node:fs";
import path from "node:path";
import { Contract, Interface, JsonRpcProvider, Wallet, ethers } from "ethers";
import type { ContractTransactionReceipt, TransactionReceipt } from "ethers";
import "dotenv/config";

type Deployment = {
  chainId: number;
  contracts: Record<string, { address: string; transactionHash: string }>;
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

const sepoliaConfirmations = positiveInteger("SEPOLIA_CONFIRMATIONS", 12);
const baseConfirmations = positiveInteger("BASE_SEPOLIA_CONFIRMATIONS", 12);
const providerA = new JsonRpcProvider(required("SEPOLIA_RPC_URL"));
const providerB = new JsonRpcProvider(required("BASE_SEPOLIA_RPC_URL"));
const deployerA = new Wallet(required("DEPLOYER_PRIVATE_KEY"), providerA);
const deployerB = new Wallet(required("DEPLOYER_PRIVATE_KEY"), providerB);
const attestorA = new Wallet(required("ATTESTOR_PRIVATE_KEY"), providerA);
const attestorB = new Wallet(required("ATTESTOR_PRIVATE_KEY"), providerB);

async function main() {
  const evidencePath = path.join(process.cwd(), "deployments", "public-demo.json");
  if (fs.existsSync(evidencePath) && process.env.PUBLIC_DEMO_ALLOW_REPEAT !== "true") {
    throw new Error(
      "deployments/public-demo.json already exists; set PUBLIC_DEMO_ALLOW_REPEAT=true to issue a new lock/loan"
    );
  }

  const chainA = readDeployment("sepolia.json");
  const chainB = readDeployment("baseSepolia.json");
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

  const collateral: any = new Contract(
    chainA.contracts.collateralToken.address,
    collateralArtifact.abi,
    deployerA
  );
  const vault: any = new Contract(chainA.contracts.vault.address, vaultArtifact.abi, deployerA);
  const messengerA: any = new Contract(
    chainA.contracts.messenger.address,
    messengerArtifact.abi,
    attestorA
  );
  const loanToken: any = new Contract(
    chainB.contracts.loanToken.address,
    loanArtifact.abi,
    providerB
  );
  const pool: any = new Contract(chainB.contracts.pool.address, poolArtifact.abi, deployerB);
  const messengerB: any = new Contract(
    chainB.contracts.messenger.address,
    messengerArtifact.abi,
    attestorB
  );

  await validateConfiguration(chainA, chainB, vault, pool, messengerA, messengerB);

  const borrower = deployerA.address;
  const collateralAmount = ethers.parseEther("100");
  const principal = ethers.parseEther("50");
  const balanceBefore = BigInt(await collateral.balanceOf(borrower));
  const vaultBefore = BigInt(await collateral.balanceOf(vault.target));
  const loanBalanceBefore = BigInt(await loanToken.balanceOf(borrower));
  const recoveryRecipient = await vault.recoveryRecipient();
  const recoveryBalanceBefore = BigInt(await collateral.balanceOf(recoveryRecipient));

  heading("1. LOCK 100 dCOL ON ETHEREUM SEPOLIA");
  const approval = await collateral.approve(vault.target, collateralAmount);
  await requireSuccess(providerA, approval.hash, "collateral approval");
  const headA = await providerA.getBlock("latest");
  if (!headA) throw new Error("Missing Sepolia head");
  const nextLockNonce = BigInt(await vault.ownerLockNonce(borrower)) + 1n;
  const collateralId = await vault.computeCollateralId(borrower, collateralAmount, nextLockNonce);
  const lockTx = await vault.lockCollateral(
    collateralAmount,
    principal,
    BigInt(headA.timestamp) + 7_200n
  );
  const lockReceipt = await requireSuccess(providerA, lockTx.hash, "collateral lock");
  const lockPrepared = findEvent(lockReceipt, vault.interface, "OutboundMessagePrepared");
  console.log(`Approval: ${approval.hash}`);
  console.log(`Lock: ${lockTx.hash}`);
  console.log(`Collateral ID: ${collateralId}`);
  console.log(
    `Vault balance: ${ethers.formatEther(await collateral.balanceOf(vault.target))} dCOL`
  );

  await waitFinality(providerA, lockTx.hash, sepoliaConfirmations, "Sepolia lock");

  heading("2. AUTHENTICATE LOCK AND ISSUE 50 dUSD ON BASE SEPOLIA");
  const lockEnvelope = envelopeFromEvent(
    BigInt(chainA.chainId),
    vault.target as string,
    lockPrepared
  );
  const lockSignature = await sign(attestorB, providerB, messengerB.target as string, lockEnvelope);
  writeFrontendEvidence(
    "public-demo-evidence.json",
    lockEnvelope,
    lockPrepared.payload,
    lockSignature
  );
  const lockMessageId = await messengerB.getMessageId(lockEnvelope);
  const issueTx = await messengerB.deliver(lockEnvelope, lockPrepared.payload, lockSignature);
  const issueReceipt = await requireSuccess(providerB, issueTx.hash, "loan issuance");
  const issued = findEvent(issueReceipt, pool.interface, "LoanIssued");
  const pledgePrepared = findEvent(issueReceipt, pool.interface, "OutboundMessagePrepared");
  const loanId = BigInt(issued.loanId);
  console.log(`Message ID: ${lockMessageId}`);
  console.log(`Issue transaction: ${issueTx.hash}`);
  console.log(`Loan ID: ${loanId}`);
  console.log(
    `Borrower dUSD delta: ${ethers.formatEther((await loanToken.balanceOf(borrower)) - loanBalanceBefore)}`
  );
  console.log(
    `Sepolia vault still holds: ${ethers.formatEther(await collateral.balanceOf(vault.target))} dCOL`
  );

  await waitFinality(providerB, issueTx.hash, baseConfirmations, "Base loan event");

  heading("3. ACKNOWLEDGE PLEDGE ON ETHEREUM SEPOLIA");
  const pledgeEnvelope = envelopeFromEvent(
    BigInt(chainB.chainId),
    pool.target as string,
    pledgePrepared
  );
  const pledgeSignature = await sign(
    attestorA,
    providerA,
    messengerA.target as string,
    pledgeEnvelope
  );
  const pledgeMessageId = await messengerA.getMessageId(pledgeEnvelope);
  const pledgeTx = await messengerA.deliver(
    pledgeEnvelope,
    pledgePrepared.payload,
    pledgeSignature
  );
  await requireSuccess(providerA, pledgeTx.hash, "pledge acknowledgement");
  console.log(`Message ID: ${pledgeMessageId}`);
  console.log(`Pledge acknowledgement: ${pledgeTx.hash}`);
  console.log(`Collateral state: ${(await vault.collaterals(collateralId)).state}`);

  heading("4. MINE THREE REJECTED ATTACK TRANSACTIONS ON BASE SEPOLIA");
  const exactReplay = await sendRejected(
    "Exact proof replay",
    messengerB,
    attestorB,
    providerB,
    lockEnvelope,
    lockPrepared.payload,
    lockSignature,
    [messengerB.interface, pool.interface]
  );

  const headB = await providerB.getBlock("latest");
  if (!headB) throw new Error("Missing Base Sepolia head");
  const duplicateEnvelope = {
    ...lockEnvelope,
    nonce: 2n,
    createdAt: BigInt(headB.timestamp),
    validUntil: BigInt(headB.timestamp) + 900n
  };
  const duplicateSignature = await sign(
    attestorB,
    providerB,
    messengerB.target as string,
    duplicateEnvelope
  );
  const doublePledge = await sendRejected(
    "Second signed pledge for the same collateral",
    messengerB,
    attestorB,
    providerB,
    duplicateEnvelope,
    lockPrepared.payload,
    duplicateSignature,
    [messengerB.interface, pool.interface]
  );

  const staleEnvelope = {
    ...lockEnvelope,
    nonce: 2n,
    createdAt: BigInt(headB.timestamp) - 120n,
    validUntil: BigInt(headB.timestamp) - 1n
  };
  const staleSignature = await sign(
    attestorB,
    providerB,
    messengerB.target as string,
    staleEnvelope
  );
  const staleProof = await sendRejected(
    "Expired proof",
    messengerB,
    attestorB,
    providerB,
    staleEnvelope,
    lockPrepared.payload,
    staleSignature,
    [messengerB.interface]
  );

  heading("5. WAIT FOR FIXED-TERM DEFAULT AND LIQUIDATE ON BASE SEPOLIA");
  const loan = await pool.loans(loanId);
  await waitUntilAfter(providerB, BigInt(loan.deadline));
  const defaultTx = await pool.markDefaulted(loanId);
  await requireSuccess(providerB, defaultTx.hash, "mark default");
  const liquidationTx = await pool.liquidate(loanId);
  const liquidationReceipt = await requireSuccess(providerB, liquidationTx.hash, "liquidation");
  const recoveryPrepared = findEvent(liquidationReceipt, pool.interface, "OutboundMessagePrepared");
  console.log(`Default: ${defaultTx.hash}`);
  console.log(`Liquidation: ${liquidationTx.hash}`);

  await waitFinality(providerB, liquidationTx.hash, baseConfirmations, "Base liquidation event");

  heading("6. AUTHENTICATE RECOVERY ON ETHEREUM SEPOLIA");
  const recoveryEnvelope = envelopeFromEvent(
    BigInt(chainB.chainId),
    pool.target as string,
    recoveryPrepared
  );
  const recoverySignature = await sign(
    attestorA,
    providerA,
    messengerA.target as string,
    recoveryEnvelope
  );
  const recoveryMessageId = await messengerA.getMessageId(recoveryEnvelope);
  const recoveryTx = await messengerA.deliver(
    recoveryEnvelope,
    recoveryPrepared.payload,
    recoverySignature
  );
  await requireSuccess(providerA, recoveryTx.hash, "collateral recovery");

  const finalCollateral = await vault.collaterals(collateralId);
  const finalLoan = await pool.loans(loanId);
  const collateralBalanceAfter = BigInt(await collateral.balanceOf(borrower));
  const recoveryBalanceAfter = BigInt(await collateral.balanceOf(recoveryRecipient));
  const recoveryDelta = recoveryBalanceAfter - recoveryBalanceBefore;
  const vaultBalanceAfter = BigInt(await collateral.balanceOf(vault.target));
  console.log(`Recovery message ID: ${recoveryMessageId}`);
  console.log(`Recovery transaction: ${recoveryTx.hash}`);
  console.log(`Recovery recipient: ${recoveryRecipient}`);
  console.log(`Recovery recipient dCOL delta: ${ethers.formatEther(recoveryDelta)}`);
  console.log(
    `Defaulted borrower dCOL loss: ${ethers.formatEther(balanceBefore - collateralBalanceAfter)}`
  );
  console.log(`Vault dCOL after recovery: ${ethers.formatEther(vaultBalanceAfter)}`);
  console.log(`Final collateral state: ${finalCollateral.state}`);
  console.log(`Final loan state: ${finalLoan.state}`);

  if (
    BigInt(finalCollateral.state) !== 4n ||
    BigInt(finalLoan.state) !== 4n ||
    vaultBalanceAfter !== vaultBefore ||
    recoveryDelta !== collateralAmount ||
    collateralBalanceAfter !== balanceBefore - collateralAmount
  ) {
    throw new Error("Final public state does not satisfy liquidation invariants");
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    networks: {
      chainA: { name: "Ethereum Sepolia", chainId: chainA.chainId },
      chainB: { name: "Base Sepolia", chainId: chainB.chainId }
    },
    contracts: {
      collateralToken: chainA.contracts.collateralToken.address,
      vault: chainA.contracts.vault.address,
      messengerA: chainA.contracts.messenger.address,
      loanToken: chainB.contracts.loanToken.address,
      pool: chainB.contracts.pool.address,
      messengerB: chainB.contracts.messenger.address
    },
    confirmations: { sepolia: sepoliaConfirmations, baseSepolia: baseConfirmations },
    collateralId,
    loanId: loanId.toString(),
    transactions: {
      approval: approval.hash,
      lock: lockTx.hash,
      issue: issueTx.hash,
      pledgeAcknowledgement: pledgeTx.hash,
      exactReplay,
      doublePledge,
      staleProof,
      markDefaulted: defaultTx.hash,
      liquidate: liquidationTx.hash,
      recovery: recoveryTx.hash
    },
    messageIds: {
      lock: lockMessageId,
      pledgeAcknowledgement: pledgeMessageId,
      recovery: recoveryMessageId
    },
    finalState: {
      collateral: Number(finalCollateral.state),
      loan: Number(finalLoan.state),
      vaultCollateral: ethers.formatEther(vaultBalanceAfter),
      recoveryRecipient,
      recoveryAmount: ethers.formatEther(recoveryDelta),
      borrowerCollateralLoss: ethers.formatEther(balanceBefore - collateralBalanceAfter)
    }
  };
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  heading("PUBLIC DEMO COMPLETE");
  console.log(`Secret-free evidence written to ${evidencePath}`);
}

async function validateConfiguration(
  chainA: Deployment,
  chainB: Deployment,
  vault: any,
  pool: any,
  messengerA: any,
  messengerB: any
) {
  if (!(await vault.peerConfigured())) throw new Error("Sepolia vault peer is not configured");
  if (
    BigInt(await vault.remoteChainId()) !== BigInt(chainB.chainId) ||
    (await vault.remoteLendingPool()).toLowerCase() !== chainB.contracts.pool.address.toLowerCase()
  ) {
    throw new Error("Sepolia vault peer does not match Base pool");
  }
  if (!(await pool.trustedVaults(chainA.chainId, chainA.contracts.vault.address))) {
    throw new Error("Base pool does not trust Sepolia vault");
  }
  for (const messenger of [messengerA, messengerB]) {
    if ((await messenger.trustedSigner()).toLowerCase() !== attestorA.address.toLowerCase()) {
      throw new Error("Messenger trusted signer mismatch");
    }
  }
}

async function sendRejected(
  label: string,
  messenger: any,
  signer: Wallet,
  provider: JsonRpcProvider,
  envelope: Envelope,
  payload: string,
  signature: string,
  interfaces: Interface[]
) {
  let errorName = "unknown";
  try {
    await messenger.deliver.staticCall(envelope, payload, signature);
    throw new Error(`${label} unexpectedly passed static validation`);
  } catch (error) {
    errorName = decodeError(error, interfaces);
  }

  const data = messenger.interface.encodeFunctionData("deliver", [envelope, payload, signature]);
  const transaction = await signer.sendTransaction({
    to: messenger.target,
    data,
    gasLimit: 3_000_000n
  });
  const receipt = await provider.waitForTransaction(transaction.hash, 1, 180_000);
  if (!receipt || receipt.status !== 0) throw new Error(`${label} was not mined as a rejection`);
  console.log(`REJECTED — ${label}`);
  console.log(`  on-chain error: ${errorName}`);
  console.log(`  transaction: ${transaction.hash}`);
  return { hash: transaction.hash, status: receipt.status, error: errorName };
}

async function waitFinality(
  provider: JsonRpcProvider,
  transactionHash: string,
  confirmations: number,
  label: string
) {
  console.log(`${label}: waiting for ${confirmations} source confirmations...`);
  const receipt = await provider.waitForTransaction(transactionHash, confirmations, 900_000);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} did not finalize successfully`);
  console.log(`${label}: finalized at block ${receipt.blockNumber}`);
}

async function waitUntilAfter(provider: JsonRpcProvider, deadline: bigint) {
  while (true) {
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Missing destination head while waiting for default");
    const remaining = deadline - BigInt(block.timestamp) + 1n;
    if (remaining <= 0n) return;
    console.log(`Loan becomes defaultable in approximately ${remaining} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}

async function requireSuccess(
  provider: JsonRpcProvider,
  transactionHash: string,
  label: string
): Promise<TransactionReceipt> {
  const receipt = await provider.waitForTransaction(transactionHash, 1, 180_000);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed`);
  return receipt;
}

async function sign(
  signer: Wallet,
  provider: JsonRpcProvider,
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

function findEvent(
  receipt: TransactionReceipt,
  contractInterface: Interface,
  eventName: string
): any {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args;
    } catch {
      // This log came from another contract in the transaction.
    }
  }
  throw new Error(`Missing ${eventName} event`);
}

function decodeError(error: any, interfaces: Interface[]): string {
  const data = error?.data?.data ?? error?.data ?? error?.error?.data;
  if (typeof data === "string") {
    for (const contractInterface of interfaces) {
      try {
        const parsed = contractInterface.parseError(data);
        if (parsed) return parsed.name;
      } catch {
        // Try the next ABI.
      }
    }
  }
  return error?.shortMessage ?? error?.message ?? "unknown revert";
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

function writeFrontendEvidence(
  filename: string,
  envelope: Envelope,
  payload: string,
  signature: string
) {
  const target = path.join(process.cwd(), "frontend", "public", filename);
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

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be positive`);
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function heading(value: string) {
  console.log(`\n=== ${value} ===`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
