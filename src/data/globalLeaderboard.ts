/**
 * Owner: Ali
 * Added by: Toufic (song page, #141)
 * Purpose: Leaderboards across all dancers: best run per dancer for one song, and the ranked-list split
 *          that pins the viewer's own row (pure)
 * FRs: FR-44 (same rules as the group board: completed runs only, FR-35)
 */

import type { PlayerProfile, SessionResult } from "../types/pulse";

/** Rows shown before the viewer's own row is pinned underneath. */
export const TOP_ROWS = 5;

export interface RankedRow {
  playerId: string;
  value: number;
  runs: number;   // counted runs, the first tie-break
  rank: number;   // 1-based, unique
}

type Handles = Pick<PlayerProfile, "id" | "handle">[];

/** Value high to low, then more runs, then handle A-Z, then id, so equal scores always list the same way. */
export function rankRows(totals: Map<string, { value: number; runs: number }>, profiles: Handles): RankedRow[] {
  const handles = new Map(profiles.map((p) => [p.id, p.handle]));
  return [...totals]
    .filter(([playerId]) => handles.has(playerId))
    .map(([playerId, { value, runs }]) => ({ playerId, value, runs }))
    .sort((a, b) => b.value - a.value || b.runs - a.runs
      || handles.get(a.playerId)!.localeCompare(handles.get(b.playerId)!, undefined, { sensitivity: "base" })
      || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Song page: each dancer's best completed points on this dance, all-time. */
export function songLeaderboard(results: SessionResult[], profiles: Handles, danceId: string): RankedRow[] {
  const totals = new Map<string, { value: number; runs: number }>();
  for (const result of results) {
    if (!result.completed || result.danceId !== danceId || !Number.isFinite(result.totalPoints)) continue;
    const entry = totals.get(result.playerId);
    totals.set(result.playerId, {
      value: Math.max(entry?.value ?? -Infinity, result.totalPoints),
      runs: (entry?.runs ?? 0) + 1,
    });
  }
  return rankRows(totals, profiles);
}

/** Top rows, plus the viewer's row only when it falls below them. */
export function splitForViewer(rows: RankedRow[], viewerId: string | undefined, topN: number = TOP_ROWS): { top: RankedRow[]; you?: RankedRow } {
  const top = rows.slice(0, topN);
  const you = rows.slice(topN).find((row) => row.playerId === viewerId);
  return you ? { top, you } : { top };
}
