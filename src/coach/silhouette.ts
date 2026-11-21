/**
 * Owner: Toufic
 * Purpose: rebuild a fixed-proportion figure from a template SegmentMap and draw it as the coach silhouette
 * FRs: FR-26
 *
 * The template is NOT mirrored: it looks like the source video, so the dancer's own left is on the
 * viewer's right. Directions are pixel-space unit vectors with y down, drawn with equal x and y scales.
 */
import type { SegmentId, SegmentMap, Vec2 } from "../types/pulse";

export interface Point {
  x: number;
  y: number;
}

export interface Limb {
  segment: SegmentId;
  from: Point;
  to: Point;
}

export interface Silhouette {
  pxPerUnit: number;
  /** Present only when the sample has a torso direction. */
  torso?: { lShoulder: Point; rShoulder: Point; lHip: Point; rHip: Point; neckBase: Point; headCenter: Point };
  limbs: Limb[];
}

/** Body proportions in figure units (visual only; gameplay thresholds live in CONFIG). */
const BODY = {
  torso: 0.3,         // hip midpoint -> shoulder midpoint
  shoulderHalf: 0.1,  // shoulder midpoint -> each shoulder
  hipHalf: 0.065,     // hip midpoint -> each hip
  upperArm: 0.16,
  forearm: 0.15,
  thigh: 0.22,
  shin: 0.21,
  neck: 0.04,
  headRadius: 0.07,
  limbWidth: 0.075,
  torsoRounding: 0.06, // stroke width that rounds the torso's corners
  outline: 0.018,      // outline thickness around every shape
} as const;

const UPRIGHT: Vec2 = [0, -1]; // hips -> shoulders when standing straight

/** Farthest any drawn shape can reach from the hip midpoint, so every pose stays inside the canvas. */
const REACH =
  Math.max(
    Math.hypot(BODY.torso, BODY.shoulderHalf) + BODY.upperArm + BODY.forearm,
    BODY.hipHalf + BODY.thigh + BODY.shin,
    BODY.torso + BODY.neck + 2 * BODY.headRadius,
  ) +
  BODY.limbWidth / 2 +
  BODY.outline;

const BODY_COLOR = "#38bdf8";    // --pulse-cyan
const OUTLINE_COLOR = "#f3f6fc"; // --pulse-text

const CHAINS: readonly { anchor: "lShoulder" | "rShoulder" | "lHip" | "rHip"; links: readonly [SegmentId, SegmentId]; lengths: readonly [number, number] }[] = [
  { anchor: "lShoulder", links: ["l_upper_arm", "l_forearm"], lengths: [BODY.upperArm, BODY.forearm] },
  { anchor: "rShoulder", links: ["r_upper_arm", "r_forearm"], lengths: [BODY.upperArm, BODY.forearm] },
  { anchor: "lHip", links: ["l_thigh", "l_shin"], lengths: [BODY.thigh, BODY.shin] },
  { anchor: "rHip", links: ["r_thigh", "r_shin"], lengths: [BODY.thigh, BODY.shin] },
];

function along(p: Point, dir: Vec2, length: number): Point {
  return { x: p.x + dir[0] * length, y: p.y + dir[1] * length };
}

/** Joint positions in canvas pixels for one pose, hips centred in a widthPx x heightPx canvas. */
export function buildSilhouette(segments: SegmentMap, widthPx: number, heightPx: number): Silhouette {
  const pxPerUnit = Math.min(widthPx, heightPx) / (2 * REACH);
  const hipMid: Point = { x: widthPx / 2, y: heightPx / 2 };
  const up = segments.torso ?? UPRIGHT;
  // Perpendicular toward the dancer's own left: (1, 0) (viewer's right) when upright, and it turns with the torso.
  const left: Vec2 = [-up[1], up[0]];
  const shoulderMid = along(hipMid, up, BODY.torso * pxPerUnit);
  const anchors = {
    lShoulder: along(shoulderMid, left, BODY.shoulderHalf * pxPerUnit),
    rShoulder: along(shoulderMid, left, -BODY.shoulderHalf * pxPerUnit),
    lHip: along(hipMid, left, BODY.hipHalf * pxPerUnit),
    rHip: along(hipMid, left, -BODY.hipHalf * pxPerUnit),
  };

  const limbs: Limb[] = [];
  for (const chain of CHAINS) {
    let joint = anchors[chain.anchor];
    for (let i = 0; i < chain.links.length; i++) {
      const dir = segments[chain.links[i]];
      if (!dir) break; // nothing to attach the next link to
      const next = along(joint, dir, chain.lengths[i] * pxPerUnit);
      limbs.push({ segment: chain.links[i], from: joint, to: next });
      joint = next;
    }
  }

  if (!segments.torso) return { pxPerUnit, limbs };
  const neckBase = along(shoulderMid, up, BODY.neck * pxPerUnit);
  const headCenter = along(neckBase, up, BODY.headRadius * pxPerUnit);
  return { pxPerUnit, limbs, torso: { ...anchors, neckBase, headCenter } };
}

/** The canvas calls drawCoach uses (a recording fake implements these in tests). */
export type CoachDrawContext = Pick<
  CanvasRenderingContext2D,
  "clearRect" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "arc" | "fill" | "stroke"
  | "fillStyle" | "strokeStyle" | "lineWidth" | "lineCap" | "lineJoin"
>;

/** Clears the canvas, then draws the pose: an outline pass, then the body on top. Empty map = clear canvas. */
export function drawCoach(ctx: CoachDrawContext, widthPx: number, heightPx: number, segments: SegmentMap): void {
  ctx.clearRect(0, 0, widthPx, heightPx);
  const s = buildSilhouette(segments, widthPx, heightPx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  paint(ctx, s, OUTLINE_COLOR, BODY.outline);
  paint(ctx, s, BODY_COLOR, 0);
}

function paint(ctx: CoachDrawContext, s: Silhouette, color: string, growUnits: number): void {
  const px = s.pxPerUnit;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (s.torso) {
    const t = s.torso;
    ctx.lineWidth = (BODY.torsoRounding + 2 * growUnits) * px;
    ctx.beginPath();
    ctx.moveTo(t.lShoulder.x, t.lShoulder.y);
    ctx.lineTo(t.rShoulder.x, t.rShoulder.y);
    ctx.lineTo(t.rHip.x, t.rHip.y);
    ctx.lineTo(t.lHip.x, t.lHip.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = (BODY.limbWidth + 2 * growUnits) * px;
    ctx.beginPath();
    const shoulderMidX = (t.lShoulder.x + t.rShoulder.x) / 2;
    const shoulderMidY = (t.lShoulder.y + t.rShoulder.y) / 2;
    ctx.moveTo(shoulderMidX, shoulderMidY);
    ctx.lineTo(t.neckBase.x, t.neckBase.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(t.headCenter.x, t.headCenter.y, (BODY.headRadius + growUnits) * px, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.lineWidth = (BODY.limbWidth + 2 * growUnits) * px;
  for (const limb of s.limbs) {
    ctx.beginPath();
    ctx.moveTo(limb.from.x, limb.from.y);
    ctx.lineTo(limb.to.x, limb.to.y);
    ctx.stroke();
  }
}
