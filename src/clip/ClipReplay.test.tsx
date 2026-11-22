/**
 * Owner: Toufic
 * Purpose: Unit tests for 9:16 silhouette pose interpolation, anti-twitching, rendering, and ClipReplay loop (FR-49)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG, LM } from "../config";
import { songMs, type LandmarkPoint, type RecordedPoseSample } from "../types/pulse";
import {
  CLIP_HEIGHT_PX,
  CLIP_WIDTH_PX,
  ClipReplay,
  computeClipStageTransform,
  computeLimbAlpha,
  interpolateRecordedPose,
  renderClipFrame,
  startClipReplayLoop,
  type ClipDrawContext,
  type ClipGradient,
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
  it("draws backdrop, torso, head, all 8 limbs, and 12 articulated joints in back-to-front order with left/right colors", () => {
    const mock = createMockClipContext();
    const standing = makeSample(0);

    renderClipFrame(mock.ctx, standing, CLIP_WIDTH_PX, CLIP_HEIGHT_PX);

    expect(mock.fillRectCalls).toHaveLength(2);
    // 12 articulated joints * 2 arcs (separator + core) + 2 head arcs (separator + fill) = 26 arcs
    expect(mock.arcs).toHaveLength(26);
    // 1 torso polygon fill + 2 head fills + 24 joint node fills = 27 fills
    expect(mock.fills).toBe(27);
    // 8 limbs * 3 strokes (separator + colored glow + core) + 2 torso polygon strokes (separator + rim) = 26 strokes
    expect(mock.strokes).toHaveLength(26);

    // Back-to-front depth order:
    // Legs ( strokes 0..11: 6 left leg #38bdf8, 6 right leg #c084fc ) ->
    // Torso ( strokes 12..13 ) ->
    // Right Arm ( strokes 14..19: #c084fc ) ->
    // Left Arm ( strokes 20..25: #38bdf8 )
    expect(mock.strokes[1].strokeStyle).toBe("#38bdf8");  // l_thigh colored pass
    expect(mock.strokes[7].strokeStyle).toBe("#c084fc");  // r_thigh colored pass
    expect(mock.strokes[14].strokeStyle).toBe("#070b18"); // r_upper_arm dark separator
    expect(mock.strokes[15].strokeStyle).toBe("#c084fc"); // r_upper_arm colored pass
    expect(mock.strokes[20].strokeStyle).toBe("#070b18"); // l_upper_arm dark separator
    expect(mock.strokes[21].strokeStyle).toBe("#38bdf8"); // l_upper_arm colored pass

    // rWrist normalized x = +0.9 should map to right of centerX (270 + 0.9 * 129.6 = 386.64).
    const expectedRightWristX = CLIP_WIDTH_PX * 0.5 + 0.9 * (CLIP_WIDTH_PX * 0.24);
    expect(mock.lineTos.some(([x]) => Math.abs(x - expectedRightWristX) < 1e-4)).toBe(true);
    expect(mock.ctx.globalAlpha).toBe(1);
    expect(mock.ctx.shadowBlur).toBe(0);
  });

  it("skips occluded lower-body limbs and joints in seated mode, handles hip occlusion, and fades partial limbs", () => {
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

    // Shoulder fallback bar (3 strokes) + 4 upper-body limbs (12 strokes) = 15 strokes; 0 leg strokes.
    expect(mock.strokes).toHaveLength(15);
    // 6 upper-body joints * 2 arcs + 2 head arcs = 14 arcs; 0 lower-body joint arcs.
    expect(mock.arcs).toHaveLength(14);
    expect(mock.fills).toBe(14);

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
});
