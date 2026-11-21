/**
 * Owner: Ali
 * Purpose: Results route rendering for completed, early-quit, and unavailable sessions.
 * FRs: FR-35, FR-36
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../../App";
import { assertSessionResult } from "../../contracts/validators";
import { store } from "../../data/store";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../../mocks/fakeSession";
import Results from "./Results";

const backToDances = /<a\b[^>]*\bhref="\/dances"[^>]*>Back to dances<\/a>/;

function renderApp(path: string): string {
  return renderToStaticMarkup(<StaticRouter location={path}><App /></StaticRouter>);
}

beforeEach(() => {
  const fixtures = [FAKE_RESULT, FAKE_RESULT_QUIT];
  fixtures.forEach(assertSessionResult);
  vi.spyOn(store, "getResult").mockImplementation((id) => fixtures.find((result) => result.id === id));
  vi.spyOn(store, "getDance").mockReturnValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

it("shows all five metrics for a completed result even without a matching dance template", () => {
  const html = renderApp(`/results/${FAKE_RESULT.id}`);

  expect(store.getResult).toHaveBeenCalledWith(FAKE_RESULT.id);
  expect(html).toContain(">Dance complete</h1>");
  expect(html).toContain("<dt>Total points</dt><dd>842</dd>");
  expect(html).toContain("<dt>Accuracy</dt><dd>78%</dd>");
  expect(html).toContain('<dt>Level</dt><dd><span class="badge session-results-level">gold</span></dd>');
  expect(html).toContain("<dt>Duration</dt><dd>0:20</dd>");
  expect(html).toContain("<dt>Calories</dt><dd>3.1 kcal</dd>");
  expect(html).toContain("Estimated and private");
  expect(html).not.toMatch(/heart rate|body weight|\bsamples\b|\bBPM\b/i);
});

it("displays stored values when accuracy has a fractional part and the saved level differs from its threshold", () => {
  const saved = { ...FAKE_RESULT, accuracyPct: 78.5, level: "silver" as const, durationSec: 125 };
  assertSessionResult(saved);
  vi.mocked(store.getResult).mockReturnValue(saved);

  const html = renderApp(`/results/${saved.id}`);

  expect(html).toContain("<dt>Accuracy</dt><dd>78.5%</dd>");
  expect(html).toContain(">silver</span>");
  expect(html).toContain("<dt>Duration</dt><dd>2:05</dd>");
});

it("shows only duration and estimated private calories for an early quit", () => {
  const html = renderApp(`/results/${FAKE_RESULT_QUIT.id}`);

  expect(store.getResult).toHaveBeenCalledWith(FAKE_RESULT_QUIT.id);
  expect(html).toContain(">Dance ended early</h1>");
  expect([...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1])).toEqual(["Duration", "Calories"]);
  expect(html).toContain("<dt>Duration</dt><dd>0:09</dd>");
  expect(html).toContain("<dt>Calories</dt><dd>1.2 kcal</dd>");
  expect(html).toContain("Estimated and private");
  expect(html).not.toMatch(/<button|class="badge|post to|heart rate|accuracy|total points/i);
  expect(html).toMatch(backToDances);
});

it("shows recovery for an unknown result ID", () => {
  const html = renderApp("/results/unknown");

  expect(store.getResult).toHaveBeenCalledWith("unknown");
  expect(html).toContain(">Result not found</h1>");
  expect(html).toMatch(backToDances);
  expect(html).not.toContain("<dt>");
});

it("shows the same recovery view when no route ID is supplied to the screen", () => {
  const html = renderToStaticMarkup(<StaticRouter location="/results"><Results /></StaticRouter>);

  expect(store.getResult).not.toHaveBeenCalled();
  expect(html).toContain(">Result not found</h1>");
  expect(html).toMatch(backToDances);
});
