import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { chainA, chainB, type ChainConfig } from "../config";
import { erc20Abi, poolAbi, vaultAbi } from "../contracts";
import { selectNetwork } from "./walletNetworks";
import {
  deploymentKey,
  emptyBalances,
  findIssuedLoans,
  friendlyError,
  readBalances,
  readPosition,
  scanEvents,
  storageRead,
  storageWrite,
  type Position,
  type SavedLoan,
  type Transaction
} from "./lending";
export type Notice = {
  id: number;
  title: string;
  detail: string;
  kind: "success" | "error" | "info";
};
export function useLending() {
  const [account, setAccount] = useState("");
  const [walletChain, setWalletChain] = useState<bigint | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balances, setBalances] = useState(emptyBalances);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [discoveryError, setDiscoveryError] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pending, setPending] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tick, setTick] = useState(0);
  const scope = `${deploymentKey}:${account.toLowerCase() || "watchlist"}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const busy = useRef(false);
  const [saved, setSaved] = useState<SavedLoan[]>([]);
  const notify = useCallback((title: string, detail: string, kind: Notice["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setNotices((n) => [{ id, title, detail, kind }, ...n].slice(0, 3));
    window.setTimeout(
      () => setNotices((n) => n.filter((x) => x.id !== id)),
      kind === "error" ? 15000 : 6500
    );
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const ethereum = window.ethereum;
    if (!ethereum) {
      setWalletReady(true);
      return;
    }
    const changeAccount = (value: unknown) => {
      const next = Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
      setAccount(next);
    };
    const changeChain = (value: unknown) => {
      if (typeof value === "string") setWalletChain(BigInt(value));
    };
    Promise.allSettled([
      ethereum.request({ method: "eth_accounts" }),
      ethereum.request({ method: "eth_chainId" })
    ]).then((results) => {
      if (cancelled) return;
      if (results[0].status === "fulfilled" && !sessionStorage.getItem("databaes.disconnected"))
        changeAccount(results[0].value);
      if (results[1].status === "fulfilled") changeChain(results[1].value);
      setWalletReady(true);
    });
    ethereum.on?.("accountsChanged", changeAccount);
    ethereum.on?.("chainChanged", changeChain);
    return () => {
      cancelled = true;
      ethereum.removeListener?.("accountsChanged", changeAccount);
      ethereum.removeListener?.("chainChanged", changeChain);
    };
  }, []);
  useEffect(() => {
    setPositions([]);
    setBalances(emptyBalances);
    setReady(false);
    setLastUpdated(null);
    setError("");
    setTransactions([]);
    setHistoryLoading(false);
    setHistoryError("");
    setDiscoveryError("");
    // Disconnected watchlists and demo records never populate a wallet portfolio.
    // Keep older browser storage intact, but only restore records scoped to a wallet.
    if (!account) {
      setSaved([]);
      return;
    }
    const records = storageRead<SavedLoan[]>(`databaes.loans.v2:${scope}`, []);
    const valid = Array.isArray(records)
      ? records.filter((x) => x && ethers.isHexString(x.id, 32) && typeof x.name === "string")
      : [];
    setSaved(valid);
  }, [scope, account]);
  const saveLoans = useCallback(
    (next: SavedLoan[]) => {
      setSaved(next);
      storageWrite(`databaes.loans.v2:${scope}`, next);
    },
    [scope]
  );
  useEffect(() => {
    if (!walletReady) return;
    let cancelled = false,
      running = false;
    async function refresh() {
      if (running) return;
      running = true;
      setRefreshing(true);
      const results = await Promise.allSettled([
        readBalances(account),
        Promise.all(saved.map(readPosition))
      ]);
      if (!cancelled) {
        if (results[0].status === "fulfilled") {
          setBalances(results[0].value);
          setReady(true);
        }
        if (results[1].status === "fulfilled")
          setPositions(results[1].value.sort((a, b) => b.createdAt - a.createdAt));
        const failed = results.find((r) => r.status === "rejected");
        setError(failed?.status === "rejected" ? friendlyError(failed.reason) : "");
        if (!failed) setLastUpdated(new Date());
        setRefreshing(false);
      }
      running = false;
    }
    void refresh();
    const interval = window.setInterval(refresh, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [walletReady, account, saved, revision]);
  // Find every lock created by this wallet, including requests still waiting for a loan.
  useEffect(() => {
    if (!account || !walletReady) {
      setDiscovering(false);
      return;
    }
    let cancelled = false;
    setDiscovering(true);
    setDiscoveryError("");
    Promise.allSettled([scanEvents("a"), findIssuedLoans(account)])
      .then(([events, issued]) => {
        if (cancelled) return;
        const owned =
          events.status === "fulfilled"
            ? events.value
                .filter((e) => e.owner?.toLowerCase() === account.toLowerCase())
                .map((e) => e.collateralId)
            : [];
        if (issued.status === "fulfilled") owned.push(...issued.value);
        if (events.status === "rejected" || issued.status === "rejected") {
          setDiscoveryError(
            "Some loans may still be missing. Refresh to retry discovery, or track a loan using its collateral ID."
          );
        }
        setSaved((current) => {
          const next = [...current];
          for (const id of owned)
            if (!next.some((x) => x.id.toLowerCase() === id.toLowerCase()))
              next.push({ id, name: "Cross-chain loan" });
          storageWrite(`databaes.loans.v2:${scope}`, next);
          return next;
        });
      })
      .catch(() => {
        if (!cancelled)
          setDiscoveryError(
            "We couldn’t finish finding your loans. Retry, or add a loan using its collateral ID."
          );
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, walletReady, scope, revision]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const loadHistory = useCallback(async () => {
    if (!account) return;
    const requestScope = scope;
    setHistoryLoading(true);
    setHistoryError("");
    const results = await Promise.allSettled([scanEvents("a"), scanEvents("b")]);
    if (scopeRef.current !== requestScope) return;
    const ids = new Set(saved.map((p) => p.id.toLowerCase()));
    const next = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((t) => ids.has(t.collateralId.toLowerCase()))
      .sort((a, b) => b.timestamp - a.timestamp);
    setTransactions(next);
    setHistoryLoading(false);
    if (results.some((r) => r.status === "rejected"))
      setHistoryError(
        "Some activity couldn’t be loaded. The list may be incomplete; try refreshing."
      );
  }, [account, scope, saved]);
  async function connect() {
    if (!window.ethereum) {
      notify(
        "A wallet is needed",
        "Open this app in a wallet-enabled browser, or install MetaMask or TokenPocket to connect.",
        "error"
      );
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setPending("Confirm the connection in your wallet");
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      sessionStorage.removeItem("databaes.disconnected");
      setAccount(accounts[0] || "");
      setWalletChain((await provider.getNetwork()).chainId);
    } catch (e) {
      notify("Wallet connection", friendlyError(e), "error");
    } finally {
      busy.current = false;
      setPending("");
    }
  }
  function disconnect() {
    sessionStorage.setItem("databaes.disconnected", "true");
    setAccount("");
  }
  async function switchTo(chain: ChainConfig) {
    if (!window.ethereum) throw new Error("Connect your wallet to continue.");
    await selectNetwork(window.ethereum, chain);
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== chain.id)
      throw new Error(`Please select ${chain.name} in your wallet.`);
    setWalletChain(network.chainId);
    return provider;
  }
  async function addNetwork(chain: ChainConfig) {
    if (busy.current) return;
    if (!window.ethereum) {
      notify(
        "A wallet is needed",
        "Open this app in a wallet-enabled browser, or install MetaMask or TokenPocket to add a network.",
        "error"
      );
      return;
    }
    busy.current = true;
    setPending(`Add ${chain.name} in your wallet`);
    try {
      await selectNetwork(window.ethereum, chain, true);
      setWalletChain(chain.id);
      notify(
        "Test network ready",
        `${chain.name} is selected in your wallet. Use test ETH only.`,
        "success"
      );
    } catch (error) {
      notify("Network setup not completed", friendlyError(error), "error");
    } finally {
      busy.current = false;
      setPending("");
    }
  }
  async function transact(
    title: string,
    chain: ChainConfig,
    action: (signer: ethers.JsonRpcSigner, setStep: (s: string) => void) => Promise<void>
  ) {
    if (busy.current) return false;
    const startingScope = scope;
    busy.current = true;
    setPending(`Switching to ${chain.name}`);
    try {
      const provider = await switchTo(chain);
      const signer = await provider.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== account.toLowerCase())
        throw new Error("Your wallet account changed. Please reconnect and try again.");
      await action(signer, setPending);
      notify(title, "The transaction is confirmed. Your dashboard will update shortly.", "success");
      if (scopeRef.current === startingScope) refresh();
      return true;
    } catch (e) {
      notify("Action not completed", friendlyError(e), "error");
      return false;
    } finally {
      busy.current = false;
      setPending("");
    }
  }
  async function approve(amount: bigint) {
    return transact("Collateral approved", chainA, async (signer, step) => {
      step("Approve the spending limit in your wallet");
      const tx = await new Contract(chainA.token, erc20Abi, signer).approve(
        chainA.application,
        amount
      );
      step("Waiting for approval confirmation…");
      await tx.wait();
    });
  }
  async function lock(
    amount: bigint,
    principal: bigint,
    name: string
  ): Promise<string | undefined> {
    let id: string | undefined;
    const startingScope = scope;
    await transact("Collateral locked", chainA, async (signer, step) => {
      const contract = new Contract(chainA.application, vaultAbi, signer);
      const block = await signer.provider.getBlock("latest");
      if (!block) throw new Error("Couldn’t read the network. Please try again.");
      step("Confirm locking your collateral in your wallet");
      const tx = await contract.lockCollateral(amount, principal, BigInt(block.timestamp) + 7200n);
      step("Waiting for your collateral lock to confirm…");
      const receipt = await tx.wait();
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "CollateralLocked") id = parsed.args.collateralId;
        } catch {
          /* Other contract log. */
        }
      }
      if (!id)
        throw new Error(
          "The transaction completed, but the loan ID could not be read. Refresh to find your loan."
        );
      const next = [
        ...storageRead<SavedLoan[]>(`databaes.loans.v2:${startingScope}`, []),
        { id, name: name.trim() || "Cross-chain loan" }
      ];
      storageWrite(`databaes.loans.v2:${startingScope}`, next);
      if (scopeRef.current === startingScope) setSaved(next);
    });
    return id;
  }
  async function faucet() {
    return transact("Test tokens received", chainA, async (signer, step) => {
      step("Confirm test tokens in your wallet");
      const tx = await new Contract(chainA.token, erc20Abi, signer).mint(
        await signer.getAddress(),
        ethers.parseEther("1000")
      );
      step("Waiting for test tokens…");
      await tx.wait();
    });
  }
  async function repay(position: Position) {
    return transact("Loan repaid", chainB, async (signer, step) => {
      const contract = new Contract(chainB.application, poolAbi, signer),
        token = new Contract(chainB.token, erc20Abi, signer);
      const due = BigInt(await contract.amountDue(position.loanId));
      if (BigInt(await token.balanceOf(account)) < due)
        throw new Error("You need more dUSD on the lending network to repay this loan.");
      // Accruing loans require a small approval buffer; only the contract's exact amount due is spent.
      const allowance =
        due +
        (due * BigInt(Math.round(balances.apr * 100)) * 300n) / (10000n * 31536000n) +
        (balances.apr > 0 ? 1n : 0n);
      if (BigInt(await token.allowance(account, chainB.application)) < allowance) {
        step("1 of 2 · Approve repayment in your wallet");
        const approval = await token.approve(chainB.application, allowance);
        step("1 of 2 · Waiting for approval…");
        await approval.wait();
      }
      step("2 of 2 · Confirm repayment in your wallet");
      const tx = await contract.repay(position.loanId);
      step("Waiting for repayment confirmation…");
      await tx.wait();
    });
  }
  async function lifecycle(position: Position, action: "markDefaulted" | "liquidate") {
    return transact(
      action === "liquidate" ? "Recovery requested" : "Default recorded",
      chainB,
      async (signer, step) => {
        step("Confirm the loan action in your wallet");
        const tx = await new Contract(chainB.application, poolAbi, signer)[action](position.loanId);
        step("Waiting for confirmation…");
        await tx.wait();
      }
    );
  }
  async function track(id: string, name: string) {
    if (!account) throw new Error("Connect your wallet before tracking a loan.");
    if (!ethers.isHexString(id.trim(), 32))
      throw new Error("Enter a valid collateral ID: 0x followed by 64 letters and numbers.");
    if (saved.some((p) => p.id.toLowerCase() === id.trim().toLowerCase()))
      throw new Error("This loan is already in your library.");
    const requestScope = scope;
    const position = await readPosition({ id: id.trim(), name: name.trim() || "Tracked loan" });
    if (scopeRef.current !== requestScope)
      throw new Error("Your wallet changed. Please try adding the loan again.");
    saveLoans([...saved, { id: position.id, name: position.name }]);
    return position;
  }
  function rename(id: string, name: string) {
    saveLoans(
      saved.map((p) => (p.id === id ? { ...p, name: name.trim() || "Cross-chain loan" } : p))
    );
  }
  function remove(id: string) {
    saveLoans(saved.filter((p) => p.id !== id));
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied", "Copied to your clipboard.", "success");
    } catch {
      notify(
        "Copy unavailable",
        "Your browser blocked clipboard access. Select and copy the address instead.",
        "error"
      );
    }
  }
  return {
    account,
    walletChain,
    positions,
    balances,
    ready,
    refreshing,
    error,
    discoveryError,
    discovering,
    lastUpdated,
    pending,
    notices,
    transactions,
    historyLoading,
    historyError,
    tick,
    connect,
    addNetwork,
    disconnect,
    refresh,
    loadHistory,
    approve,
    lock,
    faucet,
    repay,
    lifecycle,
    track,
    rename,
    remove,
    copy,
    notify,
    dismiss: (id: number) => setNotices((n) => n.filter((x) => x.id !== id))
  };
}
export type Lending = ReturnType<typeof useLending>;
