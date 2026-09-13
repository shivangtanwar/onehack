import { test, expect } from "@playwright/test";
import { selectNetwork } from "../src/lib/walletNetworks";
const sepolia = {
  name: "Ethereum Sepolia",
  id: 11155111n,
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  token: "",
  messenger: "",
  application: ""
};
const base = {
  ...sepolia,
  name: "Base Sepolia",
  id: 84532n,
  rpc: "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org"
};
for (const chain of [sepolia, base]) {
  test(`adding ${chain.name} explicitly switches even if the wallet stays on its old network`, async () => {
    const calls: any[] = [];
    let current = "0x1";
    await selectNetwork(
      {
        request: async (args) => {
          calls.push(args);
          if (args.method === "wallet_switchEthereumChain")
            current = (args.params![0] as any).chainId;
          return args.method === "eth_chainId" ? current : null;
        }
      },
      chain,
      true
    );
    expect(calls.map((x) => x.method)).toEqual([
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
      "eth_chainId"
    ]);
    expect(calls[0].params[0]).toEqual({
      chainId: `0x${chain.id.toString(16)}`,
      chainName: chain.name,
      rpcUrls: [chain.rpc],
      blockExplorerUrls: [chain.explorer],
      nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 }
    });
  });
}
test("unknown network is added and selected before a transaction can continue", async () => {
  const methods: string[] = [];
  let added = false;
  await selectNetwork(
    {
      request: async ({ method }) => {
        methods.push(method);
        if (method === "wallet_switchEthereumChain" && !added) throw { code: 4902 };
        if (method === "wallet_addEthereumChain") added = true;
        return method === "eth_chainId" ? "0xaa36a7" : null;
      }
    },
    sepolia
  );
  expect(methods).toEqual([
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
    "eth_chainId"
  ]);
});
test("cancellation stops network setup without switching or signing", async () => {
  const methods: string[] = [];
  await expect(
    selectNetwork(
      {
        request: async ({ method }) => {
          methods.push(method);
          throw { code: 4001 };
        }
      },
      sepolia,
      true
    )
  ).rejects.toEqual({ code: 4001 });
  expect(methods).toEqual(["wallet_addEthereumChain"]);
});
test("mainnet is rejected before contacting the wallet", async () => {
  let contacted = false;
  await expect(
    selectNetwork(
      {
        request: async () => {
          contacted = true;
        }
      },
      { ...sepolia, id: 1n },
      true
    )
  ).rejects.toThrow("Only supported test networks");
  expect(contacted).toBe(false);
});
test("wallet selecting the wrong chain cannot be reported as success", async () => {
  await expect(
    selectNetwork(
      { request: async ({ method }) => (method === "eth_chainId" ? "0x1" : null) },
      sepolia,
      true
    )
  ).rejects.toThrow("Please select Ethereum Sepolia");
});
