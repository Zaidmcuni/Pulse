/**
 * Owner: Zaid
 * Purpose: Unit tests for Web Audio master clock and heardSongTimeMs (FR-24, FR-25, FR-34, NFR-11)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../config";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { perfMs, type Dance } from "../types/pulse";
import { createSongPlayer } from "./songPlayer";

interface MockSourceNode {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  finishNaturally: () => void;
}

interface MockAudioContextHandle {
  currentTime: number;
  baseLatency: number;
  outputLatency: number;
  state: AudioContextState;
  destination: AudioDestinationNode;
  outputTimestamp: { contextTime: number; performanceTime: number };
  disableOutputTimestamp: boolean;
  sources: MockSourceNode[];
  resumeSpy: ReturnType<typeof vi.fn>;
  decodeSpy: ReturnType<typeof vi.fn>;
  resetDurationSec: number;
}

function installWebAudioMocks(durationSec = 180): {
  ctxHandle: MockAudioContextHandle;
  fetchMock: ReturnType<typeof vi.fn>;
} {
  const ctxHandle: MockAudioContextHandle = {
    currentTime: 0,
    baseLatency: 0.01,
    outputLatency: 0.02,
    state: "running",
    destination: {} as AudioDestinationNode,
    outputTimestamp: { contextTime: 0, performanceTime: 0 },
    disableOutputTimestamp: false,
    sources: [],
    resumeSpy: vi.fn(async () => {
      ctxHandle.state = "running";
    }),
    decodeSpy: vi.fn(async () => ({ duration: ctxHandle.resetDurationSec }) as AudioBuffer),
    resetDurationSec: durationSec,
  };

  class MockAudioContext {
    get currentTime(): number {
      return ctxHandle.currentTime;
    }
    get baseLatency(): number {
      return ctxHandle.baseLatency;
    }
    get outputLatency(): number {
      return ctxHandle.outputLatency;
    }
    get state(): AudioContextState {
      return ctxHandle.state;
    }
    get destination(): AudioDestinationNode {
      return ctxHandle.destination;
    }
    resume = ctxHandle.resumeSpy;
    decodeAudioData = ctxHandle.decodeSpy;

    getOutputTimestamp(): AudioTimestamp {
      if (ctxHandle.disableOutputTimestamp) {
        return undefined as unknown as AudioTimestamp;
      }
      return { ...ctxHandle.outputTimestamp };
    }

    createBufferSource(): AudioBufferSourceNode {
      const node: MockSourceNode = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(() => {
          // Real Web Audio fires onended on stop() unless detached beforehand
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
      ctxHandle.sources.push(node);
      return node as unknown as AudioBufferSourceNode;
    }
  }

  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    writable: true,
    value: MockAudioContext,
  });

  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(16),
  }));

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });

  return { ctxHandle, fetchMock };
}

describe("createSongPlayer", () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
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
  });

  it("loads and decodes local audioUrl, starts at 0, and surfaces HTTP errors", async () => {
    const { fetchMock } = installWebAudioMocks(180);
    const player = createSongPlayer();

    await player.load(FAKE_DANCE);
    expect(fetchMock).toHaveBeenCalledWith(FAKE_DANCE.audioUrl);
    expect(Number(player.songTimeMs())).toBe(0);
    expect(Number(player.heardSongTimeMs(perfMs(500)))).toBe(0);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(player.load(FAKE_DANCE)).rejects.toThrow(/404/);
  });

  it("tracks AudioContext.currentTime across a 3-minute song without drift and clamps at duration", async () => {
    const { ctxHandle } = installWebAudioMocks(180);
    const player = createSongPlayer();
    await player.load(FAKE_DANCE);

    ctxHandle.currentTime = 12.5;
    player.start();
    expect(Number(player.songTimeMs())).toBe(0);

    ctxHandle.currentTime = 102.5; // +90 s
    expect(Number(player.songTimeMs())).toBeCloseTo(90_000, 6);

    ctxHandle.currentTime = 192.5; // +180 s
    expect(Number(player.songTimeMs())).toBeCloseTo(180_000, 6);

    ctxHandle.currentTime = 220; // past end
    expect(Number(player.songTimeMs())).toBeCloseTo(180_000, 6);
  });

  it("keeps exact continuity across pause/resume without firing onEnd", async () => {
    const { ctxHandle } = installWebAudioMocks(180);
    const player = createSongPlayer();
    const endSpy = vi.fn();
    player.onEnd(endSpy);

    await player.load(FAKE_DANCE);

    ctxHandle.currentTime = 10;
    player.start();

    ctxHandle.currentTime = 25; // 15 s elapsed
    player.pause();
    expect(endSpy).not.toHaveBeenCalled();

    // Advance context clock 45 s while paused; song time must stay frozen at 15,000 ms
    ctxHandle.currentTime = 70;
    expect(Number(player.songTimeMs())).toBeCloseTo(15_000, 6);
    expect(Number(player.heardSongTimeMs(perfMs(9999)))).toBeCloseTo(15_000, 6);

    player.resume();
    expect(ctxHandle.sources).toHaveLength(2);
    expect(ctxHandle.sources[1].start).toHaveBeenCalledWith(0, 15);

    ctxHandle.currentTime = 75; // +5 s after resume -> 20,000 ms total
    expect(Number(player.songTimeMs())).toBeCloseTo(20_000, 6);
    expect(endSpy).not.toHaveBeenCalled();
  });

  it("computes heardSongTimeMs via getOutputTimestamp() subtracting CONFIG.camDelaySec (FR-25)", async () => {
    const { ctxHandle } = installWebAudioMocks(180);
    const player = createSongPlayer();
    await player.load(FAKE_DANCE);

    ctxHandle.currentTime = 10.0; // startCtxTimeSec = 10.0
    player.start();

    ctxHandle.outputTimestamp = { contextTime: 20.5, performanceTime: 5000 };
    const heardMs = Number(player.heardSongTimeMs(perfMs(5020)));
    const expectedMs = (20.5 + (5020 - 5000) / 1000 - CONFIG.camDelaySec - 10.0) * 1000;
    expect(heardMs).toBeCloseTo(expectedMs, 6);
    expect(heardMs).toBeCloseTo(10_475, 6);
  });

  it("falls back to currentTime - baseLatency - outputLatency when getOutputTimestamp is 0 or unavailable", async () => {
    const { ctxHandle } = installWebAudioMocks(180);
    const player = createSongPlayer();
    await player.load(FAKE_DANCE);

    ctxHandle.currentTime = 10.0;
    player.start();

    // Case 1: cold start contextTime === 0
    ctxHandle.currentTime = 15.0;
    ctxHandle.baseLatency = 0.012;
    ctxHandle.outputLatency = 0.028;
    ctxHandle.outputTimestamp = { contextTime: 0, performanceTime: 0 };

    const expectedFallbackMs = (15.0 - 0.012 - 0.028 - CONFIG.camDelaySec - 10.0) * 1000;
    expect(Number(player.heardSongTimeMs(perfMs(1234)))).toBeCloseTo(expectedFallbackMs, 6);

    // Case 2: getOutputTimestamp returns undefined
    ctxHandle.disableOutputTimestamp = true;
    expect(Number(player.heardSongTimeMs(perfMs(1234)))).toBeCloseTo(expectedFallbackMs, 6);

    // Case 3: getOutputTimestamp method completely absent on AudioContext
    const SavedAudioContext = globalThis.AudioContext;
    class NoTimestampAudioContext extends SavedAudioContext {
      declare getOutputTimestamp: never;
    }
    Object.defineProperty(NoTimestampAudioContext.prototype, "getOutputTimestamp", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      writable: true,
      value: NoTimestampAudioContext,
    });

    const playerNoTs = createSongPlayer();
    await playerNoTs.load(FAKE_DANCE);
    ctxHandle.currentTime = 10.0;
    playerNoTs.start();
    ctxHandle.currentTime = 15.0;
    expect(Number(playerNoTs.heardSongTimeMs(perfMs(1234)))).toBeCloseTo(expectedFallbackMs, 6);
  });

  it("clamps heardSongTimeMs to [0, durationMs] during early camera frames and past song end", async () => {
    const { ctxHandle } = installWebAudioMocks(20);
    const player = createSongPlayer();
    await player.load(FAKE_DANCE);

    ctxHandle.currentTime = 10.0;
    player.start();

    // Frame only 20 ms after start -> subtracting 45 ms camDelay would be negative; clamps to 0
    ctxHandle.outputTimestamp = { contextTime: 10.02, performanceTime: 1000 };
    expect(Number(player.heardSongTimeMs(perfMs(1000)))).toBe(0);

    // Frame past 20 s end -> clamps to 20,000 ms
    ctxHandle.outputTimestamp = { contextTime: 35.0, performanceTime: 2000 };
    expect(Number(player.heardSongTimeMs(perfMs(2000)))).toBe(20_000);
  });

  it("fires onEnd once on natural completion and supports clean back-to-back replays (NFR-11)", async () => {
    const { ctxHandle } = installWebAudioMocks(20);
    const player = createSongPlayer();
    const endSpy = vi.fn();
    player.onEnd(endSpy);

    await player.load(FAKE_DANCE);
    ctxHandle.currentTime = 5;
    player.start();

    ctxHandle.sources[0].finishNaturally();
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(Number(player.songTimeMs())).toBe(20_000);

    // Second run with another dance on the same player instance
    const dance2: Dance = { ...FAKE_DANCE, id: "dance-2", audioUrl: "/dances/dance-2.m4a" };
    ctxHandle.resetDurationSec = 45;
    await player.load(dance2);
    expect(Number(player.songTimeMs())).toBe(0);

    ctxHandle.currentTime = 100;
    player.start();
    ctxHandle.currentTime = 112;
    expect(Number(player.songTimeMs())).toBeCloseTo(12_000, 6);

    ctxHandle.sources[1].finishNaturally();
    expect(endSpy).toHaveBeenCalledTimes(2);
    expect(Number(player.songTimeMs())).toBe(45_000);
  });

  it("resumes a suspended AudioContext on start() and resume()", async () => {
    const { ctxHandle } = installWebAudioMocks(60);
    const player = createSongPlayer();
    await player.load(FAKE_DANCE);

    ctxHandle.state = "suspended";
    ctxHandle.currentTime = 0;
    player.start();
    expect(ctxHandle.resumeSpy).toHaveBeenCalledTimes(1);

    ctxHandle.currentTime = 5;
    player.pause();
    ctxHandle.state = "suspended";
    player.resume();
    expect(ctxHandle.resumeSpy).toHaveBeenCalledTimes(2);
  });
});
