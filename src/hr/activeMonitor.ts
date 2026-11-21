/**
 * Owner: Mohamed
 * Purpose: Keeps the heart-rate monitor chosen on /watch so the dance screen uses the same one
 * FRs: FR-04, FR-06, FR-08
 */

import type { HeartRateMonitor } from "../types/pulse";

// Module-level only: a Bluetooth connection can't survive a reload, so nothing is stored.
let active: HeartRateMonitor | null = null;

export function getActiveMonitor(): HeartRateMonitor | null {
  return active;
}

/** Disconnects the previous monitor when it's a different object. */
export function setActiveMonitor(m: HeartRateMonitor | null): void {
  if (active && active !== m) active.disconnect();
  active = m;
}
