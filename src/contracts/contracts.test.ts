/**
 * Owner: Shared (Step 0)
 * Purpose: mocks satisfy the contracts, and every implemented module reproduces the goldens.
 * A stub that still throws NotImplementedError is SKIPPED, so main stays green while work is in progress.
 */
import { describe, expect, it } from "vitest";
import { NotImplementedError } from "./notImplemented";
import { assertPoseFrame, assertSessionResult, parseDance, assertFeedPost } from "./validators";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../mocks/fakeSession";
import { GOLDEN_ASPECT, GOLDEN_RAW, GOLDEN_RAW_INVISIBLE, GOLDEN_SEGMENTS_MIRRORED, GOLDEN_SEGMENTS_MIRRORED_SEATED, GOLDEN_SEGMENTS_UNMIRRORED } from "../mocks/fixtures";
import { createMemoryStore } from "../mocks/memoryStore";
import { computePoseFrame, extractSegments } from "../vision/segments";
import { accuracyLevel, rateBeat, scoreFrame } from "../scoring/accuracy";
import { pointsDelta } from "../scoring/effort";
import { parseHeartRate } from "../hr/parseHeartRate";
import { songMs, type SegmentMap } from "../types/pulse";

/** Runs fn; if the module is still a stub, the test is skipped instead of failing. */
function implemented(name: string, fn: () => void) {
  it(name, (ctx) => {
    try { fn(); } catch (e) { if (e instanceof NotImplementedError) ctx.skip(); else throw e; }
  });
}

function expectSegments(actual: SegmentMap, expected: SegmentMap) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [k, v] of Object.entries(expected)) {
    const a = actual[k as keyof SegmentMap]!;
    expect(a[0]).toBeCloseTo(v![0], 5);
    expect(a[1]).toBeCloseTo(v![1], 5);
  }
}

describe("mocks satisfy the contracts", () => {
  it("fake dance parses", () => { expect(parseDance(FAKE_DANCE).id).toBe("fake-arms"); });
  it("fake results are valid", () => { assertSessionResult(FAKE_RESULT); assertSessionResult(FAKE_RESULT_QUIT); });
  it("memory store posts stay private", () => {
    const s = createMemoryStore();
    assertFeedPost(s.createPost({ authorId: "p-demo", resultId: FAKE_RESULT.id, showCalories: false, hasClip: false, groupIds: [] }));
  });
});

describe("segments.ts goldens (Toufic)", () => {
  implemented("unmirrored template segments", () => {
    expectSegments(extractSegments(GOLDEN_RAW.landmarks, GOLDEN_RAW.width, GOLDEN_RAW.height, { mirror: false, mode: "standing" }), GOLDEN_SEGMENTS_UNMIRRORED);
  });
  implemented("mirrored live frame, standing", () => {
    const f = computePoseFrame(GOLDEN_RAW, "standing");
    assertPoseFrame(f, "standing");
    expectSegments(f.segments, GOLDEN_SEGMENTS_MIRRORED);
    expect(f.tracking).toBe("ok");
  });
  implemented("mirrored live frame, seated", () => {
    const f = computePoseFrame(GOLDEN_RAW, "seated");
    assertPoseFrame(f, "seated");
    expectSegments(f.segments, GOLDEN_SEGMENTS_MIRRORED_SEATED);
  });
  implemented("pixel-space aspect ratio", () => {
    const pts = GOLDEN_RAW.landmarks.map((p) => ({ ...p }));
    pts[0] = { ...GOLDEN_ASPECT.from, v: 1 }; pts[2] = { ...GOLDEN_ASPECT.to, v: 1 }; // lShoulder -> lElbow
    const s = extractSegments(pts, GOLDEN_ASPECT.width, GOLDEN_ASPECT.height, { mirror: false, mode: "standing" });
    expect(s.l_upper_arm![0]).toBeCloseTo(GOLDEN_ASPECT.expected[0], 5);
    expect(s.l_upper_arm![1]).toBeCloseTo(GOLDEN_ASPECT.expected[1], 5);
  });
  implemented("invisible frame is uncertain", () => {
    const f = computePoseFrame(GOLDEN_RAW_INVISIBLE, "standing");
    assertPoseFrame(f, "standing");
    expect(f.usableRatio).toBe(0);
    expect(f.tracking).toBe("uncertain");
  });
});

