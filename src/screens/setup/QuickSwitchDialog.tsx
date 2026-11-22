/**
 * Owner: Mohamed
 * Purpose: "Who's dancing?" modal on Get Ready: big square cards for the dancers remembered on this
 *          laptop, one tap to swap in without leaving the dance. Others sign in on /who and come back.
 * FRs: FR-01, FR-03, FR-02 (only names and handles are shown), NFR-06, NFR-07 (big tap targets)
 */

import { useEffect, useRef, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { accounts, type Accounts } from "../../auth/accounts";
import { displayHandle, initialOf } from "./switcherHelpers";
import "./setup.css";

export interface QuickSwitchDialogProps {
  open: boolean;
  onClose(): void;
  /** Called after accounts.switchTo(profileId) succeeded. */
  onSwitched(profileId: string): void;
}

/** Tap on a card: the current dancer just closes; anyone else is switched to, then reported. */
export function pickDancer(
  acc: Pick<Accounts, "switchTo">,
  profileId: string,
  currentId: string | null,
  onSwitched: (profileId: string) => void,
): void {
  if (profileId === currentId) return;
  if (acc.switchTo(profileId)) onSwitched(profileId);
}

export function QuickSwitchDialog({ open, onClose, onSwitched }: QuickSwitchDialogProps): ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const location = useLocation();

  // Modal on open, focus the first card; on close, focus goes back to whatever opened it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>(".who-tile")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  const currentId = accounts.signedInProfileId();
  const dancers = accounts.listDancers().filter((d) => d.remembered);

  return (
    <dialog
      ref={dialogRef}
      className="quick-switch"
      aria-labelledby="quick-switch-title"
      onClose={onClose}
      // The dialog has no padding, so a click on the element itself is a click on the backdrop.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="quick-switch-body">
        <h2 id="quick-switch-title" className="quick-switch-title">Who&rsquo;s dancing?</h2>
        <ul className="quick-switch-grid">
          {dancers.map((d) => {
            const isCurrent = d.profileId === currentId;
            return (
              <li key={d.profileId}>
                <button
                  type="button"
                  className={`who-tile who-tile-square${isCurrent ? " is-active" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => {
                    pickDancer(accounts, d.profileId, currentId, onSwitched);
                    onClose();
                  }}
                >
                  <span className="who-avatar" aria-hidden="true">{initialOf(d.displayName)}</span>
                  <span className="who-name">{d.displayName}</span>
                  <span className="who-handle">{displayHandle(d.handle)}</span>
                  {isCurrent && <span className="quick-switch-now">Dancing now</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="quick-switch-foot">
          <Link className="auth-link" to="/who" state={{ from: location.pathname }}>Someone else? Sign in</Link>
        </p>
      </div>
    </dialog>
  );
}
