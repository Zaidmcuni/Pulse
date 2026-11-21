/**
 * Owner: Ali
 * Purpose: Weekly leaderboard: best completed points per member, Monday 00:00 to Sunday 23:59 local (pure)
 * FRs: FR-44
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { LeaderboardRow, SessionResult } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

export function computeWeeklyLeaderboard(results: SessionResult[], memberIds: string[], danceId: string, now: Date = new Date()): LeaderboardRow[] {
  void results; void memberIds; void danceId; void now;
  return todo("computeWeeklyLeaderboard");
}
