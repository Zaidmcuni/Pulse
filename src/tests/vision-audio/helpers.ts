/**
 * Owner: Zaid
 * Purpose: Deterministic test harnesses for cross-module vision + audio integration tests
 */

import { vi } from "vitest";
import { SCORED_LANDMARK_INDICES } from "../../config";
import type { PoseFrame, PosturalMode, RawPoseLandmarks } from "../../types/pulse";
import { computePoseFrame } from "../../vision/segments";

export interface FakeMediaPipeLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseGeneratorOptions {
  centerX?: number;
  centerY?: number;
  shoulderWidth?: number;
  jitter?: { x: number; y: number };
  armPhase?: number;
  seated?: boolean;
  dropVisibility?: boolean;
  asymmetricRightArmHigh?: boolean;
}

/** Builds an anatomically plausible 33-point MediaPipe pose in un-mirrored camera coordinates. */
export function makeMediaPipePose(opts?: PoseGeneratorOptions): FakeMediaPipeLandmark[] {
  const cx = opts?.centerX ?? 0.5;
  const cy = opts?.centerY ?? 0.5;
  const sw = opts?.shoulderWidth ?? 0.2;
  const hw = sw / 2;
  const jx = opts?.jitter?.x ?? 0;
  const jy = opts?.jitter?.y ?? 0;
  const armDelta = opts?.armPhase !== undefined ? Math.sin(opts.armPhase) * 0.08 : 0;

  const pose: FakeMediaPipeLandmark[] = Array.from({ length: 33 }, () => ({
    x: cx,
    y: cy,
    z: 0,
    visibility: 0.9,
  }));

  const setPoint = (mpIdx: number, x: number, y: number, v = 0.92): void => {
    pose[mpIdx] = opts?.dropVisibility
      ? { x: x + jx, y: y + jy, z: 0 }
      : { x: x + jx, y: y + jy, z: 0, visibility: v };
  };

  // MediaPipe camera convention (un-mirrored): dancer's LEFT appears at larger x, RIGHT at smaller x
  setPoint(11, cx + hw, cy - 0.16);
  setPoint(12, cx - hw, cy - 0.16);
  setPoint(13, cx + hw + 0.06, cy - 0.04 + armDelta);
  setPoint(
    14,
    cx - hw - 0.06,
    opts?.asymmetricRightArmHigh ? cy - 0.26 : cy - 0.04 - armDelta,
  );
  setPoint(15, cx + hw + 0.08, cy + 0.08 + armDelta * 1.4);
  setPoint(
    16,
    cx - hw - 0.12,
    opts?.asymmetricRightArmHigh ? cy - 0.36 : cy + 0.08 - armDelta * 1.4,
  );

  const lowerVis = opts?.seated ? 0 : 0.92;
  const setLower = (mpIdx: number, x: number, y: number): void => {
    if (opts?.seated) {
      pose[mpIdx] = opts.dropVisibility ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0, z: 0, visibility: 0 };
      return;
    }
    setPoint(mpIdx, x, y, lowerVis);
  };

  setLower(23, cx + hw * 0.55, cy + 0.16);
  setLower(24, cx - hw * 0.55, cy + 0.16);
  setLower(25, cx + hw * 0.6, cy + 0.31);
  setLower(26, cx - hw * 0.6, cy + 0.31);
  setLower(27, cx + hw * 0.65, cy + 0.45);
  setLower(28, cx - hw * 0.65, cy + 0.45);

  // Sanity guard: keep all SCORED_LANDMARK_INDICES populated
  for (const idx of SCORED_LANDMARK_INDICES) {
    if (!pose[idx]) {
      setPoint(idx, cx, cy);
    }
  }

  return pose;
}

export interface MockVideoHandle {
  video: HTMLVideoElement;
  emitFrame: (frame: { nowMs: number; presentationTimeMs?: number; mediaTimeSec: number }) => void;
  pendingCallbackCount: () => number;
  cancelSpy: ReturnType<typeof vi.fn>;
}

