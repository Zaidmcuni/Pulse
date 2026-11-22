/**
 * Owner: Mohamed
 * Purpose: server-render tests for the Me page health summary (Today ring and Recent workouts).
 * FRs: FR-32, FR-41, FR-02
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../data/store";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { HeartRateSource, PlayerProfile, SessionResult } from "../types/pulse";
import { HealthSummary } from "./HealthSummary";

const PROFILE: PlayerProfile = {
  id: "p-me", handle: "me", displayName: "Me", age: 57, sex: "female", weightKg: 83,
  heightCm: 171, restingHr: 65, mode: "standing", groupIds: [],
};

function result(id: string, hoursAgo: number, caloriesKcal: number, hrSource: HeartRateSource = "ble"): SessionResult {
  return {
    ...FAKE_RESULT,
    id,
    playerId: PROFILE.id,
    createdAtIso: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    caloriesKcal,
    samples: Array.from({ length: 60 }, (_, tSec) => ({
      tSec, heartRate: hrSource === "none" ? 0 : 140, hrSource, effort: 0, accuracy: 0.78, points: 0,
    })),
  };
}

const render = (): string => renderToStaticMarkup(<MemoryRouter><HealthSummary /></MemoryRouter>);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 21, 0));
  vi.spyOn(store, "getActiveProfile").mockReturnValue(PROFILE);
  vi.spyOn(store, "getDance").mockReturnValue({ ...FAKE_DANCE, title: "Test Song", artist: "Test Artist" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HealthSummary", () => {
  it("shows the Today ring and three recent workout links", () => {
    vi.spyOn(store, "listResults").mockReturnValue([
      result("r1", 1, 120.4), result("r2", 2, 61), result("r3", 3, 10, "none"), result("r4", 30, 500),
    ]);
    const html = render();
    expect(html).toContain("Today");
    expect(html).toContain("Sunday, Nov 22");
    expect(html).toContain('class="health-ring-value">181<');
    expect(html).toContain("/ 300 kcal");
    expect(html).toContain("active min");
    expect(html).toContain("3 dances today");
    expect(html).toContain("Calories are estimated.");
    expect(html).toContain("Recent workouts");
    const links = [...html.matchAll(/href="\/results\/([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(["r1", "r2", "r3"]);
    expect(html).toContain("Test Song");
    expect(html).toContain("120 kcal");
    expect(html).toContain('class="health-chip is-none">No watch<');
    expect(html).not.toContain("Connect a watch");
    expect(html).not.toContain("Daily goal reached!");
  });

  it("shows -- and a watch hint on a no-watch day", () => {
    vi.spyOn(store, "listResults").mockReturnValue([result("r1", 1, 50, "none")]);
    const html = render();
    expect(html).toContain('class="health-ring-value">--<');
    expect(html).toContain("Connect a watch to track calories.");
    expect(html).toContain("1 dance today");
  });

  it("celebrates a reached goal", () => {
    vi.spyOn(store, "listResults").mockReturnValue([result("r1", 1, 400)]);
    const html = render();
    expect(html).toContain("Daily goal reached!");
    expect(html).toContain("health-ring-progress is-done");
  });

  it("shows an empty state with a link to the dances", () => {
    vi.spyOn(store, "listResults").mockReturnValue([]);
    const html = render();
    expect(html).toContain("No workouts yet.");
    expect(html).toContain('href="/dances"');
  });

  it("never shows the profile's age, weight or heart rate", () => {
    vi.spyOn(store, "listResults").mockReturnValue([result("r1", 1, 120), result("r2", 2, 10, "none")]);
    const text = render().replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\b57\b/);
    expect(text).not.toMatch(/\b83\b/);
    expect(text).not.toMatch(/\b140\b/);
    expect(text).not.toMatch(/bpm/i);
  });

  it("renders nothing without an active profile", () => {
    vi.spyOn(store, "getActiveProfile").mockReturnValue(null);
    expect(render()).toBe("");
  });
});
