import { useState } from "react";
import { chainA, chainB } from "../config";
import { Icon, Token, Badge, Modal } from "./ui";
import { status, compact, dateTime, deadlineHint, format, type Position } from "../lib/lending";
import type { Lending } from "../lib/useLending";
import { TransactionRow } from "./History";

export function LoanDetail({
  position: p,
  lending: l,
  onClose
}: {
  position: Position;
  lending: Lending;
  onClose(): void;
}) {
  const [name, setName] = useState(p.name),
    [confirmation, setConfirmation] = useState<"repay" | "markDefaulted" | "liquidate" | "">("");
  const current = status(p),
    owner = l.account.toLowerCase() === p.owner.toLowerCase();
  const events = l.transactions.filter((t) => t.collateralId.toLowerCase() === p.id.toLowerCase());
  const terminal = p.collateralState >= 3;
  const stages = [
    { label: "Collateral locked", detail: chainA.name, done: p.collateralState >= 1 },
    { label: "Loan received", detail: chainB.name, done: p.loanId > 0n },
    {
      label: p.loanState === 3 || p.loanState === 4 ? "Loan defaulted" : "Loan repaid",
      detail: p.loanState === 1 ? "Your next step" : chainB.name,
      done: p.loanState >= 2
    },
    {
      label:
        p.collateralState === 4 || p.loanState >= 3
          ? "Collateral recovered"
          : "Collateral returned",
      detail: chainA.name,
      done: terminal
    }
  ];
  const description =
    p.collateralState === 4
      ? "This loan was not repaid. Its collateral has been transferred to the recovery treasury."
      : p.collateralState === 3
        ? "This loan is complete. Your original collateral has been returned to the borrower’s wallet."
        : p.loanState === 4
          ? "The loan is liquidated. Collateral recovery is still waiting for the relay to complete."
          : p.loanState === 2
            ? "Repayment is confirmed. Your collateral is still in the vault while its return is processed."
            : p.loanState === 3
              ? "This loan has defaulted. The collateral can now be recovered by the treasury."
              : p.loanState === 1
                ? "Repay the full balance before the deadline to receive your collateral back."
                : "Your collateral is locked. The loan will arrive after network confirmation and relay processing. The lock cannot be cancelled.";
  return (
    <Modal title={p.loanId ? `Loan #${p.loanId}` : "Loan request"} onClose={onClose} wide>
      <div className="modal-body loan-detail">
        <div className="detail-title">
          <div>
            <h2>{p.name}</h2>
            <p>Opened {dateTime(p.createdAt)}</p>
          </div>
          <Badge position={p} />
        </div>
        <div className={`loan-message ${current.tone}`}>
          <Icon
            name={
              current.group === "attention" || p.collateralState === 4
                ? "alert"
                : terminal
                  ? "check"
                  : "clock"
            }
          />
          <p>{description}</p>
        </div>
        <div className="detail-amounts">
          <div>
            <Token />
            <span>
              <small>{terminal ? "Original collateral" : "Collateral locked"}</small>
              <strong>
                {format(p.collateral)} <em>dCOL</em>
              </strong>
            </span>
          </div>
          <Icon name="arrow" />
          <div>
            <Token type="loan" />
            <span>
              <small>Amount borrowed</small>
              <strong>
                {format(p.principal)} <em>dUSD</em>
              </strong>
            </span>
          </div>
        </div>
        <ol className="loan-journey">
          {stages.map((s, i) => (
            <li className={s.done ? "done" : ""} key={s.label}>
              <span>{s.done ? <Icon name="check" /> : i + 1}</span>
              <div>
                <strong>{s.label}</strong>
                <small>{s.detail}</small>
              </div>
            </li>
          ))}
        </ol>
        <dl className="detail-list">
          <div>
            <dt>Amount to repay</dt>
            <dd>
              {p.amountDue > 0n
                ? `${format(p.amountDue)} dUSD`
                : p.loanState === 2
                  ? "Paid in full"
                  : p.loanState === 4
                    ? "Loan closed"
                    : "Waiting for loan"}
            </dd>
          </div>
          <div>
            <dt>Repayment deadline</dt>
            <dd className={current.group === "attention" ? "text-red" : ""}>
              {p.deadline ? dateTime(p.deadline) : "Starts when the loan is issued"}
            </dd>
          </div>
          {p.loanState === 1 && (
            <div>
              <dt>Time to repay</dt>
              <dd className={current.group === "attention" ? "text-red" : ""}>
                {deadlineHint(p.deadline)}
              </dd>
            </div>
          )}
          <div>
            <dt>Collateral location</dt>
            <dd>
              {p.collateralState === 3
                ? "Borrower’s wallet"
                : p.collateralState === 4
                  ? "Recovery treasury"
                  : "Collateral vault"}{" "}
              · {chainA.name}
            </dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>
              <span>{owner ? "Your wallet" : compact(p.owner)}</span>
              <button
                className="icon-button"
                aria-label="Copy borrower address"
                onClick={() => void l.copy(p.owner)}
              >
                <Icon name="copy" />
              </button>
            </dd>
          </div>
        </dl>
        {p.loanState === 1 && (
          <div className="repay-box">
            <div>
              <strong>
                {current.group === "attention"
                  ? "The deadline has passed"
                  : "Ready to close this loan?"}
              </strong>
              <p>
                {current.group === "attention"
                  ? "Repayment is possible while the loan is active, but it can be marked defaulted at any time."
                  : `Repay on ${chainB.name}. Your collateral returns after processing.`}
              </p>
            </div>
            <button
              className="button primary"
              disabled={Boolean(l.pending) || !l.ready || Boolean(l.error)}
              onClick={() => (l.account ? setConfirmation("repay") : void l.connect())}
            >
              {l.account ? "Repay loan" : "Connect to repay"}
              <Icon name="arrow" />
            </button>
          </div>
        )}
        {confirmation && (
          <div className="confirmation-panel" role="region" aria-label="Review loan action">
            <h3>
              {confirmation === "repay"
                ? "Review your repayment"
                : confirmation === "markDefaulted"
                  ? "Record this loan as defaulted?"
                  : "Recover this loan’s collateral?"}
            </h3>
            <p>
              {confirmation === "repay"
                ? `Your wallet will approve and pay approximately ${format(p.amountDue, 18)} dUSD, plus network fees. ${owner ? "Your" : "The borrower’s"} ${format(p.collateral)} dCOL returns after the repayment is relayed.`
                : confirmation === "markDefaulted"
                  ? "This prevents further repayment and makes the collateral eligible for recovery. This action cannot be undone."
                  : "This closes the defaulted loan and requests transfer of its collateral to the configured treasury. This action cannot be undone."}
            </p>
            {confirmation === "repay" && l.balances.loan < p.amountDue && (
              <p className="form-error">
                You need {format(p.amountDue - l.balances.loan)} more dUSD on {chainB.name}.
              </p>
            )}
            <div className="button-row">
              <button
                className={`button ${confirmation === "repay" ? "primary" : "danger"}`}
                disabled={
                  Boolean(l.pending) ||
                  Boolean(l.error) ||
                  (confirmation === "repay" && l.balances.loan < p.amountDue)
                }
                onClick={async () => {
                  const ok =
                    confirmation === "repay"
                      ? await l.repay(p)
                      : await l.lifecycle(p, confirmation);
                  if (ok) {
                    setConfirmation("");
                    void l.loadHistory();
                  }
                }}
              >
                {l.pending ? "Check your wallet…" : "Confirm in wallet"}
              </button>
              <button
                className="button secondary"
                disabled={Boolean(l.pending)}
                onClick={() => setConfirmation("")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <details className="disclosure">
          <summary>
            Loan settings & contract details <Icon name="chevron" />
          </summary>
          <div className="disclosure-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                l.rename(p.id, name);
                l.notify("Loan renamed", "The name is saved in this browser.", "success");
              }}
            >
              <label className="field-label" htmlFor="rename-loan">
                Loan name
              </label>
              <div className="inline-form">
                <input
                  className="text-input"
                  id="rename-loan"
                  maxLength={48}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="button secondary">Save name</button>
              </div>
            </form>
            <label className="field-label">Collateral ID</label>
            <div className="copy-field">
              <code>{p.id}</code>
              <button
                className="icon-button"
                aria-label="Copy collateral ID"
                onClick={() => void l.copy(p.id)}
              >
                <Icon name="copy" />
              </button>
            </div>
            <div className="button-row contract-links">
              {chainA.explorer && (
                <a
                  href={`${chainA.explorer}/address/${chainA.application}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Collateral vault <Icon name="external" />
                </a>
              )}
              {chainB.explorer && (
                <a
                  href={`${chainB.explorer}/address/${chainB.application}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Lending contract <Icon name="external" />
                </a>
              )}
            </div>
            {!owner && (
              <button
                className="text-button text-red"
                onClick={() => {
                  l.remove(p.id);
                  onClose();
                }}
              >
                Remove from this watchlist
              </button>
            )}
            {((p.loanState === 1 && p.deadline < Date.now() / 1000) || p.loanState === 3) && (
              <div className="advanced-actions">
                <h4>Recovery actions</h4>
                <p>
                  These actions close an unpaid loan and put its collateral into treasury recovery.
                </p>
                <button
                  className="button small danger"
                  disabled={!l.account || Boolean(l.pending) || Boolean(l.error)}
                  onClick={() => setConfirmation(p.loanState === 3 ? "liquidate" : "markDefaulted")}
                >
                  {p.loanState === 3 ? "Recover collateral" : "Mark as defaulted"}
                </button>
              </div>
            )}
          </div>
        </details>
        <div className="section-heading">
          <h3>Loan activity</h3>
          <button
            className="icon-button"
            aria-label="Refresh loan activity"
            disabled={l.historyLoading}
            onClick={() => void l.loadHistory()}
          >
            <Icon name="refresh" className={l.historyLoading ? "spinning" : ""} />
          </button>
        </div>
        {l.historyError && <p className="form-error">{l.historyError}</p>}
        {l.historyLoading ? (
          <p className="loading-line" role="status">
            <span className="spinner" /> Loading transactions…
          </p>
        ) : !events.length ? (
          <p className="muted">No transactions loaded yet. Refresh to check the networks.</p>
        ) : (
          <div className="detail-history">
            {events.map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
