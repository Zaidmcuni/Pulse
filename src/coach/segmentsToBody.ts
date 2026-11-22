/**
 * Owner: Toufic
 * Purpose: drive the new human coach from today's dance bundles, which only carry 2D segment directions.
 *          Builds a flat (z = 0) body track facing the camera at the home spot: fixed proportions, the
 *          segment directions for every bone, hands and feet derived from the forearms and shins.
 *          Real depth comes later from a re-extracted body track (#97 phase 2).
 * FRs: FR-26
 *
 * Segments are pixel-space unit vectors, y down, unmirrored (image right = +x), which matches the body
 * track's world convention (x toward the image right, y down). A missing segment gets a resting
 * direction at low visibility, so the renderer fades that limb instead of dropping it.
 */
import type { SegmentId, SegmentMap, Vec2 } from "../types/pulse";
import { BODY_TRACK_INDICES, BT, LOOK, type BodyPose3D, type Vec3 } from "./coach3d";

/** Bone lengths and offsets (m), shared with the mock fixtures' proportions. */
const BODY = {
  hipHalf: 0.1, shoulderHalf: 0.185, torso: 0.5, head: 0.155,
  upperArm: 0.28, forearm: 0.25, thigh: 0.42, shin: 0.41,
} as const;

const GUESSED_VIS = 0.3; // below CONFIG.visibilityMin, so the part is drawn faded
/** Flat bodies have no depth: keep the arms a little in front of the torso so the draw order is fixed. */
const ARM_FRONT_M = -0.04;

function along(p: Vec3, d: Vec2, k: number): Vec3 {
  return [p[0] + d[0] * k, p[1] + d[1] * k, p[2]];
}
function add(p: Vec3, q: Vec3): Vec3 {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
}

/** Hand landmarks (pinky, index, thumb knuckles) from the wrist and forearm direction. */
function hand(wrist: Vec3, d: Vec2): { pinky: Vec3; index: Vec3; thumb: Vec3 } {
  // Thumb side: toward the camera (-z), so the hand reads as a mitten facing forward.
  const t: Vec3 = [0, 0, -1];
  return {
    index: add(along(wrist, d, 0.075), [t[0] * 0.018, t[1] * 0.018, t[2] * 0.018]),
    pinky: add(along(wrist, d, 0.065), [t[0] * -0.03, t[1] * -0.03, t[2] * -0.03]),
    thumb: add(along(wrist, d, 0.03), [t[0] * 0.045, t[1] * 0.045, t[2] * 0.045]),
  };
}

/**
 * A flat body track for one sampled template pose, or null when the sample has no usable segment
 * (draw the empty stage then).
 */
export function bodyFromSegments(seg: SegmentMap): BodyPose3D | null {
  if (Object.keys(seg).length === 0) return null;
  const w: Vec3[] = new Array<Vec3>(BODY_TRACK_INDICES.length);
  const v: number[] = new Array<number>(BODY_TRACK_INDICES.length).fill(1);

  const up: Vec2 = seg.torso ?? [0, -1];
  const left: Vec2 = [-up[1], up[0]]; // dancer's left; image right when upright
  const hipMid: Vec3 = [0, 0, 0];
  const shMid = along(hipMid, up, BODY.torso);
  w[BT.lHip] = along(hipMid, left, BODY.hipHalf);
  w[BT.rHip] = along(hipMid, left, -BODY.hipHalf);
  w[BT.lShoulder] = along(shMid, left, BODY.shoulderHalf);
  w[BT.rShoulder] = along(shMid, left, -BODY.shoulderHalf);

  const head = along(shMid, up, BODY.head);
  w[BT.lEar] = add(along(head, left, 0.075), [0, 0, 0.015]);
  w[BT.rEar] = add(along(head, left, -0.075), [0, 0, 0.015]);
  w[BT.nose] = add(along(head, up, -0.03), [0, 0, -0.1]);

  /** The segment's direction, or a resting one (flagging the points it places as guessed). */
  const dir = (id: SegmentId, rest: Vec2, ids: readonly number[]): Vec2 => {
    const d = seg[id];
    if (d) return d;
    for (const i of ids) v[i] = GUESSED_VIS;
    return rest;
  };

  for (const [side, s, e, wr, pk, ix, th, ua, fa] of [
    [1, BT.lShoulder, BT.lElbow, BT.lWrist, BT.lPinky, BT.lIndex, BT.lThumb, "l_upper_arm", "l_forearm"],
    [-1, BT.rShoulder, BT.rElbow, BT.rWrist, BT.rPinky, BT.rIndex, BT.rThumb, "r_upper_arm", "r_forearm"],
  ] as const) {
    const rest: Vec2 = [0.15 * side, 0.99];
    const du = dir(ua, rest, [e, wr, pk, ix, th]);
    const df = dir(fa, du, [wr, pk, ix, th]);
    w[e] = add(along(w[s], du, BODY.upperArm), [0, 0, ARM_FRONT_M]);
    w[wr] = along(w[e], df, BODY.forearm);
    const h = hand(w[wr], df);
    w[pk] = h.pinky;
    w[ix] = h.index;
    w[th] = h.thumb;
  }

  for (const [side, hp, kn, an, he, ft, th, sh] of [
    [1, BT.lHip, BT.lKnee, BT.lAnkle, BT.lHeel, BT.lFoot, "l_thigh", "l_shin"],
    [-1, BT.rHip, BT.rKnee, BT.rAnkle, BT.rHeel, BT.rFoot, "r_thigh", "r_shin"],
  ] as const) {
    const rest: Vec2 = [0.06 * side, 0.998];
    const dt = dir(th, rest, [kn, an, he, ft]);
    const ds = dir(sh, dt, [an, he, ft]);
    w[kn] = along(w[hp], dt, BODY.thigh);
    w[an] = along(w[kn], ds, BODY.shin);
    w[he] = add(w[an], [0, 0.05, 0.06]);
    w[ft] = add(w[an], [0.05 * side, 0.07, -0.15]); // toes turned slightly out
  }

  let lowest = Number.NEGATIVE_INFINITY;
  for (const p of w) lowest = Math.max(lowest, p[1]);
  return { world: w, v, root: [0, lowest, LOOK.homeZ] };
}
