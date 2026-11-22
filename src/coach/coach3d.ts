/**
 * Owner: Toufic
 * Purpose: PHASE 0 PROTOTYPE for #97. Pure geometry of the 2.5D human coach: a 3D body track seen by one
 *          fixed virtual camera, turned into depth-sorted 2D shapes (organic limbs, a torso and pelvis
 *          built from 3D cross-sections, a head with hair and a face, hands, sneakers). Drawing lives in
 *          figure.ts and loftStage.ts. Not wired into CoachCanvas yet (dev preview only).
 * FRs: FR-26
 *
 * Body data follows MediaPipe worldLandmarks: meters, hip-centred, x toward the image right, y down,
 * z away from the camera (negative = nearer). Templates are unmirrored, like the source video.
 * Stage space: X right, Y up from the floor, Z forward from the camera, all in meters.
 */
import { CONFIG } from "../config";

export type Vec3 = readonly [number, number, number];

/** MediaPipe indices kept in the proposed body track (nose, ears, shoulders to feet), in this order. */
export const BODY_TRACK_INDICES = [
  0, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
] as const;

/** Position of each point inside a body-track array. "l" / "r" = the dancer's own left / right. */
export const BT = {
  nose: 0, lEar: 1, rEar: 2, lShoulder: 3, rShoulder: 4, lElbow: 5, rElbow: 6, lWrist: 7, rWrist: 8,
  lPinky: 9, rPinky: 10, lIndex: 11, rIndex: 12, lThumb: 13, rThumb: 14, lHip: 15, rHip: 16,
  lKnee: 17, rKnee: 18, lAnkle: 19, rAnkle: 20, lHeel: 21, rHeel: 22, lFoot: 23, rFoot: 24,
} as const;

export interface BodyPose3D {
  /** BODY_TRACK_INDICES.length points, MediaPipe world convention (see header). */
  world: Vec3[];
  /** Visibility 0..1 per point. */
  v: number[];
  /** Hip centre on stage: X (m), height above the floor (m), Z distance from the camera (m). */
  root: Vec3;
}

