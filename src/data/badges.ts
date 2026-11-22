/**
 * Owner: Ali
 * Purpose: Badge award rules (pure)
 * FRs: FR-46 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { CONFIG } from "../config";
import type { BadgeId, EarnedBadge, Group, SessionResult } from "../types/pulse";
import { computeWeeklyLeaderboard } from "./leaderboard";

const pointsClubs = ["1k_club", "3k_club", "5k_club", "10k_club"] as const;

function localDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Returns only NEW badges (never one already in `existing`). Quit-early results never earn badges. */
export function evaluateNewBadges(playerId: string, latestResult: SessionResult, allResults: SessionResult[], existing: EarnedBadge[], groups: Group[]): EarnedBadge[] {
  const when = new Date(latestResult.createdAtIso);
  if (!latestResult.completed || latestResult.playerId !== playerId || !Number.isFinite(when.getTime())) return [];

  const previous = allResults.filter((result) =>
    result.id !== latestResult.id && result.completed && Date.parse(result.createdAtIso) <= when.getTime());
  const results = [...previous, latestResult];
  const history = results.filter((result) => result.playerId === playerId);
  const days = new Set(history.map((result) => localDay(new Date(result.createdAtIso))));
  const day = new Date(localDay(when));
  let streak = 0;
  while (streak < CONFIG.badges.streakDays && days.has(day.getTime())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }

  const eligible: BadgeId[] = ["first_steps"];
  if (streak === CONFIG.badges.streakDays) eligible.push("on_fire");
  if (latestResult.accuracyPct >= CONFIG.level.superstar) eligible.push("superstar");

  const points = history.reduce((sum, result) => sum + result.totalPoints, 0);
  for (const club of pointsClubs) {
    if (points >= CONFIG.badges.clubPoints[club]) eligible.push(club);
  }

  const homeGroups = groups.filter(({ memberIds, groupDanceIds }) =>
    memberIds.includes(playerId) && groupDanceIds.includes(latestResult.danceId));
  if (homeGroups.length > 0) eligible.push("crew_player");
  if (homeGroups.some((group) => computeWeeklyLeaderboard(results, group.memberIds, latestResult.danceId, when)
    .slice(0, CONFIG.badges.podiumPlaces).some((row) => row.playerId === playerId))) {
    eligible.push("podium");
  }

  const earned = new Set(existing.filter((badge) => badge.playerId === playerId).map((badge) => badge.badgeId));
  return eligible.filter((badgeId) => !earned.has(badgeId))
    .map((badgeId) => ({ badgeId, playerId, earnedAtIso: latestResult.createdAtIso }));
}
