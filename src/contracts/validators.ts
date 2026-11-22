/**
 * Owner: Shared (Step 0)
 * Purpose: runtime checks for every hand-off between modules. Each throws an Error naming the exact problem.
 * Rules: every module's unit tests run its outputs through the matching validator;
 * store.init() parses every dance file with parseDance(); the extract tool validates before downloading.
 */
import { CONFIG, MODE_SEGMENTS } from "../config";
import {
  songMs,
  type Dance, type FeedPost, type LandmarkPoint, type PosturalMode, type PoseFrame,
  type RawPoseLandmarks, type SegmentId, type SegmentMap, type SessionResult, type Vec2,
} from "../types/pulse";

const EPS = 1e-6;
const ALL_SEGMENTS = MODE_SEGMENTS.standing;

function fail(where: string, msg: string): never {
  throw new Error(`[contract] ${where}: ${msg}`);
}

export function assertUnitVec(v: Vec2, where: string): void {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) fail(where, "not a finite [x, y]");
  const len = Math.hypot(v[0], v[1]);
  if (Math.abs(len - 1) > EPS) fail(where, `length ${len}, expected 1`);
}

export function assertSegmentMap(m: SegmentMap, allowed: readonly SegmentId[], where: string): void {
  for (const [k, v] of Object.entries(m)) {
    if (!allowed.includes(k as SegmentId)) fail(where, `segment "${k}" not allowed here`);
    if (v === null || v === undefined) fail(where, `segment "${k}" is ${v}; omit the key instead`);
    assertUnitVec(v as Vec2, `${where}.${k}`);
  }
}

export function assertLandmarks(points: LandmarkPoint[], where: string): void {
  if (!Array.isArray(points) || points.length !== 12) fail(where, `expected 12 landmarks, got ${points?.length}`);
  points.forEach((p, i) => {
    if (![p.x, p.y, p.v].every(Number.isFinite)) fail(where, `landmark ${i} has non-finite values`);
    if (p.v < 0 || p.v > 1) fail(where, `landmark ${i} visibility ${p.v} outside 0..1`);
  });
}

export function assertRawPoseLandmarks(raw: RawPoseLandmarks): void {
  const w = "RawPoseLandmarks";
  if (!Number.isFinite(raw.tFrameMs)) fail(w, "tFrameMs not finite");
  if (!Number.isFinite(raw.mediaTimeSec)) fail(w, "mediaTimeSec not finite");
  if (!(raw.width > 0 && raw.height > 0)) fail(w, "width/height must be > 0");
  assertLandmarks(raw.landmarks, w);
}

export function assertPoseFrame(f: PoseFrame, mode: PosturalMode): void {
  const w = `PoseFrame(${mode})`;
  if (!Number.isFinite(f.tFrameMs)) fail(w, "tFrameMs not finite");
  const allowed = MODE_SEGMENTS[mode];
  assertSegmentMap(f.segments, allowed, w);
  const expectedRatio = Object.keys(f.segments).length / allowed.length;
  if (Math.abs(f.usableRatio - expectedRatio) > EPS) fail(w, `usableRatio ${f.usableRatio}, expected ${expectedRatio}`);
  const expectedTracking = f.usableRatio < CONFIG.uncertainUsableRatio ? "uncertain" : "ok";
  if (f.tracking !== expectedTracking) fail(w, `tracking "${f.tracking}", expected "${expectedTracking}"`);
  assertLandmarks(f.points, w);
}

/** Parses untrusted JSON (dance files) into a Dance, or throws. */
export function parseDance(json: unknown): Dance {
  const w = "Dance";
  const d = json as Dance;
  if (!d || typeof d !== "object") fail(w, "not an object");
  for (const k of ["id", "title", "genre", "audioUrl"] as const) if (typeof d[k] !== "string" || !d[k]) fail(w, `${k} missing`);
  if (!["easy", "medium", "hard"].includes(d.difficulty)) fail(w, `difficulty "${d.difficulty}"`);
  for (const k of ["lengthSec", "bpm", "popularity"] as const) if (!Number.isFinite(d[k]) || d[k] < 0) fail(w, `${k} invalid`);
  if (d.aspectRatio !== undefined && (typeof d.aspectRatio !== "number" || !Number.isFinite(d.aspectRatio) || d.aspectRatio <= 0)) {
    fail(w, "aspectRatio invalid");
  }
  if (!Array.isArray(d.beatsMs) || d.beatsMs.length === 0) fail(w, "beatsMs empty");
  d.beatsMs.forEach((b, i) => { if (!Number.isFinite(b) || (i > 0 && b <= d.beatsMs[i - 1])) fail(w, `beatsMs[${i}] not increasing`); });
  if (!Array.isArray(d.frames) || d.frames.length === 0) fail(w, "frames empty");
  d.frames.forEach((fr, i) => {
    if (!Number.isFinite(fr.tMs) || (i > 0 && fr.tMs <= d.frames[i - 1].tMs)) fail(w, `frames[${i}].tMs not increasing`);
    assertSegmentMap(fr.segments, ALL_SEGMENTS, `${w}.frames[${i}]`);
    if (fr.landmarks !== undefined) {
      assertLandmarks(fr.landmarks, `${w}.frames[${i}].landmarks`);
    }
  });
  const parsed: Dance = {
    ...d,
    beatsMs: d.beatsMs.map(songMs),
    frames: d.frames.map((fr) =>
      fr.landmarks !== undefined
        ? { tMs: songMs(fr.tMs), segments: fr.segments, landmarks: fr.landmarks.map((p) => ({ x: p.x, y: p.y, v: p.v })) }
        : { tMs: songMs(fr.tMs), segments: fr.segments },
    ),
  };
  if (d.aspectRatio === undefined) {
    delete parsed.aspectRatio;
  }
  return parsed;
}

export function assertSessionResult(r: SessionResult): void {
  const w = "SessionResult";
  if (!r.id || !r.playerId || !r.danceId) fail(w, "ids missing");
  if (r.accuracyPct < 0 || r.accuracyPct > 100) fail(w, "accuracyPct outside 0..100");
  if (!r.completed && r.totalPoints !== 0) fail(w, "quit-early result must have totalPoints 0");
  if (!Array.isArray(r.samples)) fail(w, "samples missing");
}

const POST_KEYS = ["id", "authorId", "resultId", "showCalories", "hasClip", "groupIds", "kudosBy", "createdAtIso"];
/** Privacy: a post may only carry these keys (no body stats, no heart rate). */
export function assertFeedPost(p: FeedPost): void {
  const extra = Object.keys(p).filter((k) => !POST_KEYS.includes(k));
  if (extra.length) fail("FeedPost", `forbidden keys: ${extra.join(", ")}`);
}
