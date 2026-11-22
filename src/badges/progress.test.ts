/**
 * Owner: Mohamed
 * Purpose: Badge progress coverage, including consistency with the real award rules (evaluateNewBadges).
 * FRs: FR-46
 */

import { describe, expect, it } from "vitest";
import { evaluateNewBadges } from "../data/badges";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { BadgeId, EarnedBadge, Group, SessionResult } from "../types/pulse";
import { BADGE_CATALOGUE } from "./catalogue";
import { badgeProgress, type BadgeProgress } from "./progress";

const ME = "p-demo";
const OTHER = "p-other";
/** Local noon on a November 2026 day, so time zones never move it to another day. */
const nov = (day: number): string => new Date(2026, 10, day, 12).toISOString();
const NOW = new Date(2026, 10, 21, 18); // Saturday; the week started Monday Nov 16

let nextId = 0;
function result(overrides: Partial<SessionResult>): SessionResult {
  nextId++;
  return {
    ...FAKE_RESULT, id: `res-${nextId}`, playerId: ME, danceId: "d-solo", completed: true,
    totalPoints: 100, accuracyPct: 78, createdAtIso: nov(21), ...overrides,
  };
}
const group = (memberIds: string[], groupDanceIds: string[]): Group => ({ id: "g-1", name: "Crew", kind: "friends", memberIds, groupDanceIds });
const byId = (list: BadgeProgress[], id: BadgeId): BadgeProgress => list.find((badge) => badge.id === id)!;

describe("badgeProgress", () => {
  it("starts every badge locked at 0 with no history", () => {
    const list = badgeProgress(ME, [], [], [], NOW);
    expect(list).toHaveLength(9);
    expect(list.every(({ earned, earnedAtIso, current, target }) =>
      !earned && earnedAtIso === null && current === 0 && target > 0 && Number.isFinite(target))).toBe(true);
    expect(byId(list, "first_steps").label).toBe("0 / 1 dance");
    expect(byId(list, "on_fire").label).toBe("0 / 3 days in a row");
    expect(byId(list, "superstar").label).toBe("Best 0% / 85%");
    expect(byId(list, "1k_club").label).toBe("0 / 1,000 points");
    expect(byId(list, "crew_player").label).toBe("Not yet");
    expect(byId(list, "podium").label).toBe("Not yet");
  });

  it("sums completed points only", () => {
    const results = [
      result({ totalPoints: 400, createdAtIso: nov(10) }),
      result({ totalPoints: 220, createdAtIso: nov(15) }),
      result({ totalPoints: 900, completed: false, createdAtIso: nov(18) }),
    ];
    const list = badgeProgress(ME, results, [], [], NOW);
    expect(byId(list, "1k_club")).toMatchObject({ current: 620, target: 1000, label: "620 / 1,000 points" });
    expect(byId(list, "10k_club").label).toBe("620 / 10,000 points");
    expect(byId(list, "first_steps")).toMatchObject({ current: 1, label: "1 / 1 dance" });
  });

  it("clamps progress to the target", () => {
    const list = badgeProgress(ME, [result({ totalPoints: 1500 }), result({ totalPoints: 1500, createdAtIso: nov(20) })], [], [], NOW);
    expect(byId(list, "1k_club")).toMatchObject({ current: 1000, target: 1000 });
    expect(byId(list, "3k_club")).toMatchObject({ current: 3000, target: 3000 });
    expect(byId(list, "first_steps").current).toBe(1);
  });

  it("shows the best accuracy rounded down", () => {
    const list = badgeProgress(ME, [result({ accuracyPct: 60 }), result({ accuracyPct: 72.6, createdAtIso: nov(20) })], [], [], NOW);
    expect(byId(list, "superstar")).toMatchObject({ current: 72, target: 85, label: "Best 72% / 85%" });
  });

  it("counts the streak back from the latest completed day", () => {
    const three = [nov(19), nov(20), nov(21)].map((createdAtIso) => result({ createdAtIso }));
    expect(byId(badgeProgress(ME, three, [], [], NOW), "on_fire")).toMatchObject({ current: 3, target: 3, label: "3 / 3 days in a row" });
    const gap = [nov(19), nov(21)].map((createdAtIso) => result({ createdAtIso }));
    expect(byId(badgeProgress(ME, gap, [], [], NOW), "on_fire")).toMatchObject({ current: 1, label: "1 / 3 days in a row" });
    const twiceToday = [result({}), result({}), result({ createdAtIso: nov(20) })];
    expect(byId(badgeProgress(ME, twiceToday, [], [], NOW), "on_fire").current).toBe(2);
  });

  it("needs group membership for Crew Player", () => {
    const results = [result({ danceId: "d1" })];
    expect(byId(badgeProgress(ME, results, [group([ME], ["d1"])], [], NOW), "crew_player")).toMatchObject({ current: 1, label: "Done" });
    expect(byId(badgeProgress(ME, results, [group([OTHER], ["d1"])], [], NOW), "crew_player")).toMatchObject({ current: 0, label: "Not yet" });
    expect(byId(badgeProgress(ME, [result({ danceId: "d1", completed: false })], [group([ME], ["d1"])], [], NOW), "crew_player").current).toBe(0);
  });

  it("puts a top weekly finisher on the podium", () => {
    const groups = [group([ME, OTHER], ["d1"])];
    const results = [result({ danceId: "d1", totalPoints: 500 }), result({ playerId: OTHER, danceId: "d1", totalPoints: 300 })];
    expect(byId(badgeProgress(ME, results, groups, [], NOW), "podium").current).toBe(1);
    const lastWeek = [result({ danceId: "d1", createdAtIso: nov(10) })];
    expect(byId(badgeProgress(ME, lastWeek, groups, [], NOW), "podium").current).toBe(0);
  });

  it("lets an earned badge win, earliest date first, for this player only", () => {
    const earned: EarnedBadge[] = [
      { badgeId: "on_fire", playerId: ME, earnedAtIso: "2026-11-05T10:00:00.000Z" },
      { badgeId: "on_fire", playerId: ME, earnedAtIso: "2026-11-01T10:00:00.000Z" },
      { badgeId: "superstar", playerId: OTHER, earnedAtIso: "2026-11-02T10:00:00.000Z" },
    ];
    const list = badgeProgress(ME, [], [], earned, NOW);
    expect(byId(list, "on_fire")).toEqual({
      id: "on_fire", earned: true, earnedAtIso: "2026-11-01T10:00:00.000Z", current: 3, target: 3, label: "Earned",
    });
    expect(byId(list, "superstar")).toMatchObject({ earned: false, earnedAtIso: null, current: 0 });
  });

  it("ignores other players' results", () => {
    const results = [result({ playerId: OTHER, totalPoints: 5000, accuracyPct: 99, danceId: "d1" })];
    const list = badgeProgress(ME, results, [group([ME, OTHER], ["d1"])], [], NOW);
    expect(list.every(({ current }) => current === 0)).toBe(true);
  });

  it("follows the catalogue order and never mutates its inputs", () => {
    const results = [result({ danceId: "d1", createdAtIso: nov(20) }), result({ danceId: "d1" })];
    const groups = [group([ME], ["d1"])];
    const earned: EarnedBadge[] = [{ badgeId: "first_steps", playerId: ME, earnedAtIso: nov(20) }];
    const before = structuredClone({ results, groups, earned });
    const list = badgeProgress(ME, results, groups, earned, NOW);
    expect(list.map(({ id }) => id)).toEqual(BADGE_CATALOGUE.map(({ id }) => id));
    expect({ results, groups, earned }).toEqual(before);
  });
});

