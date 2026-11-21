/**
 * Owner: Ali
 * Purpose: For You ranking tests.
 * FR: FR-12
 */
import { expect, it } from "vitest";
import { CONFIG } from "../config";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../mocks/fakeSession";
import type { Dance, SessionResult } from "../types/pulse";
import { rankForYou } from "./forYou";

const easy: Dance = { ...FAKE_DANCE, id: "easy", difficulty: "easy", popularity: 15 };
const medium: Dance = { ...FAKE_DANCE, id: "medium", difficulty: "medium", popularity: 20 };
const hard: Dance = { ...FAKE_DANCE, id: "hard", difficulty: "hard", popularity: 40 };
const popularMedium: Dance = { ...medium, id: "popular-medium", popularity: 30 };
const tiedMedium: Dance = { ...popularMedium, id: "tied-medium" };
const catalogue = [medium, tiedMedium, easy, hard, popularMedium];
const popular = [hard, tiedMedium, popularMedium, medium, easy];
const mediumTier = [tiedMedium, popularMedium, medium];
const { upPct, downPct, lookback } = CONFIG.forYou;

function result(danceId: string, accuracyPct: number, createdAtIso = "2026-11-18T12:00:00Z"): SessionResult {
  return { ...FAKE_RESULT, id: createdAtIso, danceId, accuracyPct, createdAtIso };
}

it("uses stable Popular order for empty history or quit-early history and handles an empty catalogue", () => {
  expect(rankForYou(catalogue, [])).toEqual(popular);
  expect(rankForYou(catalogue, [FAKE_RESULT_QUIT])).toEqual(popular);
  expect(rankForYou([], [result(easy.id, upPct)])).toEqual([]);
});

it("uses one completed result and moves up at the exact upper threshold", () => {
  expect(rankForYou(catalogue, [result(easy.id, upPct)])).toEqual(mediumTier);
  expect(rankForYou(catalogue, [result(easy.id, upPct - 0.1)])).toEqual([easy]);
});

it("averages the two available results and moves down only below the lower threshold", () => {
  const earlier = result(hard.id, downPct - 10, "2026-11-17T12:00:00Z");
  expect(rankForYou(catalogue, [earlier, result(medium.id, downPct + 10)])).toEqual(mediumTier);
  expect(rankForYou(catalogue, [earlier, result(medium.id, downPct + 9)])).toEqual([easy]);
});

it("treats fractional scores that average to an exact threshold as equal to it", () => {
  const history = (scores: number[]) => scores.map((accuracyPct, i) =>
    result(medium.id, accuracyPct, new Date(Date.UTC(2026, 10, 18, 12 - i)).toISOString()));
  expect(rankForYou(catalogue, history([40.8, 99.6, 99.6]))).toEqual([hard]);
  expect(rankForYou(catalogue, history([28.7, 99.6, 21.7]))).toEqual(mediumTier);
});

it("uses the latest completed dances by instant and excludes results outside the lookback", () => {
  const older = result(hard.id, 0, "2026-11-16T12:00:00Z");
  const previous = result(medium.id, upPct, "2026-11-19T00:00:00+02:00");
  const newest = result(easy.id, upPct, "2026-11-18T23:00:00Z");
  const eligible = Array.from({ length: lookback - 2 }, (_, i) =>
    result(hard.id, upPct, new Date(Date.UTC(2026, 10, 17, i)).toISOString()));
  const quit = { ...FAKE_RESULT_QUIT, danceId: hard.id, createdAtIso: "2026-11-20T12:00:00Z" };
  const history = [previous, older, quit, ...eligible, newest];

  expect(rankForYou(catalogue, history)).toEqual(mediumTier);
  expect(history).toEqual([previous, older, quit, ...eligible, newest]);
  expect(catalogue).toEqual([medium, tiedMedium, easy, hard, popularMedium]);
});

it("stops at easy and hard when the recommendation would go past either endpoint", () => {
  expect(rankForYou(catalogue, [result(easy.id, downPct - 1)])).toEqual([easy]);
  expect(rankForYou(catalogue, [result(hard.id, upPct)])).toEqual([hard]);
});

it("uses the latest known dance as baseline and includes missing dances in the average", () => {
  const mostRecent = result(FAKE_DANCE.id, 0);
  const known = result(medium.id, upPct, "2026-11-17T12:00:00Z");
  expect(rankForYou(catalogue, [known, mostRecent])).toEqual([easy]);
});

it("falls back to Popular when no baseline is in the window or the target tier is empty", () => {
  const missing = Array.from({ length: lookback }, (_, i) =>
    result(FAKE_DANCE.id, upPct, new Date(Date.UTC(2026, 10, 18, i)).toISOString()));
  const older = result(easy.id, upPct, "2026-11-17T12:00:00Z");
  expect(rankForYou(catalogue, [older, ...missing])).toEqual(popular);
  expect(rankForYou([easy, hard], [result(easy.id, upPct)])).toEqual([hard, easy]);
});
