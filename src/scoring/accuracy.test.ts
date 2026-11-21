/**
 * Owner: Mohamed
 * Purpose: unit tests for accuracy.ts. Contract goldens live in src/contracts/contracts.test.ts; add your own cases here.
 */
import { describe, expect, it } from "vitest";
import { accuracyLevel, rateBeat, rollingAccuracy, scoreFrame } from "./accuracy";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { GOLDEN_RAW } from "../mocks/fixtures";
import { songMs, type PoseFrame, type SegmentMap, type Vec2 } from "../types/pulse";

const UP = FAKE_DANCE.frames[0].segments;   // 0 ms: "up" beat
const OUT = FAKE_DANCE.frames[15].segments; // 500 ms: "out" beat

function poseFrame(segments: SegmentMap, tracking: "ok" | "uncertain" = "ok"): PoseFrame {
  return { tFrameMs: GOLDEN_RAW.tFrameMs, segments, usableRatio: 1, tracking, points: GOLDEN_RAW.landmarks };
}

/** Unit vector at θ degrees clockwise from straight up (y down). */
function rotated(deg: number): Vec2 {
  const t = (deg * Math.PI) / 180;
  return [Math.sin(t), -Math.cos(t)];
}

describe("scoreFrame (FR-27, FR-28)", () => {
  it("perfect copy of the up pose scores 1", () => {
    expect(scoreFrame(poseFrame(UP), songMs(250), FAKE_DANCE, "standing")).toBeCloseTo(1, 6);
  });

  it("up pose during an out beat scores < 1; arms off by 90° score 0", () => {
    const s = scoreFrame(poseFrame(UP), songMs(750), FAKE_DANCE, "standing")!;
    expect(s).toBeLessThan(1);
    // 4 arm segments at 90° -> 0, torso + 4 leg segments exact -> 1
    expect(s).toBeCloseTo(5 / 9, 6);
    const armsOnly = { l_upper_arm: UP.l_upper_arm!, r_upper_arm: UP.r_upper_arm! };
    expect(scoreFrame(poseFrame(armsOnly), songMs(750), FAKE_DANCE, "standing")).toBe(0);
  });

  it("late-biased window: reaches 120 ms ahead, 240 ms behind", () => {
    expect(scoreFrame(poseFrame(OUT), songMs(400), FAKE_DANCE, "standing")).toBeCloseTo(1, 6);
    expect(scoreFrame(poseFrame(OUT), songMs(100), FAKE_DANCE, "standing")!).toBeLessThan(1);
  });

  it("a 15° error on one segment gives (8 + 0.5) / 9", () => {
    const seg = { ...UP, l_forearm: rotated(15) };
    expect(scoreFrame(poseFrame(seg), songMs(250), FAKE_DANCE, "standing")).toBeCloseTo(8.5 / 9, 6);
  });

  it("seated mode ignores the legs", () => {
    const seg: SegmentMap = { ...UP, l_thigh: [1, 0], r_thigh: [-1, 0], l_shin: [1, 0], r_shin: [-1, 0] };
    expect(scoreFrame(poseFrame(seg), songMs(250), FAKE_DANCE, "seated")).toBeCloseTo(1, 6);
    expect(scoreFrame(poseFrame(seg), songMs(250), FAKE_DANCE, "standing")!).toBeLessThan(1);
  });

  it("only shared segments count", () => {
    expect(scoreFrame(poseFrame({ l_upper_arm: [0, -1] }), songMs(250), FAKE_DANCE, "standing")).toBeCloseTo(1, 6);
  });

  it("returns null for an empty window, no shared segment, or uncertain tracking", () => {
    expect(scoreFrame(poseFrame(UP), songMs(60_000), FAKE_DANCE, "standing")).toBeNull();
    expect(scoreFrame(poseFrame({}), songMs(250), FAKE_DANCE, "standing")).toBeNull();
    expect(scoreFrame(poseFrame(UP, "uncertain"), songMs(250), FAKE_DANCE, "standing")).toBeNull();
  });

  it("stays in [0, 1] and never NaN when the float dot is slightly > 1", () => {
    const v: Vec2 = [Math.SQRT1_2, Math.SQRT1_2]; // v·v = 1.0000000000000002
    const dance = { ...FAKE_DANCE, frames: [{ tMs: songMs(0), segments: { torso: v } }] };
    const s = scoreFrame(poseFrame({ torso: v }), songMs(0), dance, "standing");
    expect(s).toBe(1);
    for (let t = 0; t < 20_000; t += 137) {
      for (const pose of [UP, OUT, { ...UP, torso: rotated(170) }]) {
        const x = scoreFrame(poseFrame(pose), songMs(t), FAKE_DANCE, "standing")!;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    }
  });

  it("does not mutate its inputs", () => {
    const seg = { ...UP };
    const frame = poseFrame(seg);
    const before = JSON.stringify([frame, FAKE_DANCE]);
    scoreFrame(frame, songMs(250), FAKE_DANCE, "standing");
    expect(JSON.stringify([frame, FAKE_DANCE])).toBe(before);
  });
});

describe("rollingAccuracy (FR-27)", () => {
  const h = (tMs: number, score: number) => ({ tMs: songMs(tMs), score });

  it("excludes exactly now - 2000 ms, includes now", () => {
    expect(rollingAccuracy([h(3000, 0), h(5000, 1)], songMs(5000))).toBe(1);
    expect(rollingAccuracy([h(3001, 0), h(5000, 1)], songMs(5000))).toBe(0.5);
    expect(rollingAccuracy([h(5001, 0), h(4000, 0.4)], songMs(5000))).toBeCloseTo(0.4, 9);
  });

  it("handles unsorted input without mutating it", () => {
    const hist = [h(4900, 0.2), h(1000, 1), h(4000, 0.6), h(3500, 0.4)];
    const copy = JSON.stringify(hist);
    expect(rollingAccuracy(hist, songMs(5000))).toBeCloseTo(0.4, 9);
    expect(JSON.stringify(hist)).toBe(copy);
  });

  it("returns 0 when empty or nothing in range", () => {
    expect(rollingAccuracy([], songMs(5000))).toBe(0);
    expect(rollingAccuracy([h(100, 1)], songMs(5000))).toBe(0);
  });
});

describe("rateBeat (FR-31)", () => {
  it("uses the plain average with inclusive thresholds", () => {
    expect(rateBeat([0.9, 0.8])).toBe("perfect");
    expect(rateBeat([0.64])).toBe("ok");
    expect(rateBeat([0.7, 0.66])).toBe("good");
    expect(rateBeat([0.2, 0.3])).toBe("miss");
    expect(rateBeat([])).toBe("miss");
  });
});

describe("accuracyLevel (FR-31)", () => {
  it("maps percentages to levels inclusively", () => {
    expect(accuracyLevel(100)).toBe("superstar");
    expect(accuracyLevel(85)).toBe("superstar");
    expect(accuracyLevel(84.9)).toBe("gold");
    expect(accuracyLevel(70)).toBe("gold");
    expect(accuracyLevel(50)).toBe("silver");
    expect(accuracyLevel(49.9)).toBe("bronze");
    expect(accuracyLevel(0)).toBe("bronze");
  });
});