describe("accuracy.ts goldens (Mohamed)", () => {
  implemented("perfect copy scores 1", () => {
    const frame = { tFrameMs: GOLDEN_RAW.tFrameMs, segments: FAKE_DANCE.frames[0].segments, usableRatio: 1, tracking: "ok" as const, points: GOLDEN_RAW.landmarks };
    expect(scoreFrame(frame, songMs(0), FAKE_DANCE, "standing")).toBeCloseTo(1, 5);
  });
  implemented("uncertain frame scores null", () => {
    const frame = { tFrameMs: GOLDEN_RAW.tFrameMs, segments: {}, usableRatio: 0, tracking: "uncertain" as const, points: GOLDEN_RAW.landmarks };
    expect(scoreFrame(frame, songMs(0), FAKE_DANCE, "standing")).toBeNull();
  });
  implemented("rating thresholds", () => {
    expect(rateBeat([0.85])).toBe("perfect"); expect(rateBeat([0.65])).toBe("good");
    expect(rateBeat([0.4])).toBe("ok"); expect(rateBeat([0.34])).toBe("miss"); expect(rateBeat([])).toBe("miss");
  });
  implemented("level thresholds", () => {
    expect(accuracyLevel(85)).toBe("superstar"); expect(accuracyLevel(70)).toBe("gold");
    expect(accuracyLevel(50)).toBe("silver"); expect(accuracyLevel(44.9)).toBe("bronze");
  });
});

describe("effort and heart rate goldens (Mohamed)", () => {
  implemented("points formula", () => {
    expect(pointsDelta(1, 1)).toBeCloseTo(10, 6);
    expect(pointsDelta(1, 0)).toBeCloseTo(2, 6);
  });
  implemented("8-bit and 16-bit packets", () => {
    expect(parseHeartRate(new DataView(new Uint8Array([0x00, 93]).buffer))).toBe(93);
    expect(parseHeartRate(new DataView(new Uint8Array([0x01, 0x2c, 0x01]).buffer))).toBe(300);
  });
});

describe("parseDance optional artist validation", () => {
  it("preserves and trims valid artist strings while omitting absent artist keys on legacy dances", () => {
    const withArtist = parseDance({ ...FAKE_DANCE, artist: "  Mabel  " });
    expect(withArtist.artist).toBe("Mabel");

    const { artist: _ignored, ...legacy } = FAKE_DANCE;
    const withoutArtist = parseDance(legacy);
    expect(withoutArtist.artist).toBeUndefined();
    expect("artist" in withoutArtist).toBe(false);
  });

  it("rejects invalid artist values (empty, whitespace-only, or non-string)", () => {
    for (const badArtist of ["", "   ", 123, null, {}]) {
      expect(() => parseDance({ ...FAKE_DANCE, artist: badArtist })).toThrow(/artist invalid/);
    }
  });
});

describe("parseDance optional coverUrl validation", () => {
  it("preserves and trims valid local coverUrl while omitting absent coverUrl on legacy dances", () => {
    const withCover = parseDance({ ...FAKE_DANCE, coverUrl: "  /dances/demo.jpg  " });
    expect(withCover.coverUrl).toBe("/dances/demo.jpg");

    const { coverUrl: _ignored, ...legacy } = FAKE_DANCE;
    const withoutCover = parseDance(legacy);
    expect(withoutCover.coverUrl).toBeUndefined();
    expect("coverUrl" in withoutCover).toBe(false);
  });

  it("rejects blank, non-string, and external network coverUrl values (NFR-04)", () => {
    for (const badCover of ["", "   ", 123, null, "https://example.com/art.jpg", "http://example.com/a.jpg", "//cdn.example.com/art.jpg"]) {
      expect(() => parseDance({ ...FAKE_DANCE, coverUrl: badCover })).toThrow(/coverUrl invalid/);
    }
  });
});
