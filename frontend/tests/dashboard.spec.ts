import { test, expect, type Page } from "@playwright/test";
import { Interface, ethers } from "ethers";
import { erc20Abi, poolAbi, vaultAbi } from "../src/contracts";
import { publicDemo } from "../src/demo";
const owner = publicDemo.borrower;
const other = "0x1111111111111111111111111111111111111111";
const a = {
  token: "0xf11dfc764ac5526e7d690183faefdfff0dc74868",
  vault: "0xd5b4a096de2d668db01eab08d76c11a563b38bf3"
};
const b = {
  token: "0x4d1ae7ebcfe1bedc3c5afb592871d8b3ec76ba52",
  pool: "0x3d38c71541ed82c313ebebfdab20a0cdebb76770"
};
const erc20 = new Interface(erc20Abi),
  vault = new Interface(vaultAbi),
  pool = new Interface(poolAbi);
const now = Math.floor(Date.now() / 1000);
const ids = [
  publicDemo.collateralId,
  `0x${"a".repeat(64)}`,
  `0x${"b".repeat(64)}`,
  `0x${"c".repeat(64)}`
];
const hashes = Array.from({ length: 12 }, (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}`);
const units = ethers.parseEther;
type Model = {
  connected?: boolean;
  failRpc?: boolean;
  rejectWallet?: boolean;
  allowance?: bigint;
  emptyEvents?: boolean;
  states?: Array<[number, number]>;
};
async function setup(page: Page, model: Model = {}) {
  let approvedAmount = model.allowance ?? 0n;
  const sent: string[] = [];
  const sentTransactions = new Map<string, any>();
  const states = model.states ?? [
    [4, 4],
    [2, 1],
    [2, 2],
    [1, 0]
  ];
  await page.addInitScript(
    ({ owner, connected, rejectWallet }) => {
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      let accounts = connected ? [owner] : [];
      let chain = "0xaa36a7";
      (window as any).ethereum = {
        on: (event: string, fn: (...a: unknown[]) => void) => (listeners[event] ??= []).push(fn),
        removeListener: (event: string, fn: (...a: unknown[]) => void) => {
          listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        },
        request: async ({ method, params }: { method: string; params?: any[] }) => {
          if (method === "eth_accounts") return accounts;
          if (method === "eth_chainId") return chain;
          if (method === "eth_requestAccounts") {
            accounts = [owner];
            return accounts;
          }
          if (method === "wallet_switchEthereumChain") {
            if (rejectWallet)
              throw Object.assign(new Error("User rejected request"), { code: 4001 });
            chain = params![0].chainId;
            (listeners.chainChanged || []).forEach((fn) => fn(chain));
            return null;
          }
          if (rejectWallet) throw Object.assign(new Error("User rejected request"), { code: 4001 });
          const response = await fetch(
            chain === "0xaa36a7"
              ? "https://ethereum-sepolia-rpc.publicnode.com"
              : "https://sepolia.base.org",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] })
            }
          );
          const value = await response.json();
          if (value.error) throw value.error;
          return value.result;
        }
      };
      (window as any).switchTestAccount = (account: string) => {
        accounts = account ? [account] : [];
        (listeners.accountsChanged || []).forEach((fn) => fn(accounts));
      };
    },
    { owner, connected: model.connected ?? false, rejectWallet: model.rejectWallet ?? true }
  );
  const logs = (chain: "a" | "b") => {
    const result: any[] = [];
    states.forEach(([collateralState, loanState], index) => {
      const event =
        chain === "a"
          ? vault.encodeEventLog(vault.getEvent("CollateralLocked")!, [
              ids[index],
              owner,
              "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
              units("100"),
              units("50"),
              index + 1,
              now + 7200
            ])
          : loanState
            ? pool.encodeEventLog(pool.getEvent("LoanIssued")!, [
                index + 1,
                ids[index],
                owner,
                units("50"),
                now - 20,
                11155111,
                a.vault
              ])
            : null;
      if (event)
        result.push({
          ...event,
          address: chain === "a" ? a.vault : b.pool,
          blockNumber: ethers.toQuantity(chain === "a" ? 0xb232f5 + index : 0x2c7f366 + index),
          blockHash: hashes[10],
          transactionHash: hashes[index + (chain === "a" ? 0 : 4)],
          transactionIndex: "0x0",
          logIndex: ethers.toQuantity(index),
          removed: false
        });
    });
    return result;
  };
  await page.route(
    /https:\/\/(ethereum-sepolia-rpc.publicnode.com|sepolia.base.org)/,
    async (route) => {
      if (model.failRpc) {
        await route.fulfill({ status: 503, body: "Offline" });
        return;
      }
      const chain: "a" | "b" = route.request().url().includes("publicnode") ? "a" : "b";
      const payload = route.request().postDataJSON();
      function result(req: any): any {
        if (req.method === "eth_chainId") return chain === "a" ? "0xaa36a7" : "0x14a34";
        if (req.method === "eth_blockNumber") return chain === "a" ? "0xb23300" : "0x2c7f380";
        if (req.method === "eth_getLogs" && model.emptyEvents) return [];
        if (req.method === "eth_getLogs")
          return logs(chain).filter(
            (log) =>
              Number(log.blockNumber) >= Number(req.params[0].fromBlock) &&
              Number(log.blockNumber) <= Number(req.params[0].toBlock)
          );
        if (req.method === "eth_getBlockByNumber")
          return {
            number:
              req.params[0] === "latest"
                ? chain === "a"
                  ? "0xb23300"
                  : "0x2c7f380"
                : req.params[0],
            hash: hashes[10],
            parentHash: hashes[11],
            timestamp: ethers.toQuantity(now - 100),
            nonce: "0x0000000000000000",
            difficulty: "0x0",
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            miner: ethers.ZeroAddress,
            extraData: "0x",
            transactions: [],
            baseFeePerGas: "0x1"
          };
        if (["eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas"].includes(req.method))
          return "0x186a0";
        if (req.method === "eth_getTransactionCount") return "0x0";
        if (req.method === "eth_sendTransaction") {
          const input = req.params[0],
            target = input.to.toLowerCase();
          const abi = target === a.vault ? vault : target === b.pool ? pool : erc20;
          const parsed = abi.parseTransaction({ data: input.data })!;
          const hash = `0x${(100 + sent.length).toString(16).padStart(64, "0")}`;
          sent.push(parsed.name);
          let event: { topics: string[]; data: string } | undefined;
          if (parsed.name === "approve") approvedAmount = BigInt(parsed.args[1]);
          if (parsed.name === "lockCollateral") {
            const id = `0x${"d".repeat(64)}`;
            ids[4] = id;
            states[4] = [1, 0];
            event = vault.encodeEventLog(vault.getEvent("CollateralLocked")!, [
              id,
              owner,
              "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
              parsed.args[0],
              parsed.args[1],
              5,
              parsed.args[2]
            ]);
          }
          if (parsed.name === "repay") states[Number(parsed.args[0]) - 1][1] = 2;
          const blockNumber = chain === "a" ? "0xb23300" : "0x2c7f380";
          sentTransactions.set(hash, {
            tx: {
              hash,
              to: input.to,
              from: owner,
              nonce: "0x0",
              gas: "0x186a0",
              gasPrice: "0x1",
              value: "0x0",
              input: input.data,
              blockHash: hashes[10],
              blockNumber,
              transactionIndex: "0x0",
              type: "0x0",
              v: "0x1b",
              r: hashes[0],
              s: hashes[1],
              chainId: chain === "a" ? "0xaa36a7" : "0x14a34"
            },
            receipt: {
              transactionHash: hash,
              transactionIndex: "0x0",
              blockHash: hashes[10],
              blockNumber,
              from: owner,
              to: input.to,
              cumulativeGasUsed: "0x186a0",
              gasUsed: "0x186a0",
              effectiveGasPrice: "0x1",
              contractAddress: null,
              status: "0x1",
              type: "0x0",
              logsBloom: `0x${"0".repeat(512)}`,
              logs: event
                ? [
                    {
                      ...event,
                      address: input.to,
                      blockNumber,
                      blockHash: hashes[10],
                      transactionHash: hash,
                      transactionIndex: "0x0",
                      logIndex: "0x0",
                      removed: false
                    }
                  ]
                : []
            }
          });
          return hash;
        }
        if (req.method === "eth_getTransactionByHash")
          return sentTransactions.get(req.params[0])?.tx ?? null;
        if (req.method === "eth_getTransactionReceipt")
          return sentTransactions.get(req.params[0])?.receipt ?? null;
        if (req.method === "eth_call") {
          const call = req.params[0],
            target = call.to.toLowerCase();
          const abi = target === a.vault ? vault : target === b.pool ? pool : erc20;
          const parsed = abi.parseTransaction({ data: call.data })!;
          let value: any[];
          switch (parsed.name) {
            case "balanceOf":
              value = [units(parsed.args[0].toLowerCase() === other ? "0" : "1000")];
              break;
            case "allowance":
              value = [approvedAmount];
              break;
            case "loanCount":
              value = [states.filter(([, state]) => state > 0).length];
              break;
            case "maxLtvBps":
              value = [5000];
              break;
            case "loanDuration":
              value = [180];
              break;
            case "annualInterestBps":
              value = [0];
              break;
            case "collaterals": {
              const i = ids.indexOf(parsed.args[0]);
              value =
                i >= 0
                  ? [
                      owner,
                      "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
                      units("100"),
                      units("50"),
                      i + 1,
                      i + 1,
                      now - 100,
                      now + 7200,
                      states[i][0]
                    ]
                  : [ethers.ZeroAddress, ethers.ZeroAddress, 0, 0, 0, 0, 0, 0, 0];
              break;
            }
            case "loanByCollateral": {
              const i = ids.indexOf(parsed.args[0]);
              value = [i >= 0 && states[i][1] ? i + 1 : 0];
              break;
            }
            case "loans": {
              const i = Number(parsed.args[0]) - 1;
              value = [
                ids[i],
                owner,
                "0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868",
                units("100"),
                units("50"),
                now - 100,
                now - 20,
                11155111,
                a.vault,
                i + 1,
                states[i][1]
              ];
              break;
            }
            case "amountDue":
              value = [units("50")];
              break;
            default:
              throw new Error(`Unexpected call ${parsed.name}`);
          }
          return abi.encodeFunctionResult(parsed.name, value);
        }
        throw new Error(`Unexpected RPC ${req.method}`);
      }
      const respond = (req: any) => {
        try {
          return { jsonrpc: "2.0", id: req.id, result: result(req) };
        } catch (e: any) {
          return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: e.message } };
        }
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(payload) ? payload.map(respond) : respond(payload))
      });
    }
  );
  await page.goto("/");
  return { ids, sent };
}
async function openNav(page: Page, label: string) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("disconnected personal pages prompt for a wallet and keep the demo separate", async ({
  page
}) => {
  await setup(page);
  await expect(
    page.getByRole("heading", { name: "Connect your wallet to view your loans" })
  ).toBeVisible();
  await expect(page.locator(".stat-card")).toHaveCount(0);
  for (const label of ["My loans", "Activity & history"]) {
    await openNav(page, label);
    await expect(page.locator(".loan-table tbody tr")).toHaveCount(0);
    await expect(page.locator(".transaction-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Track a loan", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Connect your wallet to view your/ })
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Explore public demo", exact: true }).click();
  await expect(page).toHaveURL(/#demo$/);
  await expect(page.getByRole("heading", { name: "Public demo loan", exact: true })).toBeVisible();
  await expect(page.getByText("Read-only example", { exact: true })).toBeVisible();
  await expect(page.getByText(/separate from your wallet’s loans and balances/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Collateral locked/ })).toHaveAttribute(
    "href",
    publicDemo.transactions.lock.url
  );
  await expect(page.getByRole("button", { name: /Repay|Save name|Track a loan/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Public demo loan", exact: true })).toBeVisible();
  await openNav(page, "My loans");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Connect your wallet to view your loans" })
  ).toBeVisible();
  await expect(page.getByText("Public demo loan", { exact: true })).toHaveCount(0);
});
test("disconnecting removes personal rows and activity immediately", async ({ page }) => {
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await openNav(page, "My loans");
  await page.evaluate(() => (window as any).switchTestAccount(""));
  await expect(
    page.getByRole("heading", { name: "Connect your wallet to view your loans" })
  ).toBeVisible();
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(0);
  await openNav(page, "Overview");
  await expect(page.locator(".stat-card")).toHaveCount(0);
  await openNav(page, "Activity & history");
  await expect(
    page.getByRole("heading", { name: "Connect your wallet to view your activity" })
  ).toBeVisible();
});
test("old anonymous watchlists never appear in a connected wallet", async ({ page }) => {
  await page.addInitScript(
    ({ id }) => {
      localStorage.setItem("databaes.collateralId", id);
      localStorage.setItem(
        "databaes.loans.v2:11155111:0xd5b4a096de2d668db01eab08d76c11a563b38bf3:84532:0x3d38c71541ed82c313ebebfdab20a0cdebb76770:watchlist",
        JSON.stringify([{ id, name: "Old anonymous loan" }])
      );
    },
    { id: publicDemo.collateralId }
  );
  await setup(page, {
    emptyEvents: true,
    states: [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0]
    ]
  });
  await openNav(page, "My loans");
  await page.getByRole("main").getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByText("Room for your next move")).toBeVisible();
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(0);
  await openNav(page, "Public demo");
  await expect(page.getByRole("heading", { name: "Public demo loan", exact: true })).toBeVisible();
  await openNav(page, "My loans");
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(0);
});
test("wallet loans are discovered; return pending is not counted as completed", async ({
  page
}) => {
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await expect(page.getByText("Return pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(
    page.locator(".stat-card").filter({ hasText: "Completed loans" }).locator("strong")
  ).toHaveText("1");
  await openNav(page, "My loans");
  await page.getByRole("button", { name: "Completed 1" }).click();
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "In progress 2" }).click();
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(2);
  await page.getByPlaceholder("Search name, loan number, or collateral ID").fill("does not exist");
  await expect(page.getByText("No loans match this view")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
});
test("wallet changes clear the previous portfolio and balances", async ({ page }) => {
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await page.evaluate((account) => (window as any).switchTestAccount(account), other);
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(0);
  await expect(page.getByText("Room for your next move")).toBeVisible();
  await expect(
    page.locator(".stat-card").filter({ hasText: "Open loans" }).locator("strong")
  ).toHaveText("0");
});
test("borrowing validates balance and ratio before the review and wallet acknowledgement", async ({
  page
}) => {
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "New loan", exact: true }).last().click();
  await page.getByLabel("You receive", { exact: true }).fill("51");
  await expect(page.getByText("You can borrow up to 50 dUSD with this collateral.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review loan", exact: true })).toBeDisabled();
  await page.getByLabel("You lock", { exact: true }).fill("1001");
  await expect(page.getByText(/more dCOL than you have available/)).toBeVisible();
  await page.getByLabel("You lock", { exact: true }).fill("100");
  await page.getByLabel("You receive", { exact: true }).fill("50");
  await page.getByLabel("Give your loan a name").fill("September expenses");
  await page.getByRole("button", { name: "Review loan", exact: true }).click();
  await expect(page.getByText("Everything look right?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve 100 dCOL" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Approve 100 dCOL" })).toBeEnabled();
  await page.getByRole("button", { name: "Approve 100 dCOL" }).click();
  await expect(
    page.getByText("You cancelled the wallet request. Nothing was changed.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve 100 dCOL" })).toBeEnabled();
});
test("approved collateral proceeds to a separate lock confirmation", async ({ page }) => {
  await setup(page, { connected: true, allowance: units("100") });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "New loan", exact: true }).last().click();
  await page.getByRole("button", { name: "Review loan", exact: true }).click();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Lock collateral & request loan" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Approve 100 dCOL" })).toHaveCount(0);
});
test("tracking validates IDs, renaming persists, and Escape closes a focused dialog", async ({
  page
}) => {
  await setup(page, { connected: true, emptyEvents: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(3);
  await openNav(page, "My loans");
  await page.getByRole("button", { name: "Track a loan", exact: true }).click();
  await page.getByLabel("Collateral ID", { exact: true }).fill("0x123");
  await page.getByRole("button", { name: "Add to my loans" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a valid collateral ID");
  await page.getByLabel("Collateral ID", { exact: true }).fill(ids[3]);
  await page.getByLabel("Loan name Optional", { exact: true }).fill("Tracked expenses");
  await page.getByRole("button", { name: "Add to my loans" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Tracked expenses" })
  ).toBeVisible();
  await page.getByText("Loan settings & contract details", { exact: true }).click();
  await page.getByLabel("Loan name", { exact: true }).fill("Renamed expenses");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Renamed expenses" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "View Renamed expenses" })).toBeVisible();
});
test("history supports network and type filters, search, and a CSV download", async ({ page }) => {
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await openNav(page, "Activity & history");
  await expect(page.locator(".transaction-row")).toHaveCount(7);
  await page.getByLabel("Filter by network").selectOption("b");
  await expect(page.locator(".transaction-row")).toHaveCount(3);
  await page.getByLabel("Filter by activity type").selectOption("collateral");
  await expect(page.getByText("No matching activity")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Search activity").fill(hashes[0]);
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/databaes-history-.*\.csv/);
});
test("repayment has a review and pending collateral stays in the vault", async ({ page }) => {
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await page
    .locator("tr")
    .filter({ hasText: "Return pending" })
    .getByRole("button", { name: /View Cross-chain loan/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("collateral is still in the vault");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Repay loan", exact: true })
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .locator("tr")
    .filter({ hasText: "Overdue" })
    .getByRole("button", { name: /View Cross-chain loan/ })
    .click();
  await page.getByRole("button", { name: "Repay loan", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review loan action" })).toContainText(
    "approximately 50 dUSD"
  );
  await page.getByRole("button", { name: "Confirm in wallet", exact: true }).click();
  await expect(
    page.getByText("You cancelled the wallet request. Nothing was changed.")
  ).toBeVisible();
});
test("unavailable networks never show a fabricated zero balance", async ({ page }) => {
  await setup(page, { failRpc: true, connected: true });
  await expect(page.getByText("Updates are paused.")).toBeVisible({ timeout: 25000 });
  await expect(
    page.locator(".stat-card").filter({ hasText: "Collateral locked" }).locator("strong")
  ).toHaveText("— dCOL");
  await page.getByRole("button", { name: "New loan", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Review loan", exact: true })).toBeDisabled();
});
test("mobile navigation, pages, and dialogs fit without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { connected: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  for (const label of [
    "My loans",
    "Activity & history",
    "Safety & contracts",
    "Public demo",
    "Overview"
  ]) {
    await openNav(page, label);
    await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  }
  await page.getByRole("button", { name: "New loan", exact: true }).last().click();
  await expect(page.getByLabel("You lock", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test("successful approval and lock saves the new loan and opens its progress", async ({ page }) => {
  const { sent } = await setup(page, { connected: true, rejectWallet: false });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "New loan", exact: true }).last().click();
  await page.getByLabel("Give your loan a name").fill("My new loan");
  await page.getByRole("button", { name: "Review loan", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve 100 dCOL" }).click();
  await expect(page.getByRole("button", { name: "Lock collateral & request loan" })).toBeEnabled();
  await page.getByRole("button", { name: "Lock collateral & request loan" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "My new loan" })
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("The lock cannot be cancelled");
  expect(sent).toEqual(["approve", "lockCollateral"]);
});
test("successful repayment pays the loan while collateral return remains pending", async ({
  page
}) => {
  const { sent } = await setup(page, { connected: true, rejectWallet: false });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(4);
  await page
    .locator("tr")
    .filter({ hasText: "Overdue" })
    .getByRole("button", { name: /View Cross-chain loan/ })
    .click();
  await page.getByRole("button", { name: "Repay loan", exact: true }).click();
  await page.getByRole("button", { name: "Confirm in wallet", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your collateral is still in the vault while its return is processed."
  );
  await expect(page.getByRole("dialog")).toContainText("Paid in full");
  expect(sent).toEqual(["approve", "repay"]);
});

test("loan registry finds issued loans even when historical events are unavailable", async ({
  page
}) => {
  await setup(page, { connected: true, emptyEvents: true });
  await expect(page.locator(".loan-table tbody tr")).toHaveCount(3);
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(page.getByText("Return pending", { exact: true })).toBeVisible();
});

test("loan network buttons report wallet cancellation and remain usable", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "New loan", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Set up your test networks" })).toBeVisible();
  await page.getByRole("button", { name: "Add Ethereum Sepolia", exact: true }).click();
  await expect(
    page.getByText("You cancelled the wallet request. Nothing was changed.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Base Sepolia", exact: true })).toBeEnabled();
});
