/**
 * Owner: Zaid
 * Purpose: Web Audio song player: AudioContext.currentTime is the master clock; frame time -> heard song time
 * FRs: FR-24, FR-25
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * heardSongTimeMs: use audioCtx.getOutputTimestamp() + CONFIG.camDelaySec; fallback currentTime - baseLatency - outputLatency.
 */

import { CONFIG } from "../config";
import { songMs, type Dance, type PerfTimeMs, type SongPlayer, type SongTimeMs } from "../types/pulse";

type PlayerState = "idle" | "ready" | "playing" | "paused" | "ended";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function createSongPlayer(): SongPlayer {
  let state: PlayerState = "idle";
  let ctx: AudioContext | null = null;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let offsetSec = 0;
  let startCtxTimeSec = 0;
  let playToken = 0;
  let loadToken = 0;
  const endListeners = new Set<() => void>();

  const ensureContext = (): AudioContext => {
    if (ctx !== null) {
      return ctx;
    }
    if (typeof globalThis.AudioContext !== "function") {
      throw new Error("Web Audio API AudioContext is unavailable in this environment.");
    }
    ctx = new globalThis.AudioContext();
    return ctx;
  };

  const teardownSource = (): void => {
    playToken += 1;
    if (source !== null) {
      const activeNode = source;
      source = null;
      activeNode.onended = null;
      try {
        activeNode.stop();
      } catch {
        // Ignore if source already finished
      }
      try {
        activeNode.disconnect();
      } catch {
        // Ignore if source already disconnected
      }
    }
  };

  const notifyEnd = (): void => {
    for (const cb of [...endListeners]) {
      cb();
    }
  };

  const startFromOffset = (offset: number, whenNow = false): void => {
    if (!buffer) {
      throw new Error("Song audio is not loaded. Call await player.load(dance) first.");
    }

    const activeBuffer = buffer;
    const audioCtx = ensureContext();
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => undefined);
    }

    teardownSource();

    const durationSec = Math.max(0, activeBuffer.duration);
    const clampedOffset = clamp(offset, 0, durationSec);
    if (clampedOffset >= durationSec) {
      offsetSec = durationSec;
      state = "ended";
      notifyEnd();
      return;
    }

    const node = audioCtx.createBufferSource();
    node.buffer = activeBuffer;
    node.connect(audioCtx.destination);

    const token = ++playToken;
    node.onended = () => {
      if (token !== playToken || state !== "playing") return;
      source = null;
      offsetSec = durationSec;
      state = "ended";
      notifyEnd();
    };

    const now = audioCtx.currentTime;
    offsetSec = clampedOffset;
    startCtxTimeSec = now - clampedOffset;
    source = node;
    state = "playing";
    node.start(whenNow ? now : 0, clampedOffset);
  };

  const computeHeardContextTimeSec = (audioCtx: AudioContext, tFrameMs: PerfTimeMs): number => {
    if (typeof audioCtx.getOutputTimestamp === "function") {
      const ts = audioCtx.getOutputTimestamp();
      if (
        ts &&
        typeof ts.contextTime === "number" &&
        Number.isFinite(ts.contextTime) &&
        ts.contextTime > 0 &&
        typeof ts.performanceTime === "number" &&
        Number.isFinite(ts.performanceTime) &&
        ts.performanceTime > 0
      ) {
        return ts.contextTime + (Number(tFrameMs) - ts.performanceTime) / 1000;
      }
    }

    const baseLatency =
      typeof audioCtx.baseLatency === "number" && Number.isFinite(audioCtx.baseLatency)
        ? audioCtx.baseLatency
        : 0;
    const outputLatency =
      typeof audioCtx.outputLatency === "number" && Number.isFinite(audioCtx.outputLatency)
        ? audioCtx.outputLatency
        : 0;
    return audioCtx.currentTime - baseLatency - outputLatency;
  };

  return {
    async load(dance: Dance): Promise<void> {
      const myLoadToken = ++loadToken;
      teardownSource();
      offsetSec = 0;
      startCtxTimeSec = 0;
      buffer = null;
      state = "idle";

      const url = dance.audioUrl;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load audio from ${url}: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const decoded = await ensureContext().decodeAudioData(arrayBuffer);
      if (myLoadToken !== loadToken) {
        return;
      }

      buffer = decoded;
      offsetSec = 0;
      startCtxTimeSec = 0;
      state = "ready";
    },

    start(): void {
      startFromOffset(0);
    },

    pause(): void {
      if (state !== "playing" || !ctx || !buffer) {
        return;
      }
      offsetSec = clamp(ctx.currentTime - startCtxTimeSec, 0, Math.max(0, buffer.duration));
      state = "paused";
      teardownSource();
    },

    resume(): void {
      if (state !== "paused" || !buffer) {
        return;
      }
      startFromOffset(offsetSec);
    },

    seek(offsetMs: SongTimeMs): void {
      if (!buffer || state === "idle" || !Number.isFinite(offsetMs)) {
        return;
      }
      const durationSec = Math.max(0, buffer.duration);
      const targetSec = clamp(offsetMs / 1000, 0, durationSec);
      if (state === "playing") {
        startFromOffset(targetSec, true);
        return;
      }
      teardownSource();
      offsetSec = targetSec;
      if (state === "ready" || (state === "ended" && targetSec < durationSec)) {
        state = "paused";
      }
    },

    songTimeMs(): SongTimeMs {
      if (!buffer || state === "idle") {
        return songMs(0);
      }
      const durationSec = Math.max(0, buffer.duration);
      if (state === "ended") {
        return songMs(durationSec * 1000);
      }
      if (state === "paused" || state === "ready") {
        return songMs(clamp(offsetSec, 0, durationSec) * 1000);
      }
      if (state === "playing" && ctx) {
        const elapsedSec = clamp(ctx.currentTime - startCtxTimeSec, 0, durationSec);
        return songMs(elapsedSec * 1000);
      }
      return songMs(0);
    },

    heardSongTimeMs(tFrameMs: PerfTimeMs): SongTimeMs {
      if (!buffer || state === "idle") {
        return songMs(0);
      }
      const durationSec = Math.max(0, buffer.duration);
      if (state === "ended") {
        return songMs(durationSec * 1000);
      }
      if (state === "paused" || state === "ready") {
        return songMs(clamp(offsetSec, 0, durationSec) * 1000);
      }
      if (state === "playing" && ctx) {
        const heardCtxTimeSec = computeHeardContextTimeSec(ctx, tFrameMs);
        // Subtract camera + detection latency so camera frame matches the beat the dancer heard
        const tSongSec = heardCtxTimeSec - CONFIG.camDelaySec - startCtxTimeSec;
        return songMs(clamp(tSongSec, 0, durationSec) * 1000);
      }
      return songMs(0);
    },

    onEnd(cb: () => void): void {
      endListeners.add(cb);
    },
  };
}
