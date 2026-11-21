/**
 * Owner: Mohamed
 * Purpose: Web Bluetooth heart-rate monitor (0x180D / 0x2A37) and simulated monitor
 * FRs: FR-04, FR-06, FR-08
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { HeartRateMonitor } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

export function createBleMonitor(): HeartRateMonitor {
  return todo("createBleMonitor");
}

/** Readings carry source "simulated"; status() returns "simulated". */
export function createSimulatedMonitor(): HeartRateMonitor {
  return todo("createSimulatedMonitor");
}
