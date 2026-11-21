/**
 * Owner: Toufic
 * Purpose: unit tests for the /dev/extract helpers and run lifecycle (Vitest node environment, no DOM)
 * FRs: FR-13, FR-14, FR-15
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, LM } from "../../config";
import { parseDance } from "../../contracts/validators";
import { GOLDEN_ASPECT, GOLDEN_RAW, GOLDEN_RAW_INVISIBLE, GOLDEN_SEGMENTS_UNMIRRORED } from "../../mocks/fixtures";
import { perfMs, type LandmarkPoint, type RawPoseLandmarks, type SegmentMap, type TemplateFrame } from "../../types/pulse";
import ExtractTool from "./ExtractTool";
import {
  MOCK_POSE_SOURCE,
  buildDance,
  computeBeats,
  createFrameCollector,
  parseExtractForm,
  startExtractionRun,
  type ExtractForm,
  type ExtractMeta,
  type PoseSource,
  type RunCallbacks,
} from "./extract";

const raw = (mediaTimeSec: number, over: Partial<RawPoseLandmarks> = {}): RawPoseLandmarks => ({
  ...GOLDEN_RAW,
  tFrameMs: perfMs(987654.321),
  mediaTimeSec,
  ...over,
});

function expectSegments(actual: SegmentMap, expected: SegmentMap): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [k, v] of Object.entries(expected)) {
    const a = actual[k as keyof SegmentMap]!;
    expect(a[0]).toBeCloseTo(v[0], 6);
    expect(a[1]).toBeCloseTo(v[1], 6);
  }
}

function withPoint(index: number, p: Partial<LandmarkPoint>): LandmarkPoint[] {
  return GOLDEN_RAW.landmarks.map((q, i) => (i === index ? { ...q, ...p } : q));
}

const META: ExtractMeta = {
  id: "test-dance", title: "Test Dance", genre: "pop", difficulty: "medium",
  bpm: 120, firstBeatOffsetMs: 125, popularity: 0,
};

// ---------- Frame unit ----------

describe("createFrameCollector: segments", () => {
  it("reproduces all nine unmirrored golden directions", () => {
    const c = createFrameCollector(10_000);
    c.push(raw(0));
    expectSegments(c.frames()[0].segments, GOLDEN_SEGMENTS_UNMIRRORED);
  });

  it("uses native pixel dimensions (aspect golden)", () => {
    const landmarks = GOLDEN_RAW.landmarks.map(() => ({ x: 0, y: 0, v: 0 }));
    landmarks[LM.lShoulder] = { ...GOLDEN_ASPECT.from, v: 1 };
    landmarks[LM.lElbow] = { ...GOLDEN_ASPECT.to, v: 1 };
    const c = createFrameCollector(10_000);
    c.push(raw(0, { landmarks, width: GOLDEN_ASPECT.width, height: GOLDEN_ASPECT.height }));
    expectSegments(c.frames()[0].segments, { l_upper_arm: GOLDEN_ASPECT.expected });
  });

  it("keeps a direction at exactly visibilityMin and omits it just below", () => {
    const at = createFrameCollector(10_000);
    at.push(raw(0, { landmarks: withPoint(LM.lElbow, { v: CONFIG.visibilityMin }) }));
    expect(at.frames()[0].segments.l_upper_arm).toBeDefined();
    expect(at.frames()[0].segments.l_forearm).toBeDefined();

    const below = createFrameCollector(10_000);
    below.push(raw(0, { landmarks: withPoint(LM.lElbow, { v: CONFIG.visibilityMin - 0.01 }) }));
    const s = below.frames()[0].segments;
    expect("l_upper_arm" in s).toBe(false);
    expect("l_forearm" in s).toBe(false);
    expect(Object.keys(s)).toHaveLength(7);
  });

  it("omits a degenerate (zero-length) direction", () => {
    const elbow = GOLDEN_RAW.landmarks[LM.lElbow];
    const c = createFrameCollector(10_000);
    c.push(raw(0, { landmarks: withPoint(LM.lWrist, { x: elbow.x, y: elbow.y }) }));
    expect("l_forearm" in c.frames()[0].segments).toBe(false);
    expect(c.frames()[0].segments.l_upper_arm).toBeDefined();
  });

  it("retains a tracking-loss frame as an empty map, with only time and segments", () => {
    const c = createFrameCollector(10_000);
    c.push({ ...GOLDEN_RAW_INVISIBLE, mediaTimeSec: 0.5 });
    expect(c.frames()).toEqual([{ tMs: 500, segments: {} }]);
    expect(Object.keys(c.frames()[0])).toEqual(["tMs", "segments"]);
  });
});

// ---------- Time and ordering unit ----------

describe("createFrameCollector: time", () => {
  it("converts mediaTimeSec exactly, ignoring tFrameMs", () => {
    const c = createFrameCollector(10_000);
    c.push(raw(0));
    c.push(raw(1.2345678, { tFrameMs: perfMs(3) }));
    expect(c.frames().map((f) => f.tMs)).toEqual([0, 1.2345678 * 1000]);
  });

  it("keeps strictly increasing times, ignoring duplicate and backward callbacks", () => {
    const c = createFrameCollector(10_000);
    c.push(raw(0.1));
    c.push(raw(0.1, { landmarks: GOLDEN_RAW_INVISIBLE.landmarks }));
    c.push(raw(0.05));
    c.push(raw(0.2));
    expect(c.frames().map((f) => f.tMs)).toEqual([100, 200]);
    expect(Object.keys(c.frames()[0].segments)).toHaveLength(9);
  });

  it("drops callbacks outside [0, durationMs), including exactly at the end", () => {
    const c = createFrameCollector(1000);
    c.push(raw(-0.001));
    c.push(raw(0.999));
    c.push(raw(1));
    c.push(raw(5));
    c.push(raw(1e308)); // * 1000 overflows to Infinity
    expect(c.frames().map((f) => f.tMs)).toEqual([999]);
  });

  it("throws on malformed frames", () => {
    const c = createFrameCollector(1000);
    expect(() => c.push(raw(Number.NaN))).toThrow(/mediaTimeSec/);
    expect(() => c.push(raw(0, { width: 0 }))).toThrow(/width/);
    expect(() => c.push(raw(0, { height: Number.POSITIVE_INFINITY }))).toThrow(/finite/);
    expect(() => c.push(raw(0, { landmarks: GOLDEN_RAW.landmarks.slice(1) }))).toThrow(/12 landmarks/);
    expect(() => c.push(raw(0, { landmarks: withPoint(0, { v: 2 }) }))).toThrow(/visibility/);
    expect(c.frames()).toEqual([]);
  });
});

// ---------- Beats and metadata unit ----------

describe("computeBeats", () => {
  it("builds the grid from offset and BPM inside [0, duration)", () => {
    expect(computeBeats(120, 125, 2000)).toEqual([125, 625, 1125, 1625]);
    expect(computeBeats(120, 0, 1600)).toEqual([0, 500, 1000, 1500]);
  });

  it("excludes a beat exactly at the end", () => {
    expect(computeBeats(120, 0, 1000)).toEqual([0, 500]);
  });

  it("keeps full precision for fractional BPM", () => {
    const interval = 60_000 / 90.5;
    expect(computeBeats(90.5, 10.25, 2000)).toEqual([0, 1, 2, 3].map((i) => 10.25 + i * interval));
  });

  it("rejects bad offsets, BPM and duration", () => {
    expect(() => computeBeats(120, -1, 2000)).toThrow(/offset/);
    expect(() => computeBeats(120, 2000, 2000)).toThrow(/past the end/);
    expect(() => computeBeats(120, 2500, 2000)).toThrow(/past the end/);
    for (const bpm of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => computeBeats(bpm, 0, 2000)).toThrow(/BPM/);
    expect(() => computeBeats(1e9, 0, 2000)).toThrow(/too high/);
    expect(() => computeBeats(120, 0, Number.NaN)).toThrow(/duration/);
    expect(() => computeBeats(120, 0, 0)).toThrow(/duration/);
  });

  it("rejects a grid that cannot stay strictly increasing", () => {
    expect(() => computeBeats(60_000, 1e17, 1e17 + 1e5)).toThrow(/not increasing/);
  });
});

describe("parseExtractForm", () => {
  const form: ExtractForm = {
    id: " my-dance_1 ", title: " Title ", genre: "pop", difficulty: "hard",
    bpm: "120.5", firstBeatOffsetMs: "0", popularity: "0",
  };

  it("parses and trims a valid form, with explicit zeros", () => {
    expect(parseExtractForm(form)).toEqual({
      id: "my-dance_1", title: "Title", genre: "pop", difficulty: "hard",
      bpm: 120.5, firstBeatOffsetMs: 0, popularity: 0,
    });
  });

  it.each([
    ["id", "", /Dance ID is required/],
    ["title", "   ", /Title is required/],
    ["genre", "", /Genre is required/],
    ["bpm", "", /BPM is required/],
    ["firstBeatOffsetMs", "  ", /offset is required/],
    ["popularity", "", /Popularity is required/],
    ["bpm", "abc", /BPM must be a number/],
    ["bpm", "Infinity", /BPM must be a number/],
    ["bpm", "0", /greater than 0/],
    ["bpm", "-3", /greater than 0/],
    ["firstBeatOffsetMs", "-1", /0 or more/],
    ["popularity", "-1", /0 or more/],
    ["difficulty", "extreme", /Difficulty/],
    ["id", "../x", /Dance ID may only/],
    ["id", "a/b", /Dance ID may only/],
    ["id", "a\\b", /Dance ID may only/],
    ["id", "a b", /Dance ID may only/],
    ["id", ".hidden", /Dance ID may only/],
    ["id", "a.json", /Dance ID may only/],
    ["id", "-x", /Dance ID may only/],
    ["id", "a%2F", /Dance ID may only/],
  ] as const)("rejects %s = %j", (key, value, error) => {
    expect(() => parseExtractForm({ ...form, [key]: value })).toThrow(error);
  });
});

// ---------- JSON boundary ----------

describe("buildDance", () => {
  const frames = (): TemplateFrame[] => {
    const c = createFrameCollector(2000);
    c.push(raw(0));
    c.push(raw(0.0333, { landmarks: withPoint(LM.lElbow, { v: 0 }) }));
    c.push({ ...GOLDEN_RAW_INVISIBLE, mediaTimeSec: 1.5 });
    return c.frames();
  };

  it("round-trips the serialized payload through parseDance", () => {
    const { json, dance } = buildDance(META, 2, frames());
    const parsed = parseDance(JSON.parse(json));
    expect(parsed).toEqual(dance);
    expect(parsed).toMatchObject({
      id: "test-dance", title: "Test Dance", genre: "pop", difficulty: "medium",
      lengthSec: 2, bpm: 120, popularity: 0, audioUrl: "/dances/test-dance.m4a",
    });
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(
      ["audioUrl", "beatsMs", "bpm", "difficulty", "frames", "genre", "id", "lengthSec", "popularity", "title"],
    );
    expect(parsed.beatsMs).toEqual([125, 625, 1125, 1625]);
    expect(parsed.frames.map((f) => f.tMs)).toEqual([0, 0.0333 * 1000, 1500]);
    expect("l_upper_arm" in parsed.frames[1].segments).toBe(false);
    expect(parsed.frames[2].segments).toEqual({});
  });

  it("rejects a non-unit direction at the JSON boundary", () => {
    const invalid = frames();
    invalid[0].segments.l_upper_arm = [0, 0];
    expect(() => buildDance(META, 2, invalid)).toThrow(/Dance.*l_upper_arm.*expected 1/);
  });

  it("rejects zero frames, all-invisible frames and bad duration", () => {
    expect(() => buildDance(META, 2, [])).toThrow(/No pose frames/);
    const c = createFrameCollector(2000);
    c.push({ ...GOLDEN_RAW_INVISIBLE, mediaTimeSec: 0 });
    c.push({ ...GOLDEN_RAW_INVISIBLE, mediaTimeSec: 1 });
    expect(() => buildDance(META, 2, c.frames())).toThrow(/never detected/);
    expect(() => buildDance(META, Number.NaN, frames())).toThrow(/duration/);
    expect(() => buildDance({ ...META, firstBeatOffsetMs: 5000 }, 2, frames())).toThrow(/past the end/);
  });
});

// ---------- Run wiring ----------

/** Minimal media element: setting src resets readyState, unless metadata is instantly available. */
class FakeVideo extends EventTarget {
  private currentSrc = "";
  readyState = 0;
  currentTime = 0;
  ended = false;
  duration = Number.NaN;
  videoWidth = 0;
  videoHeight = 0;
  muted = false;
  loop = true;
  error: { message: string } | null = null;
  metadataOnSrcSet = false;
  play = vi.fn((): Promise<void> => Promise.resolve());
  pause = vi.fn();
  load = vi.fn();
  get src(): string { return this.currentSrc; }
  set src(value: string) {
    this.currentSrc = value;
    this.readyState = 0;
    this.currentTime = 0;
    this.ended = false;
    this.error = null;
    if (this.metadataOnSrcSet && value) {
      this.duration = 2;
      this.videoWidth = 1280;
      this.videoHeight = 720;
      this.readyState = 1;
    }
  }
  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

const makeVideo = (): FakeVideo => new FakeVideo();

function fireMetadata(v: FakeVideo, duration = 2, w = 1280, h = 720): void {
  v.duration = duration;
  v.videoWidth = w;
  v.videoHeight = h;
  v.readyState = 1;
  v.dispatchEvent(new Event("loadedmetadata"));
}

function fireEnded(video: FakeVideo): void {
  video.ended = true;
  video.currentTime = video.duration;
  video.dispatchEvent(new Event("ended"));
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface Harness {
  source: PoseSource;
  emit: (r: RawPoseLandmarks) => void;
  stop: ReturnType<typeof vi.fn>;
  log: string[];
}

function makeSource(init: () => Promise<void> = () => Promise.resolve()): Harness {
  const log: string[] = [];
  let onRaw: ((r: RawPoseLandmarks) => void) | null = null;
  const stop = vi.fn(() => { log.push("stop"); });
  const source: PoseSource = {
    mock: false,
    init: () => { log.push("init"); return init().then(() => { log.push("init-resolved"); }); },
    start: (_v, cb) => { log.push("start"); onRaw = cb; return stop; },
  };
  return { source, stop, log, emit: (r) => onRaw?.(r) };
}

function makeCallbacks() {
  return {
    onStatus: vi.fn(),
    onProgress: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  } satisfies RunCallbacks;
}

const asVideo = (v: FakeVideo): HTMLVideoElement => v as unknown as HTMLVideoElement;
const FILE = new Blob(["fake video"]);

describe("startExtractionRun", () => {
  let n = 0;
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => { const u = `blob:test/${++n}`; created.push(u); return u; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((u: string) => { revoked.push(u); });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  function expectReleased(v: FakeVideo, url: string): void {
    expect(revoked).toContain(url);
    expect(v.src).toBe("");
    for (const type of ["loadedmetadata", "ended", "error"]) {
      // after cleanup no listener should react
      v.dispatchEvent(new Event(type));
    }
  }

  it("loads muted from zero, awaits init, subscribes, then plays; finishes once on ended", async () => {
    const v = makeVideo();
    const init = deferred();
    const h = makeSource(() => init.promise);
    v.play.mockImplementation(() => { h.log.push("play"); return Promise.resolve(); });
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    expect(v.src).toBe(created[0]);
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(false);
    expect(h.log).toEqual([]);

    fireMetadata(v);
    expect(h.log).toEqual(["init"]);
    init.resolve();
    await flush();
    expect(h.log).toEqual(["init", "init-resolved", "start", "play"]);

    h.emit(raw(0));
    h.emit(raw(1));
    h.emit(raw(1.999)); // delivered just before completion
    fireEnded(v);
    v.dispatchEvent(new Event("ended"));
    h.emit(raw(1.9995)); // models a final browser callback if delivery trails ended

    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    const { dance } = cb.onDone.mock.calls[0][0];
    expect(dance.frames.map((f: TemplateFrame) => f.tMs)).toEqual([0, 1000, 1999]);
    expect(dance.lengthSec).toBe(2);
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(v.pause).toHaveBeenCalledTimes(1);
    expect(v.load).toHaveBeenCalledTimes(1);
    expectReleased(v, created[0]);
    expect(cb.onDone).toHaveBeenCalledTimes(1);
  });

  it("handles metadata already available when the source is set", async () => {
    const v = makeVideo();
    v.metadataOnSrcSet = true;
    const h = makeSource();
    const cb = makeCallbacks();
    const cancel = startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    await flush();
    expect(h.log).toEqual(["init", "init-resolved", "start"]);
    expect(v.play).toHaveBeenCalledTimes(1);
    cancel();
    expectReleased(v, created[0]);
  });

  it.each([
    ["NaN duration", Number.NaN, 1280, 720, /duration/],
    ["infinite duration", Number.POSITIVE_INFINITY, 1280, 720, /duration/],
    ["zero width", 2, 0, 720, /picture size/],
  ])("rejects %s before collecting", async (_name, duration, w, h2, error) => {
    const v = makeVideo();
    const h = makeSource();
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v, duration, w, h2);
    await flush();
    expect(cb.onError).toHaveBeenCalledWith(expect.stringMatching(error));
    expect(h.log).toEqual([]);
    expectReleased(v, created[0]);
  });

  it("surfaces init rejection without starting or falling back", async () => {
    const v = makeVideo();
    const h = makeSource(() => Promise.reject(new Error("wasm missing")));
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    expect(cb.onError).toHaveBeenCalledWith("Pose model failed to load: wasm missing");
    expect(h.log).toEqual(["init"]);
    expect(v.play).not.toHaveBeenCalled();
    expectReleased(v, created[0]);
  });

  it("surfaces a synchronous startPose throw", async () => {
    const v = makeVideo();
    const cb = makeCallbacks();
    const source: PoseSource = { mock: false, init: () => Promise.resolve(), start: () => { throw new Error("no rVFC"); } };
    startExtractionRun(asVideo(v), FILE, META, source, cb);
    fireMetadata(v);
    await flush();
    expect(cb.onError).toHaveBeenCalledWith("Pose tracking failed to start: no rVFC");
    expect(v.play).not.toHaveBeenCalled();
    expectReleased(v, created[0]);
  });

  it("surfaces play() rejection and stops the pose loop", async () => {
    const v = makeVideo();
    v.play.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));
    const h = makeSource();
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    expect(cb.onError).toHaveBeenCalledWith("Video playback failed: NotAllowedError");
    expect(h.stop).toHaveBeenCalledTimes(1);
    expectReleased(v, created[0]);
  });

  it("ignores a pending play rejection and stale frames after cancellation", async () => {
    const v = makeVideo();
    const playing = deferred();
    v.play.mockReturnValue(playing.promise);
    v.load.mockImplementation(() => v.dispatchEvent(new Event("error")));
    const h = makeSource();
    const cb = makeCallbacks();
    const cancel = startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    expect(v.play).toHaveBeenCalledTimes(1);
    cancel();
    cancel();
    playing.reject(new Error("play interrupted by load"));
    h.emit(raw(0));
    await flush();

    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(cb.onProgress).not.toHaveBeenCalled();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(v.pause).toHaveBeenCalledTimes(1);
    expect(v.load).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual([created[0]]);
  });

  it("releases its own URL without detaching another source", async () => {
    const v = makeVideo();
    const cb = makeCallbacks();
    const h = makeSource();
    const cancel = startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    v.src = "blob:test/replacement";
    cancel();

    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(v.src).toBe("blob:test/replacement");
    expect(v.pause).not.toHaveBeenCalled();
    expect(v.load).not.toHaveBeenCalled();
    expect(revoked).toEqual([created[0]]);
  });

  it("ignores cleanup events and events lacking current media state", async () => {
    const v = makeVideo();
    const cb = makeCallbacks();
    const h = makeSource();
    const removeListener = vi.spyOn(v, "removeEventListener");
    v.load.mockImplementation(() => v.dispatchEvent(new Event("error")));
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    h.emit(raw(0));
    v.dispatchEvent(new Event("error"));
    v.dispatchEvent(new Event("ended"));
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();

    fireEnded(v);
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(removeListener.mock.calls.map(([type]) => type)).toEqual(["loadedmetadata", "error", "ended"]);
    expect(removeListener.mock.invocationCallOrder.at(-1)!).toBeLessThan(v.load.mock.invocationCallOrder[0]);
  });

  it("surfaces a media error so the author can pick another video", () => {
    const v = makeVideo();
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, makeSource().source, cb);
    v.error = { message: "DEMUXER_ERROR" };
    v.dispatchEvent(new Event("error"));
    expect(cb.onError).toHaveBeenCalledWith(expect.stringMatching(/could not be played \(DEMUXER_ERROR\)/));
    expectReleased(v, created[0]);
  });

