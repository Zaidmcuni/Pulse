/**
 * Owner: Ali
 * Purpose: Verification of FR-46 award rules and boundaries.
 */

import { expect, it } from "vitest";
import { CONFIG } from "../config";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { BadgeId, EarnedBadge, Group, SessionResult } from "../types/pulse";
import { evaluateNewBadges } from "./badges";

const playerId = FAKE_RESULT.playerId;

function result(id: string, overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    ...FAKE_RESULT, id, totalPoints: 100, accuracyPct: 75,
    createdAtIso: new Date(2026, 10, 20, 12).toISOString(), ...overrides,
  };
}

function awardIds(latest: SessionResult, history: SessionResult[] = [], existing: EarnedBadge[] = [], groups: Group[] = []): BadgeId[] {
  return evaluateNewBadges(playerId, latest, history, existing, groups).map(({ badgeId }) => badgeId);
}

it("awards First Steps and Superstar at the exact threshold", () => {
  const latest = result("latest", { accuracyPct: CONFIG.level.superstar });
  expect(awardIds(latest)).toEqual(["first_steps", "superstar"]);
  expect(awardIds({ ...latest, accuracyPct: CONFIG.level.superstar - 1 })).toEqual(["first_steps"]);
  expect(awardIds({ ...latest, completed: false })).toEqual([]);
  expect(awardIds({ ...latest, playerId: "another" })).toEqual([]);
});

it("uses distinct consecutive local days for On Fire across a clock change", () => {
  const date = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
  const latest = result("latest", { createdAtIso: date(2, 0) });
  const yesterday = result("yesterday", { createdAtIso: date(1, 23) });
  const first = result("first", { createdAtIso: new Date(2026, 9, 31, 12).toISOString() });
  expect(awardIds(latest, [first, yesterday])).toContain("on_fire");
  expect(awardIds(latest, [yesterday, { ...yesterday, id: "again", createdAtIso: date(1, 10) }])).not.toContain("on_fire");
  expect(awardIds(latest, [first, { ...yesterday, completed: false }])).not.toContain("on_fire");
  expect(awardIds(latest, [first, { ...yesterday, playerId: "another" }])).not.toContain("on_fire");
});

it.each(Object.entries(CONFIG.badges.clubPoints))("awards %s at %d cumulative points", (badge, threshold) => {
  const prior = result("prior", { totalPoints: threshold - 1 });
  const latest = result("latest", { totalPoints: 1 });
  expect(awardIds(latest, [prior, latest])).toContain(badge);
  expect(awardIds(latest, [{ ...prior, totalPoints: threshold - 2 }])).not.toContain(badge);
  expect(awardIds(latest, [{ ...prior, completed: false }, { ...prior, id: "other", playerId: "another" }])).not.toContain(badge);
});

it("awards Crew Player and Podium only for the member’s featured dance and weekly rank", () => {
  const latest = result("latest");
  const members = [playerId, "a", "b", "c"];
  const group: Group = { id: "crew", name: "Crew", kind: "friends", memberIds: members, groupDanceIds: [latest.danceId] };
  const opponentScores = members.slice(1).map((id) => result(id, { playerId: id, totalPoints: latest.totalPoints + 1 }));
  expect(awardIds(latest, opponentScores, [], [group])).toEqual(["first_steps", "crew_player"]);
  expect(awardIds(latest, opponentScores.slice(0, 2), [], [group])).toEqual(["first_steps", "crew_player", "podium"]);
  expect(awardIds(latest, [], [], [{ ...group, groupDanceIds: ["different-dance"] }])).toEqual(["first_steps"]);
  expect(awardIds(latest, [], [], [{ ...group, memberIds: members.slice(1) }])).toEqual(["first_steps"]);
});

it("awards milestones once per player and keeps the result’s timestamp", () => {
  const latest = result("latest", { totalPoints: CONFIG.badges.clubPoints["10k_club"] });
  const existing: EarnedBadge[] = [
    { badgeId: "first_steps", playerId, earnedAtIso: latest.createdAtIso },
    { badgeId: "3k_club", playerId: "another", earnedAtIso: latest.createdAtIso },
    { badgeId: "5k_club", playerId, earnedAtIso: latest.createdAtIso },
  ];
  expect(evaluateNewBadges(playerId, latest, [], existing, [])).toEqual(
    ["1k_club", "3k_club", "10k_club"].map((badgeId) => ({ badgeId, playerId, earnedAtIso: latest.createdAtIso })),
  );
});
