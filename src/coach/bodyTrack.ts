/**
 * Owner: Toufic
 * Purpose: the coach's 3D body track (#97): an optional sidecar public/dances/<id>.body.json, made offline
 *          by dance-sources/tools/process_body.py and read only by the coach (no shared type: nothing else
 *          consumes it). Validates it and samples it at song time as a BodyPose3D on the fixed stage.
 * FRs: FR-26
 *
 * World points are MediaPipe worldLandmarks (meters, hip-centred, x image-right, y down, z away from the
 * camera), unmirrored like the template, with left/right swaps fixed and gaps filled offline.
 * `root` is the hip centre on stage: [x meters from the centre, height above the floor in meters].
 */
import type { SongTimeMs } from "../types/pulse";
import { BODY_TRACK_INDICES, LOOK, type BodyPose3D, type Vec3 } from "./coach3d";

export interface BodyTrack {
  version: 1;
  danceId: string;
  indices: number[];
  /** Strictly increasing song times (ms), one per frame. */
  tMs: number[];
  root: [number, number][];
  /** Per frame: BODY_TRACK_INDICES.length x [x, y, z], flattened. */
  world: number[][];
  /** Per frame: visibility 0..1 per point. */
  vis: number[][];
}

/** Longest stretch between two frames that is still interpolated; beyond it the coach falls back. */
const MAX_BRIDGE_MS = 250;

function isNumArray(a: unknown, len: number): a is number[] {
  return Array.isArray(a) && a.length === len && a.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** The validated track, or null for anything malformed (the coach then keeps the flat fallback). */
export function parseBodyTrack(json: unknown, danceId: string): BodyTrack | null {
  if (typeof json !== "object" || json === null) return null;
  const j = json as Record<string, unknown>;
  const n = BODY_TRACK_INDICES.length;
  if (j.version !== 1 || j.danceId !== danceId) return null;
  if (!isNumArray(j.indices, n) || j.indices.some((v, i) => v !== BODY_TRACK_INDICES[i])) return null;
  const t = j.tMs;
  if (!Array.isArray(t) || t.length === 0) return null;
  const frames = t.length;
  if (!isNumArray(t, frames)) return null;
  for (let i = 1; i < frames; i++) if (!(t[i] > t[i - 1])) return null;
  const { root, world, vis } = j;
  if (!Array.isArray(root) || root.length !== frames || !root.every((r) => isNumArray(r, 2))) return null;
  if (!Array.isArray(world) || world.length !== frames || !world.every((w) => isNumArray(w, n * 3))) return null;
  if (!Array.isArray(vis) || vis.length !== frames || !vis.every((v) => isNumArray(v, n))) return null;
  return json as BodyTrack;
}

/** Index of the last frame at or before t, or -1. */
function frameAtOrBefore(tMs: readonly number[], t: number): number {
  let lo = 0;
  let hi = tMs.length - 1;
  if (t < tMs[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tMs[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The pose at song time t: interpolated between the two surrounding frames, held for up to
 * MAX_BRIDGE_MS past either end, null in longer gaps and outside the track. Stateless, so play,
 * pause and seeks all work.
 */
export function sampleBodyTrack(track: BodyTrack, t: SongTimeMs): BodyPose3D | null {
  const n = BODY_TRACK_INDICES.length;
  const { tMs } = track;
  const i = frameAtOrBefore(tMs, t);
  let a: number;
  let b: number;
  let k: number;
  if (i < 0) {
    if (tMs[0] - t > MAX_BRIDGE_MS) return null;
    a = b = 0;
    k = 0;
  } else if (i === tMs.length - 1) {
    if (t - tMs[i] > MAX_BRIDGE_MS) return null;
    a = b = i;
    k = 0;
  } else {
    a = i;
    b = i + 1;
    const span = tMs[b] - tMs[a];
    if (span > MAX_BRIDGE_MS) {
      // A real gap: hold the nearer side briefly, then show nothing.
      const da = t - tMs[a];
      const db = tMs[b] - t;
      if (Math.min(da, db) > MAX_BRIDGE_MS / 2) return null;
      b = a = da <= db ? a : b;
      k = 0;
    } else {
      k = (t - tMs[a]) / span;
    }
  }
  const wa = track.world[a];
  const wb = track.world[b];
  const world: Vec3[] = new Array<Vec3>(n);
  const v: number[] = new Array<number>(n);
  for (let p = 0; p < n; p++) {
    const o = p * 3;
    world[p] = [
      wa[o] + (wb[o] - wa[o]) * k,
      wa[o + 1] + (wb[o + 1] - wa[o + 1]) * k,
      wa[o + 2] + (wb[o + 2] - wa[o + 2]) * k,
    ];
    v[p] = track.vis[a][p] + (track.vis[b][p] - track.vis[a][p]) * k;
  }
  const ra = track.root[a];
  const rb = track.root[b];
  return { world, v, root: [ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k, LOOK.homeZ] };
}

/** Fetches /dances/<id>.body.json from the app's own public files; null if missing or invalid. */
export async function loadBodyTrack(danceId: string, fetcher: typeof fetch = fetch): Promise<BodyTrack | null> {
  try {
    const res = await fetcher(`/dances/${encodeURIComponent(danceId)}.body.json`);
    if (!res.ok) return null;
    return parseBodyTrack(await res.json(), danceId);
  } catch {
    return null;
  }
}
