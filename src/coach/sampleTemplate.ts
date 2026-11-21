/**
 * Owner: Toufic
 * Purpose: template pose at a song time: binary search over the frames, shortest-arc blend between neighbours
 * FRs: FR-26
 */
import type { SegmentId, SegmentMap, SongTimeMs, TemplateFrame, Vec2 } from "../types/pulse";

/**
 * Pose of the template at `tSongMs`. `frames` must be strictly increasing in `tMs` (parseDance checks this)
 * and is never mutated or copied. Each call is independent, so seeks in either direction work at once.
 * - no frames (or a NaN time): {}
 * - before the first / after the last frame: that frame's map; exactly on a frame: that frame's full map
 * - between two frames: only segments present in both, rotated along the shorter arc
 * Returned maps may be the stored ones: read them, don't mutate them.
 */
export function sampleTemplate(frames: readonly TemplateFrame[], tSongMs: SongTimeMs): SegmentMap {
  if (frames.length === 0 || Number.isNaN(tSongMs)) return {};
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (tSongMs <= first.tMs) return first.segments;
  if (tSongMs >= last.tMs) return last.segments;

  // Invariant: frames[lo].tMs <= t < frames[hi].tMs.
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tMs <= tSongMs) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  if (a.tMs === tSongMs) return a.segments;
  const b = frames[hi];
  return blendSegments(a.segments, b.segments, (tSongMs - a.tMs) / (b.tMs - a.tMs));
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
