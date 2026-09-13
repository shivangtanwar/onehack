import { chainB } from "../config";
import { Icon, Token, Badge, Empty } from "./ui";
import { format, status, dateTime, deadlineHint, type Position } from "../lib/lending";

export function LoanTable({
  positions,
  loading,
  onSelect,
  onBorrow
}: {
  positions: Position[];
  loading: boolean;
  onSelect(id: string): void;
  onBorrow(): void;
}) {
  return (
    <div className="surface table-surface">
      {loading ? (
        <div className="table-loading" role="status">
          <span className="spinner" /> Finding your loans…
        </div>
      ) : !positions.length ? (
        <Empty title="Room for your next move">
          Your loans will appear here when you open or track one.
          <button className="button primary" onClick={onBorrow}>
            <Icon name="plus" /> Open a loan
          </button>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table className="loan-table">
            <thead>
              <tr>
                <th>Loan / collateral</th>
                <th>Borrowed</th>
                <th>Status</th>
                <th>Repayment</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="loan-name" onClick={() => onSelect(p.id)}>
                      <Token />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {format(p.collateral)} dCOL ·{" "}
                          {p.loanId ? `Loan #${p.loanId}` : "Loan request"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <strong>
                      {format(p.principal)} <span className="unit">dUSD</span>
                    </strong>
                    <small>{chainB.name}</small>
                  </td>
                  <td>
                    <Badge position={p} />
                  </td>
                  <td>
                    <strong className={status(p).group === "attention" ? "text-red" : ""}>
                      {p.loanState === 1 || p.loanState === 3
                        ? `${format(p.amountDue)} dUSD`
                        : p.loanState === 2
                          ? "Paid in full"
                          : p.loanState === 4
                            ? "Closed"
                            : "Not started"}
                    </strong>
                    <small>
                      {p.loanState === 1 || p.loanState === 3
                        ? deadlineHint(p.deadline)
                        : p.loanState >= 2
                          ? dateTime(p.createdAt)
                          : "Waiting for your loan"}
                    </small>
                  </td>
                  <td>
                    <button
                      className="row-button"
                      onClick={() => onSelect(p.id)}
                      aria-label={`View ${p.name}`}
                    >
                      Details <Icon name="chevron" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
