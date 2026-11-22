/**
 * Owner: Ali
 * Added by: Toufic (song page, #141)
 * Purpose: Song and community leaderboard rules, calorie privacy, deterministic ties and the pinned viewer row
 * FRs: FR-44, FR-35, FR-02, FR-38
 */

import { describe, expect, it } from "vitest";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { SessionResult } from "../types/pulse";
import { communityLeaderboard, songLeaderboard, splitForViewer, type RankedRow } from "./globalLeaderboard";

const profiles = [
  { id: "p-ana", handle: "ana" },
  { id: "p-bo", handle: "Bo" },
  { id: "p-cy", handle: "cy" },
];

function run(id: string, playerId: string, totalPoints: number, extra: Partial<SessionResult> = {}): SessionResult {
  return { ...FAKE_RESULT, id, playerId, danceId: "song", totalPoints, completed: true, ...extra };
}

describe("songLeaderboard", () => {
  it("keeps each dancer's best completed run on this song", () => {
    const rows = songLeaderboard([
      run("1", "p-ana", 900), run("2", "p-ana", 1200), run("3", "p-bo", 1000),
      run("4", "p-bo", 5000, { completed: false }), run("5", "p-cy", 9000, { danceId: "other" }),
    ], profiles, "song");
    expect(rows.map((r) => [r.playerId, r.value, r.runs, r.rank])).toEqual([["p-ana", 1200, 2, 1], ["p-bo", 1000, 1, 2]]);
  });

  it("breaks ties by runs, then handle ignoring case, then id", () => {
    const rows = songLeaderboard([
      run("1", "p-cy", 500), run("2", "p-cy", 100), run("3", "p-bo", 500), run("4", "p-ana", 500),
    ], profiles, "song");
    expect(rows.map((r) => r.playerId)).toEqual(["p-cy", "p-ana", "p-bo"]);
  });

  it("drops runs from unknown dancers and is empty with no runs", () => {
    expect(songLeaderboard([run("1", "ghost", 999)], profiles, "song")).toEqual([]);
    expect(songLeaderboard([], profiles, "song")).toEqual([]);
  });
});

describe("splitForViewer", () => {
  const rows: RankedRow[] = Array.from({ length: 7 }, (_, i) => ({ playerId: `p${i + 1}`, value: 100 - i, runs: 1, rank: i + 1 }));

  it("pins the viewer only when they rank below the top rows", () => {
    expect(splitForViewer(rows, "p7").you?.rank).toBe(7);
    expect(splitForViewer(rows, "p2").you).toBeUndefined();
    expect(splitForViewer(rows, "nobody").you).toBeUndefined();
    expect(splitForViewer(rows, undefined).top).toHaveLength(5);
  });
});

describe("communityLeaderboard", () => {
  const noWatch = FAKE_RESULT.samples.map((s) => ({ ...s, hrSource: "none" as const }));
  const results = [
    run("a1", "p-ana", 1000, { caloriesKcal: 20.4, danceId: "x" }),
    run("a2", "p-ana", 500, { caloriesKcal: 10.2, danceId: "y" }),
    run("b1", "p-bo", 1400, { caloriesKcal: 40 }),
    run("b2", "p-bo", 9000, { completed: false, caloriesKcal: 99 }),
    run("c1", "p-cy", 1200, { caloriesKcal: 50, samples: noWatch }),
  ];
  const posts = [
    { resultId: "a1", showCalories: true },
    { resultId: "a1", showCalories: true },
    { resultId: "a2", showCalories: true },
    { resultId: "b1", showCalories: false },
    { resultId: "b2", showCalories: true },
    { resultId: "c1", showCalories: true },
  ];

  it("sums points over every completed run, on any song, posted or not", () => {
    const rows = communityLeaderboard(profiles, results, posts, "points");
    expect(rows.map((r) => [r.playerId, r.value, r.runs])).toEqual([["p-ana", 1500, 2], ["p-bo", 1400, 1], ["p-cy", 1200, 1]]);
  });

  it("counts calories only from completed watch runs posted with calories shown, once each", () => {
    const rows = communityLeaderboard(profiles, results, posts, "calories");
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("p-ana");
    expect(rows[0].value).toBeCloseTo(30.6);
    expect(rows[0].runs).toBe(2);
  });

  it("is empty with no runs", () => {
    expect(communityLeaderboard(profiles, [], [], "points")).toEqual([]);
    expect(communityLeaderboard(profiles, [], [], "calories")).toEqual([]);
  });

  it("breaks equal totals by runs, then handle", () => {
    const rows = communityLeaderboard(profiles, [
      run("1", "p-cy", 300), run("2", "p-bo", 100), run("3", "p-bo", 200), run("4", "p-ana", 300),
    ], [], "points");
    expect(rows.map((r) => r.playerId)).toEqual(["p-bo", "p-ana", "p-cy"]);
  });
});