  it("fails on a malformed engine frame and never publishes output", async () => {
    const v = makeVideo();
    const h = makeSource();
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    h.emit(raw(0));
    h.emit(raw(0.5, { landmarks: [] }));
    fireEnded(v);
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError.mock.calls[0][0]).toMatch(/malformed frame/);
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(h.stop).toHaveBeenCalledTimes(1);
  });

  it("reports an all-invisible run as an error with no output", async () => {
    const v = makeVideo();
    const h = makeSource();
    const cb = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    await flush();
    h.emit({ ...GOLDEN_RAW_INVISIBLE, mediaTimeSec: 0 });
    fireEnded(v);
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledWith(expect.stringMatching(/never detected/));
  });

  it("cancel while init is pending: no start, no callbacks, resources released", async () => {
    const v = makeVideo();
    const init = deferred();
    const h = makeSource(() => init.promise);
    const cb = makeCallbacks();
    const cancel = startExtractionRun(asVideo(v), FILE, META, h.source, cb);
    fireMetadata(v);
    cancel();
    cancel();
    init.resolve();
    await flush();
    expect(h.log).toEqual(["init", "init-resolved"]);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(revoked).toEqual([created[0]]);
    expectReleased(v, created[0]);
  });

  it("stops a pose loop obtained after cancellation", async () => {
    const v = makeVideo();
    const stop = vi.fn();
    let cancel: () => void = () => {};
    const source: PoseSource = { mock: false, init: () => Promise.resolve(), start: () => { cancel(); return stop; } };
    cancel = startExtractionRun(asVideo(v), FILE, META, source, makeCallbacks());
    fireMetadata(v);
    await flush();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(v.play).not.toHaveBeenCalled();
  });

  it("a replaced run cannot touch the new run's video, state or frames", async () => {
    const v = makeVideo();
    const init1 = deferred();
    const h1 = makeSource(() => init1.promise);
    const cb1 = makeCallbacks();
    const cancel1 = startExtractionRun(asVideo(v), FILE, META, h1.source, cb1);
    fireMetadata(v);
    cancel1();

    const h2 = makeSource();
    const cb2 = makeCallbacks();
    startExtractionRun(asVideo(v), FILE, META, h2.source, cb2);
    expect(v.src).toBe(created[1]);
    fireMetadata(v);
    await flush();
    v.pause.mockClear();

    init1.resolve();
    await flush();
    expect(h1.log).toEqual(["init", "init-resolved"]);
    expect(v.src).toBe(created[1]);
    expect(v.pause).not.toHaveBeenCalled();
    expect(revoked).toEqual([created[0]]);

    h2.emit(raw(0));
    fireEnded(v);
    expect(cb2.onDone).toHaveBeenCalledTimes(1);
    expect(cb1.onDone).not.toHaveBeenCalled();
    expect(cb1.onError).not.toHaveBeenCalled();
  });

  it("restarts from zero on the same file with fresh resources", async () => {
    const v = makeVideo();
    for (let run = 0; run < 2; run++) {
      v.currentTime = 1.5;
      const h = makeSource();
      const cb = makeCallbacks();
      startExtractionRun(asVideo(v), FILE, META, h.source, cb);
      expect(v.currentTime).toBe(0);
      fireMetadata(v);
      await flush();
      h.emit(raw(0));
      h.emit(raw(1));
      fireEnded(v);
      expect(cb.onDone.mock.calls[0][0].dance.frames.map((f: TemplateFrame) => f.tMs)).toEqual([0, 1000]);
    }
    expect(created).toHaveLength(2);
    expect(revoked).toEqual(created);
  });

  it("mock source: labeled, fixture frames past the duration are dropped, output parses", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const v = makeVideo();
    const cb = makeCallbacks();
    expect(MOCK_POSE_SOURCE.mock).toBe(true);
    startExtractionRun(asVideo(v), FILE, META, MOCK_POSE_SOURCE, cb);
    fireMetadata(v, 1);
    await flush();
    for (let elapsedMs = 50; elapsedMs <= 1500; elapsedMs += 50) {
      now.mockReturnValue(elapsedMs);
      vi.advanceTimersByTime(50);
    }
    fireEnded(v);
    expect(cb.onStatus).toHaveBeenCalledWith(expect.stringMatching(/mock/));
    const { dance, json } = cb.onDone.mock.calls[0][0];
    expect(dance.frames.map((frame: TemplateFrame) => frame.tMs)).toEqual(
      Array.from({ length: 19 }, (_, i) => (i + 1) * 50),
    );
    expect(parseDance(JSON.parse(json))).toEqual(dance);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---------- Screen smoke ----------

describe("ExtractTool screen", () => {
  it("renders the labeled inputs, controls and instructions with no download yet", () => {
    const html = renderToStaticMarkup(<ExtractTool />);
    for (const text of ["Dance video", "Dance ID", "Title", "Genre", "BPM", "First-beat offset (ms)", "Popularity", "Difficulty", "fixture poses (mock", "Extract", "Cancel", "ffmpeg -i video.mp4 -vn -c:a copy"]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/<input type="checkbox"\/>/);
    expect(html).not.toContain("Download ");
  });
});