export interface StageCamera {
  heightM: number;
  pitchRad: number;
  focalPx: number;
  cx: number;
  cy: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Projected extends Pt {
  /** Distance along the camera's view axis (m). Larger = farther. */
  depth: number;
}

/** Visual-only camera and body dimensions (meters). Gameplay thresholds stay in CONFIG. */
export const LOOK = {
  camHeightM: 1.2,
  camPitchDeg: 6,
  focalPerHeight: 1.15, // focal length as a share of canvas height
  homeZ: 3.6,
  farFade: 0.45, // opacity of a low-visibility (estimated) part
  head: { rx: 0.09, ry: 0.116 },
  /** Seated view: the coach stays centred with her hips at this height, seen from chest height. */
  seated: { focalPerHeight: 1.5, camHeightM: 1.45, hipHeightM: 0.95 },
} as const;

const DEG = Math.PI / 180;

export function stageCamera(widthPx: number, heightPx: number): StageCamera {
  return {
    heightM: LOOK.camHeightM,
    pitchRad: LOOK.camPitchDeg * DEG,
    focalPx: LOOK.focalPerHeight * heightPx,
    cx: widthPx / 2,
    cy: heightPx / 2,
  };
}

/**
 * Seated mode (FR-20): a closer, level camera at chest height framing the upper body, with the hips at
 * the bottom edge. Wide enough for arms held out to the side.
 */
export function seatedCamera(widthPx: number, heightPx: number): StageCamera {
  const focalPx = LOOK.seated.focalPerHeight * heightPx;
  const { camHeightM, hipHeightM } = LOOK.seated;
  return {
    heightM: camHeightM,
    pitchRad: 0,
    focalPx,
    cx: widthPx / 2,
    // Put the hips just above the bottom edge: sy = cy + f * (camHeight - hipHeight) / Z.
    cy: heightPx * 0.99 - (focalPx * (camHeightM - hipHeightM)) / LOOK.homeZ,
  };
}

/** Body-local world point -> stage point (flip y up, offset by the root). */
export function toStage(local: Vec3, root: Vec3): Vec3 {
  return [root[0] + local[0], root[1] - local[1], root[2] + local[2]];
}

/** Perspective projection of a stage point through the fixed, slightly downward-tilted camera. */
export function project(cam: StageCamera, p: Vec3): Projected {
  const dy = p[1] - cam.heightM;
  const dz = p[2];
  const s = Math.sin(cam.pitchRad);
  const c = Math.cos(cam.pitchRad);
  const depth = Math.max(0.05, -dy * s + dz * c);
  const up = dy * c + dz * s;
  return { x: cam.cx + (cam.focalPx * p[0]) / depth, y: cam.cy - (cam.focalPx * up) / depth, depth };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function mid(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}
function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
}
/** a with its component along unit vector n removed, normalized. */
function orthoTo(a: Vec3, n: Vec3): Vec3 {
  return norm(sub(a, scale(n, dot(a, n))));
}

/** Unit vector out of the chest: (dancer-left across the shoulders and hips) x (spine up). */
export function chestNormal(world: readonly Vec3[]): Vec3 {
  const across = add(sub(world[BT.lShoulder], world[BT.rShoulder]), sub(world[BT.lHip], world[BT.rHip]));
  const up = sub(mid(world[BT.lShoulder], world[BT.rShoulder]), mid(world[BT.lHip], world[BT.rHip]));
  return norm(cross(across, up));
}

/**
 * Which way the torso faces, as a yaw angle in radians: 0 = toward the camera, +PI/2 = toward the
 * viewer's left, +-PI = away. From the torso normal in world space.
 */
export function facingYawRad(world: readonly Vec3[]): number {
  const n = chestNormal(world);
  return Math.atan2(-n[0], -n[2]);
}

/** Convex hull of 2D points (monotone chain). */
export function convexHull<T extends Pt>(points: readonly T[]): T[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const turn = (o: T, a: T, b: T): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: T[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: T[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ---------------------------------------------------------------------------------------------
// The figure as depth-sorted parts
// ---------------------------------------------------------------------------------------------

export type Material = "skin" | "jacket" | "pants" | "shoe" | "hair";

export interface LimbPart {
  kind: "limb";
  mat: Material;
  /** Closed organic outline in canvas pixels. */
  outline: Pt[];
  /** Axis end points and their radii in pixels (for shading and cuffs). */
  a: Projected;
  b: Projected;
  ra: number;
  rb: number;
  /** Sleeve: draw a cuff band at the b end. */
  cuff?: boolean;
  depth: number;
  alpha: number;
}

export interface BlobPart {
  kind: "blob";
  mat: Material;
  outline: Pt[];
  /** Rounding: the outline is stroked with this radius. */
  strokePx: number;
  /** Shoes: the sole runs from heel to toe. */
  sole?: [Pt, Pt];
  depth: number;
  alpha: number;
}

export interface TorsoPart {
  kind: "torso";
  jacket: Pt[];
  pelvis: Pt[];
  /** Spine top and bottom on screen (for shading). */
  top: Pt;
  bottom: Pt;
  front: boolean;
  /** White tee between the open jacket fronts, when the chest faces the camera. */
  tee?: Pt[];
  /** Satin lapels either side of the top, when the chest faces the camera. */
  lapels?: Pt[][];
  /** Cream band across the jacket's back, when the back faces the camera. */
  backBand?: Pt[];
  /** Waistband line across the visible side. */
  waist: Pt[];
  depth: number;
  alpha: number;
}

export interface FaceFeatures {
  eyes: { x: number; y: number; rx: number; ry: number; rot: number }[];
  brows: [Pt, Pt][];
  nose?: [Pt, Pt];
  /** Smile: left corner, lowest point of the lower lip, right corner. */
  mouth?: [Pt, Pt, Pt];
  cheeks: { x: number; y: number; r: number }[];
}

export interface HeadPart {
  kind: "head";
  centre: Projected;
  /** Hair silhouette: an ellipse slightly larger than the skull, shifted up and back. */
  hair: { x: number; y: number; rx: number; ry: number; rot: number };
  /** Skin of the face cap (front half below the hairline), only its visible points. */
  face: Pt[];
  features: FaceFeatures;
  /** Two space buns high on the head; `behind` = farther than the head centre. */
  buns: { x: number; y: number; r: number; behind: boolean }[];
  depth: number;
  alpha: number;
}

export type FigurePart = LimbPart | BlobPart | TorsoPart | HeadPart;

/** Limb radii (m) at both ends and their mid-length bulge, per material layer. */
const LIMB_SPECS: readonly {
  from: number; to: number; mat: Material; r: readonly [number, number]; bulge: number; cuff?: boolean;
}[] = [
  { from: BT.lShoulder, to: BT.lElbow, mat: "jacket", r: [0.042, 0.035], bulge: 0.06 },
  { from: BT.lElbow, to: BT.lWrist, mat: "jacket", r: [0.034, 0.027], bulge: 0.04, cuff: true },
  { from: BT.rShoulder, to: BT.rElbow, mat: "jacket", r: [0.042, 0.035], bulge: 0.06 },
  { from: BT.rElbow, to: BT.rWrist, mat: "jacket", r: [0.034, 0.027], bulge: 0.04, cuff: true },
  { from: BT.lHip, to: BT.lKnee, mat: "pants", r: [0.078, 0.058], bulge: 0.04 },
  { from: BT.lKnee, to: BT.lAnkle, mat: "pants", r: [0.055, 0.07], bulge: 0 },
  { from: BT.rHip, to: BT.rKnee, mat: "pants", r: [0.078, 0.058], bulge: 0.04 },
  { from: BT.rKnee, to: BT.rAnkle, mat: "pants", r: [0.055, 0.07], bulge: 0 },
];

/** Torso cross-sections: position along hips (0) -> shoulders (1), half width and half depth (m). */
const JACKET_SECTIONS: readonly [number, number, number][] = [
  [1.13, 0.062, 0.055], [1.07, 0.125, 0.06], [0.97, 0.175, 0.078], [0.78, 0.158, 0.09], [0.55, 0.128, 0.08], [0.38, 0.126, 0.078],
];
const PELVIS_SECTIONS: readonly [number, number, number][] = [
  [0.42, 0.126, 0.078], [0.1, 0.146, 0.088], [-0.08, 0.14, 0.084], [-0.2, 0.1, 0.075],
];

function partAlpha(v: readonly number[], ids: readonly number[]): number {
  return ids.every((i) => (v[i] ?? 0) >= CONFIG.visibilityMin) ? 1 : LOOK.farFade;
}

/** Organic limb outline: samples along the 3D axis, each widened by its own perspective radius. */
function limbOutline(
  cam: StageCamera,
  A: Vec3,
  B: Vec3,
  r: readonly [number, number],
  bulge: number,
): { outline: Pt[]; a: Projected; b: Projected; ra: number; rb: number } {
  const N = 6;
  const centres: Projected[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = project(cam, lerp3(A, B, t));
    centres.push(c);
    radii.push((cam.focalPx * ((r[0] + (r[1] - r[0]) * t) * (1 + bulge * Math.sin(Math.PI * t)))) / c.depth);
  }
  const a = centres[0];
  const b = centres[N];
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  const nx = -dy;
  const ny = dx;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    left.push({ x: centres[i].x + nx * radii[i], y: centres[i].y + ny * radii[i] });
    right.push({ x: centres[i].x - nx * radii[i], y: centres[i].y - ny * radii[i] });
  }
  // Round caps: a half circle at each end, so a limb pointing at the camera still reads as a round end.
  const cap = (c: Pt, rad: number, sign: 1 | -1): Pt[] => {
    const out: Pt[] = [];
    for (let k = 1; k < 4; k++) {
      const ang = (k / 4) * Math.PI;
      const cx = Math.cos(ang);
      const sx = Math.sin(ang);
      // Rotate from +normal through +-axis to -normal.
      out.push({ x: c.x + (nx * cx + dx * sign * sx) * rad, y: c.y + (ny * cx + dy * sign * sx) * rad });
    }
    return out;
  };
  const outline = [...left, ...cap(b, radii[N], 1), ...right.reverse(), ...cap(a, radii[0], -1).reverse()];
  return { outline, a, b, ra: radii[0], rb: radii[N] };
}

/**
 * All figure parts projected through the fixed camera, sorted far to near (painter's order).
 * Parts sort by horizontal distance from the camera (stage Z), not by distance along the tilted view
 * axis: that axis mixes in height, which made two arms at the same depth swap order whenever one rose
 * above the other. Equal distances keep a fixed order (the sort is stable).
 * `upperBodyOnly` (seated mode) leaves out the legs and boots.
 */
export function buildFigure(pose: BodyPose3D, cam: StageCamera, upperBodyOnly = false): FigurePart[] {
  const w = pose.world;
  const S = (local: Vec3): Vec3 => toStage(local, pose.root);
  const Z = (local: Vec3): number => pose.root[2] + local[2];
  const P = (local: Vec3): Projected => project(cam, S(local));
  const pj = w.map(P);
  const px = (rM: number, p: Projected): number => (cam.focalPx * rM) / p.depth;
  const parts: FigurePart[] = [];

  for (const l of LIMB_SPECS) {
    if (upperBodyOnly && l.mat === "pants") continue; // seated: no legs
    const g = limbOutline(cam, S(w[l.from]), S(w[l.to]), l.r, l.bulge);
    parts.push({
      kind: "limb", mat: l.mat, ...g, cuff: l.cuff,
      depth: (Z(w[l.from]) + Z(w[l.to])) / 2, alpha: partAlpha(pose.v, [l.from, l.to]),
    });
  }

  // Torso frame: U up the spine, F out of the chest, A toward the dancer's left.
  const shMid = mid(w[BT.lShoulder], w[BT.rShoulder]);
  const hipMid = mid(w[BT.lHip], w[BT.rHip]);
  const U = norm(sub(shMid, hipMid));
  const F = orthoTo(chestNormal(w), U);
  const A = cross(U, F);
  const widthK = Math.hypot(...sub(w[BT.lShoulder], w[BT.rShoulder])) / 0.37;
  const at = (t: number, across: number, out: number): Vec3 =>
    add(add(lerp3(hipMid, shMid, t), scale(A, across)), scale(F, out));
  const shell = (sections: readonly [number, number, number][]): Projected[] => {
    const pts: Projected[] = [];
    for (const [t, hw, hd] of sections) {
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * 2 * Math.PI;
        pts.push(P(at(t, Math.cos(ang) * hw * widthK, Math.sin(ang) * hd)));
      }
    }
    return pts;
  };
  const jacketPts = shell(JACKET_SECTIONS);
  const pelvisPts = shell(PELVIS_SECTIONS);
  const front = Math.abs(facingYawRad(w)) < Math.PI / 2;
  const sideOut = front ? 1 : -1;
  const waist: Pt[] = [];
  for (let k = -4; k <= 4; k++) {
    const ang = (k / 4) * (Math.PI / 2);
    waist.push(P(at(0.4, Math.sin(ang) * 0.128 * widthK, Math.cos(ang) * 0.08 * sideOut)));
  }
  parts.push({
    kind: "torso",
    jacket: convexHull(jacketPts),
    pelvis: convexHull(pelvisPts),
    top: P(shMid),
    bottom: P(hipMid),
    front,
    tee: front
      ? [P(at(0.97, 0.072, 0.082)), P(at(0.97, -0.072, 0.082)), P(at(0.42, -0.05, 0.08)), P(at(0.42, 0.05, 0.08))]
      : undefined,
    lapels: front
      ? [1, -1].map((s) => [P(at(0.99, 0.068 * s, 0.075)), P(at(0.9, 0.15 * s, 0.08)), P(at(0.62, 0.078 * s, 0.09)), P(at(0.47, 0.05 * s, 0.083))])
      : undefined,
    backBand: front
      ? undefined
      : [P(at(0.86, 0.155, -0.088)), P(at(0.86, -0.155, -0.088)), P(at(0.8, -0.15, -0.09)), P(at(0.8, 0.15, -0.09))],
    waist,
    depth: Z(mid(shMid, hipMid)),
    alpha: 1,
  });

  // Head frame: hu up through the skull, hf where the face points, hl toward the dancer's left.
  const earMid = mid(w[BT.lEar], w[BT.rEar]);
  const hu = norm(sub(earMid, shMid));
  const hf = orthoTo(sub(w[BT.nose], earMid), hu);
  const hl = cross(hu, hf);
  const centre3 = add(earMid, scale(hu, 0.012));
  const { rx, ry } = LOOK.head;
  const onHead = (f: number, u: number, l: number, grow = 1): Vec3 =>
    add(centre3, add(add(scale(hf, f * rx * grow), scale(hu, u * ry * grow)), scale(hl, l * rx * grow)));
  const centre = P(centre3);
  const visible = (p: Projected): boolean => p.depth < centre.depth - 0.004;

  // Neck: skin, from the shoulders up under the jaw.
  const neck = limbOutline(cam, S(add(shMid, scale(U, -0.02))), S(add(centre3, scale(hu, -0.055))), [0.04, 0.036], 0);
  parts.push({ kind: "limb", mat: "skin", ...neck, depth: Z(centre3) + 0.02, alpha: 1 });

  // Hair silhouette, tilted with the head.
  const up2 = P(onHead(0, 1, 0));
  const rot = Math.atan2(up2.x - centre.x, -(up2.y - centre.y));
  const hairC = P(add(centre3, add(scale(hu, 0.012), scale(hf, -0.01))));
  const hair = { x: hairC.x, y: hairC.y, rx: px(rx * 1.13, centre), ry: px(ry * 1.08, centre), rot };

  // Face cap: front hemisphere below the hairline (latitude < 38 degrees), visible points only.
  const face: Projected[] = [];
  for (let lat = -80; lat <= 38; lat += 14) {
    for (let lon = -85; lon <= 85; lon += 17) {
      const la = lat * DEG;
      const lo = lon * DEG;
      const p = P(onHead(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo), 1.0));
      if (visible(p)) face.push(p);
    }
  }

  const features: FaceFeatures = { eyes: [], brows: [], cheeks: [] };
  for (const side of [1, -1]) {
    const eye = P(onHead(0.92, 0.1, 0.37 * side));
    if (visible(eye)) {
      const e1 = P(onHead(0.9, 0.1, 0.37 * side + 0.12));
      const e0 = P(onHead(0.9, 0.1, 0.37 * side - 0.12));
      const ew = Math.hypot(e1.x - e0.x, e1.y - e0.y) / 2;
      features.eyes.push({ x: eye.x, y: eye.y, rx: Math.max(0.8, ew * 0.55), ry: px(0.0075, eye), rot });
      features.brows.push([P(onHead(0.88, 0.3, 0.37 * side - 0.15)), P(onHead(0.86, 0.33, 0.37 * side + 0.15))]);
      const cheek = P(onHead(0.82, -0.22, 0.5 * side));
      if (visible(cheek)) features.cheeks.push({ x: cheek.x, y: cheek.y, r: px(0.022, cheek) });
    }
  }
  const noseTip = P(onHead(1.08, -0.18, 0));
  if (visible(P(onHead(0.98, -0.12, 0)))) features.nose = [P(onHead(0.98, 0.0, 0)), noseTip];
  const mouthMid = P(onHead(0.93, -0.45, 0));
  if (visible(mouthMid)) {
    features.mouth = [P(onHead(0.9, -0.38, 0.24)), P(onHead(0.95, -0.56, 0)), P(onHead(0.9, -0.38, -0.24))];
  }

  const buns = [1, -1].map((side) => {
    const b = P(onHead(-0.2, 0.78, 0.58 * side, 1.1));
    return { x: b.x, y: b.y, r: px(0.055, b), behind: b.depth > centre.depth };
  });
  parts.push({
    kind: "head", centre, hair, face: face.length >= 3 ? convexHull(face) : [], features,
    buns,
    depth: Z(centre3), alpha: 1,
  });

  // Hands: skin mittens around the wrist, knuckles, thumb and finger tips.
  for (const [wr, pk, ix, th] of [
    [BT.lWrist, BT.lPinky, BT.lIndex, BT.lThumb],
    [BT.rWrist, BT.rPinky, BT.rIndex, BT.rThumb],
  ] as const) {
    const tip = (i: number): Projected => P(add(w[wr], scale(sub(w[i], w[wr]), 1.75)));
    const pts = [pj[wr], pj[pk], pj[ix], pj[th], tip(pk), tip(ix)];
    parts.push({
      kind: "blob", mat: "skin", outline: convexHull(pts), strokePx: px(0.02, pj[wr]),
      depth: Z(w[wr]) - 0.006, alpha: partAlpha(pose.v, [wr, pk, ix]),
    });
  }

  // Boots, in front of the trouser hem so they stay readable. None when seated.
  for (const [an, he, ft] of upperBodyOnly ? [] : [
    [BT.lAnkle, BT.lHeel, BT.lFoot],
    [BT.rAnkle, BT.rHeel, BT.rFoot],
  ] as const) {
    const lowAnkle = P(add(w[an], [0, 0.045, 0]));
    const pts = [lowAnkle, pj[he], pj[ft]];
    parts.push({
      kind: "blob", mat: "shoe", outline: convexHull(pts), strokePx: px(0.036, pj[an]),
      sole: [pj[he], pj[ft]], depth: Z(w[an]) - 0.004, alpha: partAlpha(pose.v, [an, he, ft]),
    });
  }

  return parts.sort((p, q) => q.depth - p.depth);
}
