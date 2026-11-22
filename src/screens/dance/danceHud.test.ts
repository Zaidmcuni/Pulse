/**
 * Owner: Mohamed
 * Purpose: unit tests for danceHud.ts
 */
import { describe, expect, it } from "vitest";
import type { HudState } from "../../scoring/session";
import { debugLines, formatClock, hrBadgeText, playHintText, progressFraction, ratingText, showReconnectBanner } from "./danceHud";

describe("ratingText (NFR-10)", () => {
  it("maps every rating to encouraging text, never 'Miss'", () => {
    expect(ratingText("perfect")).toBe("Perfect!");
    expect(ratingText("good")).toBe("Good!");
    expect(ratingText("ok")).toBe("OK");
    expect(ratingText("miss")).toBe("Keep going!");
    expect(ratingText("miss").toLowerCase()).not.toContain("miss");
  });
});

describe("formatClock", () => {
  it("formats M:SS", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(59_999)).toBe("0:59");
    expect(formatClock(600_000)).toBe("10:00");
  });
  it("clamps negatives to 0:00", () => {
    expect(formatClock(-500)).toBe("0:00");
  });
});

describe("progressFraction", () => {
  it("is the share of the song played", () => {
    expect(progressFraction(5000, 20)).toBe(0.25);
  });
  it("clamps below 0 and above 1", () => {
    expect(progressFraction(-100, 20)).toBe(0);
    expect(progressFraction(25_000, 20)).toBe(1);
  });
  it("is 0 for a zero-length dance", () => {
    expect(progressFraction(1000, 0)).toBe(0);
  });
});

describe("showReconnectBanner (FR-06)", () => {
  it("is true only when disconnected", () => {
    expect(showReconnectBanner("disconnected")).toBe(true);
    expect(showReconnectBanner("live")).toBe(false);
    expect(showReconnectBanner("simulated")).toBe(false);
    expect(showReconnectBanner(null)).toBe(false);
  });
});

describe("hrBadgeText (FR-29)", () => {
  it("says No watch without a watch (and for any legacy simulated reading)", () => {
    for (const s of ["live", "holding", "none"] as const) {
      expect(hrBadgeText("none", s)).toBe("No watch");
      expect(hrBadgeText("simulated", s)).toBe("No watch");
    }
  });
  it("describes the BLE state", () => {
    expect(hrBadgeText("ble", "live")).toBe("Live");
    expect(hrBadgeText("ble", "holding")).toBe("Holding");
    expect(hrBadgeText("ble", "none")).toBe("Waiting for watch");
  });
});

describe("playHintText (#112)", () => {
  it("asks to step back while the camera can't see the dancer", () => {
    expect(playHintText(true, "no-player", "standing")).toBe("Step back into frame. Scoring waits for you.");
    expect(playHintText(true, "still", "seated")).toBe("Bring your shoulders and arms into frame. Scoring waits for you.");
  });
  it("says Keep moving! while standing still, nothing otherwise", () => {
    expect(playHintText(false, "still", "standing")).toBe("Keep moving!");
    expect(playHintText(false, "dancing", "standing")).toBeNull();
    expect(playHintText(false, "no-player", "standing")).toBeNull();
    expect(playHintText(false, "paused", "standing")).toBeNull();
  });
});

describe("debugLines (#112)", () => {
  const hud: HudState = {
    points: 0, accuracyPct: 62, bpm: null, hrSource: "none", hrState: "none", caloriesKcal: 0, status: "still",
    debug: { dancerMotion: 0.04, coachMotion: 83.4, lastBeatScore: 0.71, lastBeatRating: "good" },
  };
  it("shows every debug number", () => {
    expect(debugLines(hud, 1, -83.4)).toEqual([
      "acc     62%",
      "beat    0.71 good",
      "dancer  0.04 SW/s",
      "coach   83 deg/s",
      "usable  1.00",
      "status  still",
      "offset  -83 ms",
    ]);
  });
  it("shows -- for missing values", () => {
    const empty: HudState = { ...hud, debug: { dancerMotion: null, coachMotion: 0, lastBeatScore: null, lastBeatRating: null } };
    const lines = debugLines(empty, null, null);
    expect(lines[1]).toBe("beat    -- --");
    expect(lines[2]).toBe("dancer  -- SW/s");
    expect(lines[4]).toBe("usable  --");
    expect(lines[6]).toBe("offset  -- ms");
  });
});
