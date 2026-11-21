/**
 * Owner: Ali
 * Purpose: For you ranking (pure)
 * FRs: FR-12
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { Dance, SessionResult } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

/** Only completed results count. Last CONFIG.forYou.lookback; >= upPct -> harder, < downPct -> easier; none -> Popular order. */
export function rankForYou(dances: Dance[], results: SessionResult[]): Dance[] {
  void dances; void results;
  return todo("rankForYou");
}
