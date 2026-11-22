/**
 * Owner: Toufic
 * Purpose: template pose at a song time: binary search over the frames, shortest-arc blend between neighbours
 * FRs: FR-26
 */
import type { LandmarkPoint, SegmentId, SegmentMap, SongTimeMs, TemplateFrame, Vec2 } from "../types/pulse";

const VIS_EPS = 0.05;
const MAX_INTERP_GAP_MS = 500;

export interface SampledTemplatePose {
  segments: SegmentMap;
  landmarks?: LandmarkPoint[];
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Pose of the template at `tSongMs`. `frames` must be strictly increasing in `tMs` (parseDance checks this)
 * and is never mutated or copied. Each call is independent, so seeks in either direction work at once.
 * - no frames (or a NaN time): {}
 * - before the first / after the last frame: that frame's map; exactly on a frame: that frame's full map
 * - between two frames: only segments present in both, rotated along the shorter arc
 * Returned maps may be the stored ones: read them, don't mutate them.
 */
export function sampleTemplate(frames: readonly TemplateFrame[], tSongMs: SongTimeMs): SegmentMap {
  return sampleTemplatePose(frames, tSongMs).segments;
}

/**
 * Samples both `segments` and optional 12-point `landmarks` at `tSongMs`.
 * Interpolates landmarks smoothly between frames with visibility-aware anti-twitching (`VIS_EPS = 0.05`)
 * and snaps across large tracking gaps (`> 500 ms`).
 */
export function sampleTemplatePose(
  frames: readonly TemplateFrame[],
  tSongMs: SongTimeMs,
): SampledTemplatePose {
  if (frames.length === 0 || Number.isNaN(tSongMs)) return { segments: {} };
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (tSongMs <= first.tMs) {
    return first.landmarks ? { segments: first.segments, landmarks: first.landmarks } : { segments: first.segments };
  }
  if (tSongMs >= last.tMs) {
    return last.landmarks ? { segments: last.segments, landmarks: last.landmarks } : { segments: last.segments };
  }

  // Invariant: frames[lo].tMs <= t < frames[hi].tMs.
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tMs <= tSongMs) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  if (a.tMs === tSongMs) {
    return a.landmarks ? { segments: a.segments, landmarks: a.landmarks } : { segments: a.segments };
  }
  const b = frames[hi];
  const gapMs = b.tMs - a.tMs;
  const f = (tSongMs - a.tMs) / gapMs;
  const segments = blendSegments(a.segments, b.segments, f);

  if (a.landmarks?.length === 12 && b.landmarks?.length === 12) {
    if (gapMs > MAX_INTERP_GAP_MS) {
      const snapped = tSongMs - a.tMs <= b.tMs - tSongMs ? a.landmarks : b.landmarks;
      return { segments, landmarks: snapped };
    }
    return { segments, landmarks: blendLandmarks(a.landmarks, b.landmarks, f) };
  }
  return { segments };
}

function blendLandmarks(
  a: readonly LandmarkPoint[],
  b: readonly LandmarkPoint[],
  f: number,
): LandmarkPoint[] {
  const out: LandmarkPoint[] = new Array<LandmarkPoint>(12);
  for (let i = 0; i < 12; i++) {
    const pa = a[i];
    const pb = b[i];
    const aValid = Boolean(pa && Number.isFinite(pa.x) && Number.isFinite(pa.y) && Number.isFinite(pa.v) && pa.v > VIS_EPS);
    const bValid = Boolean(pb && Number.isFinite(pb.x) && Number.isFinite(pb.y) && Number.isFinite(pb.v) && pb.v > VIS_EPS);
    const aV = aValid ? clamp01(pa.v) : 0;
    const bV = bValid ? clamp01(pb.v) : 0;
    const v = aV + (bV - aV) * f;
    if (aValid && bValid) {
      out[i] = {
        x: pa.x + (pb.x - pa.x) * f,
        y: pa.y + (pb.y - pa.y) * f,
        v,
      };
    } else if (aValid) {
      out[i] = { x: pa.x, y: pa.y, v };
    } else if (bValid) {
      out[i] = { x: pb.x, y: pb.y, v };
    } else {
      out[i] = { x: 0, y: 0, v: 0 };
    }
  }
  return out;
}

/** Segments present in both maps, each rotated a fraction `f` (0..1) of the way from `a` to `b`. */
function blendSegments(a: SegmentMap, b: SegmentMap, f: number): SegmentMap {
  const out: SegmentMap = {};
  for (const key of Object.keys(a) as SegmentId[]) {
    const va = a[key];
    const vb = b[key];
    if (va && vb) out[key] = rotateToward(va, vb, f);
  }
  return out;
}

/**
 * Unit direction a fraction `f` of the shorter arc from `a` to `b` (radians, canvas axes: y down).
 * An exact 180° tie turns in the direction of increasing angle, which is clockwise on screen.
 */
function rotateToward(a: Vec2, b: Vec2, f: number): Vec2 {
  const angleA = Math.atan2(a[1], a[0]);
  const cross = a[0] * b[1] - a[1] * b[0];
  const dot = a[0] * b[0] + a[1] * b[1];
  const delta = cross === 0 && dot < 0 ? Math.PI : Math.atan2(cross, dot);
  const angle = angleA + f * delta;
  return [Math.cos(angle), Math.sin(angle)];
}
