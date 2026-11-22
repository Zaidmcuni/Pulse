/**
 * Owner: Mohamed
 * Purpose: pure helpers for the public dancer profile (/u/:playerId): points, groups and badges of one dancer
 * FRs: FR-41, FR-02 (only public data is summarised)
 */

import { BADGE_CATALOGUE } from "../../badges/catalogue";
import type { EarnedBadge, Group, SessionResult } from "../../types/pulse";

export interface DancerSummary {
  totalPoints: number;          // sum of totalPoints of their COMPLETED results
  completedDances: number;
  pointsThisWeek: number;       // same, only results with createdAtIso in [this Monday 00:00 local, next Monday 00:00 local)
  groups: Group[];              // groups whose memberIds include them, sorted by name
  earnedBadges: EarnedBadge[];  // theirs only, in BADGE_CATALOGUE order
}

/** Local Monday 00:00 to next Monday 00:00, same rule as data/leaderboard.ts. */
function weekRangeMs(now: Date): [number, number] {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const startMs = monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(startMs);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return [startMs, nextMonday.setHours(0, 0, 0, 0)];
}

export function summarizeDancer(playerId: string, results: readonly SessionResult[], groups: readonly Group[],
  badges: readonly EarnedBadge[], now: Date = new Date()): DancerSummary {
  const [startMs, endMs] = weekRangeMs(now);
  const completed = results.filter((result) => result.playerId === playerId && result.completed);
  const thisWeek = completed.filter((result) => {
    const createdMs = Date.parse(result.createdAtIso);
    return startMs <= createdMs && createdMs < endMs;
  });
  const sum = (list: SessionResult[]) => list.reduce((total, result) => total + result.totalPoints, 0);
  const order = BADGE_CATALOGUE.map((badge) => badge.id);

  return {
    totalPoints: sum(completed),
    completedDances: completed.length,
    pointsThisWeek: sum(thisWeek),
    groups: groups.filter((group) => group.memberIds.includes(playerId)).sort((a, b) => a.name.localeCompare(b.name)),
    earnedBadges: badges.filter((badge) => badge.playerId === playerId)
      .sort((a, b) => order.indexOf(a.badgeId) - order.indexOf(b.badgeId)),
  };
}

export function profilePath(playerId: string): string {
  return "/u/" + encodeURIComponent(playerId);
}
