/**
 * Owner: Toufic
 * Purpose: MOCK 3D poses for the #97 phase 0 preview. Hand-built with forward kinematics, NOT real
 *          MediaPipe landmarks: the pose engine does not output z or world landmarks yet.
 * FRs: FR-26
 *
 * Built in a body frame (meters, hip-centred, y down, +x = dancer's left, -z = the way the body faces),
 * then turned by yawDeg about the vertical axis. With yaw 0 this matches MediaPipe worldLandmarks
 * for a dancer facing the camera.
 */
import { BODY_TRACK_INDICES, BT, type BodyPose3D, type Vec3 } from "./coach3d";

type Dir = readonly [number, number, number];

export interface MockPoseSpec {
  id: string;
  label: string;
  /** 0 = facing the camera, +90 = facing the viewer's left, 180 = back to the camera. */
  yawDeg: number;
  /** Upper body tipped forward about the hips (degrees). Arm directions are NOT tipped with it. */
  bendDeg?: number;
  /** Head turn relative to the body (degrees, same sign as yawDeg). */
  headYawDeg?: number;
  /** Bone directions in the body frame (before yaw): [upper, lower]. */
  arms: { l: readonly [Dir, Dir]; r: readonly [Dir, Dir] };
  legs: { l: readonly [Dir, Dir]; r: readonly [Dir, Dir] };
  /** Palms face each other (thumbs up), as in a clap. */
  thumbsUp?: boolean;
  /** Points to show as low-visibility (far side during a turn). */
  lowVis?: readonly number[];
  /** Stage position of the hips: x (m), z distance from the camera (m), lift off the floor (m). */
  stage: { x: number; z: number; lift?: number };
}

const LEN = { upperArm: 0.28, forearm: 0.25, thigh: 0.42, shin: 0.41 } as const;

function n(d: Dir): Vec3 {
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
}
function along(p: Vec3, d: Vec3, k: number): Vec3 {
  return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
}
function rotY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

/** Builds a full body-track pose from a spec. */
export function buildMockPose(spec: MockPoseSpec, extraYawDeg = 0): BodyPose3D {
  const bend = ((spec.bendDeg ?? 0) * Math.PI) / 180;
  const up = (p: Vec3): Vec3 => rotX(p, bend); // upper body tip
  const w: Vec3[] = new Array<Vec3>(BODY_TRACK_INDICES.length);

  w[BT.lHip] = [0.1, 0, 0];
  w[BT.rHip] = [-0.1, 0, 0];
  w[BT.lShoulder] = up([0.185, -0.5, 0]);
  w[BT.rShoulder] = up([-0.185, -0.5, 0]);

  // Head: ears either side of the head centre, nose in front, turned by headYawDeg.
  const hy = ((spec.headYawDeg ?? 0) * Math.PI) / 180;
  const head = up([0, -0.655, 0]);
  const ear = rotY([0.075, 0, 0.015], hy);
  const nose = rotY([0, 0.03, -0.1], hy);
  w[BT.lEar] = [head[0] + ear[0], head[1] + ear[1], head[2] + ear[2]];
  w[BT.rEar] = [head[0] - ear[0], head[1] + ear[1], head[2] + ear[2]];
  w[BT.nose] = up([nose[0], -0.655 + nose[1], nose[2]]);

  const arm = (s: number, e: number, wr: number, pk: number, ix: number, th: number, dirs: readonly [Dir, Dir]): void => {
    const du = n(dirs[0]);
    const df = n(dirs[1]);
    w[e] = along(w[s], du, LEN.upperArm);
    w[wr] = along(w[e], df, LEN.forearm);
    // Thumb side: the body's forward (or up, for a clap), made perpendicular to the forearm.
    const ref: Vec3 = spec.thumbsUp ? [0, -1, 0] : [0, 0, -1];
    const dot = ref[0] * df[0] + ref[1] * df[1] + ref[2] * df[2];
    let t: Vec3 = [ref[0] - df[0] * dot, ref[1] - df[1] * dot, ref[2] - df[2] * dot];
    if (Math.hypot(t[0], t[1], t[2]) < 0.3) t = [0, -1, 0];
    t = n(t);
    w[ix] = along(along(w[wr], df, 0.075), t, 0.018);
    w[pk] = along(along(w[wr], df, 0.065), t, -0.03);
    w[th] = along(along(w[wr], df, 0.03), t, 0.045);
  };
  arm(BT.lShoulder, BT.lElbow, BT.lWrist, BT.lPinky, BT.lIndex, BT.lThumb, spec.arms.l);
  arm(BT.rShoulder, BT.rElbow, BT.rWrist, BT.rPinky, BT.rIndex, BT.rThumb, spec.arms.r);

  const leg = (h: number, k: number, a: number, he: number, ft: number, dirs: readonly [Dir, Dir]): void => {
    w[k] = along(w[h], n(dirs[0]), LEN.thigh);
    w[a] = along(w[k], n(dirs[1]), LEN.shin);
    w[he] = [w[a][0], w[a][1] + 0.05, w[a][2] + 0.06];
    w[ft] = [w[a][0], w[a][1] + 0.07, w[a][2] - 0.16];
  };
  leg(BT.lHip, BT.lKnee, BT.lAnkle, BT.lHeel, BT.lFoot, spec.legs.l);
  leg(BT.rHip, BT.rKnee, BT.rAnkle, BT.rHeel, BT.rFoot, spec.legs.r);

  const yaw = ((spec.yawDeg + extraYawDeg) * Math.PI) / 180;
  const world = w.map((p) => rotY(p, yaw));
  let lowest = Number.NEGATIVE_INFINITY;
  for (const p of world) lowest = Math.max(lowest, p[1]);
  const v = world.map(() => 1);
  for (const i of spec.lowVis ?? []) v[i] = 0.3;
  return { world, v, root: [spec.stage.x, lowest + (spec.stage.lift ?? 0), spec.stage.z] };
}

