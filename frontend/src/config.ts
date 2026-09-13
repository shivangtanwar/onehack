export type ChainConfig = {
  name: string;
  id: bigint;
  rpc: string;
  explorer: string;
  token: string;
  messenger: string;
  application: string;
};

export const chainA: ChainConfig = {
  name: import.meta.env.VITE_CHAIN_A_NAME ?? "Ethereum Sepolia",
  id: BigInt(import.meta.env.VITE_CHAIN_A_ID ?? "11155111"),
  rpc: import.meta.env.VITE_CHAIN_A_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: import.meta.env.VITE_CHAIN_A_EXPLORER ?? "https://sepolia.etherscan.io",
  token: import.meta.env.VITE_COLLATERAL_TOKEN ?? "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
  messenger: import.meta.env.VITE_CHAIN_A_MESSENGER ?? "0x3BA4CADeD1F5A98e5A88728e9CF4218091A754d3",
  application: import.meta.env.VITE_VAULT ?? "0xd5b4a096de2d668Db01eab08D76c11a563b38Bf3"
};

export const chainB: ChainConfig = {
  name: import.meta.env.VITE_CHAIN_B_NAME ?? "Base Sepolia",
  id: BigInt(import.meta.env.VITE_CHAIN_B_ID ?? "84532"),
  rpc: import.meta.env.VITE_CHAIN_B_RPC ?? "https://sepolia.base.org",
  explorer: import.meta.env.VITE_CHAIN_B_EXPLORER ?? "https://sepolia.basescan.org",
  messenger: import.meta.env.VITE_CHAIN_B_MESSENGER ?? "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
  token: import.meta.env.VITE_LOAN_TOKEN ?? "0x4D1aE7eBcfE1bEdc3c5aFb592871d8B3ec76bA52",
  application: import.meta.env.VITE_POOL ?? "0x3d38c71541ED82c313EBEBFdAb20a0CDEbb76770"
};

// Public builds must never send transactions to a mainnet or a local RPC.
const expectedIds = import.meta.env.PROD
  ? [11155111n, 84532n]
  : [11155111n, 84532n, 31337n, 31338n];
for (const chain of [chainA, chainB]) {
  if (!expectedIds.includes(chain.id)) throw new Error("Only supported test networks are allowed.");
  if (import.meta.env.PROD && !chain.rpc.startsWith("https://"))
    throw new Error("Public testnet RPCs must use HTTPS.");
}
if (import.meta.env.PROD && (chainA.id !== 11155111n || chainB.id !== 84532n))
  throw new Error("Public builds require Ethereum Sepolia and Base Sepolia.");
