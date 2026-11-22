/**
 * Owner: Mohamed
 * Purpose: Per-player badge progress (earned + date, or how far from each locked badge). Pure.
 *          Mirrors the award rules in src/data/badges.ts (evaluateNewBadges), which stays the only place badges are awarded.
 * FRs: FR-46
 */

import { CONFIG } from "../config";
import { computeWeeklyLeaderboard } from "../data/leaderboard";
import type { BadgeId, EarnedBadge, Group, SessionResult } from "../types/pulse";
import { BADGE_CATALOGUE } from "./catalogue";

export interface BadgeProgress {
  id: BadgeId;
  earned: boolean;
  earnedAtIso: string | null;
  current: number;        // clamped to [0, target]
  target: number;
  label: string;          // short progress text for a locked badge
}

type Locked = Pick<BadgeProgress, "current" | "target" | "label">;

const num = (value: number): string => value.toLocaleString("en-US");
const clamp = (value: number, target: number): number => Math.min(Math.max(value, 0), target);

/** Local midnight of the day `iso` falls on (same day logic as evaluateNewBadges). */
function localDay(iso: string): number {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Consecutive local days with a completed dance, counted back from the latest completed result's day. */
function streakDays(completed: readonly SessionResult[]): number {
  const days = new Set(completed.map(({ createdAtIso }) => localDay(createdAtIso)).filter(Number.isFinite));
  if (days.size === 0) return 0;
  const day = new Date(Math.max(...days));
  let streak = 0;
  while (streak < CONFIG.badges.streakDays && days.has(day.getTime())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function doneOrNot(done: boolean): Locked {
  return { current: done ? 1 : 0, target: 1, label: done ? "Done" : "Not yet" };
}

function lockedProgress(
  id: BadgeId, playerId: string, allResults: readonly SessionResult[], completed: readonly SessionResult[],
  groups: readonly Group[], now: Date,
): Locked {
  switch (id) {
    case "first_steps": {
      const current = clamp(completed.length, 1);
      return { current, target: 1, label: `${current} / 1 dance` };
    }
    case "on_fire": {
      const target = CONFIG.badges.streakDays;
      const current = clamp(streakDays(completed), target);
      return { current, target, label: `${current} / ${num(target)} days in a row` };
    }
    case "superstar": {
      const target = CONFIG.level.superstar;
      const best = completed.reduce((max, { accuracyPct }) => Math.max(max, Math.floor(accuracyPct) || 0), 0);
      const current = clamp(best, target);
      return { current, target, label: `Best ${current}% / ${target}%` };
    }
    case "1k_club":
    case "3k_club":
    case "5k_club":
    case "10k_club": {
      const target = CONFIG.badges.clubPoints[id];
      const total = completed.reduce((sum, { totalPoints }) => sum + (Number.isFinite(totalPoints) ? totalPoints : 0), 0);
      const current = clamp(total, target);
      return { current, target, label: `${num(current)} / ${num(target)} points` };
    }
    case "crew_player": {
      const danced = new Set(completed.map(({ danceId }) => danceId));
      return doneOrNot(groups.some(({ memberIds, groupDanceIds }) =>
        memberIds.includes(playerId) && groupDanceIds.some((danceId) => danced.has(danceId))));
    }
    case "podium": {
      const danced = new Set(completed.map(({ danceId }) => danceId));
      return doneOrNot(groups.some((group) => group.memberIds.includes(playerId) && group.groupDanceIds.some((danceId) =>
        danced.has(danceId) && computeWeeklyLeaderboard([...allResults], [...group.memberIds], danceId, now)
          .slice(0, CONFIG.badges.podiumPlaces).some((row) => row.playerId === playerId))));
    }
  }
}

export function badgeProgress(
  playerId: string,
  results: readonly SessionResult[],
  groups: readonly Group[],
  earned: readonly EarnedBadge[],
  now: Date = new Date(),
): BadgeProgress[] {
  const completed = results.filter((result) => result.playerId === playerId && result.completed);
  const earliest = new Map<BadgeId, string>();
  for (const badge of earned) {
    if (badge.playerId !== playerId) continue;
    const seen = earliest.get(badge.badgeId);
    if (seen === undefined || Date.parse(badge.earnedAtIso) < Date.parse(seen)) earliest.set(badge.badgeId, badge.earnedAtIso);
  }

  return BADGE_CATALOGUE.map(({ id }) => {
    const locked = lockedProgress(id, playerId, results, completed, groups, now);
    const earnedAtIso = earliest.get(id);
    // Earned always wins, even when the history no longer meets the rule (seeded badges have no history).
    if (earnedAtIso !== undefined) return { id, earned: true, earnedAtIso, current: locked.target, target: locked.target, label: "Earned" };
    return { id, earned: false, earnedAtIso: null, ...locked };
  });
}
