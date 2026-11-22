/**
 * Owner: Toufic
 * Purpose: logic behind the /dev/extract tool, kept out of the React screen so it can be tested:
 * form checks, beat grid, frame collection, Dance assembly + parseDance, and one extraction run's lifecycle.
 * FRs: FR-13, FR-14, FR-15
 * Time: every exported time is SongTimeMs = source video time (raw.mediaTimeSec * 1000). The matching
 * audio must be extracted from the same file and verified to share its time origin.
 * Boundary policy (proposed, pending team confirmation): beats and frames live in [0, durationMs);
 * a negative first-beat offset is rejected.
 */

import { parseDance, assertRawPoseLandmarks } from "../../contracts/validators";
import { startFakePose } from "../../mocks/fakePoseStream";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";
import { extractSegments } from "../../vision/segments";
import {
  songMs,
  type Dance,
  type Difficulty,
  type LandmarkPoint,
  type RawPoseLandmarks,
  type SongTimeMs,
  type TemplateFrame,
} from "../../types/pulse";

// ---------- Form ----------

/** Raw text from the page inputs. */
export interface ExtractForm {
  id: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  genre: string;
  difficulty: string;
  bpm: string;
  firstBeatOffsetMs: string;
  popularity: string;
}

export interface ExtractMeta {
  id: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  genre: string;
  difficulty: Difficulty;
  bpm: number;
  firstBeatOffsetMs: number;
  popularity: number;
}

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
// Safe as a file name and a URL path segment without encoding: no separators, dots, spaces or "..".
// Stricter slug rules and duplicate handling are still to be confirmed with Ali.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function requiredText(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function requiredNumber(label: string, value: string): number {
  const n = Number(requiredText(label, value));
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  return n;
}

/** Throws an Error with a readable message for the first invalid field. */
export function parseExtractForm(form: ExtractForm): ExtractMeta {
  const id = requiredText("Dance ID", form.id);
  if (!SAFE_ID.test(id)) {
    throw new Error("Dance ID may only use letters, digits, - and _, and must start with a letter or digit.");
  }
  const title = requiredText("Title", form.title);
  const artist = form.artist?.trim();
  const coverUrl = form.coverUrl?.trim();
  if (coverUrl && (/^https?:\/\//i.test(coverUrl) || coverUrl.startsWith("//"))) {
    throw new Error("Cover art path must be a local asset path (for example /dances/my-song.jpg), not an external URL.");
  }
  const genre = requiredText("Genre", form.genre);
  const difficulty = form.difficulty as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) throw new Error("Difficulty must be easy, medium or hard.");
  const bpm = requiredNumber("BPM", form.bpm);
  if (bpm <= 0) throw new Error("BPM must be greater than 0.");
  const firstBeatOffsetMs = requiredNumber("First-beat offset", form.firstBeatOffsetMs);
  if (firstBeatOffsetMs < 0) throw new Error("First-beat offset must be 0 or more.");
  const popularity = requiredNumber("Popularity", form.popularity);
  if (popularity < 0) throw new Error("Popularity must be 0 or more.");
  return {
    id,
    title,
    ...(artist ? { artist } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    genre,
    difficulty,
    bpm,
    firstBeatOffsetMs,
    popularity,
  };
}

// ---------- Beats (FR-14) ----------

/** Beat i = firstBeatOffsetMs + i * (60000 / bpm), for every beat inside [0, durationMs). */
export function computeBeats(bpm: number, firstBeatOffsetMs: number, durationMs: number): SongTimeMs[] {
  const beatIntervalMs = 60_000 / bpm;
  if (!Number.isFinite(beatIntervalMs) || beatIntervalMs <= 0) throw new Error("BPM gives an invalid beat interval.");
  // Temporary resource guard pending a team-approved limit in CONFIG.
  if (beatIntervalMs < 1) throw new Error("BPM is too high (more than one beat per millisecond).");
  if (!Number.isFinite(firstBeatOffsetMs) || firstBeatOffsetMs < 0) throw new Error("First-beat offset must be 0 or more.");
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Video duration is invalid.");
  if (firstBeatOffsetMs >= durationMs) throw new Error("First-beat offset is past the end of the video.");

  const beats: SongTimeMs[] = [];
  for (let i = 0; ; i++) {
    const t = firstBeatOffsetMs + i * beatIntervalMs;
    if (!Number.isFinite(t)) throw new Error("Beat times overflowed.");
    if (t >= durationMs) break;
    if (beats.length > 0 && t <= beats[beats.length - 1]) throw new Error("Beat times are not increasing (BPM too high for this offset).");
    beats.push(songMs(t));
  }
  return beats;
}

// ---------- Frames (FR-13) ----------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000 || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 || 0;
}

