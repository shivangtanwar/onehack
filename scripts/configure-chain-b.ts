import { ethers } from "hardhat";
import { readDeployment } from "./deployment-utils";

async function main() {
  const chainA = readDeployment(process.env.CHAIN_A_DEPLOYMENT_FILE ?? "local-a.json");
  const chainB = readDeployment(process.env.CHAIN_B_DEPLOYMENT_FILE ?? "local-b.json");
  const pool = await ethers.getContractAt("LendingPool", chainB.contracts.pool.address);
  if (await pool.trustedVaults(chainA.chainId, chainA.contracts.vault.address)) {
    console.log("Chain B vault is already trusted; no transaction sent");
    return;
  }
  const tx = await pool.setTrustedVault(chainA.chainId, chainA.contracts.vault.address, true);
  await tx.wait();
  console.log(`Pool now trusts vault ${chainA.contracts.vault.address} on ${chainA.chainId}`);
  console.log(`Transaction: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
