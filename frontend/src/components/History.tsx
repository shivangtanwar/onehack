import { useEffect, useState } from "react";
import { chainA, chainB } from "../config";
import { Icon, Empty } from "./ui";
import { dateTime, compact, type Transaction } from "../lib/lending";
import type { Lending } from "../lib/useLending";

export function History({
  lending: l,
  onSelect
}: {
  lending: Lending;
  onSelect(id: string): void;
}) {
  const [search, setSearch] = useState(""),
    [chain, setChain] = useState("all"),
    [kind, setKind] = useState("all"),
    [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const filtered = l.transactions.filter(
    (t) =>
      (chain === "all" || t.chain === chain) &&
      (kind === "all" ||
        (kind === "collateral" ? t.title.startsWith("Collateral") : t.title.startsWith("Loan"))) &&
      (period === "all" || t.timestamp >= Date.now() / 1000 - Number(period) * 86400) &&
      `${t.title} ${t.hash} ${l.positions.find((p) => p.id.toLowerCase() === t.collateralId.toLowerCase())?.name}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  useEffect(() => setPage(1), [search, chain, kind, period]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    currentPage = Math.min(page, pages);
  function exportCsv() {
    const rows = [
      ["Date (UTC)", "Activity", "Loan name", "Collateral ID", "Network", "Transaction hash"],
      ...filtered.map((t) => [
        t.timestamp ? new Date(t.timestamp * 1000).toISOString() : "",
        t.title,
        l.positions.find((p) => p.id.toLowerCase() === t.collateralId.toLowerCase())?.name ?? "",
        t.collateralId,
        t.chain === "a" ? chainA.name : chainB.name,
        t.hash
      ])
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${(/^[=+\-@\t\r]/.test(cell) ? "'" : "") + cell.replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `databaes-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="view-stack">
      <section className="surface history-card">
        <div className="section-heading padded">
          <div>
            <h2>
              Transaction history <span className="count">{filtered.length}</span>
            </h2>
            <p>Network activity for the loans in this workspace.</p>
          </div>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Refresh activity"
              disabled={l.historyLoading}
              onClick={() => void l.loadHistory()}
            >
              <Icon name="refresh" className={l.historyLoading ? "spinning" : ""} />
            </button>
            <button
              className="button secondary"
              disabled={!filtered.length || l.historyLoading}
              onClick={exportCsv}
            >
              <Icon name="download" /> Export CSV
            </button>
          </div>
        </div>
        <div className="history-filters">
          <label className="search-box">
            <Icon name="search" />
            <input
              aria-label="Search activity"
              placeholder="Search activity, loan, or transaction"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter by network"
            value={chain}
            onChange={(e) => setChain(e.target.value)}
          >
            <option value="all">All networks</option>
            <option value="a">{chainA.name}</option>
            <option value="b">{chainB.name}</option>
          </select>
          <select
            aria-label="Filter by activity type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All activity</option>
            <option value="collateral">Collateral</option>
            <option value="loan">Loans</option>
          </select>
          <select
            aria-label="Filter by date"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="all">All time</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>
        {l.historyError && (
          <div className="notice-banner" role="alert">
            <Icon name="alert" />
            <span>{l.historyError}</span>
            <button onClick={() => void l.loadHistory()}>Retry</button>
          </div>
        )}
        {l.historyLoading && (
          <div className="loading-line" role="status">
            <span className="spinner" /> Reading activity from both networks…
          </div>
        )}
        {!filtered.length && !l.historyLoading ? (
          <Empty
            icon="history"
            title={l.transactions.length ? "No matching activity" : "Your story starts here"}
            action={
              l.transactions.length ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch("");
                    setChain("all");
                    setKind("all");
                    setPeriod("all");
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {l.transactions.length
              ? "Try a different search or remove a filter."
              : "Activity appears here when your tracked loans have confirmed network transactions."}
          </Empty>
        ) : (
          <div className="history-list">
            {filtered.slice((currentPage - 1) * 10, currentPage * 10).map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                name={
                  l.positions.find((p) => p.id.toLowerCase() === t.collateralId.toLowerCase())?.name
                }
                onSelect={() => {
                  const p = l.positions.find(
                    (p) => p.id.toLowerCase() === t.collateralId.toLowerCase()
                  );
                  if (p) onSelect(p.id);
                }}
              />
            ))}
          </div>
        )}
        <div className="table-footer">
          <span>
            {l.historyError ? "Partial history" : "Confirmed contract events"} · {filtered.length}{" "}
            result{filtered.length === 1 ? "" : "s"}
          </span>
          <div className="button-row">
            <button
              className="button small secondary"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              className="button small secondary"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
export function TransactionRow({
  transaction: t,
  name,
  onSelect
}: {
  transaction: Transaction;
  name?: string;
  onSelect?(): void;
}) {
  const chain = t.chain === "a" ? chainA : chainB;
  return (
    <div className="transaction-row">
      <span
        className={`transaction-icon ${t.title.includes("liquidat") || t.title.includes("default") || t.title.includes("recovered") ? "red" : ""}`}
      >
        <Icon
          name={
            t.title.includes("locked")
              ? "lock"
              : t.title.includes("received") || t.title.includes("returned")
                ? "down"
                : "history"
          }
        />
      </span>
      <div className="transaction-title">
        <strong>{t.title}</strong>
        {onSelect ? (
          <button onClick={onSelect}>{name || "View loan"}</button>
        ) : (
          <small>{chain.name}</small>
        )}
      </div>
      <span className="network-chip">
        <i className={t.chain === "a" ? "ethereum-dot" : "base-dot"} />
        {chain.name}
      </span>
      <time>{dateTime(t.timestamp)}</time>
      {chain.explorer ? (
        <a
          className="icon-button"
          href={`${chain.explorer}/tx/${t.hash}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${t.title.toLowerCase()} transaction`}
        >
          <Icon name="external" />
        </a>
      ) : (
        <code title={t.hash}>{compact(t.hash)}</code>
      )}
    </div>
  );
}
