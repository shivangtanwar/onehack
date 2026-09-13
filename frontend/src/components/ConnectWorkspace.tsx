import { Empty, Icon } from "./ui";
import type { Lending } from "../lib/useLending";

export function ConnectWorkspace({
  lending,
  onDemo,
  history = false
}: {
  lending: Lending;
  onDemo(): void;
  history?: boolean;
}) {
  return (
    <section className="surface">
      <Empty
        icon="wallet"
        title={`Connect your wallet to view your ${history ? "activity" : "loans"}`}
        action={
          <div className="button-row">
            <button
              className="button primary"
              disabled={Boolean(lending.pending)}
              onClick={() => void lending.connect()}
            >
              <Icon name="wallet" /> Connect wallet
            </button>
            <button className="button secondary" onClick={onDemo}>
              Explore public demo <Icon name="arrow" />
            </button>
          </div>
        }
      >
        {history
          ? "Your wallet’s loan activity will appear here after you connect."
          : "Your wallet’s loans and balances will appear here after you connect."}{" "}
        You can explore a recorded testnet example in Public demo without connecting.
      </Empty>
    </section>
  );
}
