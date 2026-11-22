/**
 * Owner: Mohamed
 * Purpose: Offline regression for beat and points cutoffs with separate render and camera clocks.
 * FRs: FR-25, FR-28, FR-30
 */
import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { perfMs, songMs, type PlayerProfile } from "../types/pulse";
import { scoringTimeMs } from "./scoringClock";
import { createDanceSession } from "./session";

const profile: PlayerProfile = {
  id: "check", handle: "check", displayName: "Check", age: 25, sex: "other", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};
const renderLeadMs = 30 + CONFIG.camDelaySec * 1000;

describe("scoring clock (#87)", () => {
  it("includes a frame delivered after the render clock crossed both the beat and the points boundary", () => {
    let nowMs = 1000;
    const player = {
      songTimeMs: () => songMs(nowMs),
      heardSongTimeMs: (atMs: number) => songMs(atMs - renderLeadMs),
    };
    const session = createDanceSession(FAKE_DANCE, profile);
    session.setNoWatch(true);
    session.addFrameScore(songMs(100), 0);
    session.addFrameScore(songMs(600), 0.6);
    const advance = () => session.advance(scoringTimeMs(player, perfMs(nowMs)), perfMs(nowMs));
    expect(advance()).toEqual({ beats: [{ index: 0, rating: "miss" }], samples: [] });

    // The second beat ends at 1000. This frame was captured within it and was
    // still in flight when both the render clock and the heard clock crossed 1000.
    nowMs += renderLeadMs + 10;
    expect(advance()).toEqual({ beats: [], samples: [] });
    session.addFrameScore(songMs(990), 1);
    nowMs += CONFIG.camDelaySec * 1000;
    const { beats, samples } = advance();
    expect(beats).toEqual([{ index: 1, rating: "perfect" }]);
    expect(samples[0].accuracy).toBeCloseTo(1.6 / 3);
    expect(samples[0].points).toBeGreaterThan(0);
    expect(advance()).toEqual({ beats: [], samples: [] });

    nowMs += (CONFIG.trackingHoldSec + 1) * 1000;
    const gap = advance(); // no more camera callbacks
    expect(gap.beats).toEqual([]);
    expect(gap.samples.at(-1)).toMatchObject({ accuracy: 0, points: 0 });
  });

  it("stays at zero before audible playback and never runs ahead of suspended audio", () => {
    const player = { songTimeMs: () => songMs(0), heardSongTimeMs: () => songMs(500) };
    expect(scoringTimeMs(player, perfMs(0))).toBe(0);
    expect(scoringTimeMs({ ...player, heardSongTimeMs: () => songMs(-500) }, perfMs(0))).toBe(0);
  });
});
