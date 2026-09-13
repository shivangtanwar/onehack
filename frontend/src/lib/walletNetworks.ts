import type { ChainConfig } from "../config";

type Wallet = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export async function selectNetwork(wallet: Wallet, chain: ChainConfig, addFirst = false) {
  if (![11155111n, 84532n, 31337n, 31338n].includes(chain.id))
    throw new Error("Only supported test networks are allowed.");
  const chainId = `0x${chain.id.toString(16)}`;
  const add = () =>
    wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          rpcUrls: [chain.rpc],
          ...(chain.explorer ? { blockExplorerUrls: [chain.explorer] } : {}),
          nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 }
        }
      ]
    });
  const select = () =>
    wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  if (addFirst) await add();
  try {
    await select();
  } catch (error: any) {
    if (addFirst || (error?.code ?? error?.data?.originalError?.code) !== 4902) throw error;
    await add();
    // Adding a network does not require the wallet to select it (EIP-3085).
    await select();
  }
  if (BigInt(String(await wallet.request({ method: "eth_chainId" }))) !== chain.id)
    throw new Error(`Please select ${chain.name} in your wallet.`);
}
