import fs from "node:fs";
import path from "node:path";

type BuildInfo = {
  solcLongVersion: string;
  input: Record<string, unknown>;
};

const deployments = [
  {
    chainId: 11155111,
    address: "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
    label: "dCOL",
    contractIdentifier: "contracts/mocks/MockCollateralToken.sol:MockCollateralToken"
  },
  {
    chainId: 11155111,
    address: "0x3BA4CADeD1F5A98e5A88728e9CF4218091A754d3",
    label: "Sepolia messenger",
    contractIdentifier: "contracts/messaging/SignedRelayerMessenger.sol:SignedRelayerMessenger"
  },
  {
    chainId: 11155111,
    address: "0xd5b4a096de2d668Db01eab08D76c11a563b38Bf3",
    label: "CollateralVault",
    contractIdentifier: "contracts/CollateralVault.sol:CollateralVault"
  },
  {
    chainId: 84532,
    address: "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
    label: "Base messenger",
    contractIdentifier: "contracts/messaging/SignedRelayerMessenger.sol:SignedRelayerMessenger"
  },
  {
    chainId: 84532,
    address: "0x4D1aE7eBcfE1bEdc3c5aFb592871d8B3ec76bA52",
    label: "dUSD",
    contractIdentifier: "contracts/mocks/MockLoanToken.sol:MockLoanToken"
  },
  {
    chainId: 84532,
    address: "0x3d38c71541ED82c313EBEBFdAb20a0CDEbb76770",
    label: "LendingPool",
    contractIdentifier: "contracts/LendingPool.sol:LendingPool"
  }
];

async function main() {
  const buildDirectory = path.join(process.cwd(), "artifacts", "build-info");
  const buildFiles = fs
    .readdirSync(buildDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort(
      (left, right) =>
        fs.statSync(path.join(buildDirectory, right)).mtimeMs -
        fs.statSync(path.join(buildDirectory, left)).mtimeMs
    );
  if (!buildFiles[0]) throw new Error("No Hardhat build-info file found");
  const build = JSON.parse(
    fs.readFileSync(path.join(buildDirectory, buildFiles[0]), "utf8")
  ) as BuildInfo;

  for (const deployment of deployments) {
    const endpoint = `https://sourcify.dev/server/v2/verify/${deployment.chainId}/${deployment.address}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stdJsonInput: build.input,
        compilerVersion: build.solcLongVersion,
        contractIdentifier: deployment.contractIdentifier
      })
    });
    const body = await response.text();
    if (response.status === 409) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.customCode === "already_verified") {
          console.log(`${deployment.label}: already verified (exact match)`);
          continue;
        }
      } catch {
        // Fall through to the ordinary error report.
      }
    }
    if (!response.ok) {
      console.log(`${deployment.label}: verification unavailable (${response.status}) ${body}`);
      continue;
    }
    console.log(`${deployment.label}: verified (${response.status})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
