import { useEffect, useRef, useId, type ReactNode } from "react";
import { status, type Position } from "../lib/lending";
export type IconName =
  | "grid"
  | "loans"
  | "history"
  | "shield"
  | "arrow"
  | "plus"
  | "wallet"
  | "lock"
  | "down"
  | "up"
  | "external"
  | "copy"
  | "close"
  | "search"
  | "download"
  | "refresh"
  | "check"
  | "help"
  | "chevron"
  | "clock"
  | "globe"
  | "menu"
  | "alert"
  | "logout";
const paths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  loans: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 5V3h8v2M8 10h8M8 14h8M8 18h4" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2" />
    </>
  ),
  shield: <path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Zm-4 9 3 3 5-6" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  wallet: (
    <>
      <path d="M4 7V5l13-2v4" />
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M21 12h-6v4h6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  down: <path d="M12 4v16m-6-6 6 6 6-6" />,
  up: <path d="M12 20V4m-6 6 6-6 6 6" />,
  external: <path d="M14 3h7v7M21 3 10 14M10 4H4v16h16v-6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V4H4v12h4" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  refresh: <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" />,
  check: <path d="m5 12 4 4L19 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2M12 17h.01" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" />
    </>
  ),
  logout: <path d="M10 4H4v16h6M9 12h12m-5-5 5 5-5 5" />
};
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Token({ type = "collateral" }: { type?: "collateral" | "loan" }) {
  return (
    <span className={`token-symbol ${type}`} aria-hidden="true">
      {type === "collateral" ? (
        <svg viewBox="0 0 24 30">
          <path d="m12 0 10 15-10 6L2 15 12 0Z" fill="currentColor" />
          <path d="m2 17 10 6 10-6-10 13L2 17Z" fill="currentColor" opacity=".65" />
        </svg>
      ) : (
        <span>$</span>
      )}
    </span>
  );
}
export function Badge({ position }: { position: Position }) {
  const state = status(position);
  return (
    <span className={`badge ${state.tone}`}>
      <i />
      {state.label}
    </span>
  );
}
export function Empty({
  icon = "loans",
  title,
  children,
  action
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement as HTMLElement;
    el.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "wide-modal" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
