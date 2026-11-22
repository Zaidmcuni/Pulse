/**
 * Owner: Mohamed
 * Purpose: #112 how much the dancer and the coach move (pure functions), so standing still earns no points.
 * FRs: FR-28, FR-30, FR-31
 */

import type { Dance, LandmarkPoint, PosturalMode } from "../types/pulse";
import { CONFIG, LM, MODE_SEGMENTS } from "../config";

/** Limbs whose travel counts as dancing. */
const MOVING_JOINTS = [LM.lWrist, LM.rWrist, LM.lElbow, LM.rElbow, LM.lKnee, LM.rKnee, LM.lAnkle, LM.rAnkle] as const;

const visible = (p: LandmarkPoint | undefined): p is LandmarkPoint => !!p && p.v >= CONFIG.visibilityMin;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Dancer motion over a window, in shoulder widths per second: mean over visible wrists, elbows, knees, ankles of path length / duration,
 *  positions in pixel space (x * aspect), divided by the median shoulder width over the window. null if < 2 usable frames. */
export function dancerMotion(frames: readonly { tMs: number; points: readonly LandmarkPoint[] }[], aspect: number): number | null {
  // A frame is usable when both shoulders are visible (it gives the body scale).
  const usable = frames.filter((f) => visible(f.points[LM.lShoulder]) && visible(f.points[LM.rShoulder]));
  if (usable.length < 2) return null;
  const durationSec = (usable[usable.length - 1].tMs - usable[0].tMs) / 1000;
  if (!(durationSec > 0)) return null;

  const widths = usable.map((f) => {
    const l = f.points[LM.lShoulder], r = f.points[LM.rShoulder];
    return Math.hypot((l.x - r.x) * aspect, l.y - r.y);
  });
  const shoulderWidth = median(widths);
  if (!(shoulderWidth > 0)) return null;

  let sum = 0, n = 0;
  for (const j of MOVING_JOINTS) {
    let path = 0, steps = 0;
    for (let i = 1; i < usable.length; i++) {
      const a = usable[i - 1].points[j], b = usable[i].points[j];
      if (!visible(a) || !visible(b)) continue;
      path += Math.hypot((b.x - a.x) * aspect, b.y - a.y);
      steps++;
    }
    if (steps === 0) continue; // joint never seen twice in a row: not counted
    sum += path / durationSec;
    n++;
  }
  return n === 0 ? null : sum / n / shoulderWidth;
}

/** Coach motion over [fromMs, toMs]: mean angular speed of the template segments, in degrees per second. 0 if < 2 frames. */
export function coachMotion(dance: Dance, fromMs: number, toMs: number, mode: PosturalMode): number {
  const frames = dance.frames.filter((f) => f.tMs >= fromMs && f.tMs <= toMs);
  if (frames.length < 2) return 0;
  const durationSec = (frames[frames.length - 1].tMs - frames[0].tMs) / 1000;
  if (!(durationSec > 0)) return 0;

  let sum = 0, n = 0;
  for (const id of MODE_SEGMENTS[mode]) {
    let angleDeg = 0, steps = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].segments[id], b = frames[i].segments[id];
      if (!a || !b) continue;
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1]));
      angleDeg += (Math.acos(dot) * 180) / Math.PI;
      steps++;
    }
    if (steps === 0) continue;
    sum += angleDeg / durationSec;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}
