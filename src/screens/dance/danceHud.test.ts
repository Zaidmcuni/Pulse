/**
 * Owner: Mohamed
 * Purpose: unit tests for danceHud.ts
 */
import { describe, expect, it } from "vitest";
import type { HudState } from "../../scoring/session";
import { CONFIG, LM } from "../../config";
import { GOLDEN_RAW } from "../../mocks/fixtures";
import { perfMs, type RawPoseLandmarks } from "../../types/pulse";
import { computePoseFrame } from "../../vision/segments";
import {
  createTrackingFeedback, debugLines, formatClock, hrBadgeText, playHintText, progressFraction,
  ratingText, showReconnectBanner, trackingHintText,
} from "./danceHud";

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
  it("labels unavailable and simulated data by source", () => {
    for (const s of ["live", "holding", "none"] as const) {
      expect(hrBadgeText("none", s)).toBe("No watch");
      expect(hrBadgeText("simulated", s)).toBe("Simulated");
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

describe("tracking feedback (FR-21)", () => {
  const absenceDelayMs = 2_000;
  const rawFrame = (visible: (index: number) => number): RawPoseLandmarks => ({
    tFrameMs: perfMs(0), mediaTimeSec: 0, width: 640, height: 480,
    landmarks: GOLDEN_RAW.landmarks.map((point, index) => ({ ...point, v: visible(index) })),
  });
  const healthy = rawFrame(() => 1);
  const partial = rawFrame((index) => index === LM.lShoulder ? CONFIG.visibilityMin / 2 : 0);
  const empty = rawFrame(() => 0);

  it.each(["standing", "seated"] as const)("shows an immediate brief dropout and clears on recovery (%s)", (mode) => {
    const feedback = createTrackingFeedback(absenceDelayMs, 0);
    const observe = (raw: RawPoseLandmarks, atMs: number) => {
      feedback.observe(raw, computePoseFrame(raw, mode).tracking, atMs);
    };
    observe(healthy, 10);
    expect(feedback.read(10)).toBe("tracked");
    observe(partial, 20);
    expect(trackingHintText(feedback.read(20), "still", mode)).toBe("Tracking uncertain — keep moving");
    observe(healthy, 50);
    expect(trackingHintText(feedback.read(50), "dancing", mode)).toBeNull();
  });

  it("uses raw presence when seated masking removes the only detected landmarks", () => {
    const feetOnly = rawFrame((index) => index === LM.lAnkle ? 1 : 0);
    const frame = computePoseFrame(feetOnly, "seated");
    expect(frame.points.every((point) => point.v === 0)).toBe(true);
    const feedback = createTrackingFeedback(absenceDelayMs, 0);
    feedback.observe(feetOnly, frame.tracking, 10);
    expect(feedback.read(10)).toBe("uncertain");

    const legsHidden = rawFrame((index) => [LM.lKnee, LM.rKnee, LM.lAnkle, LM.rAnkle].some((id) => id === index) ? 0 : 1);
    feedback.observe(legsHidden, computePoseFrame(legsHidden, "seated").tracking, 20);
    expect(feedback.read(20)).toBe("tracked");
  });

  it("keeps distinct absence timing across continued blanks and clears it on partial or full recovery", () => {
    const feedback = createTrackingFeedback(absenceDelayMs, 0);
    feedback.observe(partial, "uncertain", 5);
    feedback.observe(empty, "uncertain", 10);
    expect(trackingHintText(feedback.read(10), "still", "standing")).toBeNull();
    feedback.observe(empty, "uncertain", 2_009);
    expect(feedback.read(2_009)).toBe("waiting");
    expect(trackingHintText(feedback.read(2_010), "still", "standing")).toBe("Step back into frame. Scoring waits for you.");
    expect(trackingHintText(feedback.read(2_010), "dancing", "seated")).toBe("Bring your shoulders and arms into frame. Scoring waits for you.");
    feedback.observe(partial, "uncertain", 2_021);
    expect(feedback.read(2_021)).toBe("uncertain");
    feedback.observe(empty, "uncertain", 2_050);
    expect(feedback.read(2_050)).toBe("waiting");
    feedback.observe(healthy, "ok", 2_090);
    expect(feedback.read(2_090)).toBe("tracked");
  });

  it("handles a stalled stream and restarts the grace period on transport reset", () => {
    const feedback = createTrackingFeedback(absenceDelayMs, 0);
    feedback.observe(partial, "uncertain", 100);
    expect(feedback.read(2_099)).toBe("uncertain");
    expect(feedback.read(2_100)).toBe("absent");
    feedback.observe(empty, "uncertain", 2_110);
    expect(feedback.read(2_110)).toBe("absent");
    feedback.reset(2_200);
    expect(feedback.read(4_199)).toBe("waiting");
    expect(feedback.read(4_200)).toBe("absent");
    feedback.observe(healthy, "ok", 4_201);
    expect(feedback.read(4_201)).toBe("tracked");
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
