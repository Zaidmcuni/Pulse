/**
 * Owner: Ali
 * Purpose: Results route rendering for completed, early-quit, and unavailable sessions.
 * FRs: FR-35, FR-36, FR-38
 * Edited: Mohamed (council redesign: early-quit check scoped to the page, not the app header)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../../App";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { assertSessionResult } from "../../contracts/validators";
import { store } from "../../data/store";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../../mocks/fakeSession";
import Results from "./Results";

const backToDances = /<a\b[^>]*\bhref="\/dances"[^>]*>Back to dances<\/a>/;

function renderApp(path: string): string {
  return renderToStaticMarkup(<StaticRouter location={path}><App /></StaticRouter>);
}

beforeEach(async () => {
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD); // App routes sit behind the auth gate (task 14)
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
  const page = html.slice(html.indexOf("<main")); // the app header has its own avatar button
  expect(page).not.toMatch(/<button|class="badge|post to|heart rate|accuracy|total points/i);
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

it("offers only the dancer's groups and opts out of calories and clips by default", () => {
  const profile = store.getActiveProfile()!;
  expect(profile.id).toBe(FAKE_RESULT.playerId);
  vi.spyOn(store, "listGroups").mockReturnValue([
    { id: "my-group", name: "My Group", kind: "friends", memberIds: [profile.id], groupDanceIds: [] },
    { id: "other-group", name: "Other Group", kind: "city", memberIds: [], groupDanceIds: [] },
  ]);
  const html = renderApp(`/results/${FAKE_RESULT.id}`);

  expect(html).toContain(">Post result</button>");
  expect(html).toContain("My Group");
  expect(html).not.toContain("Other Group");
  expect(html).not.toContain("checked");
  expect(html).toMatch(/<input[^>]*name="hasClip"[^>]*disabled/);
});

it("hides posting when the active profile does not own the result or it is already posted", () => {
  const profile = store.getActiveProfile()!;
  vi.spyOn(store, "getActiveProfile").mockReturnValueOnce({ ...profile, id: "another-dancer" });
  expect(renderApp(`/results/${FAKE_RESULT.id}`)).not.toContain(">Post result</button>");

  vi.spyOn(store, "listFeed").mockReturnValue([{
    id: "already-posted", authorId: profile.id, resultId: FAKE_RESULT.id, showCalories: false,
    hasClip: false, groupIds: [], kudosBy: [], createdAtIso: "2026-11-21T12:00:00Z",
  }]);
  const html = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(html).toContain("This result is already posted.");
  expect(html).not.toContain(">Post result</button>");
});

it("shows the badge dialog for awards from the active dancer’s completed result", () => {
  vi.spyOn(store, "listBadges").mockReturnValue([
    { badgeId: "5k_club", playerId: FAKE_RESULT.playerId, earnedAtIso: FAKE_RESULT.createdAtIso },
    { badgeId: "first_steps", playerId: FAKE_RESULT.playerId, earnedAtIso: "2025-01-01T12:00:00Z" },
  ]);

  const html = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(html).toContain("Badges unlocked");
  expect(html).toContain("5K Club");
  expect(html).not.toContain("First Steps");
  expect(renderApp(`/results/${FAKE_RESULT_QUIT.id}`)).not.toContain("Badges unlocked");
});
