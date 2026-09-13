import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

export type DeploymentRecord = {
  network: string;
  chainId: number;
  deployer: string;
  attestor: string;
  contracts: Record<string, { address: string; transactionHash: string }>;
};

export async function resolveAttestor(): Promise<string> {
  const [deployer] = await ethers.getSigners();
  if (
    network.name === "localhostA" ||
    network.name === "localhostB" ||
    network.name === "hardhat"
  ) {
    return process.env.LOCAL_ATTESTOR_ADDRESS
      ? ethers.getAddress(process.env.LOCAL_ATTESTOR_ADDRESS)
      : deployer.address;
  }
  const configuredAddress = process.env.ATTESTOR_ADDRESS;
  if (configuredAddress && configuredAddress !== ethers.ZeroAddress) {
    return ethers.getAddress(configuredAddress);
  }
  if (process.env.ATTESTOR_PRIVATE_KEY) {
    return new ethers.Wallet(process.env.ATTESTOR_PRIVATE_KEY).address;
  }
  throw new Error("Set ATTESTOR_ADDRESS (preferred for deployment) or ATTESTOR_PRIVATE_KEY");
}

export async function deployedContractRecord(contract: any) {
  await contract.waitForDeployment();
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error("Missing deployment transaction");
  return {
    address: await contract.getAddress(),
    transactionHash: transaction.hash
  };
}

export async function existingContractRecord(
  address: string,
  transactionHash: string,
  label: string
) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no deployed code at ${address}`);
  const receipt = await ethers.provider.getTransactionReceipt(transactionHash);
  if (
    !receipt ||
    receipt.status !== 1 ||
    receipt.contractAddress?.toLowerCase() !== address.toLowerCase()
  ) {
    throw new Error(`${label} deployment transaction does not match ${address}`);
  }
  return { address: ethers.getAddress(address), transactionHash };
}

export function requirePairedEnvironment(addressName: string, transactionName: string) {
  const address = process.env[addressName];
  const transactionHash = process.env[transactionName];
  if (!address && !transactionHash) return undefined;
  if (!address || !transactionHash) {
    throw new Error(`${addressName} and ${transactionName} must be set together`);
  }
  return { address: ethers.getAddress(address), transactionHash };
}

export function deploymentPath(side: "a" | "b"): string {
  const filename = network.name.startsWith("localhost")
    ? `local-${side}.json`
    : `${network.name}.json`;
  return path.join(process.cwd(), "deployments", filename);
}

export function writeDeployment(side: "a" | "b", record: DeploymentRecord): void {
  const target = deploymentPath(side);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(`Deployment metadata written to ${target}`);
}

export function readLocalDeployment(side: "a" | "b"): DeploymentRecord {
  return readDeployment(`local-${side}.json`);
}

export function readDeployment(filename: string): DeploymentRecord {
  const target = path.join(process.cwd(), "deployments", filename);
  return JSON.parse(fs.readFileSync(target, "utf8")) as DeploymentRecord;
}
