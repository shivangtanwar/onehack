import { useEffect, useState } from "react";
import { chainA, chainB } from "./config";
import { Icon, Modal, type IconName } from "./components/ui";
import { Borrow } from "./components/Borrow";
import { Safety } from "./components/Safety";
import { useLending } from "./lib/useLending";
import { compact, format, status } from "./lib/lending";
import { Overview } from "./components/Overview";
import { LoanLibrary } from "./components/LoanLibrary";
import { History } from "./components/History";
import { TrackDialog } from "./components/TrackDialog";
import { LoanDetail } from "./components/LoanDetail";

type View = "overview" | "loans" | "history" | "borrow" | "safety";
const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "loans", label: "My loans", icon: "loans" },
  { id: "history", label: "Activity & history", icon: "history" },
  { id: "safety", label: "Safety & contracts", icon: "shield" }
];
const headings: Record<View, [string, string]> = {
  overview: [
    "A little clarity. A lot more control.",
    "Your loans, collateral, and next steps. All in one place."
  ],
  loans: [
    "Your loans, organized.",
    "Keep an eye on active loans and revisit the ones you’ve closed."
  ],
  history: ["Every move, in one place.", "A clear record of what happened across both networks."],
  borrow: ["Put your assets to work.", "Keep your collateral on one network. Borrow on another."],
  safety: [
    "Know where your assets are.",
    "Understand how your loan works and explore the contracts behind it."
  ]
};
function initialView(): View {
  const hash = window.location.hash.slice(1);
  return ["overview", "loans", "history", "borrow", "safety"].includes(hash)
    ? (hash as View)
    : "overview";
}
export default function App() {
  const lending = useLending();
  const [view, setView] = useState<View>(initialView);
  const [selectedId, setSelectedId] = useState("");
  const [trackOpen, setTrackOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loanFilter, setLoanFilter] = useState("all");
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.activeElement as HTMLElement;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      previous?.focus();
    };
  }, [menuOpen]);
  const selected = lending.positions.find((p) => p.id === selectedId);
  const attention = lending.positions.filter(
    (p) =>
      (!lending.account || p.owner.toLowerCase() === lending.account.toLowerCase()) &&
      status(p).group === "attention"
  );
  function navigate(next: View) {
    setView(next);
    window.location.hash = next;
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const change = () => setView(initialView());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    setSelectedId("");
    setWalletOpen(false);
  }, [lending.account]);
  useEffect(() => {
    if (view === "history" || selectedId) void lending.loadHistory();
  }, [view, selectedId, lending.loadHistory]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <button className="brand" onClick={() => navigate("overview")} aria-label="Databaes home">
          <span className="brand-mark">
            <span />
            <span />
          </span>
          <strong>
            databaes<span>.</span>
          </strong>
        </button>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-label={item.label}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "loans" && attention.length > 0 && (
                <span className="nav-count">{attention.length}</span>
              )}
            </button>
          ))}
        </nav>
        <button className="button primary sidebar-borrow" onClick={() => navigate("borrow")}>
          <Icon name="plus" /> New loan <Icon name="arrow" />
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="small-orbit">
              <Icon name="lock" />
            </span>
            <strong>
              Across chains.
              <br />
              Always in the picture.
            </strong>
            <p>Track your collateral from the first lock to the final return.</p>
            <button onClick={() => setHelpOpen(true)}>
              How it works <Icon name="arrow" />
            </button>
          </div>
          <button className="nav-item help-link" onClick={() => setHelpOpen(true)}>
            <Icon name="help" /> Help & getting started
          </button>
          <div className="sidebar-network">
            <span className="status-dot" />
            <span>Testnet workspace</span>
            <span className="tiny-pill">BETA</span>
          </div>
        </div>
      </aside>
      <div className="main-shell" {...(menuOpen ? { inert: "" } : {})}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="menu" />
            </button>
            <span>Workspace</span>
            <Icon name="chevron" />
            <strong>
              {view === "borrow" ? "New loan" : navigation.find((n) => n.id === view)?.label}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="testnet-label">
              <span className="status-dot" /> Test assets only
            </span>
            <button
              className="wallet-button"
              disabled={Boolean(lending.pending)}
              onClick={() => (lending.account ? setWalletOpen(true) : void lending.connect())}
            >
              <Icon name="wallet" />
              <span>{lending.account ? compact(lending.account) : "Connect wallet"}</span>
              {lending.account && <span className="wallet-avatar" />}
            </button>
          </div>
        </header>
        <main id="main" className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "THE BIG PICTURE"
                  : view === "borrow"
                    ? "A SIMPLE START"
                    : "YOUR WORKSPACE"}
              </div>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            {view !== "borrow" && (
              <button className="button primary" onClick={() => navigate("borrow")}>
                <Icon name="plus" /> New loan
              </button>
            )}
          </div>
          {!lending.account && (
            <div className="context-banner">
              <Icon name="globe" />
              <span>
                <strong>You’re exploring the public workspace.</strong> Connect your wallet to see
                your own balances and loans.
              </span>
              <button disabled={Boolean(lending.pending)} onClick={() => void lending.connect()}>
                Connect wallet <Icon name="arrow" />
              </button>
            </div>
          )}
          {lending.error && (
            <div className="notice-banner error-banner" role="alert">
              <Icon name="alert" />
              <span>
                <strong>Updates are paused.</strong>{" "}
                {lending.lastUpdated
                  ? "Showing the last available data. "
                  : "Balances and loan data aren’t available yet. "}
                {lending.error}
              </span>
              <button onClick={lending.refresh}>Retry</button>
            </div>
          )}
          {lending.discoveryError && (
            <div className="notice-banner" role="alert">
              <Icon name="alert" />
              <span>{lending.discoveryError}</span>
              <button onClick={lending.refresh}>Retry</button>
            </div>
          )}
          {view === "overview" && (
            <Overview
              lending={lending}
              onBorrow={() => navigate("borrow")}
              onSelect={setSelectedId}
              onTrack={() => setTrackOpen(true)}
              onLoans={(filter = "all") => {
                setLoanFilter(filter);
                navigate("loans");
              }}
              onHelp={() => setHelpOpen(true)}
            />
          )}
          {view === "loans" && (
            <LoanLibrary
              lending={lending}
              onSelect={setSelectedId}
              onTrack={() => setTrackOpen(true)}
              onBorrow={() => navigate("borrow")}
              filter={loanFilter}
              onFilter={setLoanFilter}
            />
          )}
          {view === "borrow" && (
            <Borrow
              lending={lending}
              onCreated={(id) => {
                navigate("loans");
                setSelectedId(id);
              }}
              onCancel={() => navigate("overview")}
            />
          )}
          {view === "history" && <History lending={lending} onSelect={setSelectedId} />}
          {view === "safety" && <Safety onCopy={lending.copy} />}
          <footer className="site-footer">
            <span>
              Thoughtfully connected. <strong>Databaes</strong>
            </span>
            <div>
              <span className={`status-dot ${lending.error ? "amber" : ""}`} />
              <span>
                {lending.error
                  ? "Updates paused"
                  : lending.refreshing
                    ? "Updating your workspace…"
                    : lending.lastUpdated
                      ? `Updated ${lending.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Connecting to networks…"}
              </span>
              <button
                className="icon-button"
                aria-label="Refresh workspace"
                disabled={lending.refreshing}
                onClick={lending.refresh}
              >
                <Icon name="refresh" className={lending.refreshing ? "spinning" : ""} />
              </button>
            </div>
          </footer>
        </main>
      </div>
      {trackOpen && (
        <TrackDialog
          lending={lending}
          onClose={() => setTrackOpen(false)}
          onTracked={(id) => {
            setTrackOpen(false);
            navigate("loans");
            setSelectedId(id);
          }}
        />
      )}
      {selected && (
        <LoanDetail
          key={selected.id}
          position={selected}
          lending={lending}
          onClose={() => setSelectedId("")}
        />
      )}
      {walletOpen && (
        <Modal title="Your wallet" onClose={() => setWalletOpen(false)}>
          <div className="modal-body">
            <div className="wallet-detail">
              <span className="wallet-avatar large" />
              <strong>Connected wallet</strong>
              <code>{lending.account}</code>
              <button
                className="button secondary"
                onClick={() => void lending.copy(lending.account)}
              >
                <Icon name="copy" /> Copy address
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Current network</dt>
                <dd>
                  {lending.walletChain === chainA.id
                    ? chainA.name
                    : lending.walletChain === chainB.id
                      ? chainB.name
                      : "Another network"}
                </dd>
              </div>
              <div>
                <dt>Available collateral</dt>
                <dd>{lending.ready ? format(lending.balances.collateral) : "—"} dCOL</dd>
              </div>
              <div>
                <dt>Available to repay</dt>
                <dd>{lending.ready ? format(lending.balances.loan) : "—"} dUSD</dd>
              </div>
            </dl>
            <button
              className="button secondary full"
              disabled={Boolean(lending.pending)}
              onClick={() => {
                lending.disconnect();
                setWalletOpen(false);
              }}
            >
              <Icon name="logout" /> Disconnect from this workspace
            </button>
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal title="A simpler way to borrow" onClose={() => setHelpOpen(false)}>
          <div className="modal-body">
            <p className="muted">
              Your loan connects two networks. Your original collateral stays on {chainA.name}.
            </p>
            <ol className="help-steps">
              <li>
                <span>1</span>
                <div>
                  <h3>Choose your amounts</h3>
                  <p>
                    Set how much dCOL to lock and how much dUSD to borrow. You can borrow up to{" "}
                    {lending.balances.maxLtv}% of your collateral.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <h3>Approve, then lock</h3>
                  <p>
                    Your wallet asks for a spending approval, then a collateral lock. Keep test ETH
                    on both networks for fees.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <h3>Receive your loan</h3>
                  <p>
                    After network confirmation and relay processing, dUSD arrives on {chainB.name}.
                    Track progress in My loans.
                  </p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <h3>Repay and get your collateral back</h3>
                  <p>
                    Repay the full amount before the deadline. Once the repayment is relayed, your
                    original dCOL returns to your wallet.
                  </p>
                </div>
              </li>
            </ol>
            <div className="notice-banner">
              <Icon name="alert" />
              <span>
                This testnet prototype uses a trusted relay operator. Requests can remain pending
                until the operator processes them. Locked collateral cannot be cancelled.
              </span>
            </div>
            <button
              className="button primary full"
              onClick={() => {
                setHelpOpen(false);
                navigate("borrow");
              }}
            >
              Start a new loan <Icon name="arrow" />
            </button>
          </div>
        </Modal>
      )}
      {lending.pending && (
        <div className="pending-bar" role="status">
          <span className="spinner" />
          <div>
            <strong>Transaction in progress</strong>
            <span>{lending.pending}</span>
          </div>
        </div>
      )}
      <div className="toast-stack" aria-live="polite">
        {lending.notices.map((n) => (
          <div key={n.id} className={`toast ${n.kind}`}>
            <Icon name={n.kind === "error" ? "alert" : n.kind === "success" ? "check" : "help"} />
            <div>
              <strong>{n.title}</strong>
              <p>{n.detail}</p>
            </div>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => lending.dismiss(n.id)}
            >
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
