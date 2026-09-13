import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { chainA, chainB } from "../config";
import { duration, format, parseAmount } from "../lib/lending";
import type { Lending } from "../lib/useLending";
import { Icon, Token } from "./ui";
export function Borrow({
  lending: l,
  onCreated,
  onCancel
}: {
  lending: Lending;
  onCreated(id: string): void;
  onCancel(): void;
}) {
  const [amount, setAmount] = useState("100"),
    [principal, setPrincipal] = useState("50"),
    [name, setName] = useState("");
  const [review, setReview] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [approved, setApproved] = useState(0n);
  useEffect(() => {
    setReview(false);
    setAcknowledged(false);
    setApproved(0n);
  }, [l.account]);
  const amountWei = parseAmount(amount),
    principalWei = parseAmount(principal);
  const maxBps = BigInt(Math.round(l.balances.maxLtv * 100));
  const maxBorrow = amountWei ? (amountWei * maxBps) / 10000n : 0n;
  const ratio = amountWei && principalWei ? Number((principalWei * 10000n) / amountWei) / 100 : 0;
  const formError =
    !amountWei || !principalWei
      ? "Enter positive amounts with up to 18 decimal places."
      : principalWei > maxBorrow
        ? `You can borrow up to ${format(maxBorrow)} dUSD with this collateral.`
        : l.account && l.ready && amountWei > l.balances.collateral
          ? "This is more dCOL than you have available. Reduce the amount or get test tokens below."
          : l.ready && principalWei > l.balances.liquidity
            ? "The lending pool doesn’t have enough dUSD for this loan. Try a smaller amount."
            : "";
  const needsApproval = Boolean(
    amountWei && l.balances.allowance < amountWei && approved < amountWei
  );
  function setFraction(percent: number) {
    const value = (l.balances.collateral * BigInt(percent)) / 100n;
    setAmount(ethers.formatEther(value));
    setPrincipal(ethers.formatEther((value * maxBps) / 10000n));
  }
  const estimatedInterest = principalWei
    ? (principalWei * BigInt(Math.round(l.balances.apr * 100)) * BigInt(l.balances.duration)) /
      (10000n * 31536000n)
    : 0n;
  return (
    <div className="borrow-layout">
      <section className="surface borrow-card">
        <div className="borrow-progress">
          <span className={!review ? "current" : "done"}>
            <i>{review ? <Icon name="check" /> : "1"}</i> Choose amounts
          </span>
          <span className="progress-line" />
          <span className={review ? "current" : ""}>
            <i>2</i> Review & lock
          </span>
        </div>
        <div className="borrow-heading">
          <div className="eyebrow">{review ? "ONE LAST LOOK" : "MAKE IT YOURS"}</div>
          <h2>{review ? "Everything look right?" : "Your new loan"}</h2>
          <p>
            {review
              ? "Review the details before confirming in your wallet."
              : "Choose what to lock and what you’d like to receive."}
          </p>
        </div>
        <section className="network-setup" aria-labelledby="network-setup-title">
          <h3 id="network-setup-title">Set up your test networks</h3>
          <p>
            Add each network to your wallet before borrowing. Each button also switches to that
            network. You’ll need test ETH on both; dCOL and dUSD have no monetary value.
          </p>
          <div className="network-setup-actions">
            {[chainA, chainB].map((chain) => (
              <button
                key={chain.name}
                type="button"
                className="button secondary"
                disabled={Boolean(l.pending)}
                onClick={() => void l.addNetwork(chain)}
              >
                <Icon name="plus" /> Add {chain.name}
              </button>
            ))}
          </div>
        </section>
        {!review ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!l.account) {
                void l.connect();
                return;
              }
              if (!formError && l.ready && !l.error) setReview(true);
            }}
          >
            <div className="amount-card">
              <div className="amount-card-label">
                <label htmlFor="collateral-amount">You lock</label>
                <span className="network-chip">
                  <i className="ethereum-dot" />
                  {chainA.name}
                </span>
              </div>
              <div className="amount-entry">
                <input
                  id="collateral-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-describedby="amount-help borrow-error"
                  aria-invalid={Boolean(
                    amountWei && l.account && amountWei > l.balances.collateral
                  )}
                />
                <span className="token-selector">
                  <Token /> dCOL
                </span>
              </div>
              <div className="amount-balance">
                <span id="amount-help">
                  Available:{" "}
                  <strong>
                    {l.account && l.ready
                      ? `${format(l.balances.collateral)} dCOL`
                      : "Connect to see balance"}
                  </strong>
                </span>
                <div className="amount-presets">
                  {[25, 50, 100].map((percent) => (
                    <button
                      type="button"
                      key={percent}
                      disabled={!l.account || !l.ready || Boolean(l.pending)}
                      onClick={() => setFraction(percent)}
                    >
                      {percent === 100 ? "Max" : `${percent}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="amount-connector">
              <span>
                <Icon name="down" />
              </span>
            </div>
            <div className="amount-card loan-amount-card">
              <div className="amount-card-label">
                <label htmlFor="borrow-amount">You receive</label>
                <span className="network-chip">
                  <i className="base-dot" />
                  {chainB.name}
                </span>
              </div>
              <div className="amount-entry">
                <input
                  id="borrow-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  aria-describedby="principal-help borrow-error"
                  aria-invalid={Boolean(principalWei && principalWei > maxBorrow)}
                />
                <span className="token-selector">
                  <Token type="loan" /> dUSD
                </span>
              </div>
              <div className="amount-balance">
                <span id="principal-help">
                  Borrow up to <strong>{format(maxBorrow)} dUSD</strong>
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={!amountWei}
                  onClick={() => setPrincipal(ethers.formatEther(maxBorrow))}
                >
                  Use maximum
                </button>
              </div>
            </div>
            <div className="borrowing-limit">
              <div>
                <span>
                  Borrowing limit used{" "}
                  <button
                    type="button"
                    className="inline-help"
                    title="Your loan can be up to the maximum percentage of your collateral shown below. These test tokens use equal unit values."
                    aria-label="About the borrowing limit"
                  >
                    <Icon name="help" />
                  </button>
                </span>
                <strong className={ratio > l.balances.maxLtv ? "text-red" : ""}>
                  {Number.isFinite(ratio) ? ratio.toFixed(1) : "0"}%{" "}
                  <span>/ {l.balances.maxLtv}%</span>
                </strong>
              </div>
              <div className={`limit-track ${ratio > l.balances.maxLtv ? "exceeded" : ""}`}>
                <i style={{ width: `${Math.min(100, (ratio / l.balances.maxLtv) * 100)}%` }} />
              </div>
              <small>{l.balances.maxLtv}% maximum loan-to-collateral ratio</small>
            </div>
            <label className="field-label" htmlFor="loan-name">
              Give your loan a name <span>Optional</span>
            </label>
            <input
              className="text-input"
              id="loan-name"
              value={name}
              maxLength={48}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My September loan"
            />
            {formError && (
              <p id="borrow-error" className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="button primary full borrow-primary"
              disabled={
                Boolean(l.pending) || Boolean(l.account && (formError || !l.ready || l.error))
              }
            >
              {!l.account ? (
                <>
                  <Icon name="wallet" /> Connect wallet to continue
                </>
              ) : (
                <>
                  Review loan <Icon name="arrow" />
                </>
              )}
            </button>
            <div className="borrow-bottom-note">
              <Icon name="lock" /> Review all details before anything is locked.
            </div>
            {l.account && (
              <button
                type="button"
                className="faucet-link"
                disabled={Boolean(l.pending)}
                onClick={() => void l.faucet()}
              >
                Just trying things out? Get 1,000 test dCOL <Icon name="external" />
              </button>
            )}
          </form>
        ) : (
          <div className="review-content">
            <div className="review-route">
              <div>
                <Token />
                <small>You lock on {chainA.name}</small>
                <strong>
                  {amountWei ? format(amountWei) : "0"} <span>dCOL</span>
                </strong>
              </div>
              <Icon name="arrow" />
              <div>
                <Token type="loan" />
                <small>You receive on {chainB.name}</small>
                <strong>
                  {principalWei ? format(principalWei) : "0"} <span>dUSD</span>
                </strong>
              </div>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Loan name</dt>
                <dd>{name || "Cross-chain loan"}</dd>
              </div>
              <div>
                <dt>Term from loan receipt</dt>
                <dd>{duration(l.balances.duration)}</dd>
              </div>
              <div>
                <dt>Annual interest</dt>
                <dd>{l.balances.apr}% APR</dd>
              </div>
              <div>
                <dt>Estimated repayment at deadline</dt>
                <dd>{principalWei ? format(principalWei + estimatedInterest, 8) : "0"} dUSD</dd>
              </div>
              <div>
                <dt>Network fees</dt>
                <dd>Shown in your wallet · test ETH</dd>
              </div>
            </dl>
            <div className="notice-banner">
              <Icon name="clock" />
              <span>
                <strong>This is a {duration(l.balances.duration)} test loan.</strong> The deadline
                begins when the loan is issued. Repay before it expires to avoid losing your
                collateral.
              </span>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I understand my collateral stays locked until repayment or recovery, and the request
                cannot be cancelled.
              </span>
            </label>
            <div className="wallet-steps">
              <div className={!needsApproval ? "done" : "current"}>
                <span>{!needsApproval ? <Icon name="check" /> : "1"}</span>
                <p>
                  <strong>Approve collateral</strong>
                  <small>Allow the vault to use {amount} dCOL.</small>
                </p>
              </div>
              <div className={!needsApproval ? "current" : ""}>
                <span>2</span>
                <p>
                  <strong>Lock and request loan</strong>
                  <small>Confirm the lock in your wallet.</small>
                </p>
              </div>
            </div>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="button primary full"
              disabled={
                !acknowledged ||
                Boolean(l.pending) ||
                Boolean(formError) ||
                Boolean(l.error) ||
                !l.ready
              }
              onClick={async () => {
                if (!amountWei || !principalWei) return;
                if (needsApproval) {
                  if (await l.approve(amountWei)) setApproved(amountWei);
                } else {
                  const id = await l.lock(amountWei, principalWei, name);
                  if (id) onCreated(id);
                }
              }}
            >
              {l.pending ? (
                <>
                  <span className="spinner" /> Check your wallet…
                </>
              ) : needsApproval ? (
                <>
                  Approve {amount} dCOL <Icon name="arrow" />
                </>
              ) : (
                <>
                  <Icon name="lock" /> Lock collateral & request loan
                </>
              )}
            </button>
            <button
              className="text-button back-link"
              disabled={Boolean(l.pending)}
              onClick={() => {
                setReview(false);
                setAcknowledged(false);
              }}
            >
              Back to amounts
            </button>
          </div>
        )}
      </section>
      <aside className="borrow-aside">
        <section className="surface loan-summary">
          <span className="eyebrow">SIMPLE, FROM START TO FINISH</span>
          <h3>A clear path to your loan</h3>
          <ol className="help-steps">
            <li>
              <span>1</span>
              <div>
                <h4>Lock your collateral</h4>
                <p>Your dCOL stays on {chainA.name}, held securely by the vault contract.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h4>We follow the progress</h4>
                <p>
                  The dashboard checks for confirmation and relay processing. You can follow along
                  in My loans.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h4>Receive, then repay</h4>
                <p>
                  Your dUSD arrives on {chainB.name}. Repay it before the deadline to get your
                  collateral back.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="borrow-trust">
          <span>
            <Icon name="shield" />
          </span>
          <h3>Your assets stay grounded.</h3>
          <p>
            Your original collateral never leaves its network. Only confirmation of the lock is
            shared between chains.
          </p>
          <div className="chain-route">
            <span>
              <i className="ethereum-dot" /> {chainA.name}
            </span>
            <Icon name="arrow" />
            <span>
              <i className="base-dot" /> {chainB.name}
            </span>
          </div>
        </section>
        <section className="terms-note">
          <h4>A few things to know</h4>
          <p>
            This workspace uses test tokens with no real monetary value. Both tokens use equal unit
            values for the borrowing limit.
          </p>
          <p>
            Loan delivery and collateral return depend on a trusted relay operator. Network fees
            require test ETH on both networks.
          </p>
        </section>
        <button className="text-button back-link" onClick={onCancel}>
          Back to overview
        </button>
      </aside>
    </div>
  );
}