/** Deterministic HTMLVideoElement mock driving requestVideoFrameCallback frames without timers. */
export function createMockVideo(opts?: {
  width?: number;
  height?: number;
  readyState?: number;
  liveStream?: boolean;
}): MockVideoHandle {
  let nextHandle = 1;
  const pending = new Map<number, VideoFrameRequestCallback>();
  const cancelSpy = vi.fn((handle: number) => {
    pending.delete(handle);
  });

  const videoObj = {
    videoWidth: opts?.width ?? 1280,
    videoHeight: opts?.height ?? 720,
    readyState: opts?.readyState ?? 4,
    currentTime: 0,
    srcObject: opts?.liveStream ? ({} as MediaStream) : null,
    requestVideoFrameCallback(cb: VideoFrameRequestCallback): number {
      const id = nextHandle++;
      pending.set(id, cb);
      return id;
    },
    cancelVideoFrameCallback: cancelSpy,
  };

  return {
    video: videoObj as unknown as HTMLVideoElement,
    emitFrame({ nowMs, presentationTimeMs, mediaTimeSec }) {
      const entry = pending.entries().next();
      if (entry.done) {
        throw new Error("No queued requestVideoFrameCallback to fire");
      }
      const [id, cb] = entry.value;
      pending.delete(id);
      videoObj.currentTime = mediaTimeSec;
      cb(nowMs, {
        expectedDisplayTime: presentationTimeMs ?? nowMs,
        presentationTime: presentationTimeMs ?? nowMs,
        mediaTime: mediaTimeSec,
        presentedFrames: id,
        width: videoObj.videoWidth,
        height: videoObj.videoHeight,
      });
    },
    pendingCallbackCount: () => pending.size,
    cancelSpy,
  };
}

interface MockAudioNode {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  finishNaturally: () => void;
}

export interface MockWebAudioHandle {
  currentTimeSec: () => number;
  setColdStart: (cold: boolean) => void;
  setDurationSec: (sec: number) => void;
  setState: (state: AudioContextState) => void;
  setPerfNowMs: (ms: number) => void;
  advanceAudio: (deltaSec: number) => void;
  triggerNaturalEnd: () => void;
  fetchSpy: ReturnType<typeof vi.fn>;
  resumeSpy: ReturnType<typeof vi.fn>;
  sourceCount: () => number;
  restore: () => void;
}

/** Deterministic fetch + AudioContext mock with warm/cold getOutputTimestamp and natural onended. */
export function installMockWebAudio(initialDurationSec = 180): MockWebAudioHandle {
  const originalAudioContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;

  let currentTime = 0;
  let baseLatency = 0.01;
  let outputLatency = 0.02;
  let audioState: AudioContextState = "running";
  let coldStart = false;
  let durationSec = initialDurationSec;
  let perfAnchorMs = 1000;
  let activeSource: MockAudioNode | null = null;
  const sources: MockAudioNode[] = [];

  const resumeSpy = vi.fn(async () => {
    audioState = "running";
  });

  class MockAudioContext {
    get currentTime(): number {
      return currentTime;
    }
    get baseLatency(): number {
      return baseLatency;
    }
    get outputLatency(): number {
      return outputLatency;
    }
    get state(): AudioContextState {
      return audioState;
    }
    destination = {} as AudioDestinationNode;
    resume = resumeSpy;

    decodeAudioData = vi.fn(async () => ({ duration: durationSec }) as AudioBuffer);

    getOutputTimestamp(): AudioTimestamp {
      if (coldStart) {
        return { contextTime: 0, performanceTime: 0 };
      }
      return {
        contextTime: Math.max(0, currentTime - baseLatency - outputLatency),
        performanceTime: perfAnchorMs,
      };
    }

    createBufferSource(): AudioBufferSourceNode {
      const node: MockAudioNode = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(() => {
          if (node.onended) {
            node.onended();
          }
        }),
        finishNaturally: () => {
          if (node.onended) {
            node.onended();
          }
        },
      };
      activeSource = node;
      sources.push(node);
      return node as unknown as AudioBufferSourceNode;
    }
  }

  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.startsWith("/dances/")) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(32),
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response;
  });

  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    writable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchSpy,
  });

  return {
    currentTimeSec: () => currentTime,
    setColdStart: (cold: boolean) => {
      coldStart = cold;
    },
    setDurationSec: (sec: number) => {
      durationSec = sec;
    },
    setState: (state: AudioContextState) => {
      audioState = state;
    },
    setPerfNowMs: (ms: number) => {
      perfAnchorMs = ms;
    },
    advanceAudio: (deltaSec: number) => {
      currentTime += deltaSec;
      perfAnchorMs += deltaSec * 1000;
    },
    triggerNaturalEnd: () => {
      activeSource?.finishNaturally();
    },
    fetchSpy,
    resumeSpy,
    sourceCount: () => sources.length,
    restore: () => {
      Object.defineProperty(globalThis, "AudioContext", {
        configurable: true,
        writable: true,
        value: originalAudioContext,
      });
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    },
  };
}

