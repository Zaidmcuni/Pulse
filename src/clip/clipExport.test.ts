/**
 * Owner: Toufic
 * Purpose: Unit tests for highlight clip video+audio export and MIME negotiation (FR-50)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { exportClip, exportHighlight, selectExportMimeType } from "./clipExport";

interface MockTrack {
  kind: "video" | "audio";
  stop: ReturnType<typeof vi.fn<() => void>>;
}

interface MockSourceNode {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn<(dest: unknown) => void>>;
  disconnect: ReturnType<typeof vi.fn<() => void>>;
  start: ReturnType<typeof vi.fn<(when?: number, offset?: number, duration?: number) => void>>;
  stop: ReturnType<typeof vi.fn<() => void>>;
}

interface MockRecorderInstance {
  stream: MediaStream;
  options: MediaRecorderOptions | undefined;
  state: RecordingState;
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start: ReturnType<typeof vi.fn<() => void>>;
  stop: ReturnType<typeof vi.fn<() => void>>;
  emitError: (error: unknown) => void;
}

interface MockHarnessOptions {
  supportedMimeTypes?: string[];
  hasIsTypeSupported?: boolean;
  audioState?: AudioContextState;
  audioDurationSec?: number;
  currentTimeSec?: number;
  fetchOk?: boolean;
  fetchStatus?: number;
  decodeError?: Error;
  recorderMimeType?: string;
  autoEmitChunkOnStop?: boolean;
  chunkMimeType?: string;
  chunkSize?: number;
}

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
  for (const [key, descriptor] of savedGlobals.entries()) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, key);
    } else {
      Object.defineProperty(globalThis, key, descriptor);
    }
  }
  savedGlobals.clear();
}

function createMockTrack(kind: "video" | "audio"): MockTrack {
  return {
    kind,
    stop: vi.fn<() => void>(),
  };
}

function createMockStream(tracks: MockTrack[]): MediaStream {
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
    getVideoTracks: () => tracks.filter((t) => t.kind === "video") as unknown as MediaStreamTrack[],
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio") as unknown as MediaStreamTrack[],
  } as unknown as MediaStream;
}

function installExportMocks(opts: MockHarnessOptions = {}) {
  const {
    supportedMimeTypes = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus"],
    hasIsTypeSupported = true,
    audioState = "running",
    audioDurationSec = 30,
    currentTimeSec = 1.25,
    fetchOk = true,
    fetchStatus = 200,
    decodeError,
    recorderMimeType = "",
    autoEmitChunkOnStop = true,
    chunkMimeType = "video/webm",
    chunkSize = 128,
  } = opts;

  const callOrder: string[] = [];
  const videoTrack = createMockTrack("video");
  const audioTrack = createMockTrack("audio");
  const videoStream = createMockStream([videoTrack]);
  const destinationStream = createMockStream([audioTrack]);
  const sources: MockSourceNode[] = [];
  const recorders: MockRecorderInstance[] = [];
  const audioDestinationsCreated: MediaStreamAudioDestinationNode[] = [];
  const audioContextsCreated: Array<{
    state: AudioContextState;
    currentTime: number;
    destination: AudioDestinationNode;
    resume: ReturnType<typeof vi.fn<() => Promise<void>>>;
    decodeAudioData: ReturnType<typeof vi.fn<(buf: ArrayBuffer) => Promise<AudioBuffer>>>;
    close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];

  class MockMediaStream {
    private readonly tracks: MediaStreamTrack[];

    constructor(tracks: MediaStreamTrack[] = []) {
      this.tracks = [...tracks];
    }

    getTracks(): MediaStreamTrack[] {
      return [...this.tracks];
    }

    getVideoTracks(): MediaStreamTrack[] {
      return this.tracks.filter((t) => t.kind === "video");
    }

    getAudioTracks(): MediaStreamTrack[] {
      return this.tracks.filter((t) => t.kind === "audio");
    }
  }

  class MockAudioContext {
    currentTime = currentTimeSec;
    state: AudioContextState = audioState;
    readonly destination = { kind: "speakers" } as unknown as AudioDestinationNode;

    readonly resume = vi.fn<() => Promise<void>>(async () => {
      this.state = "running";
    });

    readonly decodeAudioData = vi.fn<(buf: ArrayBuffer) => Promise<AudioBuffer>>(async () => {
      if (decodeError) {
        throw decodeError;
      }
      return { duration: audioDurationSec } as AudioBuffer;
    });

    readonly close = vi.fn<() => Promise<void>>(async () => {
      this.state = "closed";
    });

    constructor() {
      audioContextsCreated.push(this);
    }

    createMediaStreamDestination(): MediaStreamAudioDestinationNode {
      const node = {
        stream: destinationStream,
      } as unknown as MediaStreamAudioDestinationNode;
      audioDestinationsCreated.push(node);
      return node;
    }

    createBufferSource(): AudioBufferSourceNode {
      const node: MockSourceNode = {
        buffer: null,
        onended: null,
        connect: vi.fn<(dest: unknown) => void>(),
        disconnect: vi.fn<() => void>(),
        start: vi.fn<(when?: number, offset?: number, duration?: number) => void>(() => {
          callOrder.push("source.start");
        }),
        stop: vi.fn<() => void>(),
      };
      sources.push(node);
      return node as unknown as AudioBufferSourceNode;
    }
  }

  class MockMediaRecorder {
    static isTypeSupported = hasIsTypeSupported
      ? vi.fn<(type: string) => boolean>((type: string) => supportedMimeTypes.includes(type))
      : undefined;

    readonly stream: MediaStream;
    readonly options: MediaRecorderOptions | undefined;
    state: RecordingState = "inactive";
    mimeType: string;
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    readonly start = vi.fn<() => void>(() => {
      callOrder.push("recorder.start");
      this.state = "recording";
    });

    readonly stop = vi.fn<() => void>(() => {
      callOrder.push("recorder.stop");
      this.state = "inactive";
      if (autoEmitChunkOnStop && this.ondataavailable) {
        if (chunkSize > 0) {
          this.ondataavailable({
            data: new Blob([new Uint8Array(chunkSize)], { type: chunkMimeType }),
          } as BlobEvent);
        } else {
          this.ondataavailable({
            data: new Blob([], { type: chunkMimeType }),
          } as BlobEvent);
        }
      }
      this.onstop?.();
    });

    readonly emitError = (error: unknown): void => {
      this.state = "inactive";
      this.onerror?.({ error } as unknown as Event);
    };

    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      this.stream = stream;
      this.options = options;
      this.mimeType = options?.mimeType ?? recorderMimeType;
      recorders.push(this as unknown as MockRecorderInstance);
    }
  }

  const fetchMock = vi.fn<typeof fetch>(async () => {
    return {
      ok: fetchOk,
      status: fetchStatus,
      arrayBuffer: async () => new ArrayBuffer(16),
    } as Response;
  });

  const canvas = {
    captureStream: vi.fn<(fps?: number) => MediaStream>(() => videoStream),
  } as unknown as HTMLCanvasElement;

  stubGlobalProp("MediaStream", MockMediaStream);
  stubGlobalProp("AudioContext", MockAudioContext);
  stubGlobalProp("MediaRecorder", MockMediaRecorder);
  stubGlobalProp("fetch", fetchMock);

  return {
    callOrder,
    canvas,
    videoTrack,
    audioTrack,
    videoStream,
    destinationStream,
    sources,
    recorders,
    audioDestinationsCreated,
    audioContextsCreated,
    fetchMock,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
  restoreAllGlobals();
  vi.restoreAllMocks();
});

describe("selectExportMimeType", () => {
  it("prefers MP4 candidates in priority order when supported", () => {
    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn((type: string) =>
        [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4",
          "video/webm;codecs=vp9,opus",
        ].includes(type),
      ),
    });
    expect(selectExportMimeType()).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");

    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn((type: string) =>
        ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus"].includes(type),
      ),
    });
    expect(selectExportMimeType()).toBe("video/mp4;codecs=avc1,mp4a.40.2");

    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn((type: string) =>
        ["video/mp4", "video/webm;codecs=vp9,opus"].includes(type),
      ),
    });
    expect(selectExportMimeType()).toBe("video/mp4");
  });

  it("falls back to WebM candidates in priority order when MP4 is unsupported", () => {
    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn((type: string) =>
        ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].includes(type),
      ),
    });
    expect(selectExportMimeType()).toBe("video/webm;codecs=vp9,opus");

    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn((type: string) =>
        ["video/webm;codecs=vp8,opus", "video/webm"].includes(type),
      ),
    });
    expect(selectExportMimeType()).toBe("video/webm;codecs=vp8,opus");

    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn((type: string) => type === "video/webm"),
    });
    expect(selectExportMimeType()).toBe("video/webm");
  });

  it("returns undefined when no candidate is supported or MediaRecorder.isTypeSupported is unavailable", () => {
    stubGlobalProp("MediaRecorder", {
      isTypeSupported: vi.fn(() => false),
    });
    expect(selectExportMimeType()).toBeUndefined();

    stubGlobalProp("MediaRecorder", {});
    expect(selectExportMimeType()).toBeUndefined();

    stubGlobalProp("MediaRecorder", undefined);
    expect(selectExportMimeType()).toBeUndefined();
  });
});

describe("exportClip happy path and stream synchronization", () => {
  it("captures 60 FPS canvas, decodes and resumes audio, muxes tracks, starts synchronously, and cleans up onended", async () => {
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/mp4;codecs=avc1.42E01E,mp4a.40.2"],
      audioState: "suspended",
      audioDurationSec: 45,
      currentTimeSec: 2.5,
    });

    const promise = exportClip(mocks.canvas, "/dances/neon.m4a", 5, 10);
    await flushMicrotasks();

    expect(mocks.fetchMock).toHaveBeenCalledWith("/dances/neon.m4a");
    expect(mocks.canvas.captureStream).toHaveBeenCalledWith(60);

    expect(mocks.audioContextsCreated).toHaveLength(1);
    const audioCtx = mocks.audioContextsCreated[0];
    expect(audioCtx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(audioCtx.resume).toHaveBeenCalledTimes(1);

    expect(mocks.sources).toHaveLength(1);
    const source = mocks.sources[0];
    const destination = mocks.audioDestinationsCreated[0];
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(destination);
    expect(source.connect).not.toHaveBeenCalledWith(audioCtx.destination);

    expect(mocks.recorders).toHaveLength(1);
    const recorder = mocks.recorders[0];
    expect(recorder.options).toEqual({ mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2" });
    expect(recorder.stream.getVideoTracks()).toHaveLength(1);
    expect(recorder.stream.getAudioTracks()).toHaveLength(1);

    expect(mocks.callOrder).toEqual(["recorder.start", "source.start"]);
    expect(source.start).toHaveBeenCalledWith(2.5, 5, 10);
    expect(source.onended).toBeTypeOf("function");

    source.onended!();
    const blob = await promise;

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(128);
    expect(blob.type).toBe("video/mp4;codecs=avc1.42e01e,mp4a.40.2");
    expect(mocks.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(audioCtx.close).toHaveBeenCalledTimes(1);
  });

  it("omits mimeType option when selectExportMimeType returns undefined and falls back to recorder.mimeType", async () => {
    const mocks = installExportMocks({
      supportedMimeTypes: [],
      recorderMimeType: "video/webm;codecs=vp8",
      audioDurationSec: 20,
    });

    const promise = exportClip(mocks.canvas, "/dances/fallback.m4a", 0, 4);
    await flushMicrotasks();

    const recorder = mocks.recorders[0];
    expect(recorder.options).toBeUndefined();
    mocks.sources[0].onended!();

    const blob = await promise;
    expect(blob.type).toBe("video/webm;codecs=vp8");
  });

  it("invokes options.onRecordingStart synchronously right before recorder.start() and source.start()", async () => {
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/webm"],
      audioDurationSec: 30,
      currentTimeSec: 2.0,
    });
    const onRecordingStart = vi.fn(() => {
      mocks.callOrder.push("onRecordingStart");
    });

    const promise = exportClip(mocks.canvas, "/dances/sync.m4a", 5, 10, { onRecordingStart });
    expect(onRecordingStart).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(onRecordingStart).toHaveBeenCalledTimes(1);
    expect(mocks.callOrder).toEqual(["onRecordingStart", "recorder.start", "source.start"]);

    mocks.sources[0].onended!();
    const blob = await promise;
    expect(blob.size).toBe(128);
  });

  it("resolves via the watchdog timer if source.onended never fires", async () => {
    vi.useFakeTimers();
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/webm"],
      audioDurationSec: 20,
    });

    const promise = exportClip(mocks.canvas, "/dances/watchdog.m4a", 2, 3);
    await flushMicrotasks();

    const recorder = mocks.recorders[0];
    expect(recorder.stop).not.toHaveBeenCalled();

    // At exact durationSec (3000ms), watchdog (+250ms) has not fired yet.
    await vi.advanceTimersByTimeAsync(3000);
    expect(recorder.stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(recorder.stop).toHaveBeenCalledTimes(1);

    const blob = await promise;
    expect(blob.type).toBe("video/webm");
  });

  it("ignores empty BlobEvent chunks and falls back to window.AudioContext when defined", async () => {
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/webm"],
      autoEmitChunkOnStop: false,
      audioDurationSec: 15,
    });
    const WindowAudioCtx = globalThis.AudioContext;
    stubGlobalProp("window", { AudioContext: WindowAudioCtx });
    stubGlobalProp("AudioContext", undefined);

    const promise = exportClip(mocks.canvas, "/dances/chunks.m4a", 0, 2);
    await flushMicrotasks();

    const recorder = mocks.recorders[0];
    recorder.stop.mockImplementation(() => {
      recorder.state = "inactive";
      recorder.ondataavailable?.({ data: new Blob([]) } as BlobEvent);
      recorder.ondataavailable?.({
        data: new Blob([new Uint8Array(64)], { type: "video/webm" }),
      } as BlobEvent);
      recorder.onstop?.();
    });

    mocks.sources[0].onended!();
    const blob = await promise;
    expect(blob.size).toBe(64);
  });
});

describe("exportClip audio slicing and boundary clamping", () => {
  it("clamps negative startSec to 0", async () => {
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/webm"],
      audioDurationSec: 20,
      currentTimeSec: 0.5,
    });

    const promise = exportClip(mocks.canvas, "/dances/clamp.m4a", -3.5, 5);
    await flushMicrotasks();

    expect(mocks.sources[0].start).toHaveBeenCalledWith(0.5, 0, 5);
    mocks.sources[0].onended!();

    const blob = await promise;
    expect(blob.size).toBe(128);
  });

  it("slices only remaining audio when startSec + durationSec exceeds audio duration and ends via timer", async () => {
    vi.useFakeTimers();
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/webm"],
      audioDurationSec: 10,
      currentTimeSec: 1.0,
    });

    const promise = exportClip(mocks.canvas, "/dances/tail.m4a", 7, 5);
    await flushMicrotasks();

    const source = mocks.sources[0];
    const recorder = mocks.recorders[0];
    expect(source.start).toHaveBeenCalledWith(1.0, 7, 3);
    expect(source.onended).toBeNull();

    // Audio ends at 3s, but video continues recording trailing silence until 5s.
    await vi.advanceTimersByTimeAsync(3500);
    expect(recorder.stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(recorder.stop).toHaveBeenCalledTimes(1);

    const blob = await promise;
    expect(blob.size).toBe(128);
    expect(mocks.audioContextsCreated[0].close).toHaveBeenCalledTimes(1);
  });

  it("skips creating or starting an audio source when startSec >= audioBuffer.duration", async () => {
    vi.useFakeTimers();
    const mocks = installExportMocks({
      supportedMimeTypes: ["video/webm"],
      audioDurationSec: 10,
    });

    const promise = exportClip(mocks.canvas, "/dances/silent.m4a", 12, 4);
    await flushMicrotasks();

    expect(mocks.sources).toHaveLength(0);
    expect(mocks.recorders[0].start).toHaveBeenCalledTimes(1);
    expect(mocks.recorders[0].stream.getAudioTracks()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3999);
    expect(mocks.recorders[0].stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const blob = await promise;
    expect(blob.size).toBe(128);
    expect(mocks.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioContextsCreated[0].close).toHaveBeenCalledTimes(1);
  });
});

describe("exportClip validation, error paths, and cleanup", () => {
  it("rejects with RangeError for non-finite or non-positive window arguments", async () => {
    const mocks = installExportMocks();

    await expect(exportClip(mocks.canvas, "/dances/a.m4a", 0, 0)).rejects.toThrow(RangeError);
    await expect(exportClip(mocks.canvas, "/dances/a.m4a", 0, -2)).rejects.toThrow(RangeError);
    await expect(exportClip(mocks.canvas, "/dances/a.m4a", Number.NaN, 5)).rejects.toThrow(
      RangeError,
    );
    await expect(exportClip(mocks.canvas, "/dances/a.m4a", 0, Number.POSITIVE_INFINITY)).rejects.toThrow(
      RangeError,
    );
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("rejects with Error on blank audioUrl or missing browser capabilities", async () => {
    const mocks = installExportMocks();

    await expect(exportClip(mocks.canvas, "   ", 0, 5)).rejects.toThrow(/audioUrl/i);

    const badCanvas = {} as HTMLCanvasElement;
    await expect(exportClip(badCanvas, "/dances/a.m4a", 0, 5)).rejects.toThrow(/captureStream/i);

    stubGlobalProp("MediaRecorder", undefined);
    await expect(exportClip(mocks.canvas, "/dances/a.m4a", 0, 5)).rejects.toThrow(/MediaRecorder/i);

    installExportMocks();
    stubGlobalProp("AudioContext", undefined);
    stubGlobalProp("window", undefined);
    await expect(exportClip(mocks.canvas, "/dances/a.m4a", 0, 5)).rejects.toThrow(/AudioContext/i);
  });

  it("rejects when fetch fails with !response.ok without creating an AudioContext", async () => {
    const mocks = installExportMocks({
      fetchOk: false,
      fetchStatus: 404,
    });

    await expect(exportClip(mocks.canvas, "/dances/missing.m4a", 0, 5)).rejects.toThrow(
      /404.*\/dances\/missing\.m4a|\/dances\/missing\.m4a.*404/,
    );
    expect(mocks.audioContextsCreated).toHaveLength(0);
  });

  it("rejects when decodeAudioData fails and still closes AudioContext", async () => {
    const mocks = installExportMocks({
      decodeError: new Error("corrupt audio stream"),
    });

    await expect(exportClip(mocks.canvas, "/dances/bad.m4a", 0, 5)).rejects.toThrow(
      "corrupt audio stream",
    );
    expect(mocks.audioContextsCreated).toHaveLength(1);
    expect(mocks.audioContextsCreated[0].close).toHaveBeenCalledTimes(1);
  });

  it("rejects on MediaRecorder onerror and stops all tracks, source, and AudioContext", async () => {
    const mocks = installExportMocks({
      audioDurationSec: 20,
    });

    const promise = exportClip(mocks.canvas, "/dances/err.m4a", 1, 5);
    await flushMicrotasks();

    const recorder = mocks.recorders[0];
    const source = mocks.sources[0];
    recorder.emitError(new Error("encoder hardware failure"));

    await expect(promise).rejects.toThrow("encoder hardware failure");
    expect(source.onended).toBeNull();
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioContextsCreated[0].close).toHaveBeenCalledTimes(1);
  });

  it("rejects when recorder.onstop fires with zero recorded data chunks and cleans up", async () => {
    const mocks = installExportMocks({
      autoEmitChunkOnStop: true,
      chunkSize: 0,
      audioDurationSec: 20,
    });

    const promise = exportClip(mocks.canvas, "/dances/empty.m4a", 0, 5);
    await flushMicrotasks();

    mocks.sources[0].onended!();

    await expect(promise).rejects.toThrow("No media data was recorded.");
    expect(mocks.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioContextsCreated[0].close).toHaveBeenCalledTimes(1);
  });

  it("handles source.stop throwing and audioCtx.close rejecting during cleanup, and falls back to chunk/default MIME", async () => {
    const mocks = installExportMocks({
      supportedMimeTypes: [],
      recorderMimeType: "",
      chunkMimeType: "video/mp4",
      audioDurationSec: 20,
    });

    const promise = exportClip(mocks.canvas, "/dances/resilient.m4a", 0, 5);
    await flushMicrotasks();

    const source = mocks.sources[0];
    source.stop.mockImplementation(() => {
      throw new Error("InvalidStateError");
    });
    mocks.audioContextsCreated[0].close.mockRejectedValue(new Error("already closed"));

    source.onended!();

    const blob = await promise;
    expect(blob.type).toBe("video/mp4");
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("uses fallback error message when recorder.onerror has no event.error", async () => {
    const mocks = installExportMocks({
      audioDurationSec: 20,
    });

    const promise = exportClip(mocks.canvas, "/dances/noerr.m4a", 0, 5);
    await flushMicrotasks();

    mocks.recorders[0].onerror?.({} as Event);

    await expect(promise).rejects.toThrow("MediaRecorder failed during clip export.");
  });
});


it("starts the export frame after audio preparation and advances from the recording audio clock", async () => {
  const mocks = installExportMocks({ audioState: "suspended", currentTimeSec: 4 });
  const fillRect = vi.fn(() => { mocks.callOrder.push("draw"); });
  Object.assign(mocks.canvas, { getContext: () => ({
    fillRect,
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
  }) });
  stubGlobalProp("document", { createElement: () => mocks.canvas });
  const drawNext = vi.fn<(cb: FrameRequestCallback) => number>(() => 1);
  const cancel = vi.fn();
  stubGlobalProp("requestAnimationFrame", drawNext);
  stubGlobalProp("cancelAnimationFrame", cancel);

  const controller = new AbortController();
  const promise = exportHighlight([], "/dances/neon.m4a", 7, 2, controller.signal);
  expect(mocks.audioContextsCreated[0].resume).toHaveBeenCalled();
  expect(fillRect).not.toHaveBeenCalled();
  await flushMicrotasks();

  expect(mocks.callOrder).toEqual(["draw", "draw", "recorder.start", "source.start"]);
  expect(mocks.sources[0].start).toHaveBeenCalledWith(4, 7, 2);
  mocks.audioContextsCreated[0].currentTime = 4.5;
  drawNext.mock.calls[0][0](50_000);
  expect(fillRect).toHaveBeenCalledTimes(4);
  expect(drawNext).toHaveBeenCalledTimes(2);
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledWith(1);
  expect(mocks.videoTrack.stop).toHaveBeenCalledTimes(1);
  expect(mocks.audioTrack.stop).toHaveBeenCalledTimes(1);
});
