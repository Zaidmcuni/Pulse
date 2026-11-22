/**
 * Owner: Mohamed
 * Purpose: "Connect your watch" pop-up on Get Ready: the /watch panel in a modal, so connecting never leaves the dance.
 * FRs: FR-04, FR-06, FR-29
 */

import { useEffect, useRef, type ReactElement } from "react";
import { WatchConnectPanel } from "./WatchConnect";
import "./setup.css";

export interface WatchConnectDialogProps {
  open: boolean;
  onClose(): void;
}

export function WatchConnectDialog({ open, onClose }: WatchConnectDialogProps): ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Modal on open; on close, focus goes back to whatever opened it (the watch icon).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="watch-dialog"
      aria-labelledby="watch-dialog-title"
      onClose={onClose}
      // The dialog has no padding, so a click on the element itself is a click on the backdrop.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <WatchConnectPanel doneLabel="Done" onDone={onClose} titleId="watch-dialog-title" />
    </dialog>
  );
}
