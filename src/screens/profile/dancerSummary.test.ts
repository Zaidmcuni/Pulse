/**
 * Owner: Mohamed
 * Purpose: unit tests for the public dancer profile helpers
 * FRs: FR-41, FR-02
 */

import { describe, expect, it } from "vitest";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { EarnedBadge, Group, SessionResult } from "../../types/pulse";
import { profilePath, summarizeDancer } from "./dancerSummary";

const THU_NOON = new Date(2026, 10, 19, 12); // Thu Nov 19 2026, local
const localIso = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();

function result(id: string, playerId: string, totalPoints: number, completed = true, day = 18): SessionResult {
  return { ...FAKE_RESULT, id, playerId, totalPoints, completed, createdAtIso: localIso(day) };
}

function group(id: string, name: string, memberIds: string[]): Group {
  return { id, name, kind: "friends", memberIds, groupDanceIds: [] };
}

describe("summarizeDancer", () => {
  it("sums only completed results of this dancer", () => {
    const results = [result("a", "theo", 400), result("b", "theo", 220), result("c", "theo", 900, false), result("d", "amira", 5000)];
    const summary = summarizeDancer("theo", results, [], [], THU_NOON);
    expect(summary.totalPoints).toBe(620);
    expect(summary.completedDances).toBe(2);
  });

  it("counts points this week from local Monday 00:00", () => {
    const results = [result("mon", "theo", 300, true, 16), result("sun", "theo", 700, true, 15)];
    const summary = summarizeDancer("theo", results, [], [], THU_NOON);
    expect(summary.pointsThisWeek).toBe(300);
    expect(summary.totalPoints).toBe(1000);
  });

  it("keeps only their groups by name and their badges in catalogue order", () => {
    const groups = [group("g1", "Zumba Crew", ["theo"]), group("g2", "Montreal", ["amira"]), group("g3", "Afro Beats", ["amira", "theo"])];
    const badges: EarnedBadge[] = [
      { badgeId: "podium", playerId: "theo", earnedAtIso: localIso(17) },
      { badgeId: "first_steps", playerId: "amira", earnedAtIso: localIso(17) },
      { badgeId: "first_steps", playerId: "theo", earnedAtIso: localIso(18) },
    ];
    const summary = summarizeDancer("theo", [], groups, badges, THU_NOON);
    expect(summary.groups.map((g) => g.id)).toEqual(["g3", "g1"]);
    expect(summary.earnedBadges.map((b) => b.badgeId)).toEqual(["first_steps", "podium"]);
    expect(summary.earnedBadges.every((b) => b.playerId === "theo")).toBe(true);
  });

  it("does not mutate its inputs", () => {
    const results = [result("a", "theo", 400)];
    const groups = [group("g1", "Zumba Crew", ["theo"]), group("g3", "Afro Beats", ["theo"])];
    const badges: EarnedBadge[] = [
      { badgeId: "podium", playerId: "theo", earnedAtIso: localIso(17) },
      { badgeId: "first_steps", playerId: "theo", earnedAtIso: localIso(18) },
    ];
    const before = JSON.stringify([results, groups, badges]);
    summarizeDancer("theo", results, groups, badges, THU_NOON);
    expect(JSON.stringify([results, groups, badges])).toBe(before);
  });
});

describe("profilePath", () => {
  it("encodes the player id", () => {
    expect(profilePath("player x")).toBe("/u/player%20x");
    expect(profilePath("player-theo")).toBe("/u/player-theo");
  });
});
