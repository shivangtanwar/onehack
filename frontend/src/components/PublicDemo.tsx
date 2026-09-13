import { publicDemo } from "../demo";
import { compact } from "../lib/lending";
import { Icon, Token, type IconName } from "./ui";
import "./PublicDemo.css";

const journey: {
  key: keyof typeof publicDemo.transactions;
  title: string;
  description: string;
  icon: IconName;
  outcome?: boolean;
}[] = [
  {
    key: "lock",
    title: "Collateral locked",
    description: `${publicDemo.collateralAmount} dCOL moved into the collateral vault on Ethereum Sepolia.`,
    icon: "lock"
  },
  {
    key: "issue",
    title: "Loan received",
    description: `${publicDemo.principal} dUSD was sent to the borrower’s wallet on Base Sepolia.`,
    icon: "down"
  },
  {
    key: "pledge",
    title: "Collateral confirmed",
    description: `The vault confirmed that this collateral was backing loan #${publicDemo.loanId}.`,
    icon: "shield"
  },
  {
    key: "liquidation",
    title: "Loan liquidated",
    description: "The loan wasn’t repaid before its deadline and was closed through liquidation.",
    icon: "clock",
    outcome: true
  },
  {
    key: "recovery",
    title: "Collateral recovered",
    description: `The original ${publicDemo.collateralAmount} dCOL moved from the vault to the recovery treasury.`,
    icon: "history",
    outcome: true
  }
];

