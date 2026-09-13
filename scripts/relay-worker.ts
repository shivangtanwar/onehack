import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import "dotenv/config";

const stateDir = process.env.RELAYER_STATE_DIR || "runtime";
fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const key = process.env.ATTESTOR_KEY_FILE
  ? fs.readFileSync(process.env.ATTESTOR_KEY_FILE, "utf8").trim()
  : process.env.ATTESTOR_PRIVATE_KEY;
if (!key) throw new Error("An attestor key is required.");
const eventAbi = new ethers.Interface([
  "event OutboundMessagePrepared(uint8 indexed action,uint64 indexed destinationChainId,address indexed destinationReceiver,uint64 nonce,bytes payload,uint64 createdAt,uint64 validUntil)"
]);
const messengerAbi = [
  "function localChainId() view returns(uint64)",
  "function trustedSigner() view returns(address)",
  "function latestNonce(uint64,address) view returns(uint64)",
  "function deliver((uint64 sourceChainId,uint64 destinationChainId,address sourceSender,address destinationReceiver,uint64 nonce,bytes32 payloadHash,uint64 createdAt,uint64 validUntil),bytes,bytes) returns(bytes32)"
];
const types = {
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
function side(name: string, expectedId: number, rpc: string) {
  const data = JSON.parse(fs.readFileSync(`deployments/${name}.json`, "utf8"));
  if (data.chainId !== expectedId)
    throw new Error("Worker is restricted to the two Sepolia networks.");
  const url = new URL(rpc);
  if (url.protocol !== "https:") throw new Error("The worker requires HTTPS testnet RPCs.");
  const request = new ethers.FetchRequest(rpc);
  request.timeout = 20_000;
  const provider = new ethers.JsonRpcProvider(request);
  const wallet = new ethers.Wallet(key!, provider);
  return {
    name,
    data,
    provider,
    wallet,
    app: (data.contracts.vault || data.contracts.pool).address as string,
    messenger: new ethers.Contract(data.contracts.messenger.address, messengerAbi, wallet)
  };
}
const a = side(
  "sepolia",
  11155111,
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
);
const b = side(
  "baseSepolia",
  84532,
  process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
);
type Side = typeof a;
function confirmations(name: string) {
  const n = Number(process.env[name] || 12);
  if (!Number.isSafeInteger(n) || n < 12)
    throw new Error("At least 12 confirmations are required.");
  return n;
}
const finality = {
  sepolia: confirmations("SEPOLIA_CONFIRMATIONS"),
  baseSepolia: confirmations("BASE_SEPOLIA_CONFIRMATIONS")
};
function save(name: string, data: unknown) {
  const file = path.join(stateDir, `${name}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
async function check(s: Side) {
  if ((await s.provider.getNetwork()).chainId !== BigInt(s.data.chainId))
    throw new Error("RPC chain mismatch");
  if (BigInt(await s.messenger.localChainId()) !== BigInt(s.data.chainId))
    throw new Error("Messenger chain mismatch");
  if ((await s.messenger.trustedSigner()).toLowerCase() !== s.wallet.address.toLowerCase())
    throw new Error("Configured signer does not match the messenger");
  if ((await s.provider.getCode(s.app)) === "0x")
    throw new Error("Application has no deployed code");
}
async function relay(source: Side, destination: Side) {
  await check(source);
  await check(destination);
  const safeHead =
    (await source.provider.getBlockNumber()) - finality[source.name as keyof typeof finality] + 1;
  const cursorFile = path.join(stateDir, `${source.name}.json`);
  let from: number;
  if (fs.existsSync(cursorFile)) {
    const cursor = JSON.parse(fs.readFileSync(cursorFile, "utf8"));
    if (cursor.chainId !== source.data.chainId || cursor.application !== source.app)
      throw new Error("Relay cursor belongs to another deployment");
    from = cursor.nextBlock;
  } else {
    // Verified application scan boundaries, also used by the dashboard. Some public
    // RPCs do not retain old deployment receipts; delivery still verifies each source receipt.
    from = source.name === "sepolia" ? 11678451 : 46658404;
  }
  if (!Number.isSafeInteger(from) || from < 0 || from > safeHead + 1)
    throw new Error("Invalid relay cursor; operator review required");
  for (; from <= safeHead; from += 2000) {
    const through = Math.min(from + 1999, safeHead);
    const logs = await source.provider.getLogs({
      address: source.app,
      topics: [eventAbi.getEvent("OutboundMessagePrepared")!.topicHash],
      fromBlock: from,
      toBlock: through
    });
    for (const log of logs.sort((x, y) => x.blockNumber - y.blockNumber || x.index - y.index)) {
      const e = eventAbi.parseLog(log)!.args;
      if (
        BigInt(e.destinationChainId) !== BigInt(destination.data.chainId) ||
        e.destinationReceiver.toLowerCase() !== destination.app.toLowerCase()
      )
        continue; // The pool supports other vault routes, with independent peer nonces.
      const received = BigInt(
        await destination.messenger.latestNonce(source.data.chainId, source.app)
      );
      if (BigInt(e.nonce) <= received) continue;
      if (BigInt(e.nonce) !== received + 1n)
        throw new Error(`Nonce gap on ${source.name}; operator review required`);
      const receipt = await source.provider.getTransactionReceipt(log.transactionHash);
      const block = await source.provider.getBlock(log.blockNumber);
      if (
        !receipt ||
        receipt.status !== 1 ||
        receipt.blockHash !== log.blockHash ||
        block?.hash !== log.blockHash
      )
        throw new Error("Source receipt changed; refusing to attest");
      const head = await destination.provider.getBlock("latest");
      if (!head || BigInt(head.timestamp) >= BigInt(e.validUntil))
        throw new Error(
          `Expired message on ${source.name} nonce ${e.nonce}; cannot skip ordered messages`
        );
      const envelope = {
        sourceChainId: BigInt(source.data.chainId),
        destinationChainId: BigInt(destination.data.chainId),
        sourceSender: source.app,
        destinationReceiver: destination.app,
        nonce: BigInt(e.nonce),
        payloadHash: ethers.keccak256(e.payload),
        createdAt: BigInt(e.createdAt),
        validUntil: BigInt(e.validUntil)
      };
      const signature = await destination.wallet.signTypedData(
        {
          name: "DatabaesCrossChainMessenger",
          version: "1",
          chainId: destination.data.chainId,
          verifyingContract: destination.data.contracts.messenger.address
        },
        types,
        envelope
      );
      // Estimate first; invalid events must not burn gas or advance the cursor.
      const gas = await destination.messenger.deliver.estimateGas(envelope, e.payload, signature);
      if (gas > 1_500_000n) throw new Error("Relay gas estimate exceeds the safety limit");
      const tx = await destination.messenger.deliver(envelope, e.payload, signature, {
        gasLimit: (gas * 120n) / 100n
      });
      console.log(
        JSON.stringify({
          event: "submitted",
          source: source.name,
          sourceTx: log.transactionHash,
          destination: destination.name,
          destinationTx: tx.hash,
          nonce: String(e.nonce)
        })
      );
      // Keep one transaction in flight per worker. Restarts recover from on-chain nonces.
      const delivered = await tx.wait(1);
      if (!delivered || delivered.status !== 1) throw new Error("Destination receipt failed");
      console.log(JSON.stringify({ event: "delivered", destinationTx: tx.hash }));
    }
    save(source.name, {
      nextBlock: through + 1,
      chainId: source.data.chainId,
      application: source.app
    });
  }
}
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  while (!stopping) {
    const errors: string[] = [];
    // Both directions get a turn even when a source message requires operator attention.
    for (const [source, destination] of [
      [a, b],
      [b, a]
    ]) {
      try {
        await relay(source, destination);
      } catch (error: any) {
        // Do not log RPC request objects or credentials.
        const message = String(error.shortMessage || error.message || "Relay failed")
          .replace(/https?:\/\/[^\s]+/g, "[RPC]")
          .slice(0, 240);
        errors.push(`${source.name}: ${message}`);
        console.error(errors.at(-1));
      }
    }
    save("health", {
      healthy: errors.length === 0,
      updatedAt: new Date().toISOString(),
      networks: ["Ethereum Sepolia", "Base Sepolia"],
      errors
    });
    if (process.env.RELAYER_ONCE === "true") {
      if (errors.length) process.exitCode = 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, errors.length ? 30_000 : 5_000));
  }
}
main().catch(() => {
  console.error("Relay worker failed at startup");
  process.exitCode = 1;
});