describe("badgeProgress agrees with evaluateNewBadges", () => {
  const scenarios: Record<string, { results: SessionResult[]; groups: Group[] }> = {
    points: {
      results: [
        result({ totalPoints: 400, createdAtIso: nov(10) }),
        result({ totalPoints: 900, completed: false, createdAtIso: nov(12) }),
        result({ totalPoints: 220, createdAtIso: nov(15) }),
      ],
      groups: [],
    },
    "big points": { results: [result({ totalPoints: 2600, createdAtIso: nov(14) }), result({ totalPoints: 2600 })], groups: [] },
    superstar: { results: [result({ accuracyPct: 60, createdAtIso: nov(15) }), result({ accuracyPct: 72.6 })], groups: [] },
    "superstar reached": { results: [result({ accuracyPct: 91 })], groups: [] },
    "streak of 3": { results: [nov(19), nov(20), nov(21)].map((createdAtIso) => result({ createdAtIso })), groups: [] },
    "streak with a gap": { results: [nov(19), nov(21)].map((createdAtIso) => result({ createdAtIso })), groups: [] },
    "crew member": { results: [result({ danceId: "d1" })], groups: [group([ME], ["d1"])] },
    "crew non-member": { results: [result({ danceId: "d1" })], groups: [group([OTHER], ["d1"])] },
    "other players": {
      results: [result({ playerId: OTHER, totalPoints: 5000, accuracyPct: 99, createdAtIso: nov(20) }), result({ totalPoints: 50 })],
      groups: [],
    },
    podium: {
      results: [
        result({ playerId: OTHER, danceId: "d1", totalPoints: 300, createdAtIso: nov(20) }),
        result({ danceId: "d1", totalPoints: 500 }),
      ],
      groups: [group([ME, OTHER], ["d1"])],
    },
  };

  for (const [name, { results, groups }] of Object.entries(scenarios)) {
    it(name, () => {
      const mine = results.filter((r) => r.playerId === ME && r.completed);
      const latest = mine.reduce((a, b) => (Date.parse(b.createdAtIso) > Date.parse(a.createdAtIso) ? b : a));
      const awarded = new Set(evaluateNewBadges(ME, latest, results, [], groups).map(({ badgeId }) => badgeId));
      const reached = new Set(badgeProgress(ME, results, groups, [], new Date(latest.createdAtIso))
        .filter(({ current, target }) => current >= target).map(({ id }) => id));
      expect(reached).toEqual(awarded);
    });
  }
});
