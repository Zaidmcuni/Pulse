/**
 * Owner: Ali
 * Purpose: Weekly leaderboard: best completed points per member between local Monday midnights (pure)
 * FRs: FR-44
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { LeaderboardRow, SessionResult } from "../types/pulse";

export function computeWeeklyLeaderboard(results: SessionResult[], memberIds: string[], danceId: string, now: Date = new Date()): LeaderboardRow[] {
  const monday = new Date(now);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  const startMs = monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(startMs);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const endMs = nextMonday.setHours(0, 0, 0, 0);

  const best = new Map<string, number | undefined>(memberIds.map((id) => [id, undefined]));
  for (const result of results) {
    const { playerId, totalPoints } = result;
    if (!result.completed || result.danceId !== danceId || !best.has(playerId)) continue;
    const createdMs = Date.parse(result.createdAtIso);
    if (!(startMs <= createdMs && createdMs < endMs)) continue;
    const previous = best.get(playerId);
    if (previous === undefined || totalPoints > previous) best.set(playerId, totalPoints);
  }

  return [...best].flatMap(([playerId, points]) => points === undefined ? [] : [{ playerId, points }])
    .sort((a, b) => b.points - a.points);
}