function quantizeLandmarks(landmarks: readonly LandmarkPoint[]): LandmarkPoint[] {
  return landmarks.map((pt) => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.v) || pt.v <= 0) {
      return { x: 0, y: 0, v: 0 };
    }
    return {
      x: round3(pt.x),
      y: round3(pt.y),
      v: round2(clamp01(pt.v)),
    };
  });
}

export interface FrameCollector {
  /** Throws on a malformed engine frame. Silently drops out-of-range, repeated or backward times. */
  push(raw: RawPoseLandmarks): void;
  frames(): TemplateFrame[];
  aspectRatio?(): number | undefined;
}

/** Keeps time, unmirrored standing segment directions, and quantized 12 landmarks; raw video frames are never retained. */
export function createFrameCollector(durationMs: number): FrameCollector {
  const frames: TemplateFrame[] = [];
  let capturedAspectRatio: number | undefined;
  return {
    push(raw) {
      assertRawPoseLandmarks(raw);
      if (!Number.isFinite(raw.width) || !Number.isFinite(raw.height)) {
        throw new Error("[contract] RawPoseLandmarks: width/height must be finite");
      }
      const t = raw.mediaTimeSec * 1000;
      if (!Number.isFinite(t) || t < 0 || t >= durationMs) return;
      const last = frames[frames.length - 1];
      if (last && t <= last.tMs) return;
      capturedAspectRatio = round3(raw.width / raw.height);
      frames.push({
        tMs: songMs(t),
        segments: extractSegments(raw.landmarks, raw.width, raw.height, { mirror: false, mode: "standing" }),
        landmarks: quantizeLandmarks(raw.landmarks),
      });
    },
    frames: () => frames,
    aspectRatio: () => capturedAspectRatio,
  };
}

// ---------- Dance (FR-13 to FR-15) ----------

export interface BuiltDance {
  dance: Dance;
  json: string;
}

