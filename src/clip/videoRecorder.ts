/**
 * Owner: Toufic
 * Purpose: Pause-aware video-only MediaRecorder wrapper and screen-space [0..1] overlay landmark recorder
 * FRs: FR-47, FR-49, NFR-04, NFR-05, NFR-11
 */

import { CONFIG, SCORED_LANDMARK_INDICES } from "../config";
import {
  songMs,
  type LandmarkPoint,
  type PoseFrame,
  type PoseRecorder,
  type RecordedPoseSample,
  type SongTimeMs,
} from "../types/pulse";

const VIDEO_BITS_PER_SECOND = 1_500_000;
const RECORDER_TIMESLICE_MS = 1000;

const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/webm",
  "video/mp4",
] as const;

export interface HighlightVideoResult {
  blob: Blob | null;
  startSongMs: number;
}

export interface HighlightVideoRecorder {
  start(): void;
  pause(): void;
  resume(): void;
  finish(): Promise<HighlightVideoResult>;
  discard(): void;
}

const NOOP_RECORDER: HighlightVideoRecorder = {
  start() {},
  pause() {},
  resume() {},
  finish: async () => ({ blob: null, startSongMs: 0 }),
  discard() {},
};

function safeSongMs(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Selects the best supported video-only MIME type for webcam highlight recording. */
export function selectVideoRecorderMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  for (const mime of VIDEO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return undefined;
}

function createMediaRecorderInstance(
  stream: MediaStream,
  mimeType: string | undefined,
): MediaRecorder | null {
  try {
    const options: MediaRecorderOptions = mimeType
      ? { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND }
      : { videoBitsPerSecond: VIDEO_BITS_PER_SECOND };
    return new MediaRecorder(stream, options);
  } catch {
    try {
      return new MediaRecorder(stream);
    } catch {
      return null;
    }
  }
}

/**
 * Records video-only tracks from `stream` into transient memory with pause/resume support.
 * Never stops caller-owned webcam tracks and degrades safely when MediaRecorder is unavailable.
 */
export function createHighlightVideoRecorder(
  stream: MediaStream,
  getSongTimeMs: () => SongTimeMs,
): HighlightVideoRecorder {
  const videoTracks =
    stream && typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
  if (videoTracks.length === 0 || typeof MediaRecorder === "undefined") {
    return NOOP_RECORDER;
  }

  const videoOnlyStream =
    typeof MediaStream === "function" ? new MediaStream(videoTracks) : stream;
  const selectedMimeType = selectVideoRecorderMimeType();
  const recorder = createMediaRecorderInstance(videoOnlyStream, selectedMimeType);
  if (!recorder) {
    return NOOP_RECORDER;
  }

  let chunks: Blob[] = [];
  let started = false;
  let finished = false;
  let discarded = false;
  let fallbackStartSongMs = 0;
  let startSongMs: number | null = null;
  let finishPromise: Promise<HighlightVideoResult> | null = null;
  let resolvePendingFinish: ((result: HighlightVideoResult) => void) | null = null;

  const detachHandlers = (): void => {
    recorder.ondataavailable = null;
    recorder.onstart = null;
    recorder.onstop = null;
    recorder.onerror = null;
  };

  const buildResultAndClear = (): HighlightVideoResult => {
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const resolvedMime =
      selectedMimeType || recorder.mimeType || chunks[0]?.type || "video/webm";
    const blob = totalBytes > 0 ? new Blob(chunks, { type: resolvedMime }) : null;
    const resolvedStartSongMs = startSongMs ?? fallbackStartSongMs;
    chunks = [];
    detachHandlers();
    return { blob, startSongMs: resolvedStartSongMs };
  };

  return {
    start(): void {
      if (started || discarded || finished) return;
      started = true;
      fallbackStartSongMs = safeSongMs(Number(getSongTimeMs()), 0);

      recorder.ondataavailable = (event: BlobEvent): void => {
        if (!discarded && event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstart = (): void => {
        if (!discarded) {
          startSongMs = safeSongMs(Number(getSongTimeMs()), fallbackStartSongMs);
        }
      };

      recorder.onerror = (): void => {
        discarded = true;
        chunks = [];
        detachHandlers();
        resolvePendingFinish?.({ blob: null, startSongMs: 0 });
      };

      try {
        recorder.start(RECORDER_TIMESLICE_MS);
      } catch {
        discarded = true;
        chunks = [];
        detachHandlers();
      }
    },

    pause(): void {
      if (discarded || finished || !started) return;
      if (recorder.state === "recording") {
        try {
          recorder.pause();
        } catch {
          // Ignore invalid state transitions from browser MediaRecorder.
        }
      }
    },

    resume(): void {
      if (discarded || finished || !started) return;
      if (recorder.state === "paused") {
        try {
          recorder.resume();
        } catch {
          // Ignore invalid state transitions from browser MediaRecorder.
        }
      }
    },

    finish(): Promise<HighlightVideoResult> {
      if (finishPromise) return finishPromise;
      if (discarded || !started) {
        finishPromise = Promise.resolve({ blob: null, startSongMs: 0 });
        return finishPromise;
      }

      finished = true;
      if (recorder.state === "inactive") {
        finishPromise = Promise.resolve(buildResultAndClear());
        return finishPromise;
      }

      finishPromise = new Promise<HighlightVideoResult>((resolve) => {
        let settled = false;
        const settle = (result: HighlightVideoResult): void => {
          if (settled) return;
          settled = true;
          resolvePendingFinish = null;
          resolve(result);
        };

        resolvePendingFinish = settle;

        recorder.onstop = (): void => {
          if (discarded) {
            chunks = [];
            detachHandlers();
            settle({ blob: null, startSongMs: 0 });
            return;
          }
          settle(buildResultAndClear());
        };

        recorder.onerror = (): void => {
          chunks = [];
          detachHandlers();
          settle({ blob: null, startSongMs: startSongMs ?? fallbackStartSongMs });
        };

        try {
          recorder.stop();
        } catch {
          chunks = [];
          detachHandlers();
          settle({ blob: null, startSongMs: startSongMs ?? fallbackStartSongMs });
        }
      });

      return finishPromise;
    },

    discard(): void {
      if (discarded) return;
      discarded = true;
      detachHandlers();
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Ignore errors when stopping an already-inactive recorder.
        }
      }
      chunks = [];
      resolvePendingFinish?.({ blob: null, startSongMs: 0 });
    },
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000 || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 || 0;
}

function quantizeScreenPoint(pt: LandmarkPoint | undefined): LandmarkPoint {
  if (
    !pt ||
    !Number.isFinite(pt.x) ||
    !Number.isFinite(pt.y) ||
    !Number.isFinite(pt.v) ||
    pt.v <= 0
  ) {
    return { x: 0, y: 0, v: 0 };
  }
  return {
    x: round3(pt.x),
    y: round3(pt.y),
    v: round2(Math.max(0, Math.min(1, pt.v))),
  };
}

/**
 * Records screen-space [0..1] mirrored PoseFrame.points at `fps` gated on monotonic SongTimeMs
 * so body landmarks overlay pixel-accurately onto the cropped user video.
 */
export function createOverlayLandmarkRecorder(fps: number = CONFIG.clipFps): PoseRecorder {
  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : CONFIG.clipFps;
  const minIntervalMs = 1000 / effectiveFps;

  let samples: RecordedPoseSample[] = [];
  let lastRecordedTSongMs: number | null = null;

  return {
    push(frame: PoseFrame, tSongMs: SongTimeMs): void {
      const tMs = Number(tSongMs);
      if (!Number.isFinite(tMs)) {
        return;
      }
      if (lastRecordedTSongMs !== null && tMs - lastRecordedTSongMs < minIntervalMs - 1e-6) {
        return;
      }
      lastRecordedTSongMs = tMs;
      samples.push({
        tSongMs: songMs(Math.round(tMs)),
        points: SCORED_LANDMARK_INDICES.map((_, i) => quantizeScreenPoint(frame.points[i])),
      });
    },

    getSamples(): RecordedPoseSample[] {
      return [...samples];
    },

    clear(): void {
      samples = [];
      lastRecordedTSongMs = null;
    },
  };
}
