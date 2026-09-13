import { ethers, network } from "hardhat";
import {
  deployedContractRecord,
  resolveAttestor,
  writeDeployment,
  type DeploymentRecord
} from "./deployment-utils";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const attestor = await resolveAttestor();
  const configuredDuration = Number(process.env.LOAN_DURATION_SECONDS ?? "300");
  const loanDuration =
    network.name.startsWith("localhost") || network.name === "hardhat" ? 300 : configuredDuration;
  if (
    !Number.isSafeInteger(loanDuration) ||
    loanDuration <= 0 ||
    loanDuration > 365 * 24 * 60 * 60
  ) {
    throw new Error("LOAN_DURATION_SECONDS must be an integer between 1 and 31536000");
  }

  const messenger = await ethers.deployContract("SignedRelayerMessenger", [
    chainId,
    attestor,
    deployer.address
  ]);
  await messenger.waitForDeployment();
  const loanToken = await ethers.deployContract("MockLoanToken");
  await loanToken.waitForDeployment();
  const pool = await ethers.deployContract("LendingPool", [
    await loanToken.getAddress(),
    await messenger.getAddress(),
    chainId,
    loanDuration,
    5_000,
    0,
    deployer.address
  ]);
  await pool.waitForDeployment();

  const liquidityTx = await loanToken.mint(await pool.getAddress(), ethers.parseEther("1000000"));
  await liquidityTx.wait();

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    attestor,
    contracts: {
      loanToken: await deployedContractRecord(loanToken),
      messenger: await deployedContractRecord(messenger),
      pool: await deployedContractRecord(pool)
    }
  };
  writeDeployment("b", record);
  console.log(`Chain B ready: pool ${record.contracts.pool.address}`);
  console.log("Funded pool with 1,000,000 dUSD");
  console.log(`Loan duration: ${loanDuration} seconds`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
