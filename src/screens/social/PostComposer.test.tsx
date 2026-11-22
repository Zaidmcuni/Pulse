/**
 * Owner: Ali
 * Purpose: Share to Crew dialog: live preview card, FR-38 defaults, opt-in average heart rate.
 * FRs: FR-38, FR-39
 * Edited: Toufic (#154)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { SessionResult } from "../../types/pulse";
import { PostComposer } from "./PostComposer";

const watchResult: SessionResult = {
  ...FAKE_RESULT,
  samples: FAKE_RESULT.samples.map((s) => ({ ...s, hrSource: "ble" as const })), // 110..129 bpm, avg 120
};

function render(result: SessionResult, canShareClip = false): string {
  return renderToStaticMarkup(<StaticRouter location="/results"><PostComposer result={result} canShareClip={canShareClip} /></StaticRouter>);
}

function input(html: string, name: string): string {
  return html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
}

beforeEach(() => {
  const profile = store.getActiveProfile()!;
  vi.spyOn(store, "listFeed").mockReturnValue([]);
  vi.spyOn(store, "getDance").mockReturnValue(FAKE_DANCE);
  vi.spyOn(store, "listProfiles").mockReturnValue([{ ...profile, id: FAKE_RESULT.playerId }]);
  vi.spyOn(store, "listGroups").mockReturnValue([
    { id: "my-group", name: "My Group", kind: "friends", memberIds: [FAKE_RESULT.playerId], groupDanceIds: [] },
  ]);
});

afterEach(() => vi.restoreAllMocks());

it("previews the post card at the top with nothing extra shared by default", () => {
  const html = render(watchResult);
  expect(html).toContain(">Share to Crew</button>");
  const preview = html.slice(html.indexOf('aria-label="Post preview"'), html.indexOf("<fieldset"));
  expect(preview).toContain("Preview: what your crew will see");
  expect(preview).toContain('<article class="card social-panel social-post">');
  expect(preview).toContain(`<h3 class="social-post-title">${FAKE_DANCE.title}`);
  expect(preview).toContain("<strong>842</strong> points");
  expect(preview).not.toMatch(/kcal|bpm|highlight clip|href=/i); // health stats off; author is not a link inside the dialog
  expect(html.indexOf("Post preview")).toBeLessThan(html.indexOf("Also share with groups"));
});

it("keeps every toggle off by default (FR-38) and offers the watch average", () => {
  const html = render(watchResult, true);
  for (const name of ["group", "showCalories", "showHeartRate", "hasClip"]) {
    expect(input(html, name)).not.toBe("");
    expect(input(html, name)).not.toContain("checked");
    expect(input(html, name)).not.toContain("disabled");
  }
  expect(html).toContain("Show average heart rate · 120 bpm");
  expect(html).toContain("Body stats always stay private; calories and average heart rate show only if you turn them on.");
  expect(html).not.toContain("session-post-hr-note");
});

it.each([
  ["simulated", FAKE_RESULT],
  ["no watch", { ...FAKE_RESULT, samples: FAKE_RESULT.samples.map((s) => ({ ...s, heartRate: 0, hrSource: "none" as const })) }],
])("disables average heart rate with a note for a %s run", (_label, result) => {
  const html = render(result);
  expect(input(html, "showHeartRate")).toMatch(/disabled[^>]*aria-describedby="session-post-hr-note"|aria-describedby="session-post-hr-note"[^>]*disabled/);
  expect(html).toContain('<p id="session-post-hr-note">Average heart rate needs a watch connected during the dance.</p>');
  expect(html).not.toMatch(/\d+ bpm/);
});

it("says so instead of offering a second post", () => {
  vi.mocked(store.listFeed).mockReturnValue([{
    id: "p", authorId: FAKE_RESULT.playerId, resultId: FAKE_RESULT.id, showCalories: false,
    hasClip: false, groupIds: [], kudosBy: [], createdAtIso: "2026-11-21T12:00:00Z",
  }]);
  const html = render(watchResult);
  expect(html).toBe("<p>This result is already posted.</p>");
});