/** The five phase 0 poses. MOCK data: replace with real body-track frames in phase 2. */
export const MOCK_POSES: readonly MockPoseSpec[] = [
  {
    id: "front",
    label: "Front: arms up in a V, one knee lifted",
    yawDeg: 0,
    arms: { l: [[0.6, -0.8, 0], [0.5, -0.85, -0.1]], r: [[-0.6, -0.8, 0], [-0.5, -0.85, -0.1]] },
    legs: { l: [[0.12, 1, 0], [0.12, 1, 0]], r: [[-0.25, 0.85, -0.45], [-0.05, 1, 0.3]] },
    stage: { x: 0, z: 3.6 },
  },
  {
    id: "side",
    label: "Side: facing stage left, near arm reaches forward",
    yawDeg: 90,
    headYawDeg: 0,
    arms: { l: [[0.05, 0.25, -1], [0, -0.1, -1]], r: [[-0.05, 0.6, 0.8], [0, 0.85, 0.5]] },
    legs: { l: [[0.08, 0.95, -0.32], [0.05, 1, 0.08]], r: [[-0.08, 0.95, 0.3], [-0.05, 0.85, 0.5]] },
    lowVis: [BT.rElbow, BT.rWrist, BT.rPinky, BT.rIndex, BT.rThumb],
    stage: { x: -0.15, z: 3.4 },
  },
  {
    id: "back",
    label: "Back: dancer's right arm up, farther upstage",
    yawDeg: 180,
    arms: { l: [[0.35, 0.94, 0], [0.3, 0.95, 0]], r: [[-0.2, -1, 0], [-0.1, -1, 0]] },
    legs: { l: [[0.18, 1, 0], [0.1, 1, 0]], r: [[-0.18, 1, 0], [-0.1, 1, 0]] },
    stage: { x: 0.5, z: 4.3 },
  },
  {
    id: "clap",
    label: "Clap: hands meet in front of the chest",
    yawDeg: 20,
    thumbsUp: true,
    arms: { l: [[0.2, 0.75, -0.62], [-0.216, -0.091, -0.155]], r: [[-0.2, 0.75, -0.62], [0.216, -0.091, -0.155]] },
    legs: { l: [[0.15, 1, 0], [0.12, 1, 0]], r: [[-0.15, 1, 0], [-0.12, 1, 0]] },
    stage: { x: 0.2, z: 3.4 },
  },
  {
    id: "bend",
    label: "Forward bend: torso tipped toward the camera, arms hang",
    yawDeg: 30,
    bendDeg: 65,
    headYawDeg: 0,
    arms: { l: [[0.1, 1, -0.15], [0.05, 1, -0.05]], r: [[-0.1, 1, -0.15], [-0.05, 1, -0.05]] },
    legs: { l: [[0.14, 1, 0.08], [0.1, 1, 0]], r: [[-0.14, 1, 0.08], [-0.1, 1, 0]] },
    stage: { x: -0.2, z: 3.5 },
  },
];
