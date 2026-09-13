import { ethers, network } from "hardhat";
import {
  deployedContractRecord,
  existingContractRecord,
  requirePairedEnvironment,
  resolveAttestor,
  writeDeployment,
  type DeploymentRecord
} from "./deployment-utils";

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("No deployer signer configured");
  const borrowerAddress = process.env.DEMO_BORROWER_ADDRESS
    ? ethers.getAddress(process.env.DEMO_BORROWER_ADDRESS)
    : (signers[1]?.address ?? deployer.address);
  const recoveryRecipient = process.env.RECOVERY_RECIPIENT_ADDRESS
    ? ethers.getAddress(process.env.RECOVERY_RECIPIENT_ADDRESS)
    : (signers[4]?.address ?? deployer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const attestor = await resolveAttestor();
  const useResumeConfiguration =
    !network.name.startsWith("localhost") && network.name !== "hardhat";

  const existingToken = useResumeConfiguration
    ? requirePairedEnvironment(
        "CHAIN_A_COLLATERAL_TOKEN_ADDRESS",
        "CHAIN_A_COLLATERAL_TOKEN_DEPLOY_TX"
      )
    : undefined;
  const existingMessenger = useResumeConfiguration
    ? requirePairedEnvironment("CHAIN_A_MESSENGER_ADDRESS", "CHAIN_A_MESSENGER_DEPLOY_TX")
    : undefined;

  const collateralToken: any = existingToken
    ? await ethers.getContractAt("MockCollateralToken", existingToken.address)
    : await ethers.deployContract("MockCollateralToken");
  const collateralTokenRecord = existingToken
    ? await existingContractRecord(
        existingToken.address,
        existingToken.transactionHash,
        "MockCollateralToken"
      )
    : await deployedContractRecord(collateralToken);

  const messenger: any = existingMessenger
    ? await ethers.getContractAt("SignedRelayerMessenger", existingMessenger.address)
    : await ethers.deployContract("SignedRelayerMessenger", [chainId, attestor, deployer.address]);
  const messengerRecord = existingMessenger
    ? await existingContractRecord(
        existingMessenger.address,
        existingMessenger.transactionHash,
        "SignedRelayerMessenger"
      )
    : await deployedContractRecord(messenger);
  if (
    BigInt(await messenger.localChainId()) !== BigInt(chainId) ||
    ethers.getAddress(await messenger.trustedSigner()) !== attestor
  ) {
    throw new Error("Existing Chain-A messenger configuration does not match this deployment");
  }

  const vault = await ethers.deployContract("CollateralVault", [
    await collateralToken.getAddress(),
    await messenger.getAddress(),
    chainId,
    recoveryRecipient,
    deployer.address
  ]);
  await vault.waitForDeployment();

  const mintTx = await collateralToken.mint(borrowerAddress, ethers.parseEther("1000"));
  await mintTx.wait();

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    attestor,
    contracts: {
      collateralToken: collateralTokenRecord,
      messenger: messengerRecord,
      vault: await deployedContractRecord(vault)
    }
  };
  writeDeployment("a", record);
  console.log(`Chain A ready: vault ${record.contracts.vault.address}`);
  console.log(`Funded demo borrower ${borrowerAddress} with 1000 dCOL`);
  console.log(`Recovery recipient: ${recoveryRecipient}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
