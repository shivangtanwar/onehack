import { ethers } from "hardhat";
import { readDeployment } from "./deployment-utils";

async function main() {
  const chainA = readDeployment(process.env.CHAIN_A_DEPLOYMENT_FILE ?? "local-a.json");
  const chainB = readDeployment(process.env.CHAIN_B_DEPLOYMENT_FILE ?? "local-b.json");
  const vault = await ethers.getContractAt("CollateralVault", chainA.contracts.vault.address);
  if (await vault.peerConfigured()) {
    console.log("Chain A peer is already configured; no transaction sent");
    return;
  }
  const tx = await vault.configurePeer(chainB.chainId, chainB.contracts.pool.address);
  await tx.wait();
  console.log(`Vault now trusts pool ${chainB.contracts.pool.address} on ${chainB.chainId}`);
  console.log(`Transaction: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
