import { useState } from "react";
import { chainA, chainB } from "../config";
import { Icon, Modal } from "./ui";
import type { Lending } from "../lib/useLending";

export function TrackDialog({
  lending: l,
  onClose,
  onTracked
}: {
  lending: Lending;
  onClose(): void;
  onTracked(id: string): void;
}) {
  const [id, setId] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  return (
    <Modal title="Track an existing loan" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          try {
            const p = await l.track(id, name);
            onTracked(p.id);
          } catch (e: any) {
            setError(e.message || "Couldn’t find this loan. Please try again.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="muted">
          Paste the collateral ID from your lock transaction. We’ll find the loan and keep its
          status up to date.
        </p>
        <label className="field-label" htmlFor="track-name">
          Loan name <span>Optional</span>
        </label>
        <input
          className="text-input"
          id="track-name"
          value={name}
          maxLength={48}
          placeholder="e.g. My September loan"
          onChange={(e) => setName(e.target.value)}
        />
        <label className="field-label" htmlFor="track-id">
          Collateral ID
        </label>
        <input
          className="text-input mono"
          id="track-id"
          value={id}
          required
          placeholder="0x…"
          onChange={(e) => setId(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby="track-error"
        />
        <small className="muted">
          We’ll look on {chainA.name} and {chainB.name}.
        </small>
        {error && (
          <p className="form-error" id="track-error" role="alert">
            {error}
          </p>
        )}
        <div className="notice-banner">
          <Icon name="help" />
          <span>
            Tracking lets you view a public loan. It doesn’t move assets or change ownership.
          </span>
        </div>
        <button className="button primary full" disabled={loading || !id.trim()}>
          {loading ? (
            <>
              <span className="spinner" /> Finding your loan…
            </>
          ) : (
            <>
              Add to my loans <Icon name="arrow" />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
