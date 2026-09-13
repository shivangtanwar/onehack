import { publicDemo } from "../demo";
import { Icon, Token } from "./ui";

export function PublicDemo() {
  return (
    <div className="view-stack">
      <section className="surface public-demo-card" aria-labelledby="public-demo-title">
        <span className="eyebrow">RECORDED TESTNET EXAMPLE · SEPTEMBER 11, 2026</span>
        <div className="detail-title">
          <div>
            <h2 id="public-demo-title">Public demo loan</h2>
            <p>Loan #{publicDemo.loanId} · Ethereum Sepolia → Base Sepolia</p>
          </div>
          <span className="soft-tag">Read-only example</span>
        </div>
        <p>
          This is the team’s recorded demonstration. It is separate from your wallet’s loans and
          balances.
        </p>
        <div className="detail-amounts">
          <div>
            <Token />
            <span>
              <small>Example collateral</small>
              <strong>
                {publicDemo.collateralAmount} <em>dCOL</em>
              </strong>
            </span>
          </div>
          <Icon name="arrow" />
          <div>
            <Token type="loan" />
            <span>
              <small>Example amount borrowed</small>
              <strong>
                {publicDemo.principal} <em>dUSD</em>
              </strong>
            </span>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Recorded outcome</dt>
            <dd>Liquidated · Closed</dd>
          </div>
          <div>
            <dt>Collateral outcome</dt>
            <dd>Transferred to the recovery treasury</dd>
          </div>
          <div>
            <dt>Example borrower</dt>
            <dd>
              <code>{publicDemo.borrower}</code>
            </dd>
          </div>
        </dl>
        <p className="muted">
          The links below show the recorded on-chain transactions. This example has no repayment or
          wallet actions.
        </p>
        <div className="section-heading">
          <h3>Verify the demo transactions</h3>
        </div>
        <div className="public-demo-links">
          {Object.values(publicDemo.transactions).map((tx) => (
            <a key={tx.hash} href={tx.url} target="_blank" rel="noreferrer">
              <span>
                <strong>{tx.label}</strong>
                <small>{tx.network}</small>
              </span>
              <Icon name="external" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
