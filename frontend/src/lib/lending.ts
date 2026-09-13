import { Contract, FetchRequest, Interface, JsonRpcProvider, ethers } from "ethers";
import { chainA, chainB, type ChainConfig } from "../config";
import { erc20Abi, poolAbi, vaultAbi, messengerAbi } from "../contracts";

export type SavedLoan = { id: string; name: string };
export type Position = SavedLoan & {
  owner: string;
  collateral: bigint;
  principal: bigint;
  collateralState: number;
  loanId: bigint;
  loanState: number;
  createdAt: number;
  deadline: number;
  amountDue: bigint;
};
export type Balances = {
  collateral: bigint;
  loan: bigint;
  allowance: bigint;
  liquidity: bigint;
  maxLtv: number;
  duration: number;
  apr: number;
};
export type Transaction = {
  id: string;
  collateralId: string;
  title: string;
  hash: string;
  chain: "a" | "b";
  timestamp: number;
  block: number;
};
export const emptyBalances: Balances = {
  collateral: 0n,
  loan: 0n,
  allowance: 0n,
  liquidity: 0n,
  maxLtv: 50,
  duration: 0,
  apr: 0
};
function provider(chain: ChainConfig) {
  const request = new FetchRequest(chain.rpc);
  request.timeout = 15_000;
  return new JsonRpcProvider(request, Number(chain.id), { staticNetwork: true });
}
export const providerA = provider(chainA),
  providerB = provider(chainB);
export const vault = new Contract(chainA.application, vaultAbi, providerA);
export const pool = new Contract(chainB.application, poolAbi, providerB);
export const tokenA = new Contract(chainA.token, erc20Abi, providerA);
export const tokenB = new Contract(chainB.token, erc20Abi, providerB);
export const deploymentKey = `${chainA.id}:${chainA.application.toLowerCase()}:${chainB.id}:${chainB.application.toLowerCase()}`;
export const isPublicDemo =
  chainA.id === 11155111n &&
  chainB.id === 84532n &&
  chainA.application.toLowerCase() === "0xd5b4a096de2d668db01eab08d76c11a563b38bf3" &&
  chainB.application.toLowerCase() === "0x3d38c71541ed82c313ebebfdab20a0cdebb76770";
