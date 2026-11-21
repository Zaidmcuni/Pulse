/**
 * Owner: Toufic
 * Purpose: Start second of the best-scoring window
 * FRs: FR-48 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ScoreSample } from "../types/pulse";
import { CONFIG } from "../config";
import { todo } from "../contracts/notImplemented";

export function findBestWindowStartSec(samples: ScoreSample[], windowSec: number = CONFIG.clipLengthSec): number {
  void samples; void windowSec;
  return todo("findBestWindowStartSec");
}
