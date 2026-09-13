import { ethers } from "ethers";
import "dotenv/config";

const sourceRpc = required("SOURCE_RPC_URL");
const destinationRpc = required("DESTINATION_RPC_URL");
const sourceApplicationAddress = ethers.getAddress(required("SOURCE_APP_ADDRESS"));
const destinationMessengerAddress = ethers.getAddress(required("DESTINATION_MESSENGER_ADDRESS"));
const sourceTransactionHash = required("SOURCE_TX_HASH");
const privateKey = required("ATTESTOR_PRIVATE_KEY");
const confirmations = Number(process.env.SOURCE_CONFIRMATIONS ?? "1");

const preparedEvent = new ethers.Interface([
  "event OutboundMessagePrepared(uint8 indexed action,uint64 indexed destinationChainId,address indexed destinationReceiver,uint64 nonce,bytes payload,uint64 createdAt,uint64 validUntil)"
]);
const applicationInterface = new ethers.Interface([
  "function localChainId() view returns (uint64)"
]);
const messengerInterface = new ethers.Interface([
  "function trustedSigner() view returns (address)",
  "function getMessageId((uint64 sourceChainId,uint64 destinationChainId,address sourceSender,address destinationReceiver,uint64 nonce,bytes32 payloadHash,uint64 createdAt,uint64 validUntil) envelope) view returns (bytes32)",
  "function deliver((uint64 sourceChainId,uint64 destinationChainId,address sourceSender,address destinationReceiver,uint64 nonce,bytes32 payloadHash,uint64 createdAt,uint64 validUntil) envelope,bytes payload,bytes proof) returns (bytes32)"
]);

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

async function main() {
  if (!Number.isSafeInteger(confirmations) || confirmations < 1) {
    throw new Error("SOURCE_CONFIRMATIONS must be a positive integer");
  }

  const sourceProvider = new ethers.JsonRpcProvider(sourceRpc);
  const destinationProvider = new ethers.JsonRpcProvider(destinationRpc);
  const receipt = await sourceProvider.waitForTransaction(
    sourceTransactionHash,
    confirmations,
    120_000
  );
  if (!receipt || receipt.status !== 1)
    throw new Error("Source transaction is missing or reverted");

  const log = receipt.logs.find((candidate) => {
    if (candidate.address.toLowerCase() !== sourceApplicationAddress.toLowerCase()) return false;
    try {
      return preparedEvent.parseLog(candidate)?.name === "OutboundMessagePrepared";
    } catch {
      return false;
    }
  });
  if (!log) throw new Error("No OutboundMessagePrepared event from SOURCE_APP_ADDRESS");
  const event = preparedEvent.parseLog(log);
  if (!event) throw new Error("Unable to parse outbound event");

  const sourceApplication = new ethers.Contract(
    sourceApplicationAddress,
    applicationInterface,
    sourceProvider
  );
  const sourceChainId = BigInt(await sourceApplication.localChainId());
  const destinationNetwork = await destinationProvider.getNetwork();
  if (BigInt(event.args.destinationChainId) !== destinationNetwork.chainId) {
    throw new Error(
      `Destination mismatch: event=${event.args.destinationChainId}, RPC=${destinationNetwork.chainId}`
    );
  }

  const envelope = {
    sourceChainId,
    destinationChainId: BigInt(event.args.destinationChainId),
    sourceSender: sourceApplicationAddress,
    destinationReceiver: ethers.getAddress(event.args.destinationReceiver),
    nonce: BigInt(event.args.nonce),
    payloadHash: ethers.keccak256(event.args.payload),
    createdAt: BigInt(event.args.createdAt),
    validUntil: BigInt(event.args.validUntil)
  };

  const attestor = new ethers.Wallet(privateKey, destinationProvider);
  const messenger = new ethers.Contract(destinationMessengerAddress, messengerInterface, attestor);
  const trustedSigner = ethers.getAddress(await messenger.trustedSigner());
  if (trustedSigner !== attestor.address) {
    throw new Error(`Attestor mismatch: configured ${trustedSigner}, supplied ${attestor.address}`);
  }

  const signature = await attestor.signTypedData(
    {
      name: "DatabaesCrossChainMessenger",
      version: "1",
      chainId: destinationNetwork.chainId,
      verifyingContract: destinationMessengerAddress
    },
    envelopeTypes,
    envelope
  );
  const messageId = await messenger.getMessageId(envelope);
  const transaction = await messenger.deliver(envelope, event.args.payload, signature);
  const destinationReceipt = await transaction.wait();
  if (!destinationReceipt || destinationReceipt.status !== 1) {
    throw new Error("Destination delivery reverted");
  }

  console.log(`Source transaction: ${sourceTransactionHash}`);
  console.log(`Confirmed source blocks: ${confirmations}`);
  console.log(`Recovered/expected signer: ${trustedSigner}`);
  console.log(`Message ID: ${messageId}`);
  console.log(`Destination transaction: ${transaction.hash}`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