export function storageRead<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function storageWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The app remains usable without browser storage. */
  }
}
export function parseAmount(value: string): bigint | null {
  try {
    if (!/^\d+(\.\d*)?$/.test(value)) return null;
    const n = ethers.parseEther(value);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}
export function format(value: bigint, digits = 4) {
  const [whole, decimals = ""] = ethers.formatEther(value).split(".");
  const fraction = decimals.slice(0, digits).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
export function compact(value: string) {
  return value.length > 18 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
export function dateTime(value: number) {
  return value
    ? new Date(value * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "—";
}
export function duration(value: number) {
  return value < 60
    ? `${value} seconds`
    : value < 3600
      ? `${Math.round(value / 60)} minutes`
      : value < 86400
        ? `${Math.round(value / 3600)} hours`
        : `${Math.round(value / 86400)} days`;
}
export function deadlineHint(deadline: number, now = Date.now() / 1000) {
  const seconds = Math.ceil(deadline - now);
  const distance = Math.abs(seconds);
  const label =
    distance >= 86400
      ? `${Math.floor(distance / 86400)}d ${Math.floor((distance % 86400) / 3600)}h`
      : distance >= 3600
        ? `${Math.floor(distance / 3600)}h ${Math.floor((distance % 3600) / 60)}m`
        : `${Math.floor(distance / 60)}m ${distance % 60}s`;
  return seconds > 0 ? `${label} left to repay` : `Overdue by ${label}`;
}

export function status(
  p: Position,
  now = Date.now() / 1000
): { label: string; tone: string; group: string } {
  if (p.collateralState === 4) return { label: "Liquidated", tone: "red", group: "closed" };
  if (p.collateralState === 3) return { label: "Repaid", tone: "green", group: "closed" };
  if (p.loanState === 4) return { label: "Recovery pending", tone: "amber", group: "active" };
  if (p.loanState === 2) return { label: "Return pending", tone: "blue", group: "active" };
  if (p.loanState === 3) return { label: "Defaulted", tone: "red", group: "attention" };
  if (p.loanState === 1 && p.deadline < now)
    return { label: "Overdue", tone: "red", group: "attention" };
  if (p.loanState === 1) return { label: "Active", tone: "green", group: "active" };
  return { label: "Processing", tone: "blue", group: "active" };
}
export async function readPosition(saved: SavedLoan): Promise<Position> {
  const lock = await vault.collaterals(saved.id);
  if (Number(lock.state) === 0)
    throw new Error("No collateral was found for this ID on the selected network.");
  const loanId = BigInt(await pool.loanByCollateral(saved.id));
  const loan = loanId > 0n ? await pool.loans(loanId) : null;
  const loanState = loan ? Number(loan.state) : 0;
  return {
    ...saved,
    owner: lock.owner,
    collateral: BigInt(lock.amount),
    principal: BigInt(lock.requestedPrincipal),
    collateralState: Number(lock.state),
    loanId,
    loanState,
    createdAt: Number(lock.createdAt),
    deadline: loan ? Number(loan.deadline) : 0,
    amountDue: loanState === 1 || loanState === 3 ? BigInt(await pool.amountDue(loanId)) : 0n
  };
}
export async function readBalances(account: string): Promise<Balances> {
  const [collateral, loan, allowance, liquidity, maxLtv, term, apr] = await Promise.all([
    account ? tokenA.balanceOf(account) : 0n,
    account ? tokenB.balanceOf(account) : 0n,
    account ? tokenA.allowance(account, chainA.application) : 0n,
    tokenB.balanceOf(chainB.application),
    pool.maxLtvBps(),
    pool.loanDuration(),
    pool.annualInterestBps()
  ]);
  return {
    collateral: BigInt(collateral),
    loan: BigInt(loan),
    allowance: BigInt(allowance),
    liquidity: BigInt(liquidity),
    maxLtv: Number(maxLtv) / 100,
    duration: Number(term),
    apr: Number(apr) / 100
  };
}

// Cross-check the event index against the pool's authoritative loan registry.
// Persist the cursor per wallet so subsequent refreshes only read newly issued loans.
export async function findIssuedLoans(account: string): Promise<string[]> {
  const key = `databaes.issued.v1:${deploymentKey}:${account.toLowerCase()}`;
  const count = Number(await pool.loanCount());
  const saved = storageRead<{ through: number; ids: string[] }>(key, { through: 0, ids: [] });
  const cached = saved.through > count ? { through: 0, ids: [] as string[] } : saved;
  const ids = new Set(cached.ids);
  for (let start = cached.through + 1; start <= count; start += 20) {
    const end = Math.min(start + 19, count);
    const loans = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, offset) => pool.loans(start + offset))
    );
    for (const loan of loans) {
      if (
        loan.borrower.toLowerCase() === account.toLowerCase() &&
        BigInt(loan.sourceChainId) === chainA.id &&
        loan.sourceVault.toLowerCase() === chainA.application.toLowerCase()
      )
        ids.add(loan.collateralId);
    }
    storageWrite(key, { through: end, ids: [...ids] });
  }
  return [...ids];
}
const starts = {
  a: Number(import.meta.env.VITE_CHAIN_A_START_BLOCK ?? (isPublicDemo ? 0xb232f3 : 0)),
  b: Number(import.meta.env.VITE_CHAIN_B_START_BLOCK ?? (isPublicDemo ? 0x2c7f364 : 0))
};
const eventNames: Record<string, string> = {
  CollateralLocked: "Collateral locked",
  CollateralPledged: "Collateral confirmed",
  CollateralReleased: "Collateral returned",
  CollateralLiquidated: "Collateral recovered",
  LoanIssued: "Loan received",
  LoanRepaid: "Loan repaid",
  LoanDefaulted: "Loan defaulted",
  LoanLiquidated: "Loan liquidated"
};
type IndexedEvent = Transaction & { owner?: string };
const scans = new Map<string, Promise<IndexedEvent[]>>();
// Incremental, deployment-scoped event history. Re-read a small overlap on every scan.
export async function scanEvents(chain: "a" | "b"): Promise<IndexedEvent[]> {
  const key = `databaes.events.v2:${deploymentKey}:${chain}`;
  const running = scans.get(key);
  if (running) return running;
  const work = (async () => {
    const rpc = chain === "a" ? providerA : providerB,
      contract = chain === "a" ? vault : pool;
    const latest = await rpc.getBlockNumber();
    const cache = storageRead<{ through: number; events: IndexedEvent[] }>(key, {
      through: starts[chain] - 1,
      events: []
    });
    const from = Math.max(
      starts[chain],
      cache.through > latest ? starts[chain] : cache.through - 12
    );
    const events = cache.through > latest ? [] : cache.events.filter((e) => e.block < from);
    const blocks = new Map<number, number>();
    for (let start = from; start <= latest; start += 9000) {
      const end = Math.min(start + 8999, latest);
      const logs = await rpc.getLogs({
        address: contract.target as string,
        fromBlock: start,
        toBlock: end
      });
      for (const log of logs) {
        const parsed = contract.interface.parseLog(log);
        if (!parsed || !eventNames[parsed.name]) continue;
        if (!blocks.has(log.blockNumber))
          blocks.set(log.blockNumber, (await rpc.getBlock(log.blockNumber))?.timestamp ?? 0);
        events.push({
          id: `${chain}:${log.transactionHash}:${log.index}`,
          collateralId: parsed.args.collateralId,
          title: eventNames[parsed.name],
          hash: log.transactionHash,
          chain,
          timestamp: blocks.get(log.blockNumber)!,
          block: log.blockNumber,
          owner: parsed.name === "CollateralLocked" ? parsed.args.owner : undefined
        });
      }
      storageWrite(key, { through: end, events });
    }
    return events;
  })();
  scans.set(key, work);
  try {
    return await work;
  } finally {
    scans.delete(key);
  }
}
const interfaces = [new Interface(vaultAbi), new Interface(poolAbi), new Interface(messengerAbi)];
export function friendlyError(error: any): string {
  if (error?.code === "ACTION_REJECTED" || error?.code === 4001)
    return "You cancelled the wallet request. Nothing was changed.";
  if (error?.code === "INSUFFICIENT_FUNDS")
    return "Your wallet needs test ETH to cover the network fee.";
  const data = error?.data?.data ?? error?.data ?? error?.info?.error?.data;
  if (typeof data === "string")
    for (const abi of interfaces) {
      try {
        const parsed = abi.parseError(data);
        if (parsed)
          return `The contract could not complete this action (${parsed.name}). Refresh your loan and try again.`;
      } catch {
        /* Try the next ABI. */
      }
    }
  if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT", "BAD_DATA"].includes(error?.code))
    return "We couldn’t reach the network. Please try again in a moment.";
  return String(
    error?.shortMessage ??
      error?.reason ??
      error?.message ??
      "Something went wrong. Please try again."
  ).slice(0, 220);
}
