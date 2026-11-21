/**
 * Owner: Ali
 * Purpose: Badge award rules (pure)
 * FRs: FR-46 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { EarnedBadge, Group, SessionResult } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

/** Returns only NEW badges (never one already in `existing`). Quit-early results never earn badges. */
export function evaluateNewBadges(playerId: string, latestResult: SessionResult, allResults: SessionResult[], existing: EarnedBadge[], groups: Group[]): EarnedBadge[] {
  void playerId; void latestResult; void allResults; void existing; void groups;
  return todo("evaluateNewBadges");
}
