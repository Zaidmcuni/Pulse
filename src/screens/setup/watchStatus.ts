/**
 * Owner: Mohamed
 * Purpose: Pure helpers for the watch connect screen (/watch)
 * FRs: FR-04, FR-06, FR-08
 */

import type { HeartRateStatus } from "../../types/pulse";

// Display-only: a live watch with no reading for longer than this shows "Waiting for data…".
// Matches the 5 s gap target used when testing the WHOOP; not a scoring threshold, so not in CONFIG.
export const STALE_AFTER_SEC = 5;

export type ConnectProblem = "unsupported" | "not-found" | "failed";

function errorName(err: unknown): unknown {
  return typeof err === "object" && err !== null && "name" in err ? err.name : undefined;
}

/** Maps a connect() failure to the panel shown on /watch. */
export function classifyConnectError(err: unknown): ConnectProblem {
  const name = errorName(err);
  if (name === "NotSupportedError") return "unsupported";
  if (name === "NotFoundError") return "not-found";
  return "failed";
}

/** FR-06 / FR-08: badge text for the current heart-rate state. */
export function statusLabel(status: HeartRateStatus, secondsSinceReading: number | null): string {
  if (status === "simulated") return "Simulated";
  if (status === "live") {
    return secondsSinceReading === null || secondsSinceReading <= STALE_AFTER_SEC ? "Live" : "Waiting for data…";
  }
  return "Not connected";
}
