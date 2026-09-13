import fs from "node:fs";
import path from "node:path";
import { Wallet } from "ethers";

const target = path.join(process.cwd(), ".env");
if (fs.existsSync(target)) {
  throw new Error("Refusing to overwrite existing .env");
}

const deployer = Wallet.createRandom();
const attestor = Wallet.createRandom();
const contents = [
  "# Generated project-only testnet wallets. Never fund with real assets.",
  "# This file is ignored and must not be committed or shared.",
  "SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com",
  "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
  `DEPLOYER_PRIVATE_KEY=${deployer.privateKey}`,
  `ATTESTOR_PRIVATE_KEY=${attestor.privateKey}`,
  `ATTESTOR_ADDRESS=${attestor.address}`,
  "SEPOLIA_CONFIRMATIONS=12",
  "BASE_SEPOLIA_CONFIRMATIONS=12",
  "CHAIN_A_DEPLOYMENT_FILE=sepolia.json",
  "CHAIN_B_DEPLOYMENT_FILE=baseSepolia.json",
  ""
].join("\n");

fs.writeFileSync(target, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
fs.chmodSync(target, 0o600);

console.log(`Deployer address: ${deployer.address}`);
console.log(`Attestor address: ${attestor.address}`);
console.log("Saved private keys to ignored .env with mode 0600; no private key was printed.");
