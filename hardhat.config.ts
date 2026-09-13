import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 500 },
      viaIR: true,
      evmVersion: "paris"
    }
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhostA: { url: "http://127.0.0.1:8545", chainId: 31337 },
    localhostB: { url: "http://127.0.0.1:9545", chainId: 31338 },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545",
      chainId: 11155111,
      accounts
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "http://127.0.0.1:9545",
      chainId: 84532,
      accounts
    }
  },
  mocha: { timeout: 60_000 }
};

export default config;
