/**
 * Owner: Toufic
 * Purpose: Unit tests for pause-aware videoRecorder and screen-space overlayLandmarkRecorder
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG, LM } from "../config";
import { assertLandmarks } from "../contracts/validators";
import { perfMs, songMs, type LandmarkPoint, type PoseFrame } from "../types/pulse";
import {
  createHighlightVideoRecorder,
  createOverlayLandmarkRecorder,
} from "./videoRecorder";

const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

function stubGlobalProp(key: string, value: unknown): void {
  if (!savedGlobals.has(key)) {
    savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreAllGlobals(): void {
  for (const [key, desc] of savedGlobals.entries()) {
    if (desc === undefined) {
      Reflect.deleteProperty(globalThis, key);
    } else {
      Object.defineProperty(globalThis, key, desc);
    }
  }
  savedGlobals.clear();
}

function makePoseFrame(points: LandmarkPoint[]): PoseFrame {
  return {
    tFrameMs: perfMs(1000),
    segments: {},
    usableRatio: 1,
    tracking: "ok",
    points,
  };
}

function makeScreenPoints(): LandmarkPoint[] {
  return [
    { x: 0.41234, y: 0.28991, v: 0.946 },
    { x: 0.58765, y: 0.29123, v: 0.951 },
    { x: 0.31234, y: 0.42111, v: 0.884 },
    { x: 0.68888, y: 0.41999, v: 0.876 },
    { x: 0.24567, y: 0.54321, v: 0.801 },
    { x: 0.75432, y: 0.54111, v: 0.819 },
    { x: 0.44111, y: 0.61234, v: 0.912 },
    { x: 0.55888, y: 0.61444, v: 0.914 },
    { x: 0.43222, y: 0.78111, v: 0.761 },
    { x: 0.56777, y: 0.78222, v: 0.771 },
    { x: 0.42111, y: 0.94321, v: 0.0 },
    { x: 0.57888, y: 0.94444, v: -0.2 },
  ];
}

afterEach(() => {
  restoreAllGlobals();
  vi.restoreAllMocks();
});

describe("createHighlightVideoRecorder", () => {
  it("records video-only tracks, captures startSongMs onstart, pauses/resumes, and resolves a non-empty Blob without stopping live tracks", async () => {
    const videoTrack = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const audioTrack = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;

    const inputStream = {
      getTracks: () => [videoTrack, audioTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;

    class MockMediaStream {
      readonly tracks: MediaStreamTrack[];
      constructor(tracks: MediaStreamTrack[] = []) {
        this.tracks = [...tracks];
      }
      getTracks() {
        return [...this.tracks];
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === "video");
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === "audio");
      }
    }

    const instances: MockRecorder[] = [];
    class MockRecorder {
      static isTypeSupported = vi.fn((type: string) => type === "video/webm;codecs=vp8");
      readonly stream: MediaStream;
      readonly options: MediaRecorderOptions | undefined;
      state: RecordingState = "inactive";
      mimeType: string;
      ondataavailable: ((e: BlobEvent) => void) | null = null;
      onstart: (() => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      startTimeslice: number | undefined;
      pauseCalls = 0;
      resumeCalls = 0;
      stopCalls = 0;

      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        this.stream = stream;
        this.options = options;
        this.mimeType = options?.mimeType ?? "video/webm";
        instances.push(this);
      }

      start = vi.fn((timeslice?: number) => {
        this.startTimeslice = timeslice;
        this.state = "recording";
        // Simulate asynchronous onstart with slightly advanced song time.
        songClock = 120;
        this.onstart?.();
      });

      pause = vi.fn(() => {
        this.pauseCalls += 1;
        this.state = "paused";
      });

      resume = vi.fn(() => {
        this.resumeCalls += 1;
        this.state = "recording";
      });

      stop = vi.fn(() => {
        this.stopCalls += 1;
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }),
        } as BlobEvent);
        this.onstop?.();
      });
    }

    stubGlobalProp("MediaStream", MockMediaStream);
    stubGlobalProp("MediaRecorder", MockRecorder);

    let songClock = 40;
    const rec = createHighlightVideoRecorder(inputStream, () => songMs(songClock));
    expect(instances).toHaveLength(1);
    const mockRec = instances[0];
    expect(mockRec.stream.getVideoTracks()).toEqual([videoTrack]);
    expect(mockRec.stream.getAudioTracks()).toEqual([]);
    expect(mockRec.options).toEqual({
      mimeType: "video/webm;codecs=vp8",
      videoBitsPerSecond: 1_500_000,
    });

    rec.start();
    expect(mockRec.startTimeslice).toBe(1000);

    rec.pause();
    expect(mockRec.pauseCalls).toBe(1);
    rec.pause(); // no-op when already paused
    expect(mockRec.pauseCalls).toBe(1);

    rec.resume();
    expect(mockRec.resumeCalls).toBe(1);
    rec.resume(); // no-op when already recording
    expect(mockRec.resumeCalls).toBe(1);

    const firstFinish = rec.finish();
    const secondFinish = rec.finish(); // idempotent
    expect(firstFinish).toBe(secondFinish);

    const result = await firstFinish;
    expect(mockRec.stopCalls).toBe(1);
    expect(result.startSongMs).toBe(120);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob?.size).toBe(4);
    expect(result.blob?.type).toBe("video/webm;codecs=vp8");

    // Live tracks owned by DancePlay must never be stopped by the recorder.
    expect((videoTrack as unknown as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled();
    expect((audioTrack as unknown as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled();
  });

  it("discards chunks and detaches handlers cleanly on discard()", async () => {
    const videoTrack = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;

    let created: MockRecorder | undefined;
    class MockRecorder {
      static isTypeSupported = vi.fn(() => true);
      state: RecordingState = "inactive";
      mimeType = "video/webm";
      ondataavailable: ((e: BlobEvent) => void) | null = null;
      onstart: (() => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: Event) => void) | null = null;

      constructor() {
        created = this;
      }

      start = vi.fn(() => {
        this.state = "recording";
        this.onstart?.();
        this.ondataavailable?.({ data: new Blob([new Uint8Array(64)]) } as BlobEvent);
      });
      pause = vi.fn();
      resume = vi.fn();
      stop = vi.fn(() => {
        this.state = "inactive";
      });
    }

    stubGlobalProp("MediaStream", class { constructor(public tracks: MediaStreamTrack[]) {} });
    stubGlobalProp("MediaRecorder", MockRecorder);

    const rec = createHighlightVideoRecorder(stream, () => songMs(0));
    rec.start();
    rec.discard();

    expect(created?.stop).toHaveBeenCalledTimes(1);
    expect(created?.ondataavailable).toBeNull();
    expect(created?.onstop).toBeNull();
    expect(await rec.finish()).toEqual({ blob: null, startSongMs: 0 });
    expect((videoTrack as unknown as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled();
  });

  it("degrades safely to blob: null when MediaRecorder or video tracks are absent", async () => {
    stubGlobalProp("MediaRecorder", undefined);
    const stream = {
      getTracks: () => [],
      getVideoTracks: () => [{ kind: "video" }],
    } as unknown as MediaStream;

    const noRec = createHighlightVideoRecorder(stream, () => songMs(100));
    noRec.start();
    noRec.pause();
    noRec.resume();
    expect(await noRec.finish()).toEqual({ blob: null, startSongMs: 0 });
    noRec.discard();

    // Also when stream has zero video tracks:
    stubGlobalProp("MediaRecorder", class {});
    const emptyStream = { getVideoTracks: () => [] } as unknown as MediaStream;
    const emptyRec = createHighlightVideoRecorder(emptyStream, () => songMs(100));
    emptyRec.start();
    expect(await emptyRec.finish()).toEqual({ blob: null, startSongMs: 0 });
  });

  it("flushes final buffered tail chunks across pause/resume and preserves startSongMs on finish", async () => {
    const instances: SpyRecorder[] = [];
    class SpyRecorder {
      static isTypeSupported = () => true;
      mimeType = "video/webm";
      state: RecordingState = "inactive";
      ondataavailable: ((ev: BlobEvent) => void) | null = null;
      onstart: (() => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor() {
        instances.push(this);
      }

      start = (): void => {
        this.state = "recording";
        this.onstart?.();
      };

      pause = (): void => {
        this.state = "paused";
      };

      resume = (): void => {
        this.state = "recording";
      };

      stop = (): void => {
        // Real MediaRecorder flushes remaining < 1000ms tail data before onstop fires.
        this.ondataavailable?.({
          data: new Blob(["tail"], { type: "video/webm" }),
        } as BlobEvent);
        this.state = "inactive";
        this.onstop?.();
      };
    }

    stubGlobalProp("MediaRecorder", SpyRecorder);
    let songClock = 320;
    const stream = {
      getTracks: () => [],
      getVideoTracks: () => [{ kind: "video" }],
    } as unknown as MediaStream;

    const rec = createHighlightVideoRecorder(stream, () => songMs(songClock));
    rec.start();
    const spy = instances[0]!;
    spy.ondataavailable?.({
      data: new Blob(["chunk1-"], { type: "video/webm" }),
    } as BlobEvent);

    songClock = 2_400;
    rec.pause();
    expect(spy.state).toBe("paused");

    songClock = 2_450;
    rec.resume();
    expect(spy.state).toBe("recording");

    const result = await rec.finish();
    expect(result.startSongMs).toBe(320);
    expect(result.blob).not.toBeNull();
    expect(result.blob!.size).toBe(11); // "chunk1-" (7) + "tail" (4)
  });

  it("discards buffered chunks cleanly on mid-recording MediaRecorder onerror", async () => {
    const instances: SpyRecorder[] = [];
    class SpyRecorder {
      static isTypeSupported = () => true;
      mimeType = "video/webm";
      state: RecordingState = "inactive";
      ondataavailable: ((ev: BlobEvent) => void) | null = null;
      onstart: (() => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor() {
        instances.push(this);
      }

      start = (): void => {
        this.state = "recording";
        this.onstart?.();
      };

      stop = (): void => {
        this.state = "inactive";
        this.onstop?.();
      };
    }

    stubGlobalProp("MediaRecorder", SpyRecorder);
    const stream = {
      getTracks: () => [],
      getVideoTracks: () => [{ kind: "video" }],
    } as unknown as MediaStream;

    const rec = createHighlightVideoRecorder(stream, () => songMs(500));
    rec.start();
    const spy = instances[0]!;
    spy.ondataavailable?.({
      data: new Blob(["partial"], { type: "video/webm" }),
    } as BlobEvent);

    spy.onerror?.({ type: "error" } as Event);
    expect(spy.ondataavailable).toBeNull();
    expect(spy.onstop).toBeNull();
    expect(await rec.finish()).toEqual({ blob: null, startSongMs: 0 });
  });
});

describe("createOverlayLandmarkRecorder", () => {
  it("captures quantized screen-space [0..1] mirrored points at target FPS without torso centering, and clears on clear()", () => {
    const rec = createOverlayLandmarkRecorder(CONFIG.clipFps);
    const frame = makePoseFrame(makeScreenPoints());

    for (let i = 0; i < 60; i++) {
      rec.push(frame, songMs((i * 1000) / 30));
    }

    const samples = rec.getSamples();
    expect(samples).toHaveLength(20);
    assertLandmarks(samples[0].points, "overlaySample");

    // Screen-space coordinates stay anchored around their original [0..1] positions (not centered at 0).
    expect(samples[0].points[LM.lShoulder]).toEqual({ x: 0.412, y: 0.29, v: 0.95 });
    expect(samples[0].points[LM.rShoulder]).toEqual({ x: 0.588, y: 0.291, v: 0.95 });
    // Points with v <= 0 collapse cleanly to { x: 0, y: 0, v: 0 }.
    expect(samples[0].points[LM.lAnkle]).toEqual({ x: 0, y: 0, v: 0 });
    expect(samples[0].points[LM.rAnkle]).toEqual({ x: 0, y: 0, v: 0 });

    // Duplicate or backward timestamps are ignored.
    rec.push(frame, samples[samples.length - 1].tSongMs);
    rec.push(frame, songMs(100));
    expect(rec.getSamples()).toHaveLength(20);

    // Defensive copy on getSamples().
    const copy = rec.getSamples();
    copy.pop();
    expect(rec.getSamples()).toHaveLength(20);

    rec.clear();
    expect(rec.getSamples()).toHaveLength(0);

    // 60 FPS input captures at exact 12 FPS (24 samples in 2 s).
    for (let i = 0; i < 120; i++) {
      rec.push(frame, songMs((i * 1000) / 60));
    }
    expect(rec.getSamples()).toHaveLength(24);
    expect(Number(rec.getSamples()[0].tSongMs)).toBe(0);
  });
});
