import fs from "node:fs";
import path from "node:path";
import { Interface, JsonRpcProvider } from "ethers";
import "dotenv/config";

const evidencePath = path.join(process.cwd(), "deployments", "public-demo.json");
const publicEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const provider = new JsonRpcProvider(required("BASE_SEPOLIA_RPC_URL"));
const messengerArtifact = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "artifacts",
      "contracts/messaging/SignedRelayerMessenger.sol",
      "SignedRelayerMessenger.json"
    ),
    "utf8"
  )
);

async function main() {
  const contractInterface = new Interface(messengerArtifact.abi);
  const issue = await parseDelivery(contractInterface, publicEvidence.transactions.issue, "issue");
  const target = path.join(process.cwd(), "frontend", "public", "public-demo-evidence.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(serializeDelivery(issue.args), null, 2)}\n`);

  const security: Record<string, unknown> = {};
  for (const key of ["exactReplay", "doublePledge", "staleProof"]) {
    const record = publicEvidence.transactions[key];
    const attack = await parseDelivery(contractInterface, record.hash, key);
    security[key] = {
      ...serializeDelivery(attack.args),
      transactionHash: record.hash,
      expectedError: record.error,
      status: record.status
    };
  }
  const securityTarget = path.join(
    process.cwd(),
    "frontend",
    "public",
    "public-security-evidence.json"
  );
  fs.writeFileSync(securityTarget, `${JSON.stringify(security, null, 2)}\n`);
  console.log(`Exported confirmed public proof evidence to ${target}`);
  console.log(`Exported three public attack proofs to ${securityTarget}`);
}

async function parseDelivery(contractInterface: Interface, transactionHash: string, label: string) {
  const transaction = await provider.getTransaction(transactionHash);
  if (!transaction) throw new Error(`Confirmed ${label} transaction was not found`);
  const parsed = contractInterface.parseTransaction({
    data: transaction.data,
    value: transaction.value
  });
  if (!parsed || parsed.name !== "deliver") throw new Error(`${label} is not messenger delivery`);
  return parsed;
}

function serializeDelivery(args: any) {
  const envelope = args[0];
  return {
    envelope: {
      sourceChainId: envelope.sourceChainId.toString(),
      destinationChainId: envelope.destinationChainId.toString(),
      sourceSender: envelope.sourceSender,
      destinationReceiver: envelope.destinationReceiver,
      nonce: envelope.nonce.toString(),
      payloadHash: envelope.payloadHash,
      createdAt: envelope.createdAt.toString(),
      validUntil: envelope.validUntil.toString()
    },
    payload: args[1],
    signature: args[2]
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
