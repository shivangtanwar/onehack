import { useEffect, useState } from "react";
import { chainA, chainB } from "../config";
import { publicDemo } from "../demo";
import { isPublicDemo } from "../lib/lending";
import { Icon, Token } from "./ui";
export function Safety({ onCopy }: { onCopy(value: string): Promise<void> }) {
  const [tab, setTab] = useState("overview");
  const [evidence, setEvidence] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isPublicDemo) return;
    fetch("/public-security-evidence.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setEvidence)
      .catch(() => setError(true));
  }, []);
  const contracts = [
    {
      chain: chainA,
      name: "Collateral vault",
      description: "Holds your dCOL until repayment or recovery.",
      address: chainA.application,
      icon: "lock" as const
    },
    {
      chain: chainB,
      name: "Lending pool",
      description: "Issues loans and records their repayments.",
      address: chainB.application,
      icon: "wallet" as const
    },
    {
      chain: chainA,
      name: "Collateral token · dCOL",
      description: "The test asset you use to secure a loan.",
      address: chainA.token,
      icon: "globe" as const
    },
    {
      chain: chainB,
      name: "Loan token · dUSD",
      description: "The test asset you receive and repay.",
      address: chainB.token,
      icon: "globe" as const
    },
    {
      chain: chainA,
      name: "Ethereum messenger",
      description: "Verifies instructions to release or recover collateral.",
      address: chainA.messenger,
      icon: "shield" as const
    },
    {
      chain: chainB,
      name: "Base messenger",
      description: "Verifies the collateral confirmation for a loan.",
      address: chainB.messenger,
      icon: "shield" as const
    }
  ];
  return (
    <div className="view-stack">
      <div className="filter-tabs safety-tabs">
        {[
          ["overview", "How you’re protected"],
          ["contracts", "Contract directory"],
          ["evidence", "Security evidence"]
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          <section className="safety-intro surface">
            <div>
              <span className="eyebrow">UNDERSTAND YOUR LOAN</span>
              <h2>
                Two networks.
                <br />
                One original collateral.
              </h2>
              <p>
                Your dCOL is held in the collateral vault on {chainA.name}. The lending network
                receives proof of that lock so it can issue your loan.
              </p>
            </div>
            <div className="custody-visual">
              <div>
                <Token />
                <strong>Your dCOL</strong>
                <span>{chainA.name}</span>
                <span className="badge green">
                  <Icon name="lock" /> Held in vault
                </span>
              </div>
              <div className="custody-connector">
                <span>Lock confirmation</span>
                <Icon name="arrow" />
              </div>
              <div>
                <Token type="loan" />
                <strong>Your dUSD</strong>
                <span>{chainB.name}</span>
                <span className="badge blue">Sent to your wallet</span>
              </div>
            </div>
          </section>
          <section className="protection-grid">
            {[
              [
                "lock",
                "Your collateral stays put",
                "The original token remains on its home network. No wrapped copy of your collateral is created."
              ],
              [
                "shield",
                "One lock, one loan",
                "A collateral lock can only be used for one loan. Reusing the same request is rejected by the contracts."
              ],
              [
                "history",
                "A record you can follow",
                "Each confirmed step is recorded on-chain. Explore your history and open the original transactions at any time."
              ]
            ].map(([icon, title, description]) => (
              <article className="surface protection-card" key={title}>
                <span className="utility-icon">
                  <Icon name={icon as "lock" | "shield" | "history"} />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </section>
          <div className="notice-banner safety-disclosure">
            <Icon name="help" />
            <div>
              <strong>What this prototype depends on</strong>
              <p>
                A single trusted relay operator confirms events between networks. This introduces
                trust and availability risks. The contracts are testnet software and have not been
                audited; use test assets only. If you miss repayment, your collateral can be
                transferred to the configured recovery treasury.
              </p>
            </div>
          </div>
          <button className="button secondary fit" onClick={() => setTab("contracts")}>
            Explore the contracts <Icon name="arrow" />
          </button>
        </>
      )}
      {tab === "contracts" && (
        <>
          <div className="section-heading">
            <div>
              <h2>The contracts behind your workspace</h2>
              <p>Current configured addresses. Open a block explorer to inspect their records.</p>
            </div>
            <span className="soft-tag">6 contracts · 2 networks</span>
          </div>
          <div className="contract-grid">
            {contracts.map((c) => (
              <article className="surface contract-card" key={c.name}>
                <div className="card-heading">
                  <span className="utility-icon">
                    <Icon name={c.icon} />
                  </span>
                  <span className="network-chip">
                    <i className={c.chain.id === chainA.id ? "ethereum-dot" : "base-dot"} />
                    {c.chain.name}
                  </span>
                </div>
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <div className="copy-field">
                  <code>{c.address}</code>
                  <button
                    className="icon-button"
                    aria-label={`Copy ${c.name} address`}
                    onClick={() => void onCopy(c.address)}
                  >
                    <Icon name="copy" />
                  </button>
                </div>
                {c.chain.explorer ? (
                  <a
                    className="text-button"
                    href={`${c.chain.explorer}/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View contract & transactions <Icon name="external" />
                  </a>
                ) : (
                  <small className="muted">No explorer configured for this network.</small>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "evidence" && (
        <>
          <section className="surface evidence-intro">
            <span className="utility-icon">
              <Icon name="shield" />
            </span>
            <div>
              <h2>Security checks, with public records.</h2>
              <p>
                {isPublicDemo
                  ? "Three recorded test transactions were rejected by the deployed contracts. These examples demonstrate specific protections; they are not a security audit."
                  : "Public evidence belongs to the Sepolia / Base Sepolia demo deployment. It does not verify this workspace’s contracts."}
              </p>
            </div>
            <span className="soft-tag">Public testnet evidence</span>
          </section>
          {isPublicDemo && (
            <div className="evidence-grid">
              {Object.entries(publicDemo.attacks).map(([key, attack], index) => (
                <article className="surface evidence-card" key={key}>
                  <div className="card-heading">
                    <span className="badge green">
                      <Icon name="check" /> Rejected on-chain
                    </span>
                    <span className="evidence-number">0{index + 1}</span>
                  </div>
                  <h3>
                    {
                      [
                        "A request can’t be reused",
                        "Collateral can’t be pledged twice",
                        "Expired requests are rejected"
                      ][index]
                    }
                  </h3>
                  <p>{attack.description}</p>
                  <a
                    className="button secondary full"
                    href={attack.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View recorded transaction <Icon name="external" />
                  </a>
                  <details className="disclosure">
                    <summary>
                      Technical details <Icon name="chevron" />
                    </summary>
                    <div className="disclosure-body">
                      <label className="field-label">Contract response</label>
                      <code className="error-code">{attack.error}</code>
                      {evidence?.[key] ? (
                        <details className="proof-json">
                          <summary>View signed proof</summary>
                          <pre>{JSON.stringify(evidence[key], null, 2)}</pre>
                        </details>
                      ) : (
                        <p className="muted">
                          {error
                            ? "Proof details are unavailable. Use the transaction link above."
                            : "Loading proof details…"}
                        </p>
                      )}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
          <p className="inline-note">
            <Icon name="help" /> Recorded rejection evidence is available to inspect without
            connecting a wallet.
          </p>
        </>
      )}
    </div>
  );
}
