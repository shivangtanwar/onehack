import baseConfig from "./hardhat.config";
import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  ...baseConfig,
  networks: {
    ...baseConfig.networks,
    hardhat: { chainId: 31338, throwOnTransactionFailures: false }
  }
};

export default config;
