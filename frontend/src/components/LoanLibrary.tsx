import { useState } from "react";
import { Icon, Empty } from "./ui";
import { status } from "../lib/lending";
import type { Lending } from "../lib/useLending";
import { LoanTable } from "./LoanTable";

export function LoanLibrary({
  lending: l,
  onSelect,
  onTrack,
  onBorrow,
  filter,
  onFilter
}: {
  lending: Lending;
  onSelect(id: string): void;
  onTrack(): void;
  onBorrow(): void;
  filter: string;
  onFilter(f: string): void;
}) {
  const [search, setSearch] = useState("");
  const filtered = l.positions.filter(
    (p) =>
      (filter === "all" || status(p).group === filter) &&
      `${p.name} ${p.id} ${p.loanId}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="view-stack">
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="Filter loans">
          {[
            ["all", "All loans"],
            ["active", "In progress"],
            ["attention", "Needs attention"],
            ["closed", "Completed"]
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
            >
              {label}
              <span>
                {l.positions.filter((p) => id === "all" || status(p).group === id).length}
              </span>
            </button>
          ))}
        </div>
        <button className="button secondary" onClick={onTrack}>
          <Icon name="plus" /> Track a loan
        </button>
      </div>
      <div className="library-search-row">
        <label className="search-box">
          <Icon name="search" />
          <input
            aria-label="Search loans"
            placeholder="Search name, loan number, or collateral ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              aria-label="Clear loan search"
              className="icon-button"
              onClick={() => setSearch("")}
            >
              <Icon name="close" />
            </button>
          )}
        </label>
        <span className="muted">
          {filtered.length} loan{filtered.length === 1 ? "" : "s"}
          {l.discovering ? " · Finding wallet loans…" : ""}
        </span>
      </div>
      {!filtered.length && (search || filter !== "all") ? (
        <section className="surface">
          <Empty
            icon="search"
            title="No loans match this view"
            action={
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  onFilter("all");
                }}
              >
                Clear filters
              </button>
            }
          >
            Try another search or choose a different status.
          </Empty>
        </section>
      ) : (
        <LoanTable
          positions={filtered}
          loading={(l.refreshing && !l.lastUpdated) || (l.discovering && !l.positions.length)}
          onSelect={onSelect}
          onBorrow={onBorrow}
        />
      )}
      <div className="inline-note">
        <Icon name="shield" />
        <p>
          Loans created by your connected wallet are found automatically. Names and tracked loans
          are saved in this browser; on-chain records remain available on the network.
        </p>
      </div>
    </div>
  );
}
