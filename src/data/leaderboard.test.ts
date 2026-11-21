/**
 * Owner: Ali
 * Purpose: Weekly leaderboard ranking tests.
 * FR: FR-44
 */
import { expect, it } from "vitest";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { SessionResult } from "../types/pulse";
import { computeWeeklyLeaderboard } from "./leaderboard";

const danceId = FAKE_RESULT.danceId;
const now = new Date(2026, 10, 18, 12);

function score(playerId: string, totalPoints: number, date = now): SessionResult {
  return { ...FAKE_RESULT, id: `${playerId}-${totalPoints}`, playerId, totalPoints, createdAtIso: date.toISOString() };
}

it("includes local Monday midnight and Sunday night and excludes both adjacent weeks", () => {
  const monday = new Date(2026, 10, 16);
  const nextMonday = new Date(2026, 10, 23);
  const results = [
    score("a", 20, monday),
    score("a", 100, new Date(monday.getTime() - 1)),
    score("b", 30, new Date(nextMonday.getTime() - 1)),
    score("b", 200, nextMonday),
  ];
  const expected = [{ playerId: "b", points: 30 }, { playerId: "a", points: 20 }];
  expect(computeWeeklyLeaderboard(results, ["a", "b"], danceId, monday)).toEqual(expected);
  expect(computeWeeklyLeaderboard(results, ["a", "b"], danceId, new Date(nextMonday.getTime() - 1))).toEqual(expected);
  expect(computeWeeklyLeaderboard(results, ["a", "b"], danceId, nextMonday)).toEqual([{ playerId: "b", points: 200 }]);
});

it.each([
  [new Date(2026, 2, 4, 12), new Date(2026, 2, 9)],
  [new Date(2026, 9, 28, 12), new Date(2026, 10, 2)],
])("uses the following local Monday even in a daylight-saving transition week (%s)", (date, nextMonday) => {
  const results = [
    score("a", 10, new Date(nextMonday.getTime() - 1)),
    score("a", 50, nextMonday),
  ];
  expect(computeWeeklyLeaderboard(results, ["a"], danceId, date)).toEqual([{ playerId: "a", points: 10 }]);
});

it("keeps each member's best completed score, sorts ties by member order, and preserves inputs", () => {
  const members = ["b", "c", "a", "no-score"];
  const results = [
    score("a", 50), score("b", 20), score("a", 50), score("b", 50), score("b", 25), score("c", 0),
    score("outsider", 200),
    { ...score("c", 200), danceId: "other-dance" },
    { ...score("no-score", 0), completed: false },
  ];
  const original = structuredClone({ results, members, now });

  expect(computeWeeklyLeaderboard(results, members, danceId, now)).toEqual([
    { playerId: "b", points: 50 }, { playerId: "a", points: 50 }, { playerId: "c", points: 0 },
  ]);
  expect({ results, members, now }).toEqual(original);
  expect(computeWeeklyLeaderboard(results, [], danceId, now)).toEqual([]);
});

it("moves a member up when they save a new high score", () => {
  const members = ["a", "b"];
  const results = [score("a", 40), score("b", 50)];
  expect(computeWeeklyLeaderboard(results, members, danceId, now)).toEqual([
    { playerId: "b", points: 50 }, { playerId: "a", points: 40 },
  ]);
  expect(computeWeeklyLeaderboard([...results, score("a", 60)], members, danceId, now)).toEqual([
    { playerId: "a", points: 60 }, { playerId: "b", points: 50 },
  ]);
});
