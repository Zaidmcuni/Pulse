/**
 * Owner: Toufic
 * Purpose: Unit tests for 9:16 silhouette pose interpolation, anti-twitching, rendering, and ClipReplay loop (FR-49)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BodyTrack } from "../coach/bodyTrack";
import { BODY_TRACK_INDICES } from "../coach/coach3d";
import * as humanCoach from "../coach/humanCoach";
import { computeStageTransform } from "../coach/silhouette";
import { CONFIG, LM } from "../config";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { perfMs, songMs, type Dance, type LandmarkPoint, type PoseFrame, type RecordedPoseSample } from "../types/pulse";
import { createPoseRecorder } from "../vision/poseRecorder";
import {
  CLIP_HEIGHT_PX,
  CLIP_WIDTH_PX,
  ClipReplay,
  SIDE_BY_SIDE_HEIGHT_PX,
  SIDE_BY_SIDE_WIDTH_PX,
  computeClipStageTransform,
  computeCoverCrop,
  computeLimbAlpha,
  interpolateRecordedPose,
  projectMirroredLandmarkToPane,
  renderClipFrame,
  renderSideBySideFrame,
  songTimeToVideoSec,
  startClipReplayLoop,
  type ClipDrawContext,
  type ClipGradient,
  type SideBySideDrawContext,
  type SideBySideRenderSurface,
} from "./ClipReplay";

interface RecordedStrokeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  globalAlpha: number;
  strokeStyle: string;
}

interface RecordedArcCall {
  x: number;
  y: number;
  r: number;
  globalAlpha: number;
  fillStyle: string;
}

interface MockCanvasHandle {
  ctx: ClipDrawContext;
  fillRectCalls: Array<[number, number, number, number]>;
  moveTos: Array<[number, number]>;
  lineTos: Array<[number, number]>;
  strokes: RecordedStrokeSegment[];
  arcs: RecordedArcCall[];
  fills: number;
}

function createMockClipContext(): MockCanvasHandle {
  const fillRectCalls: Array<[number, number, number, number]> = [];
  const moveTos: Array<[number, number]> = [];
  const lineTos: Array<[number, number]> = [];
  const strokes: RecordedStrokeSegment[] = [];
  const arcs: RecordedArcCall[] = [];
  let fills = 0;

  let pathMoves: Array<[number, number]> = [];
  let pendingArc: { x: number; y: number; r: number } | null = null;

  const makeGradient = (): ClipGradient => ({
    addColorStop: () => {},
  });

  const ctx: ClipDrawContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    fillRect: (x, y, w, h) => {
      fillRectCalls.push([x, y, w, h]);
    },
    beginPath: () => {
      pathMoves = [];
      pendingArc = null;
    },
    moveTo: (x, y) => {
      moveTos.push([x, y]);
      pathMoves.push([x, y]);
    },
    lineTo: (x, y) => {
      lineTos.push([x, y]);
      pathMoves.push([x, y]);
    },
    closePath: () => {},
    arc: (x, y, r) => {
      pendingArc = { x, y, r };
      arcs.push({ x, y, r, globalAlpha: ctx.globalAlpha, fillStyle: String(ctx.fillStyle) });
    },
    fill: () => {
      fills += 1;
    },
    stroke: () => {
      if (pathMoves.length >= 2 && pendingArc === null) {
        const start = pathMoves[0];
        const end = pathMoves[pathMoves.length - 1];
        strokes.push({
          x1: start[0],
          y1: start[1],
          x2: end[0],
          y2: end[1],
          globalAlpha: ctx.globalAlpha,
          strokeStyle: String(ctx.strokeStyle),
        });
      }
    },
  };

  return { ctx, fillRectCalls, moveTos, lineTos, strokes, arcs, get fills() { return fills; } };
}

function makeNormalizedStandingPoints(overrides: Partial<Record<number, Partial<LandmarkPoint>>> = {}): LandmarkPoint[] {
  const base: LandmarkPoint[] = [
    { x: -0.5, y: -0.6, v: 0.95 }, // lShoulder
    { x: 0.5, y: -0.6, v: 0.95 },  // rShoulder
    { x: -0.8, y: -0.1, v: 0.95 }, // lElbow
    { x: 0.8, y: -0.1, v: 0.95 },  // rElbow
    { x: -0.9, y: 0.35, v: 0.95 }, // lWrist
    { x: 0.9, y: 0.35, v: 0.95 },  // rWrist
    { x: -0.35, y: 0.6, v: 0.95 }, // lHip
    { x: 0.35, y: 0.6, v: 0.95 },  // rHip
    { x: -0.4, y: 1.35, v: 0.95 }, // lKnee
    { x: 0.4, y: 1.35, v: 0.95 },  // rKnee
    { x: -0.45, y: 2.1, v: 0.95 }, // lAnkle
    { x: 0.45, y: 2.1, v: 0.95 },  // rAnkle
  ];
  return base.map((pt, idx) => ({ ...pt, ...(overrides[idx] ?? {}) }));
}

function makeSample(tMs: number, overrides: Partial<Record<number, Partial<LandmarkPoint>>> = {}): RecordedPoseSample {
  return {
    tSongMs: songMs(tMs),
    points: makeNormalizedStandingPoints(overrides),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("react");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("computeLimbAlpha", () => {
  it("returns 0 at or below 0.2, 1 at or above CONFIG.visibilityMin, and monotonically ramps in between", () => {
    expect(computeLimbAlpha(0, 0.9)).toBe(0);
    expect(computeLimbAlpha(0.2, 0.9)).toBe(0);
    expect(computeLimbAlpha(0.15, 0.15)).toBe(0);

    expect(computeLimbAlpha(CONFIG.visibilityMin, 0.9)).toBe(1);
    expect(computeLimbAlpha(0.95, 0.8)).toBe(1);

    const a = computeLimbAlpha(0.25, 0.9);
    const b = computeLimbAlpha(0.375, 0.9);
    const c = computeLimbAlpha(0.5, 0.9);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(0.5, 6);
    expect(c).toBeLessThan(1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);

    expect(computeLimbAlpha(Number.NaN, 0.9)).toBe(0);
  });
});

describe("interpolateRecordedPose", () => {
  it("returns null for an empty recording and fades to blank beyond the recording", () => {
    expect(interpolateRecordedPose([], 500)).toBeNull();

    const s1 = makeSample(1000);
    const s2 = makeSample(1100, { [LM.rWrist]: { x: 1.3, y: -0.4, v: 0.9 } });
    expect(interpolateRecordedPose([s1, s2], 500)?.points.every(({ v }) => v === 0)).toBe(true);
    expect(interpolateRecordedPose([s1, s2], 1500)?.points.every(({ v }) => v === 0)).toBe(true);
    expect(interpolateRecordedPose([s1, s2], 1100)).toEqual(s2);
  });

  it("interpolates coordinates and visibility cleanly at 25%, 50%, and 75% between 100ms samples", () => {
    const s1 = makeSample(1000, { [LM.rWrist]: { x: 0.5, y: 0.4, v: 0.6 } });
    const s2 = makeSample(1100, { [LM.rWrist]: { x: 1.3, y: -0.4, v: 1.0 } });

    const p25 = interpolateRecordedPose([s1, s2], 1025)!;
    expect(p25.tSongMs).toBe(1025);
    expect(p25.points[LM.rWrist].x).toBeCloseTo(0.7, 6);
    expect(p25.points[LM.rWrist].y).toBeCloseTo(0.2, 6);
    expect(p25.points[LM.rWrist].v).toBeCloseTo(0.7, 6);

    const p50 = interpolateRecordedPose([s1, s2], 1050)!;
    expect(p50.points[LM.rWrist].x).toBeCloseTo(0.9, 6);
    expect(p50.points[LM.rWrist].y).toBeCloseTo(0.0, 6);
    expect(p50.points[LM.rWrist].v).toBeCloseTo(0.8, 6);

    const p75 = interpolateRecordedPose([s1, s2], 1075)!;
    expect(p75.points[LM.rWrist].x).toBeCloseTo(1.1, 6);
    expect(p75.points[LM.rWrist].y).toBeCloseTo(-0.2, 6);
    expect(p75.points[LM.rWrist].v).toBeCloseTo(0.9, 6);
  });

  it("holds valid joint coordinates while visibility fades out or fades in (anti-twitching guard)", () => {
    const dropStart = makeSample(1000, { [LM.rWrist]: { x: 0.9, y: -0.6, v: 0.9 } });
    const dropEnd = makeSample(1100, { [LM.rWrist]: { x: 4, y: 3, v: 0.1 } });

    const midFadeOut = interpolateRecordedPose([dropStart, dropEnd], 1050)!;
    expect(midFadeOut.points[LM.rWrist].x).toBeCloseTo(0.9, 6);
    expect(midFadeOut.points[LM.rWrist].y).toBeCloseTo(-0.6, 6);
    expect(midFadeOut.points[LM.rWrist].v).toBeCloseTo(0.45, 6);

    const riseStart = makeSample(2000, { [LM.rWrist]: { x: 0, y: 0, v: 0 } });
    const riseEnd = makeSample(2100, { [LM.rWrist]: { x: 0.9, y: -0.6, v: 0.9 } });

    const midFadeIn = interpolateRecordedPose([riseStart, riseEnd], 2050)!;
    expect(midFadeIn.points[LM.rWrist].x).toBeCloseTo(0.9, 6);
    expect(midFadeIn.points[LM.rWrist].y).toBeCloseTo(-0.6, 6);
    expect(midFadeIn.points[LM.rWrist].v).toBeCloseTo(0.45, 6);

    const bothOccluded = interpolateRecordedPose(
      [
        makeSample(3000, { [LM.lAnkle]: { x: 0, y: 0, v: 0 } }),
        makeSample(3100, { [LM.lAnkle]: { x: 0, y: 0, v: 0.02 } }),
      ],
      3050,
    )!;
    expect(bothOccluded.points[LM.lAnkle]).toEqual({ x: 0, y: 0, v: 0 });
  });

  it("fades the last pose out and the new one in across a tracking gap", () => {
    const a = makeSample(1000, { [LM.rWrist]: { x: 0.2, y: 0.2, v: 0.9 } });
    const b = makeSample(1800, { [LM.rWrist]: { x: 1.4, y: -0.8, v: 0.9 } });
    const at = (time: number) => interpolateRecordedPose([a, b], time)!.points[LM.rWrist];
    expect(at(1050).x).toBe(0.2);
    expect(at(1050).v).toBeLessThan(0.9);
    expect(at(1400).v).toBe(0);
    expect(at(1401).v).toBe(0);
    expect(at(1750).x).toBe(1.4);
    expect(at(1750).v).toBeGreaterThan(0);
  });
});

describe("renderClipFrame", () => {
  it("draws backdrop, sculpted torso/neck/head, all 8 limbs with hands/feet, and 12 precision joints in back-to-front order with left/right colors", () => {
    const mock = createMockClipContext();
    const standing = makeSample(0);

    renderClipFrame(mock.ctx, standing, CLIP_WIDTH_PX, CLIP_HEIGHT_PX);

    expect(mock.fillRectCalls).toHaveLength(2);
    // 12 precision joints * 3 concentric circles (halo + ring + core) + 1 head anchor arc = 37 arcs
    expect(mock.arcs).toHaveLength(37);
    // 15 contour polygons (8 limbs + 2 hands + 2 feet + torso + neck + head) + 37 circle fills = 52 fills
    expect(mock.fills).toBe(52);
    // 15 contour polygons * 2 strokes (dark moat + luminous rim) + 8 internal bone-axis lines = 38 strokes
    expect(mock.strokes).toHaveLength(38);

    // Back-to-front depth order:
    // Legs (strokes 0..15) -> Torso/Neck/Head (strokes 16..21) -> Right Arm (strokes 22..29) -> Left Arm (strokes 30..37)
    expect(mock.strokes[2].strokeStyle).toBe("#bae6fd");  // l_thigh internal axis
    expect(mock.strokes[10].strokeStyle).toBe("#e9d5ff"); // r_thigh internal axis
    expect(mock.strokes[22].strokeStyle).toBe("#070b18"); // r_upper_arm dark moat
    expect(mock.strokes[23].strokeStyle).toBe("#f3e8ff"); // r_upper_arm violet rim
    expect(mock.strokes[24].strokeStyle).toBe("#e9d5ff"); // r_upper_arm violet axis
    expect(mock.strokes[30].strokeStyle).toBe("#070b18"); // l_upper_arm dark moat
    expect(mock.strokes[31].strokeStyle).toBe("#e0f2fe"); // l_upper_arm cyan rim
    expect(mock.strokes[32].strokeStyle).toBe("#bae6fd"); // l_upper_arm cyan axis

    // rWrist normalized x = +0.9 should map to right of centerX (270 + 0.9 * 129.6 = 386.64).
    const expectedRightWristX = CLIP_WIDTH_PX * 0.5 + 0.9 * (CLIP_WIDTH_PX * 0.24);
    expect(mock.lineTos.some(([x]) => Math.abs(x - expectedRightWristX) < 1e-4)).toBe(true);
    expect(mock.ctx.globalAlpha).toBe(1);
    expect(mock.ctx.shadowBlur).toBe(0);
  });

  it("skips occluded lower-body limbs and joints in seated mode, renders sculpted seated bust, and fades partial limbs", () => {
    const mock = createMockClipContext();
    const seatedPose = makeSample(0, {
      [LM.rWrist]: { x: 0.9, y: -0.2, v: 0.35 },
      [LM.lHip]: { x: 0, y: 0, v: 0 },
      [LM.rHip]: { x: 0, y: 0, v: 0 },
      [LM.lKnee]: { x: 0, y: 0, v: 0 },
      [LM.rKnee]: { x: 0, y: 0, v: 0 },
      [LM.lAnkle]: { x: 0, y: 0, v: 0 },
      [LM.rAnkle]: { x: 0, y: 0, v: 0 },
    });

    renderClipFrame(mock.ctx, seatedPose, CLIP_WIDTH_PX, CLIP_HEIGHT_PX);

    // 9 upper-body contour polygons (bust + neck + head + 4 arm segments + 2 hands) * 2 strokes + 4 arm axis lines = 22 strokes; 0 leg strokes.
    expect(mock.strokes).toHaveLength(22);
    // 6 upper-body joints * 3 arcs + 1 head anchor arc = 19 arcs; 0 lower-body joint arcs.
    expect(mock.arcs).toHaveLength(19);
    // 9 contour polygon fills + 19 circle fills = 28 fills.
    expect(mock.fills).toBe(28);

    // Zero draw calls at (0, 0) or at torso origin (centerX, centerY) from occluded legs.
    const centerX = CLIP_WIDTH_PX * 0.5;
    const centerY = CLIP_HEIGHT_PX * 0.46;
    for (const [x, y] of [...mock.moveTos, ...mock.lineTos, ...mock.arcs.map((a): [number, number] => [a.x, a.y])]) {
      expect(x === 0 && y === 0).toBe(false);
      expect(Math.hypot(x - centerX, y - centerY)).toBeGreaterThan(1);
    }

    const expectedPartialAlpha = computeLimbAlpha(0.95, 0.35);
    expect(expectedPartialAlpha).toBeLessThan(1);
    expect(expectedPartialAlpha).toBeGreaterThan(0);
    expect(mock.strokes.some((s) => Math.abs(s.globalAlpha - expectedPartialAlpha) < 1e-6)).toBe(true);
  });

  it("preserves lateral and vertical stage translation across frames using a fixed ClipStageTransform", () => {
    const shiftPoints = (dx: number, dy: number): LandmarkPoint[] =>
      makeNormalizedStandingPoints().map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy }));

    const sLeft: RecordedPoseSample = { tSongMs: songMs(1000), points: shiftPoints(-0.6, 0) };
    const sRight: RecordedPoseSample = { tSongMs: songMs(2000), points: shiftPoints(0.8, -0.3) };
    const stage = computeClipStageTransform([sLeft, sRight], 0, 15, CLIP_WIDTH_PX, CLIP_HEIGHT_PX);

    const mockLeft = createMockClipContext();
    const mockRight = createMockClipContext();
    renderClipFrame(mockLeft.ctx, sLeft, CLIP_WIDTH_PX, CLIP_HEIGHT_PX, stage);
    renderClipFrame(mockRight.ctx, sRight, CLIP_WIDTH_PX, CLIP_HEIGHT_PX, stage);

    // Compare head arc x and y coordinates between the two frames
    const headLeft = mockLeft.arcs.find((a) => a.r > 20)!;
    const headRight = mockRight.arcs.find((a) => a.r > 20)!;
    expect(headRight.x - headLeft.x).toBeCloseTo(1.4 * stage.scale, 4);
    expect(headRight.y - headLeft.y).toBeCloseTo(-0.3 * stage.scale, 4);
  });

  it("draws only the clean backdrop for null or fully occluded poses", () => {
    const mockNull = createMockClipContext();
    renderClipFrame(mockNull.ctx, null, CLIP_WIDTH_PX, CLIP_HEIGHT_PX);
    expect(mockNull.fillRectCalls).toHaveLength(2);
    expect(mockNull.strokes).toHaveLength(0);
    expect(mockNull.arcs).toHaveLength(0);

    const mockInvisible = createMockClipContext();
    const invisible = makeSample(
      0,
      Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, { x: 0, y: 0, v: 0 }])),
    );
    renderClipFrame(mockInvisible.ctx, invisible, CLIP_WIDTH_PX, CLIP_HEIGHT_PX);
    expect(mockInvisible.fillRectCalls).toHaveLength(2);
    expect(mockInvisible.strokes).toHaveLength(0);
    expect(mockInvisible.arcs).toHaveLength(0);
  });
});

describe("ClipReplay component and rAF loop lifecycle", () => {
  it("renders a 9:16 canvas with expected dimensions and aria-label", () => {
    const html = renderToStaticMarkup(<ClipReplay samples={[makeSample(0)]} startSec={2} />);
    expect(html).toContain("<canvas");
    expect(html).toContain(`width="${CLIP_WIDTH_PX}"`);
    expect(html).toContain(`height="${CLIP_HEIGHT_PX}"`);
    expect(CLIP_WIDTH_PX / CLIP_HEIGHT_PX).toBeCloseTo(9 / 16, 6);
    expect(html).toContain("max-width:16rem");
    expect(html).toContain('aria-label="Highlight clip silhouette replay"');
  });

  it("drives a looping 60 FPS requestAnimationFrame cycle and cancels cleanly on stop", () => {
    const queued = new Map<number, (nowMs: number) => void>();
    let nextId = 1;
    const rafSpy = vi.fn((cb: (nowMs: number) => void) => {
      const id = nextId++;
      queued.set(id, cb);
      return id;
    });
    const cancelSpy = vi.fn((id: number) => {
      queued.delete(id);
    });
    vi.stubGlobal("requestAnimationFrame", rafSpy);
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);

    const mock = createMockClipContext();
    const samples = [
      makeSample(5000, { [LM.rWrist]: { x: 0.4, y: 0, v: 0.9 } }),
      makeSample(5100, { [LM.rWrist]: { x: 1.2, y: 0, v: 0.9 } }),
    ];

    const stop = startClipReplayLoop(mock.ctx, { width: CLIP_WIDTH_PX, height: CLIP_HEIGHT_PX }, samples, 5, 10);
    expect(rafSpy).toHaveBeenCalledTimes(1);

    const cb1 = queued.get(1)!;
    queued.delete(1);
    cb1(1000);
    expect(mock.fillRectCalls).toHaveLength(2);
    expect(rafSpy).toHaveBeenCalledTimes(2);

    // Advance 50ms into the clip -> midpoint between 5000ms and 5100ms -> rWrist x = 0.8.
    const cb2 = queued.get(2)!;
    queued.delete(2);
    cb2(1050);
    const expectedMidX = CLIP_WIDTH_PX * 0.5 + 0.8 * (CLIP_WIDTH_PX * 0.24);
    expect(mock.lineTos.some(([x]) => Math.abs(x - expectedMidX) < 1e-4)).toBe(true);

    stop();
    expect(cancelSpy).toHaveBeenCalledWith(3);
    expect(queued.size).toBe(0);
  });

  it("mounts ClipReplay effect to start rAF loop and cancels the active handle on unmount", async () => {
    const mock = createMockClipContext();
    const fakeCanvas = {
      width: CLIP_WIDTH_PX,
      height: CLIP_HEIGHT_PX,
      getContext: vi.fn(() => mock.ctx),
    };
    const queued = new Map<number, (nowMs: number) => void>();
    let nextId = 10;
    const rafSpy = vi.fn((cb: (nowMs: number) => void) => {
      const id = nextId++;
      queued.set(id, cb);
      return id;
    });
    const cancelSpy = vi.fn((id: number) => {
      queued.delete(id);
    });
    vi.stubGlobal("requestAnimationFrame", rafSpy);
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);

    const cleanups: Array<() => void> = [];
    const effects: Array<() => void | (() => void)> = [];

    vi.resetModules();
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useRef: () => ({ current: fakeCanvas }),
        useMemo: <T,>(factory: () => T) => factory(),
        useEffect: (effect: () => void | (() => void)) => {
          effects.push(effect);
        },
      };
    });

    const { ClipReplay: HookedClipReplay } = await import("./ClipReplay");
    HookedClipReplay({ samples: [makeSample(0), makeSample(100)], startSec: 0, durationSec: 15 });

    expect(effects).toHaveLength(1);
    const cleanup = effects[0]();
    if (typeof cleanup === "function") {
      cleanups.push(cleanup);
    }

    expect(rafSpy).toHaveBeenCalledTimes(1);
    queued.get(10)?.(500);
    expect(mock.fillRectCalls).toHaveLength(2);
    expect(rafSpy).toHaveBeenCalledTimes(2);

    expect(cleanups).toHaveLength(1);
    cleanups[0]();
    expect(cancelSpy).toHaveBeenCalledWith(11);
  });

  it("translates drawn x and y coordinates end-to-end from createPoseRecorder -> startClipReplayLoop across lateral steps and jumps", () => {
    const makeLiveFrame = (centerX: number, dy: number, tFrame: number): PoseFrame => {
      const base: Array<[number, number]> = [
        [-0.10, -0.20], // lShoulder
        [0.10, -0.20],  // rShoulder
        [-0.16, -0.08], // lElbow
        [0.16, -0.08],  // rElbow
        [-0.20, 0.05],  // lWrist
        [0.20, 0.05],   // rWrist
        [-0.06, 0.20],  // lHip
        [0.06, 0.20],   // rHip
        [-0.07, 0.36],  // lKnee
        [0.07, 0.36],   // rKnee
        [-0.08, 0.48],  // lAnkle
        [0.08, 0.48],   // rAnkle
      ];
      return {
        tFrameMs: perfMs(tFrame),
        segments: {},
        usableRatio: 1,
        tracking: "ok",
        points: base.map(([ox, oy]) => ({ x: centerX + ox, y: 0.5 + oy + dy, v: 0.95 })),
      };
    };

    const recorder = createPoseRecorder();
    recorder.push(makeLiveFrame(0.30, 0, 0), songMs(0));
    recorder.push(makeLiveFrame(0.50, -0.12, 500), songMs(500));
    recorder.push(makeLiveFrame(0.70, 0, 1000), songMs(1000));

    const recordedSamples = recorder.getSamples();
    expect(recordedSamples).toHaveLength(3);

    let pendingCb: ((nowMs: number) => void) | null = null;
    let nextHandle = 1;
    const manualScheduler = {
      request: (cb: (nowMs: number) => void) => {
        pendingCb = cb;
        return nextHandle++;
      },
      cancel: () => {
        pendingCb = null;
      },
    };

    const mock = createMockClipContext();
    const stop = startClipReplayLoop(
      mock.ctx,
      { width: CLIP_WIDTH_PX, height: CLIP_HEIGHT_PX },
      recordedSamples,
      0,
      2,
      manualScheduler,
    );

    const stepLoopAt = (nowMs: number): { headX: number; headY: number } => {
      mock.arcs.length = 0;
      pendingCb!(nowMs);
      const headArc = mock.arcs.reduce((best, curr) => (curr.r > best.r ? curr : best), mock.arcs[0]);
      return { headX: headArc.x, headY: headArc.y };
    };

    const posStart = stepLoopAt(1000); // elapsed = 0 ms -> tSongMs = 0 (centerX = 0.30, dy = 0)
    const posMid = stepLoopAt(1500);   // elapsed = 500 ms -> tSongMs = 500 (centerX = 0.50, dy = -0.12)
    const posEnd = stepLoopAt(2000);   // elapsed = 1000 ms -> tSongMs = 1000 (centerX = 0.70, dy = 0)
    stop();

    expect(posStart.headX).toBeLessThan(CLIP_WIDTH_PX * 0.5 - 50);
    expect(posMid.headX).toBeCloseTo(CLIP_WIDTH_PX * 0.5, 2);
    expect(posEnd.headX).toBeGreaterThan(CLIP_WIDTH_PX * 0.5 + 50);
    expect(posEnd.headX - posStart.headX).toBeGreaterThan(CLIP_WIDTH_PX * 0.35);

    // Jump at t = 500 ms shifts headY upward significantly compared to t = 0 and t = 1000 ms
    expect(posMid.headY).toBeLessThan(posStart.headY - 40);
    expect(posMid.headY).toBeLessThan(posEnd.headY - 40);
  });
});

interface SideBySideMockHandle {
  ctx: SideBySideDrawContext;
  saves: number;
  restores: number;
  translates: Array<[number, number]>;
  scales: Array<[number, number]>;
  rects: Array<[number, number, number, number]>;
  drawImages: Array<{ img: unknown; args: number[] }>;
  strokes: Array<{ x1: number; y1: number; x2: number; y2: number; strokeStyle: string; globalAlpha: number }>;
  arcs: Array<{ x: number; y: number; r: number; fillStyle: string; globalAlpha: number }>;
  texts: Array<{ text: string; x: number; y: number }>;
}

function createMockSideBySideContext(): SideBySideMockHandle {
  const base = createMockClipContext();
  const translates: Array<[number, number]> = [];
  const scales: Array<[number, number]> = [];
  const rects: Array<[number, number, number, number]> = [];
  const drawImages: Array<{ img: unknown; args: number[] }> = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  let saves = 0;
  let restores = 0;

  const ctx = Object.assign(base.ctx, {
    save: () => {
      saves += 1;
    },
    restore: () => {
      restores += 1;
    },
    rect: (x: number, y: number, w: number, h: number) => {
      rects.push([x, y, w, h]);
    },
    clip: () => {},
    translate: (x: number, y: number) => {
      translates.push([x, y]);
    },
    scale: (x: number, y: number) => {
      scales.push([x, y]);
    },
    clearRect: () => {},
    drawImage: (img: CanvasImageSource, ...args: number[]) => {
      drawImages.push({ img, args });
    },
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y });
    },
  }) as unknown as SideBySideDrawContext;

  return {
    ctx,
    get saves() { return saves; },
    get restores() { return restores; },
    translates,
    scales,
    rects,
    drawImages,
    strokes: base.strokes,
    arcs: base.arcs,
    texts,
  };
}

function makeScreenSample(tMs: number, overrides: Partial<Record<number, Partial<LandmarkPoint>>> = {}): RecordedPoseSample {
  const base: LandmarkPoint[] = [
    { x: 0.42, y: 0.30, v: 0.95 }, // lShoulder
    { x: 0.58, y: 0.30, v: 0.95 }, // rShoulder
    { x: 0.34, y: 0.42, v: 0.92 }, // lElbow
    { x: 0.66, y: 0.42, v: 0.92 }, // rElbow
    { x: 0.28, y: 0.54, v: 0.90 }, // lWrist
    { x: 0.72, y: 0.54, v: 0.90 }, // rWrist
    { x: 0.44, y: 0.56, v: 0.94 }, // lHip
    { x: 0.56, y: 0.56, v: 0.94 }, // rHip
    { x: 0.43, y: 0.74, v: 0.90 }, // lKnee
    { x: 0.57, y: 0.74, v: 0.90 }, // rKnee
    { x: 0.42, y: 0.90, v: 0.88 }, // lAnkle
    { x: 0.58, y: 0.90, v: 0.88 }, // rAnkle
  ];
  return {
    tSongMs: songMs(tMs),
    points: base.map((pt, idx) => ({ ...pt, ...(overrides[idx] ?? {}) })),
  };
}

describe("side-by-side cover-crop, projection, and video sync math", () => {
  it("computeCoverCrop computes symmetric centered object-fit: cover crops for wide and tall sources", () => {
    // 1280x720 (16:9) into 480x540 (8:9): height stays 720, width crops to 640 centered at sx=320.
    const wide = computeCoverCrop(1280, 720, 480, 540);
    expect(wide).toEqual({ sx: 320, sy: 0, sw: 640, sh: 720 });

    // 540x960 (9:16) into 480x540 (8:9): width stays 540, height crops to 607.5 centered at sy=176.25.
    const tall = computeCoverCrop(540, 960, 480, 540);
    expect(tall.sx).toBe(0);
    expect(tall.sw).toBe(540);
    expect(tall.sh).toBeCloseTo(607.5, 5);
    expect(tall.sy).toBeCloseTo(176.25, 5);

    // Invalid inputs return safe finite non-zero crop dimensions.
    expect(computeCoverCrop(0, 720, 480, 540)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 720 });
  });

  it("projectMirroredLandmarkToPane maps mirrored [0..1] landmarks onto cropped pane coordinates symmetrically", () => {
    const srcW = 1280;
    const srcH = 720;
    const paneX = 0;
    const paneY = 0;
    const paneW = 480;
    const paneH = 540;
    const crop = computeCoverCrop(srcW, srcH, paneW, paneH);

    // Crop edges: sx = 320 (x = 0.25) -> 0; sx + sw = 960 (x = 0.75) -> 480; center (0.5, 0.5) -> (240, 270).
    expect(projectMirroredLandmarkToPane({ x: 0.25, y: 0, v: 1 }, srcW, srcH, crop, paneX, paneY, paneW, paneH)).toEqual({ x: 0, y: 0 });
    expect(projectMirroredLandmarkToPane({ x: 0.75, y: 1, v: 1 }, srcW, srcH, crop, paneX, paneY, paneW, paneH)).toEqual({ x: 480, y: 540 });
    expect(projectMirroredLandmarkToPane({ x: 0.5, y: 0.5, v: 1 }, srcW, srcH, crop, paneX, paneY, paneW, paneH)).toEqual({ x: 240, y: 270 });

    // Verify symmetric horizontal edge mapping around pane center.
    const leftPt = projectMirroredLandmarkToPane({ x: 0.35, y: 0.4, v: 1 }, srcW, srcH, crop, paneX, paneY, paneW, paneH);
    const rightPt = projectMirroredLandmarkToPane({ x: 0.65, y: 0.4, v: 1 }, srcW, srcH, crop, paneX, paneY, paneW, paneH);
    expect(leftPt.x + rightPt.x).toBeCloseTo(2 * paneX + paneW, 6);
    expect(leftPt.y).toBeCloseTo(rightPt.y, 6);
  });

  it("songTimeToVideoSec maps song time minus videoStartSongMs cleanly and clamps boundaries", () => {
    expect(songTimeToVideoSec(5000, 120)).toBeCloseTo(4.88, 6);
    expect(songTimeToVideoSec(50, 200)).toBe(0);
    expect(songTimeToVideoSec(25_000, 0, 18.5)).toBe(18.5);
    expect(songTimeToVideoSec(25_000, 0, Number.POSITIVE_INFINITY)).toBe(25);
    expect(songTimeToVideoSec(Number.NaN, 0, 10)).toBe(0);
  });
});

describe("renderSideBySideFrame and side-by-side ClipReplay component", () => {
  it("draws mirrored video on left, landmark overlay ONLY when showLandmarks is true, and coach silhouette on right", () => {
    const mockOff = createMockSideBySideContext();
    const coachCanvas = { width: 480, height: 540 } as unknown as CanvasImageSource & { width: number; height: number };
    const coachSurface: SideBySideRenderSurface = { canvas: coachCanvas, ctx: mockOff.ctx };
    const videoEl = { readyState: 4, videoWidth: 1280, videoHeight: 720 };
    const overlayPose = makeScreenSample(1000, {
      [LM.lWrist]: { x: 0.35, y: 0.5, v: 0.35 }, // soft faded line (0.2 < v < 0.55)
      [LM.rAnkle]: { x: 0, y: 0, v: 0.03 },    // skipped (v <= 0.05) -> zero (0, 0) artifacts
    });

    // 1. showLandmarks === false: mirrored video + coach surface blit, ZERO landmark dots or cyan bones
    const mockHidden = createMockSideBySideContext();
    renderSideBySideFrame(mockHidden.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 1000,
      videoEl,
      overlayPose,
      showLandmarks: false,
      coachSurface,
    });

    expect(mockHidden.translates).toContainEqual([480, 0]);
    expect(mockHidden.scales).toContainEqual([-1, 1]);
    expect(mockHidden.drawImages[0]).toEqual({ img: videoEl, args: [320, 0, 640, 720, 0, 0, 480, 540] });
    expect(mockHidden.drawImages[1]).toEqual({ img: coachCanvas, args: [480, 0, 480, 540] });
    expect(mockHidden.arcs).toHaveLength(0);
    expect(mockHidden.strokes.some((s) => s.strokeStyle === "#22d3ee")).toBe(false);
    expect(mockHidden.texts.map((t) => t.text)).toEqual(["YOU", "COACH"]);
    expect(mockHidden.saves).toBe(mockHidden.restores);

    // 2. showLandmarks === true: draws neon-cyan overlay bones + glowing joints + soft faded wrist, skips v <= 0.05
    const mockShown = createMockSideBySideContext();
    renderSideBySideFrame(mockShown.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 1000,
      videoEl,
      overlayPose,
      showLandmarks: true,
      coachSurface,
    });

    expect(mockShown.strokes.some((s) => s.strokeStyle === "#22d3ee")).toBe(true);
    expect(mockShown.strokes.some((s) => s.globalAlpha < 1 && s.globalAlpha > 0)).toBe(true);
    // 10 confident joints * 2 arcs + 1 faded wrist * 1 arc = 21 overlay arcs; rAnkle (v = 0.03) skipped!
    expect(mockShown.arcs).toHaveLength(21);
    expect(mockShown.arcs.some((a) => a.x === 0 && a.y === 0)).toBe(false);
    expect(mockShown.saves).toBe(mockShown.restores);
  });

  it("falls back cleanly to recorded user pose silhouette when video is null and renders 16:9 side-by-side ClipReplay controls", () => {
    const mock = createMockSideBySideContext();
    renderSideBySideFrame(mock.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 0,
      videoEl: null,
      userPose: makeSample(0),
      showLandmarks: true,
    });
    expect(mock.arcs.length).toBeGreaterThan(0);
    expect(mock.texts.map((t) => t.text)).toEqual(["YOU", "COACH"]);

    const html = renderToStaticMarkup(
      <ClipReplay samples={[makeSample(0)]} startSec={2} durationSec={15} dance={FAKE_DANCE} />,
    );
    expect(html).toContain(`width="${SIDE_BY_SIDE_WIDTH_PX}"`);
    expect(html).toContain(`height="${SIDE_BY_SIDE_HEIGHT_PX}"`);
    expect(html).toContain('aria-label="Side-by-side highlight replay"');
    expect(html).toContain(">Pause</button>");
    expect(html).toContain(">Sound off</button>");
    expect(html).toContain('aria-label="Seek highlight clip"');
  });

  it("invokes the upgraded live coach renderer on the right pane with exact dance metadata and synced tSongMs", () => {
    const mockMain = createMockSideBySideContext();
    const mockOff = createMockSideBySideContext();
    const coachCanvas = {
      width: 480,
      height: 540,
    } as unknown as CanvasImageSource & { width: number; height: number };
    const coachSurface: SideBySideRenderSurface = { canvas: coachCanvas, ctx: mockOff.ctx };

    const customDance: Dance = {
      ...FAKE_DANCE,
      id: "dance3",
      aspectRatio: 16 / 9,
      beatsMs: [songMs(0), songMs(500), songMs(1000)],
    };
    const coachStage = computeStageTransform(customDance.frames, 480, 540, customDance.aspectRatio);
    const bodyTrack: BodyTrack = {
      version: 1,
      danceId: customDance.id,
      indices: [...BODY_TRACK_INDICES],
      tMs: [0, 5000],
      root: [[0, 0.9], [0.1, 0.9]],
      world: [
        Array.from({ length: BODY_TRACK_INDICES.length * 3 }, () => 0.1),
        Array.from({ length: BODY_TRACK_INDICES.length * 3 }, () => 0.2),
      ],
      vis: [
        Array(BODY_TRACK_INDICES.length).fill(1),
        Array(BODY_TRACK_INDICES.length).fill(1),
      ],
    };

    const spy = vi.spyOn(humanCoach, "drawUpgradedCoachFrame");

    renderSideBySideFrame(mockMain.ctx, {
      dance: customDance,
      tSongMs: 4321,
      videoEl: { readyState: 4, videoWidth: 1280, videoHeight: 720 },
      coachSurface,
      coachStage,
      bodyTrack,
      coachMode: "standing",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [calledCtx, calledW, calledH, calledDance, calledTime, calledOpts] = spy.mock.calls[0];
    expect(calledCtx).toBe(mockOff.ctx);
    expect(calledW).toBe(480);
    expect(calledH).toBe(540);
    expect(calledDance).toBe(customDance);
    expect(calledDance.id).toBe("dance3");
    expect(calledDance.frames).toBe(customDance.frames);
    expect(calledDance.beatsMs).toEqual([songMs(0), songMs(500), songMs(1000)]);
    expect(calledDance.aspectRatio).toBeCloseTo(16 / 9, 6);
    expect(calledTime).toBe(songMs(4321));
    expect(calledOpts).toEqual({
      track: bodyTrack,
      mode: "standing",
      stageTransform: coachStage,
    });
    expect(mockMain.drawImages).toContainEqual({ img: coachCanvas, args: [480, 0, 480, 540] });
  });

  it("drawUpgradedCoachFrame executes loftStage + costumed figure rendering (not bare silhouette) when scratch canvases exist", () => {
    const colorStops: string[] = [];
    const fillStyles: string[] = [];
    const drawnSources: unknown[] = [];

    const make2dCanvas = (): HTMLCanvasElement => {
      const ctx = {
        fillStyle: "" as unknown,
        strokeStyle: "" as unknown,
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        shadowColor: "",
        shadowBlur: 0,
        clearRect: () => {},
        fillRect: () => {
          if (typeof ctx.fillStyle === "string") fillStyles.push(ctx.fillStyle);
        },
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arc: () => {},
        ellipse: () => {},
        rect: () => {},
        clip: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        fill: () => {
          if (typeof ctx.fillStyle === "string") fillStyles.push(ctx.fillStyle);
        },
        stroke: () => {},
        drawImage: (img: unknown) => {
          drawnSources.push(img);
        },
        createLinearGradient: () => ({
          addColorStop: (_off: number, color: string) => {
            colorStops.push(color);
          },
        }),
        createRadialGradient: () => ({
          addColorStop: (_off: number, color: string) => {
            colorStops.push(color);
          },
        }),
      };
      const canvas = {
        width: 480,
        height: 540,
        getContext: () => ctx,
      };
      return canvas as unknown as HTMLCanvasElement;
    };

    const targetCanvas = make2dCanvas();
    const targetCtx = targetCanvas.getContext("2d")!;
    humanCoach.drawUpgradedCoachFrame(targetCtx, 480, 540, FAKE_DANCE, songMs(500), {
      makeCanvas: make2dCanvas,
    });

    // Sunset lounge stage colors (loftStage.ts) and cobalt blazer costume colors (figure.ts) were drawn.
    expect(colorStops).toContain("#7a6bd6"); // sunset sky top
    expect(colorStops).toContain("#f29ac0"); // sunset sky mid
    expect(colorStops).toContain("#2856e8"); // cobalt satin blazer
    expect(fillStyles).not.toContain("#0ea5e9"); // legacy flat silhouette cyan torso not used
    expect(drawnSources.length).toBeGreaterThanOrEqual(3); // stage + tint + body composited
  });
});

describe("highlight reliability, seek-gating, and non-flashing fallback regressions", () => {
  function makeNormalizedPoseSample(
    tMs: number,
    pointCount: number,
  ): import("../types/pulse").RecordedPoseSample {
    const pts = Array.from({ length: pointCount }, (_, idx) => {
      const side = idx % 2 === 0 ? -0.08 : 0.08;
      const y = 0.2 + ((idx % 10) * 0.06);
      return { x: 0.5 + side, y, v: 0.99 };
    });
    return {
      tSongMs: songMs(tMs),
      points: pts,
    };
  }

  it("never flashes the silhouette stick figure when hasUserVideo is true during seek or initial load", async () => {
    const { renderSideBySideFrame } = await import("./ClipReplay");
    const { SCORED_LANDMARK_INDICES } = await import("../config");

    const main = createMockSideBySideContext();
    const cache = createMockSideBySideContext();
    const coach = createMockSideBySideContext();

    const strokeStyles: string[] = [];
    const fillStylesUsed: string[] = [];
    let arcCalls = 0;

    const origStroke = main.ctx.stroke.bind(main.ctx);
    main.ctx.stroke = (() => {
      if (typeof main.ctx.strokeStyle === "string") {
        strokeStyles.push(main.ctx.strokeStyle);
      }
      origStroke();
    }) as typeof main.ctx.stroke;

    const origFill = main.ctx.fill.bind(main.ctx);
    main.ctx.fill = (() => {
      if (typeof main.ctx.fillStyle === "string") {
        fillStylesUsed.push(main.ctx.fillStyle);
      }
      origFill();
    }) as typeof main.ctx.fill;

    const origArc = main.ctx.arc.bind(main.ctx);
    main.ctx.arc = ((...args: Parameters<typeof main.ctx.arc>) => {
      arcCalls += 1;
      origArc(...args);
    }) as typeof main.ctx.arc;

    const cacheCanvas = {
      width: 480,
      height: 540,
      getContext: () => cache.ctx,
    } as unknown as import("./ClipReplay").LastVideoFrameCanvas;
    const coachSurface = {
      canvas: { width: 480, height: 540 } as unknown as HTMLCanvasElement,
      ctx: coach.ctx as unknown as import("../coach/silhouette").CoachDrawContext,
    };
    const pose = makeNormalizedPoseSample(5000, SCORED_LANDMARK_INDICES.length);

    // 1. Before frame 0 decodes (hasUserVideo=true, readyState=0, empty cache): dark backdrop only, zero silhouette.
    renderSideBySideFrame(main.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 5000,
      videoEl: { readyState: 0, seeking: false, videoWidth: 0, videoHeight: 0 },
      hasUserVideo: true,
      lastVideoFrameCanvas: cacheCanvas,
      coachSurface,
      overlayPose: pose,
      showLandmarks: true,
    });
    expect(cache.drawImages.length).toBe(0);
    expect(arcCalls).toBe(0);
    expect(fillStylesUsed).not.toContain("#0ea5e9");
    expect(strokeStyles).not.toContain("#38bdf8");
    expect(strokeStyles).not.toContain("#c084fc");

    // 2. Frame 1 decoded (readyState=4, !seeking): draws mirrored crop to cache canvas and blits to left pane.
    main.drawImages.length = 0;
    strokeStyles.length = 0;
    fillStylesUsed.length = 0;
    arcCalls = 0;
    const readyVideo = { readyState: 4, seeking: false, videoWidth: 1280, videoHeight: 720 };
    renderSideBySideFrame(main.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 5050,
      videoEl: readyVideo,
      hasUserVideo: true,
      lastVideoFrameCanvas: cacheCanvas,
      coachSurface,
      overlayPose: pose,
      showLandmarks: true,
    });
    expect(cache.drawImages.some((d) => d.img === readyVideo)).toBe(true);
    expect(main.drawImages.some((d) => d.img === cacheCanvas)).toBe(true);
    expect(strokeStyles).toContain("#22d3ee");

    // 3. Frame 2 mid-seek stall (readyState=1, seeking=true): blits cached frame and keeps cyan overlay, ZERO silhouette.
    cache.drawImages.length = 0;
    main.drawImages.length = 0;
    strokeStyles.length = 0;
    fillStylesUsed.length = 0;
    arcCalls = 0;
    renderSideBySideFrame(main.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 5100,
      videoEl: { readyState: 1, seeking: true, videoWidth: 1280, videoHeight: 720 },
      hasUserVideo: true,
      lastVideoFrameCanvas: cacheCanvas,
      coachSurface,
      overlayPose: pose,
      showLandmarks: true,
    });
    expect(cache.drawImages.length).toBe(0);
    expect(
      main.drawImages.some(
        (d) =>
          d.img === cacheCanvas &&
          d.args[0] === 0 &&
          d.args[1] === 0 &&
          d.args[2] === 480 &&
          d.args[3] === 540,
      ),
    ).toBe(true);
    expect(strokeStyles).toContain("#22d3ee");
    expect(fillStylesUsed).not.toContain("#0ea5e9");
    expect(fillStylesUsed).not.toContain("#38bdf8");
    expect(fillStylesUsed).not.toContain("#c084fc");
    expect(strokeStyles).not.toContain("#e0f2fe");
    expect(strokeStyles).not.toContain("#f3e8ff");

    // 4. Explicit fallback (hasUserVideo=false, videoEl=null) still renders silhouette normally.
    fillStylesUsed.length = 0;
    arcCalls = 0;
    renderSideBySideFrame(main.ctx, {
      dance: FAKE_DANCE,
      tSongMs: 5150,
      videoEl: null,
      hasUserVideo: false,
      userPose: pose,
      coachSurface,
    });
    expect(arcCalls).toBeGreaterThan(0);
    expect(fillStylesUsed).toContain("#0ea5e9");
  });

  it("computes smooth playbackRate micro-nudges and cooldown-gated hard seeks via computeVideoSyncAction", async () => {
    const {
      computeVideoSyncAction,
      VIDEO_DRIFT_DEADBAND_SEC,
      VIDEO_DRIFT_HARD_SEEK_SEC,
      VIDEO_HARD_SEEK_COOLDOWN_MS,
      VIDEO_RATE_MIN,
      VIDEO_RATE_MAX,
    } = await import("./ClipReplay");

    expect(computeVideoSyncAction(0, 0)).toEqual({ mode: "rate", playbackRate: 1 });
    expect(computeVideoSyncAction(VIDEO_DRIFT_DEADBAND_SEC, 0)).toEqual({
      mode: "rate",
      playbackRate: 1,
    });
    expect(computeVideoSyncAction(-VIDEO_DRIFT_DEADBAND_SEC, 0)).toEqual({
      mode: "rate",
      playbackRate: 1,
    });

    expect(computeVideoSyncAction(0.06, 0)).toEqual({ mode: "rate", playbackRate: 1.03 });
    expect(computeVideoSyncAction(-0.1, 0)).toEqual({ mode: "rate", playbackRate: 0.95 });
    expect(computeVideoSyncAction(0.5, 0)).toEqual({ mode: "rate", playbackRate: VIDEO_RATE_MAX });
    expect(computeVideoSyncAction(-0.5, 0)).toEqual({ mode: "rate", playbackRate: VIDEO_RATE_MIN });

    expect(computeVideoSyncAction(VIDEO_DRIFT_HARD_SEEK_SEC - 0.01, 10_000).mode).toBe("rate");
    expect(
      computeVideoSyncAction(VIDEO_DRIFT_HARD_SEEK_SEC, VIDEO_HARD_SEEK_COOLDOWN_MS - 1).mode,
    ).toBe("rate");
    expect(
      computeVideoSyncAction(VIDEO_DRIFT_HARD_SEEK_SEC, VIDEO_HARD_SEEK_COOLDOWN_MS),
    ).toEqual({ mode: "seek" });
    expect(
      computeVideoSyncAction(-0.9, Number.POSITIVE_INFINITY),
    ).toEqual({ mode: "seek" });
    expect(computeVideoSyncAction(Number.NaN, 5_000)).toEqual({ mode: "rate", playbackRate: 1 });
  });

  it("handles Chromium Infinity, 0, and NaN video durations safely in songTimeToVideoSec", async () => {
    const { songTimeToVideoSec } = await import("./ClipReplay");

    expect(songTimeToVideoSec(12_500, 2_500, Number.POSITIVE_INFINITY)).toBeCloseTo(10, 6);
    expect(songTimeToVideoSec(12_500, 2_500, 0)).toBeCloseTo(10, 6);
    expect(songTimeToVideoSec(12_500, 2_500, Number.NaN)).toBeCloseTo(10, 6);
    expect(songTimeToVideoSec(12_500, 2_500, 8)).toBe(8);
    expect(songTimeToVideoSec(1_000, 2_500, 8)).toBe(0);
    expect(songTimeToVideoSec(Number.NaN, 0, 8)).toBe(0);
  });

  it("keeps <video> and objectURL stable when toggling showLandmarks and gates clock deterministically on seeked or timeout", async () => {
    vi.resetModules();

    type HookEffectEntry = {
      deps: readonly unknown[] | undefined;
      create: () => void | (() => void);
      cleanup?: () => void;
      pending: boolean;
    };
    type CompHookStore = {
      slots: unknown[];
      effects: HookEffectEntry[];
      cursor: number;
    };

    const stores = new Map<string, CompHookStore>();
    let activeKey = "root";
    const getStore = (): CompHookStore => {
      let s = stores.get(activeKey);
      if (!s) {
        s = { slots: [], effects: [], cursor: 0 };
        stores.set(activeKey, s);
      }
      return s;
    };

    const depsEqual = (
      a: readonly unknown[] | undefined,
      b: readonly unknown[] | undefined,
    ): boolean => {
      if (!a || !b || a.length !== b.length) return false;
      return a.every((v, idx) => Object.is(v, b[idx]));
    };

    vi.doMock("react", () => ({
      useRef: <T,>(initial: T) => {
        const s = getStore();
        const idx = s.cursor++;
        if (!(idx in s.slots)) {
          s.slots[idx] = { current: initial };
        }
        return s.slots[idx] as { current: T };
      },
      useState: <T,>(initial: T | (() => T)) => {
        const s = getStore();
        const idx = s.cursor++;
        if (!(idx in s.slots)) {
          s.slots[idx] = typeof initial === "function" ? (initial as () => T)() : initial;
        }
        return [
          s.slots[idx] as T,
          (next: T | ((prev: T) => T)) => {
            s.slots[idx] =
              typeof next === "function" ? (next as (prev: T) => T)(s.slots[idx] as T) : next;
          },
        ] as const;
      },
      useMemo: <T,>(factory: () => T, deps: readonly unknown[]) => {
        const s = getStore();
        const idx = s.cursor++;
        const prev = s.slots[idx] as { value: T; deps: readonly unknown[] } | undefined;
        if (!prev || !depsEqual(prev.deps, deps)) {
          const entry = { value: factory(), deps };
          s.slots[idx] = entry;
          return entry.value;
        }
        return prev.value;
      },
      useEffect: (create: () => void | (() => void), deps?: readonly unknown[]) => {
        const s = getStore();
        const idx = s.cursor++;
        const prev = s.slots[idx] as HookEffectEntry | undefined;
        if (!prev) {
          const entry: HookEffectEntry = { deps, create, pending: true };
          s.slots[idx] = entry;
          s.effects.push(entry);
        } else if (!depsEqual(prev.deps, deps)) {
          prev.deps = deps;
          prev.create = create;
          prev.pending = true;
        }
      },
    }));

    let nowPerfMs = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => nowPerfMs);

    const rafQueue = new Map<number, FrameRequestCallback>();
    let nextRafId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQueue.delete(id);
    });
    const stepRaf = (advanceMs: number): void => {
      nowPerfMs += advanceMs;
      const queued = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, cb] of queued) {
        cb(nowPerfMs);
      }
    };

    const seekAssignments: number[] = [];
    const createdVideos: Array<{
      readyState: number;
      seeking: boolean;
      paused: boolean;
      ended: boolean;
      currentTime: number;
      duration: number;
      videoWidth: number;
      videoHeight: number;
      playbackRate: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      emit: (type: string) => void;
    }> = [];

    const mainCanvasCtx = createMockSideBySideContext();
    const mainCanvas = {
      width: 960,
      height: 540,
      getContext: () => mainCanvasCtx.ctx,
    };

    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "video") {
          let currentTimeVal = 0;
          const listeners = new Map<string, Set<() => void>>();
          const videoObj = {
            src: "",
            muted: false,
            playsInline: false,
            preload: "",
            playbackRate: 1,
            readyState: 0,
            seeking: false,
            paused: true,
            ended: false,
            duration: Number.POSITIVE_INFINITY,
            videoWidth: 1280,
            videoHeight: 720,
            get currentTime() {
              return currentTimeVal;
            },
            set currentTime(val: number) {
              seekAssignments.push(val);
              currentTimeVal = val;
              videoObj.seeking = true;
            },
            play: vi.fn(async () => {
              videoObj.paused = false;
            }),
            pause: vi.fn(() => {
              videoObj.paused = true;
            }),
            removeAttribute: vi.fn(),
            load: vi.fn(),
            addEventListener: (name: string, fn: () => void) => {
              let set = listeners.get(name);
              if (!set) {
                set = new Set();
                listeners.set(name, set);
              }
              set.add(fn);
            },
            removeEventListener: (name: string, fn: () => void) => {
              listeners.get(name)?.delete(fn);
            },
            emit: (name: string) => {
              for (const fn of [...(listeners.get(name) ?? [])]) {
                fn();
              }
            },
          };
          createdVideos.push(videoObj);
          return videoObj;
        }
        const mockCtx = createMockSideBySideContext().ctx;
        return {
          width: 480,
          height: 540,
          getContext: () => mockCtx,
        };
      },
    });

    const RealURL = globalThis.URL;
    const createObjectUrlSpy = vi.fn(() => "blob:pulse-user-video");
    const revokeObjectUrlSpy = vi.fn();
    class PatchedURL extends RealURL {
      static override createObjectURL = createObjectUrlSpy;
      static override revokeObjectURL = revokeObjectUrlSpy;
    }
    vi.stubGlobal("URL", PatchedURL);
    vi.stubGlobal("fetch", undefined);

    const { ClipReplay, VIDEO_SEEK_GATE_TIMEOUT_MS } = await import("./ClipReplay");
    const { SCORED_LANDMARK_INDICES } = await import("../config");

    const findCanvasRef = (node: unknown): { current: unknown } | null => {
      if (!node || typeof node !== "object") return null;
      const el = node as { type?: unknown; ref?: unknown; props?: Record<string, unknown> };
      if (el.type === "canvas") {
        const refCandidate =
          el.ref && typeof el.ref === "object"
            ? el.ref
            : el.props && Object.prototype.hasOwnProperty.call(el.props, "ref")
              ? el.props.ref
              : null;
        if (refCandidate && typeof refCandidate === "object" && "current" in refCandidate) {
          return refCandidate as { current: unknown };
        }
      }
      const children = el.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findCanvasRef(child);
          if (found) return found;
        }
      } else if (children) {
        return findCanvasRef(children);
      }
      return null;
    };

    const flushEffects = (): void => {
      for (const store of stores.values()) {
        for (const eff of store.effects) {
          if (eff.pending) {
            eff.pending = false;
            eff.cleanup?.();
            eff.cleanup = eff.create() ?? undefined;
          }
        }
      }
    };

    const userVideoBlob = new Blob(["webm-bytes"], { type: "video/webm" });
    const controlRef: {
      current: import("./ClipReplay").ClipReplayHandle | null;
    } = { current: null };
    const samples = [
      makeNormalizedPoseSample(5000, SCORED_LANDMARK_INDICES.length),
      makeNormalizedPoseSample(6000, SCORED_LANDMARK_INDICES.length),
    ];

    const renderClip = (showLandmarks: boolean): void => {
      activeKey = "root";
      getStore().cursor = 0;
      const outer = ClipReplay({
        dance: FAKE_DANCE,
        samples,
        startSec: 5,
        durationSec: 15,
        userVideoBlob,
        videoStartSongMs: 1000,
        overlaySamples: samples,
        showLandmarks,
        controlRef,
      }) as unknown as { type: (p: unknown) => unknown; props: unknown };

      activeKey = "side";
      getStore().cursor = 0;
      const inner = outer.type(outer.props);
      const canvasRefObj = findCanvasRef(inner);
      if (canvasRefObj && !canvasRefObj.current) {
        canvasRefObj.current = mainCanvas;
      }
      flushEffects();
    };

    // Mount with showLandmarks=false
    renderClip(false);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(0);
    expect(createdVideos).toHaveLength(1);
    const vid = createdVideos[0]!;
    expect(seekAssignments).toEqual([]);
    expect(vid.play).not.toHaveBeenCalled();

    // Advance 120ms while metadata not ready: seek gate keeps playback frozen without calling play().
    stepRaf(120);
    expect(vid.play).not.toHaveBeenCalled();

    // Metadata arrives: dispatches deterministic seek to (5000 - 1000) / 1000 = 4s.
    vid.readyState = 1;
    vid.emit("loadedmetadata");
    expect(seekAssignments).toEqual([4]);
    expect(vid.seeking).toBe(true);
    expect(vid.play).not.toHaveBeenCalled();

    // Still seeking after 150ms (< 600ms timeout): remains gated.
    stepRaf(150);
    expect(vid.play).not.toHaveBeenCalled();

    // Seek completes deterministically -> starts playback at frame 0.
    vid.seeking = false;
    vid.readyState = 4;
    vid.emit("seeked");
    expect(vid.play).toHaveBeenCalledTimes(1);

    // Toggle showLandmarks=true -> objectURL and <video> MUST NOT be torn down or recreated.
    renderClip(true);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(0);
    expect(createdVideos).toHaveLength(1);

    // Restart with a stuck seek -> 600ms safety timeout unlocks playback without deadlocking.
    vid.currentTime = 7;
    vid.seeking = false;
    controlRef.current?.restartFromStart();
    expect(seekAssignments[seekAssignments.length - 1]).toBe(4);
    expect(vid.seeking).toBe(true);
    expect(vid.play).toHaveBeenCalledTimes(1);

    stepRaf(300);
    expect(vid.play).toHaveBeenCalledTimes(1);

    stepRaf(VIDEO_SEEK_GATE_TIMEOUT_MS);
    expect(vid.play).toHaveBeenCalledTimes(2);

    // Unmount cleanly revokes objectURL once and resets playbackRate.
    for (const store of stores.values()) {
      for (const eff of store.effects) {
        eff.cleanup?.();
      }
    }
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:pulse-user-video");
    expect(vid.playbackRate).toBe(1);
  });
});

