import { chainA, chainB } from "../config";
import { Icon, Token, type IconName } from "./ui";
import { format, status, dateTime, deadlineHint } from "../lib/lending";
import type { Lending } from "../lib/useLending";
import { LoanTable } from "./LoanTable";

export function Overview({
  lending: l,
  onBorrow,
  onSelect,
  onTrack,
  onLoans,
  onHelp
}: {
  lending: Lending;
  onBorrow(): void;
  onSelect(id: string): void;
  onTrack(): void;
  onLoans(filter?: string): void;
  onHelp(): void;
}) {
  const portfolio = l.account
    ? l.positions.filter((p) => p.owner.toLowerCase() === l.account.toLowerCase())
    : l.positions;
  const active = portfolio.filter((p) => status(p).group !== "closed");
  const due = portfolio.filter((p) => p.loanState === 1 || p.loanState === 3);
  const locked = portfolio
    .filter((p) => p.collateralState === 1 || p.collateralState === 2)
    .reduce((sum, p) => sum + p.collateral, 0n);
  const totalDue = due.reduce((sum, p) => sum + p.amountDue, 0n);
  const nextDue = [...due].sort((a, b) => a.deadline - b.deadline)[0];
  const loaded = l.lastUpdated !== null;
  return (
    <div className="view-stack">
      <div className="overview-grid">
        <section className="welcome-card">
          <div className="welcome-copy">
            <span className="hero-label">
              <span className="status-dot" />{" "}
              {l.account ? "YOUR EVERYDAY OVERVIEW" : "YOUR NEXT POSSIBILITY"}
            </span>
            <h2>
              {l.account ? (
                <>
                  Your collateral.
                  <br />
                  Working across chains.
                </>
              ) : (
                <>
                  More possibilities.
                  <br />
                  Same collateral.
                </>
              )}
            </h2>
            <p>
              {l.account ? (
                <>
                  {active.length
                    ? `${active.length} open loan${active.length === 1 ? "" : "s"}, with every step in view.`
                    : "A fresh start. Your next loan is one step away."}
                  <br /> Keep track of your assets and what comes next.
                </>
              ) : (
                <>
                  A loan on {chainB.id === 84532n ? "Base" : chainB.name}. Your assets on{" "}
                  {chainA.id === 11155111n ? "Ethereum" : chainA.name}.<br /> A clear view of
                  everything in between.
                </>
              )}
            </p>
            <button
              className="button mint"
              onClick={() => (nextDue ? onSelect(nextDue.id) : onBorrow)}
            >
              {nextDue
                ? "Review next repayment"
                : l.account
                  ? "Open a new loan"
                  : "Let’s get you started"}{" "}
              <Icon name="arrow" />
            </button>
            <span className="hero-footnote">
              <Icon name="shield" /> Your collateral stays on its original network
            </span>
          </div>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="art-core">
              <Icon name="lock" />
            </div>
            <span className="art-token eth">
              <Token />
            </span>
            <span className="art-token usd">
              <Token type="loan" />
            </span>
            <span className="orbit-dot dot-one" />
            <span className="orbit-dot dot-two" />
            <span className="orbit-caption">CONNECTED, NOT BRIDGED</span>
          </div>
        </section>
        <section className="surface next-card">
          <div className="card-heading">
            <span className="eyebrow">UP NEXT</span>
            <Icon name="clock" />
          </div>
          {nextDue ? (
            <>
              <span className={`next-icon ${status(nextDue).tone}`}>
                <Icon name="clock" />
              </span>
              <h3>
                {status(nextDue).group === "attention"
                  ? "A loan needs attention"
                  : "Your next repayment"}
              </h3>
              <p>
                {nextDue.name} · {status(nextDue).label.toLowerCase()}
              </p>
              <strong className="next-amount">
                {format(nextDue.amountDue)} <small>dUSD</small>
              </strong>
              <span className="muted" title={dateTime(nextDue.deadline)}>
                {deadlineHint(nextDue.deadline)}
              </span>
              <button className="button secondary full" onClick={() => onSelect(nextDue.id)}>
                Review loan <Icon name="arrow" />
              </button>
            </>
          ) : (
            <>
              <span className="next-icon">
                <Icon name="check" />
              </span>
              <h3>
                {!loaded
                  ? "Getting your workspace ready"
                  : active.length
                    ? "We’re following your progress"
                    : "You’re all caught up"}
              </h3>
              <p>
                {!loaded
                  ? "Your latest loan details will appear here."
                  : active.length
                    ? "Your loan is processing. Open its details to see the next step."
                    : "No repayments coming up. Your next move is up to you."}
              </p>
              <div className="next-card-bottom">
                <span className="soft-tag">
                  {active.length ? `${active.length} in progress` : "A little peace of mind"}
                </span>
                <button className="text-button" onClick={() => onLoans()}>
                  View your loans <Icon name="arrow" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      <section className="stats-grid" aria-label="Loan summary">
        <Stat
          icon="lock"
          label="Collateral locked"
          value={loaded ? format(locked) : "—"}
          unit="dCOL"
          detail={`Held on ${chainA.name}`}
        />
        <Stat
          icon="wallet"
          label="Outstanding balance"
          value={loaded ? format(totalDue) : "—"}
          unit="dUSD"
          detail={
            due.length
              ? `Across ${due.length} open loan${due.length === 1 ? "" : "s"}`
              : "Nothing to repay right now"
          }
        />
        <Stat
          icon="loans"
          label="Open loans"
          value={loaded ? String(active.length) : "—"}
          detail="Including requests in progress"
        />
        <Stat
          icon="check"
          label="Completed loans"
          value={loaded ? String(portfolio.length - active.length) : "—"}
          detail="Your history, always available"
        />
      </section>
      {l.account && (
        <div className="wallet-balance-strip">
          <span>
            <Icon name="wallet" /> Available in your wallet
          </span>
          <div>
            <Token />
            <strong>{l.ready ? format(l.balances.collateral) : "—"} dCOL</strong>
            <small>{chainA.name}</small>
          </div>
          <div>
            <Token type="loan" />
            <strong>{l.ready ? format(l.balances.loan) : "—"} dUSD</strong>
            <small>{chainB.name}</small>
          </div>
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>
            {l.account ? "Your loans" : "Tracked loans"}{" "}
            <span className="count">{l.positions.length}</span>
          </h2>
          <p>
            {l.account
              ? "A quick look at where things stand."
              : "Public positions you’re following in this browser."}
          </p>
        </div>
        <button className="text-button" onClick={() => onLoans()}>
          View all loans <Icon name="arrow" />
        </button>
      </div>
      <LoanTable
        positions={l.positions.slice(0, 4)}
        loading={(l.refreshing && !loaded) || (l.discovering && !l.positions.length)}
        onSelect={onSelect}
        onBorrow={onBorrow}
      />
      <div className="bottom-grid">
        <button className="utility-card" onClick={onTrack}>
          <span className="utility-icon">
            <Icon name="search" />
          </span>
          <span>
            <strong>Already have a loan?</strong>
            <small>Add its collateral ID to track it here.</small>
          </span>
          <Icon name="arrow" />
        </button>
        <button className="utility-card" onClick={onHelp}>
          <span className="utility-icon lavender">
            <Icon name="help" />
          </span>
          <span>
            <strong>A first time for everything.</strong>
            <small>Get to know locking, borrowing, and repayment.</small>
          </span>
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  unit,
  detail
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <Icon name={icon} />
      </div>
      <strong>
        {value} {unit && <small>{unit}</small>}
      </strong>
      <p>{detail}</p>
    </article>
  );
}