export interface RecordedCanvasLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
}

export interface RecordedCanvasArc {
  x: number;
  y: number;
  radius: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

export interface MockCanvasSpy {
  ctx: CanvasRenderingContext2D;
  clearRectCalls: Array<[number, number, number, number]>;
  lines: RecordedCanvasLine[];
  arcs: RecordedCanvasArc[];
  hasOriginDraw: () => boolean;
  resetCounts: () => void;
}

/** CanvasRenderingContext2D spy capturing clearRect, lines, and joint arcs without DOM canvas. */
export function createMockCanvasContext(): MockCanvasSpy {
  const clearRectCalls: Array<[number, number, number, number]> = [];
  const lines: RecordedCanvasLine[] = [];
  const arcs: RecordedCanvasArc[] = [];

  let movePt: { x: number; y: number } | null = null;
  let linePts: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let arcPt: { x: number; y: number; radius: number } | null = null;

  const mockObj = {
    strokeStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    clearRect(x: number, y: number, w: number, h: number) {
      clearRectCalls.push([x, y, w, h]);
    },
    beginPath() {
      movePt = null;
      linePts = null;
      arcPt = null;
    },
    moveTo(x: number, y: number) {
      movePt = { x, y };
    },
    lineTo(x: number, y: number) {
      if (movePt) {
        linePts = { x1: movePt.x, y1: movePt.y, x2: x, y2: y };
      }
    },
    stroke() {
      if (linePts) {
        lines.push({ ...linePts, strokeStyle: mockObj.strokeStyle });
      }
    },
    arc(x: number, y: number, radius: number) {
      arcPt = { x, y, radius };
    },
    fill() {
      if (arcPt) {
        arcs.push({ ...arcPt, fillStyle: mockObj.fillStyle });
      }
    },
    save() {},
    restore() {},
  };

  return {
    ctx: mockObj as unknown as CanvasRenderingContext2D,
    clearRectCalls,
    lines,
    arcs,
    hasOriginDraw: () =>
      lines.some(
        (l) =>
          (Math.abs(l.x1) < 1e-6 && Math.abs(l.y1) < 1e-6) ||
          (Math.abs(l.x2) < 1e-6 && Math.abs(l.y2) < 1e-6),
      ) || arcs.some((a) => Math.abs(a.x) < 1e-6 && Math.abs(a.y) < 1e-6),
    resetCounts: () => {
      clearRectCalls.length = 0;
      lines.length = 0;
      arcs.length = 0;
    },
  };
}

/** Converts un-mirrored RawPoseLandmarks to a mirrored PoseFrame using Toufic's segments.ts. */
export function toMirroredPoseFrame(raw: RawPoseLandmarks, mode: PosturalMode): PoseFrame {
  return computePoseFrame(raw, mode);
}
