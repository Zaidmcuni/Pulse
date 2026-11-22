/**
 * Owner: Toufic
 * Purpose: unit tests for sampleTemplate: boundaries, interpolation, missing keys, fake dance timing
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { MODE_SEGMENTS } from "../config";
import { assertSegmentMap, parseDance } from "../contracts/validators";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { songMs, type LandmarkPoint, type SegmentMap, type TemplateFrame, type Vec2 } from "../types/pulse";
import { sampleTemplate, sampleTemplatePose } from "./sampleTemplate";

const at = (tMs: number, segments: SegmentMap): TemplateFrame => ({ tMs: songMs(tMs), segments });
const dir = (deg: number): Vec2 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

function expectVec(actual: Vec2 | undefined, expected: Vec2) {
  expect(actual).toBeDefined();
  expect(actual![0]).toBeCloseTo(expected[0], 9);
  expect(actual![1]).toBeCloseTo(expected[1], 9);
}

describe("sampleTemplate boundaries", () => {
  it("returns no segments when there are no frames", () => {
    expect(sampleTemplate([], songMs(0))).toEqual({});
  });

  it("uses a single frame for every finite time", () => {
    const only = at(1000, { torso: [0, -1] });
    for (const t of [-500, 0, 1000, 1001, 99999]) expect(sampleTemplate([only], songMs(t))).toBe(only.segments);
  });

  it("clamps before the first and after the last frame", () => {
    const frames = [at(100, { torso: [0, -1] }), at(200, { torso: [1, 0] })];
    expect(sampleTemplate(frames, songMs(0))).toBe(frames[0].segments);
    expect(sampleTemplate(frames, songMs(-1))).toBe(frames[0].segments);
    expect(sampleTemplate(frames, songMs(200))).toBe(frames[1].segments);
    expect(sampleTemplate(frames, songMs(5000))).toBe(frames[1].segments);
  });

  it("uses an exact frame's full map, including directions its neighbours lack", () => {
    const frames = [
      at(0, { torso: [0, -1] }),
      at(10, { torso: [0, -1], l_shin: [0, 1] }),
      at(20, { torso: [0, -1] }),
    ];
    expect(sampleTemplate(frames, songMs(10))).toBe(frames[1].segments);
    expect(sampleTemplate(frames, songMs(10)).l_shin).toEqual([0, 1]);
  });

  it("returns no segments for a NaN time", () => {
    expect(sampleTemplate([at(0, { torso: [0, -1] })], songMs(Number.NaN))).toEqual({});
  });
});

describe("sampleTemplate interpolation", () => {
  it("uses the actual timestamp gap, not frame indexes", () => {
    const frames = [at(0, { torso: dir(0) }), at(100, { torso: dir(0) }), at(400, { torso: dir(90) })];
    expectVec(sampleTemplate(frames, songMs(250)).torso, dir(45)); // halfway through 100..400
    expectVec(sampleTemplate(frames, songMs(175)).torso, dir(22.5));
  });

  it("returns unit vectors that pass the contract validator", () => {
    const frames = [at(0, { l_upper_arm: dir(10), torso: dir(-90) }), at(33, { l_upper_arm: dir(130), torso: dir(-60) })];
    for (const t of [1, 7, 16.5, 32]) assertSegmentMap(sampleTemplate(frames, songMs(t)), MODE_SEGMENTS.standing, "sample");
  });

  it("crosses the ±π boundary by the shorter path", () => {
    const frames = [at(0, { torso: dir(170) }), at(100, { torso: dir(-170) })];
    expectVec(sampleTemplate(frames, songMs(50)).torso, dir(180));
    expectVec(sampleTemplate(frames, songMs(25)).torso, dir(175));
    const back = [at(0, { torso: dir(-170) }), at(100, { torso: dir(170) })];
    expectVec(sampleTemplate(back, songMs(25)).torso, dir(-175));
  });

  it("turns an exact 180° tie toward increasing angle (clockwise on screen, y down)", () => {
    const rightToLeft = [at(0, { torso: [1, 0] }), at(100, { torso: [-1, 0] })];
    expectVec(sampleTemplate(rightToLeft, songMs(50)).torso, [0, 1]);
    const leftToRight = [at(0, { torso: [-1, 0] }), at(100, { torso: [1, 0] })];
    expectVec(sampleTemplate(leftToRight, songMs(50)).torso, [0, -1]);
    const upToDown = [at(0, { torso: [0, -1] }), at(100, { torso: [0, 1] })];
    expectVec(sampleTemplate(upToDown, songMs(50)).torso, [1, 0]);
    const diagonal = [at(0, { torso: [0.6, 0.8] }), at(100, { torso: [-0.6, -0.8] })];
    expectVec(sampleTemplate(diagonal, songMs(50)).torso, [-0.8, 0.6]);
  });

  it("keeps only directions present in both frames", () => {
    const frames = [at(0, { torso: [0, -1], l_thigh: [0, 1] }), at(100, { torso: [0, -1], r_thigh: [0, 1] })];
    expect(Object.keys(sampleTemplate(frames, songMs(50)))).toEqual(["torso"]);
    const disjoint = [at(0, { l_thigh: [0, 1] }), at(100, { r_thigh: [0, 1] })];
    expect(sampleTemplate(disjoint, songMs(50))).toEqual({});
    const empty = [at(0, {}), at(100, { torso: [0, -1] })];
    expect(sampleTemplate(empty, songMs(50))).toEqual({});
  });

  it("does not mutate frames and answers seeks in any order", () => {
    const frames = Object.freeze([
      at(0, Object.freeze({ torso: dir(-90) })),
      at(300, Object.freeze({ torso: dir(-45) })),
      at(900, Object.freeze({ torso: dir(0) })),
    ]);
    const fresh = (t: number) => sampleTemplate([...frames], songMs(t));
    for (const t of [800, 100, 850, 0, 450, 900, 150]) expect(sampleTemplate(frames, songMs(t))).toEqual(fresh(t));
  });
});

describe("sampleTemplate on the fake dance", () => {
  const dance = parseDance(FAKE_DANCE);
  const UP: Vec2 = [0, -1];

  it("arms up at 0 ms, out at 500 ms, up again at 1000 ms", () => {
    const s0 = sampleTemplate(dance.frames, songMs(0));
    const s500 = sampleTemplate(dance.frames, songMs(500));
    const s1000 = sampleTemplate(dance.frames, songMs(1000));
    for (const k of ["l_upper_arm", "l_forearm", "r_upper_arm", "r_forearm"] as const) {
      expectVec(s0[k], UP);
      expectVec(s1000[k], UP);
    }
    expectVec(s500.l_upper_arm, [1, 0]); // dancer's left arm points to the viewer's right
    expectVec(s500.l_forearm, [1, 0]);
    expectVec(s500.r_upper_arm, [-1, 0]);
    expectVec(s500.r_forearm, [-1, 0]);
  });

  it("blends between the last 'up' frame and the 500 ms frame", () => {
    const lastUp = dance.frames.filter((f) => f.tMs < 500).at(-1)!;
    expect(lastUp.tMs).toBeCloseTo(1400 / 3, 9); // 466.67 ms at 30 fps
    const mid = sampleTemplate(dance.frames, songMs((lastUp.tMs + 500) / 2));
    const h = Math.SQRT1_2;
    expectVec(mid.l_upper_arm, [h, -h]);
    expectVec(mid.r_upper_arm, [-h, -h]);
    expectVec(mid.torso, UP);
    assertSegmentMap(mid, MODE_SEGMENTS.standing, "fake mid");
  });
});

describe("sampleTemplatePose landmark interpolation", () => {
  const makeLandmarks = (dx: number, dy: number, v = 0.9): LandmarkPoint[] =>
    Array.from({ length: 12 }, (_, i) => ({
      x: 0.4 + i * 0.01 + dx,
      y: 0.3 + i * 0.02 + dy,
      v,
    }));

  it("interpolates landmarks smoothly between frames, holds coordinates during fade-out/in, and snaps across > 500 ms gaps", () => {
    const lmA = makeLandmarks(0, 0, 0.8);
    const lmB = makeLandmarks(0.2, -0.1, 1.0);
    // Point 4 fades out to v = 0 at (0, 0) in B; Point 5 fades in from (0, 0) v = 0 in A; Point 11 is invisible in both
    lmB[4] = { x: 0, y: 0, v: 0 };
    lmA[5] = { x: 0, y: 0, v: 0 };
    lmA[11] = { x: 0, y: 0, v: 0.02 };
    lmB[11] = { x: 0, y: 0, v: 0 };

    const frames: TemplateFrame[] = [
      { tMs: songMs(100), segments: { torso: [0, -1] }, landmarks: lmA },
      { tMs: songMs(300), segments: { torso: [0, -1] }, landmarks: lmB },
      { tMs: songMs(1000), segments: { torso: [0, -1] }, landmarks: makeLandmarks(0.4, 0, 0.9) },
    ];

    const mid = sampleTemplatePose(frames, songMs(200));
    expect(mid.landmarks).toHaveLength(12);
    // Point 0 interpolated halfway
    expect(mid.landmarks![0].x).toBeCloseTo(lmA[0].x + 0.1, 6);
    expect(mid.landmarks![0].y).toBeCloseTo(lmA[0].y - 0.05, 6);
    expect(mid.landmarks![0].v).toBeCloseTo(0.9, 6);

    // Point 4 holds A's coordinates while visibility decays (anti-twitching)
    expect(mid.landmarks![4].x).toBeCloseTo(lmA[4].x, 6);
    expect(mid.landmarks![4].y).toBeCloseTo(lmA[4].y, 6);
    expect(mid.landmarks![4].v).toBeCloseTo(0.4, 6);

    // Point 5 holds B's coordinates while visibility rises (anti-twitching)
    expect(mid.landmarks![5].x).toBeCloseTo(lmB[5].x, 6);
    expect(mid.landmarks![5].y).toBeCloseTo(lmB[5].y, 6);
    expect(mid.landmarks![5].v).toBeCloseTo(0.5, 6);

    // Point 11 stays zeroed when both sides are <= VIS_EPS
    expect(mid.landmarks![11]).toEqual({ x: 0, y: 0, v: 0 });

    // Gap from 300 ms to 1000 ms is 700 ms (> 500 ms) -> snaps to nearest frame's landmarks
    expect(sampleTemplatePose(frames, songMs(500)).landmarks).toBe(frames[1].landmarks);
    expect(sampleTemplatePose(frames, songMs(800)).landmarks).toBe(frames[2].landmarks);
  });
});