export function PublicDemo({
  onSafety,
  onCopy
}: {
  onSafety(): void;
  onCopy(value: string): Promise<void>;
}) {
  return (
    <div className="public-demo">
      <section className="demo-hero" aria-labelledby="public-demo-title">
        <div className="demo-hero-heading">
          <div>
            <div className="demo-eyebrow">
              <Icon name="history" /> RECORDED ON SEPTEMBER 11, 2026
            </div>
            <h2 id="public-demo-title">Public demo loan</h2>
            <p>A cross-chain loan, from the first lock to the final outcome.</p>
          </div>
          <div className="demo-hero-labels">
            <span className="demo-readonly">
              <Icon name="globe" /> Read-only example
            </span>
            <span className="demo-loan-number">Loan #{publicDemo.loanId} · Testnet</span>
          </div>
        </div>

        <div className="demo-asset-route" aria-label="Recorded loan summary">
          <div className="demo-asset">
            <span className="demo-asset-label">COLLATERAL LOCKED</span>
            <div>
              <Token />
              <strong>
                {publicDemo.collateralAmount} <small>dCOL</small>
              </strong>
            </div>
            <span>Ethereum Sepolia</span>
          </div>
          <span className="demo-route-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </span>
          <div className="demo-asset">
            <span className="demo-asset-label">LOAN RECEIVED</span>
            <div>
              <Token type="loan" />
              <strong>
                {publicDemo.principal} <small>dUSD</small>
              </strong>
            </div>
            <span>Base Sepolia</span>
          </div>
          <span className="demo-route-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </span>
          <div className="demo-asset demo-final-asset">
            <span className="demo-asset-label">COLLATERAL RECOVERED</span>
            <div>
              <span className="demo-treasury-icon">
                <Icon name="wallet" />
              </span>
              <strong>
                {publicDemo.collateralAmount} <small>dCOL</small>
              </strong>
            </div>
            <span>Recovery treasury · Ethereum Sepolia</span>
          </div>
        </div>
        <div className="demo-hero-note">
          <Icon name="help" />
          <p>This recorded example is separate from your wallet’s loans and balances.</p>
        </div>
      </section>

      <div className="demo-content-grid">
        <section className="surface demo-journey" aria-labelledby="demo-journey-title">
          <header className="demo-section-header">
            <div>
              <span className="eyebrow">FOLLOW THE JOURNEY</span>
              <h2 id="demo-journey-title">Every step, accounted for.</h2>
              <p>Follow the recorded transactions in the order they happened.</p>
            </div>
            <span className="demo-record-count">5 transactions</span>
          </header>
          <ol className="demo-timeline" aria-label="Recorded loan transactions">
            {journey.map((step, index) => {
              const tx = publicDemo.transactions[step.key];
              return (
                <li key={step.key} className={step.outcome ? "demo-outcome-step" : ""}>
                  <span className="demo-step-marker" aria-hidden="true">
                    <Icon name={step.icon} />
                  </span>
                  <div className="demo-step-content">
                    <div className="demo-step-heading">
                      <h3>{step.title}</h3>
                      <span>0{index + 1}</span>
                    </div>
                    <p>{step.description}</p>
                    <div className="demo-step-footer">
                      <span className="demo-network">
                        <i
                          className={tx.network === "Base Sepolia" ? "base-dot" : "ethereum-dot"}
                        />
                        {tx.network}
                      </span>
                      <a
                        href={tx.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${tx.label} — view transaction`}
                      >
                        View transaction <Icon name="external" />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="demo-timeline-note">
            <Icon name="external" />
            <span>Each link opens the original transaction in a block explorer.</span>
          </div>
        </section>

        <aside className="demo-aside" aria-label="Understanding the demo">
          <section className="demo-outcome-card" aria-labelledby="demo-outcome-title">
            <div className="demo-outcome-heading">
              <span className="demo-outcome-icon">
                <Icon name="alert" />
              </span>
              <span>RECORDED OUTCOME</span>
            </div>
            <h2 id="demo-outcome-title">
              This loan ended
              <br /> in recovery.
            </h2>
            <p>
              The borrower didn’t repay before the deadline. The loan was liquidated and its
              collateral was transferred to the recovery treasury.
            </p>
            <div className="demo-recovery-amount">
              <strong>
                {publicDemo.collateralAmount} <span>dCOL</span>
              </strong>
              <span>Recovered on Ethereum Sepolia</span>
            </div>
            <div className="demo-outcome-status">
              <span>
                <i /> Liquidated · Closed
              </span>
              <Icon name="lock" />
            </div>
          </section>

          <section className="surface demo-takeaway">
            <span className="demo-takeaway-icon">
              <Icon name="shield" />
            </span>
            <h3>
              Same collateral.
              <br /> Same home network.
            </h3>
            <p>
              The original dCOL stayed on Ethereum Sepolia throughout the loan. Only the lock
              confirmation was shared with Base.
            </p>
            <div className="demo-repayment-note">
              <strong>What if the loan had been repaid?</strong>
              <p>
                After repayment and relay confirmation, the collateral would have returned to the
                borrower’s wallet.
              </p>
            </div>
            <button className="text-button" onClick={onSafety}>
              Explore safety & contracts <Icon name="arrow" />
            </button>
          </section>
        </aside>
      </div>

      <details className="surface demo-record-details">
        <summary>
          <span className="demo-record-icon">
            <Icon name="loans" />
          </span>
          <span>
            <strong>Explore the original record</strong>
            <small>Borrower, recovery treasury, and collateral ID</small>
          </span>
          <Icon name="chevron" />
        </summary>
        <div className="demo-record-body">
          <p>These addresses belong to the recorded public example.</p>
          <dl>
            {[
              { label: "Example borrower", value: publicDemo.borrower, explorer: true },
              { label: "Recovery treasury", value: publicDemo.recoveryRecipient, explorer: true },
              { label: "Collateral ID", value: publicDemo.collateralId, explorer: false }
            ].map((record) => (
              <div key={record.label}>
                <dt>{record.label}</dt>
                <dd>
                  <code>{record.value}</code>
                  <span>
                    <button
                      className="icon-button"
                      aria-label={`Copy ${record.label.toLowerCase()}`}
                      onClick={() => void onCopy(record.value)}
                    >
                      <Icon name="copy" />
                    </button>
                    {record.explorer && (
                      <a
                        className="icon-button"
                        href={`https://sepolia.etherscan.io/address/${record.value}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View ${record.label.toLowerCase()} ${compact(record.value)} on explorer`}
                      >
                        <Icon name="external" />
                      </a>
                    )}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
      <p className="demo-page-note">
        <Icon name="globe" /> A recorded testnet demonstration using test assets. No wallet
        connection is needed to explore.
      </p>
    </div>
  );
}