/** Builds the shared Dance, validates it with parseDance and serializes the validated value. */
export function buildDance(
  meta: ExtractMeta,
  durationSec: number,
  frames: TemplateFrame[],
  aspectRatio?: number,
): BuiltDance {
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("Video duration is invalid.");
  if (frames.length === 0) throw new Error("No pose frames were captured. Try another video.");
  if (frames.every((f) => Object.keys(f.segments).length === 0)) {
    throw new Error("The dancer was never detected clearly. Try a clean, front-facing solo video.");
  }
  const artist = meta.artist?.trim();
  const coverUrl = meta.coverUrl?.trim();
  const candidate: Dance = {
    id: meta.id,
    title: meta.title,
    ...(artist ? { artist } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    genre: meta.genre,
    difficulty: meta.difficulty,
    lengthSec: durationSec,
    bpm: meta.bpm,
    beatsMs: computeBeats(meta.bpm, meta.firstBeatOffsetMs, durationSec * 1000),
    popularity: meta.popularity,
    audioUrl: `/dances/${meta.id}.m4a`,
    ...(aspectRatio !== undefined && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? { aspectRatio: round3(aspectRatio) }
      : {}),
    frames,
  };
  const dance = parseDance(candidate);
  return { dance, json: JSON.stringify(dance) };
}

// ---------- One extraction run ----------

export interface PoseSource {
  mock: boolean;
  init(): Promise<void>;
  start(video: HTMLVideoElement, onRawFrame: (raw: RawPoseLandmarks) => void): () => void;
}

export const REAL_POSE_SOURCE: PoseSource = { mock: false, init: initPoseLandmarker, start: startPose };
/** Development only: emits the static GOLDEN_RAW pose on wall-clock time and ignores the video. */
export const MOCK_POSE_SOURCE: PoseSource = { mock: true, init: () => Promise.resolve(), start: startFakePose };

export interface RunCallbacks {
  onStatus(message: string): void;
  onProgress(frameCount: number, tMs: number, durationMs: number): void;
  onDone(result: BuiltDance): void;
  onError(message: string): void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Plays `file` muted from t = 0 in `video`, collects pose frames until the media ends, then builds the Dance.
 * Returns cancel(). After cancel, error or completion no callback fires again and every resource
 * (pose loop, listeners, media source, object URL) is released.
 */
export function startExtractionRun(
  video: HTMLVideoElement, file: Blob, meta: ExtractMeta, source: PoseSource, cb: RunCallbacks,
): () => void {
  let active = true;
  let stopPose: (() => void) | null = null;
  let collector: FrameCollector | null = null;
  let durationSec = 0;
  let sourceAspectRatio: number | undefined;
  let metadataSeen = false;
  const url = URL.createObjectURL(file);

  const close = (): boolean => {
    if (!active) return false;
    active = false;
    video.removeEventListener("loadedmetadata", onMetadata);
    video.removeEventListener("error", onMediaError);
    video.removeEventListener("ended", onEnded);
    stopPose?.();
    stopPose = null;
    if (video.src === url) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    URL.revokeObjectURL(url);
    return true;
  };

  const fail = (message: string): void => {
    if (close()) cb.onError(message);
  };

  const onRawFrame = (raw: RawPoseLandmarks): void => {
    if (!active || !collector) return;
    const previousCount = collector.frames().length;
    try {
      collector.push(raw);
    } catch (err) {
      fail(`Pose engine sent a malformed frame: ${messageOf(err)}`);
      return;
    }
    const frames = collector.frames();
    const last = frames[frames.length - 1];
    if (frames.length > previousCount) cb.onProgress(frames.length, last.tMs, durationSec * 1000);
  };

  function onMetadata(): void {
    if (!active || metadataSeen || video.src !== url) return;
    metadataSeen = true;
    void preparePlayback().catch((err: unknown) => fail(`Could not prepare extraction: ${messageOf(err)}`));
  }

  async function preparePlayback(): Promise<void> {
    durationSec = video.duration;
    if (!Number.isFinite(durationSec * 1000) || durationSec <= 0) return fail("This video has no usable duration. Try another file.");
    if (!(Number.isFinite(video.videoWidth) && video.videoWidth > 0 && Number.isFinite(video.videoHeight) && video.videoHeight > 0)) {
      return fail("This video has no usable picture size. Try another file.");
    }
    sourceAspectRatio = video.videoWidth / video.videoHeight;
    collector = createFrameCollector(durationSec * 1000);

    cb.onStatus(source.mock ? "Starting fixture poses (mock)…" : "Loading pose model…");
    if (!active) return;
    try {
      await source.init();
    } catch (err) {
      return fail(`Pose model failed to load: ${messageOf(err)}`);
    }
    if (!active) return;

    let stop: () => void;
    try {
      stop = source.start(video, onRawFrame);
    } catch (err) {
      return fail(`Pose tracking failed to start: ${messageOf(err)}`);
    }
    if (!active) {
      stop();
      return;
    }
    stopPose = stop;

    cb.onStatus(source.mock ? "Extracting with fixture poses (mock)…" : "Extracting poses…");
    if (!active) return;
    try {
      return video.play().catch((err: unknown) => fail(`Video playback failed: ${messageOf(err)}`));
    } catch (err) {
      fail(`Video playback failed: ${messageOf(err)}`);
    }
  }

  function onMediaError(): void {
    if (video.src !== url || !video.error) return;
    fail(`This video could not be played${video.error.message ? ` (${video.error.message})` : ""}. Try another file.`);
  }

  function onEnded(): void {
    if (!collector || video.src !== url || !video.ended || !close()) return;
    let result: BuiltDance;
    try {
      result = buildDance(meta, durationSec, collector.frames(), sourceAspectRatio ?? collector.aspectRatio?.());
    } catch (err) {
      cb.onError(messageOf(err));
      return;
    }
    cb.onDone(result);
  }

  video.addEventListener("loadedmetadata", onMetadata);
  video.addEventListener("error", onMediaError);
  video.addEventListener("ended", onEnded);
  video.muted = true;
  video.loop = false;
  video.src = url;
  if (video.readyState >= 1) onMetadata();

  return () => { close(); };
}
