/**
 * Owner: Toufic
 * Purpose: Pure human contour geometry builders (tapered limbs, hands, feet, sculpted torso, seated bust, neck, oval head)
 * FRs: FR-26, FR-49
 */

import type { Vec2 } from "../types/pulse";

export interface ContourPoint {
  x: number;
  y: number;
}

export interface LimbProfileStation {
  readonly t: number;      // 0..1 along bone (from -> to)
  readonly rLeft: number;  // half-width on +normal side (in bodyScale units)
  readonly rRight: number; // half-width on -normal side (in bodyScale units)
}

/** Deltoid shoulder cap -> natural bicep contour -> tapered elbow. */
export const UPPER_ARM_PROFILE: readonly LimbProfileStation[] = [
  { t: 0.0,  rLeft: 0.142, rRight: 0.142 },
  { t: 0.36, rLeft: 0.136, rRight: 0.136 },
  { t: 0.72, rLeft: 0.114, rRight: 0.114 },
  { t: 1.0,  rLeft: 0.096, rRight: 0.096 },
];

/** Elbow -> subtle upper-forearm curve -> clean slim wrist. */
export const FOREARM_PROFILE: readonly LimbProfileStation[] = [
  { t: 0.0,  rLeft: 0.094, rRight: 0.094 },
  { t: 0.25, rLeft: 0.102, rRight: 0.102 },
  { t: 0.68, rLeft: 0.076, rRight: 0.076 },
  { t: 1.0,  rLeft: 0.060, rRight: 0.060 },
];

/** Hip/upper quad -> athletic mid-thigh -> tapered knee. */
export const THIGH_PROFILE: readonly LimbProfileStation[] = [
  { t: 0.0,  rLeft: 0.180, rRight: 0.180 },
  { t: 0.38, rLeft: 0.168, rRight: 0.168 },
  { t: 0.75, rLeft: 0.134, rRight: 0.134 },
  { t: 1.0,  rLeft: 0.110, rRight: 0.110 },
];

/** Knee -> subtle calf curve -> lower shin -> slim ankle. */
export const SHIN_PROFILE: readonly LimbProfileStation[] = [
  { t: 0.0,  rLeft: 0.106, rRight: 0.106 },
  { t: 0.28, rLeft: 0.126, rRight: 0.118 },
  { t: 0.72, rLeft: 0.078, rRight: 0.078 },
  { t: 1.0,  rLeft: 0.064, rRight: 0.064 },
];

const HAND_PROFILE: readonly LimbProfileStation[] = [
  { t: 0.0,  rLeft: 0.058, rRight: 0.058 },
  { t: 0.45, rLeft: 0.068, rRight: 0.068 },
  { t: 1.0,  rLeft: 0.036, rRight: 0.036 },
];

const FOOT_PROFILE: readonly LimbProfileStation[] = [
  { t: 0.0, rLeft: 0.064, rRight: 0.064 },
  { t: 0.5, rLeft: 0.060, rRight: 0.060 },
  { t: 1.0, rLeft: 0.048, rRight: 0.048 },
];

function safeScale(bodyScale: number): number {
  return Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;
}

function normalizeUp(up: Vec2): Vec2 {
  const len = Math.hypot(up[0], up[1]);
  if (!Number.isFinite(len) || len < 1e-6) return [0, -1];
  return [up[0] / len, up[1] / len];
}

function sampleStation(
  stations: readonly LimbProfileStation[],
  tInput: number,
): { rLeft: number; rRight: number } {
  const t = tInput <= 0 ? 0 : tInput >= 1 ? 1 : tInput;
  const first = stations[0];
  const last = stations[stations.length - 1];
  if (t <= first.t) return { rLeft: first.rLeft, rRight: first.rRight };
  if (t >= last.t) return { rLeft: last.rLeft, rRight: last.rRight };

  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const u = span > 1e-6 ? (t - a.t) / span : 0;
      const s = u * u * (3 - 2 * u);
      return {
        rLeft: a.rLeft + (b.rLeft - a.rLeft) * s,
        rRight: a.rRight + (b.rRight - a.rRight) * s,
      };
    }
  }
  return { rLeft: last.rLeft, rRight: last.rRight };
}

/**
 * Builds a closed, smoothly tapered human limb polygon with rounded semicircular endcaps.
 * Handles extreme 3D-to-2D foreshortening (`len < 1e-3`) by returning a smooth 16-vertex circle.
 */
export function buildLimbContour(
  from: ContourPoint,
  to: ContourPoint,
  stations: readonly LimbProfileStation[],
  bodyScale: number,
  capSegments = 6,
): ContourPoint[] {
  if (stations.length === 0) return [];
  const scale = safeScale(bodyScale);
  const caps = Math.max(2, Math.floor(capSegments));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);

  if (!Number.isFinite(len) || len < 1e-3) {
    const first = stations[0];
    const last = stations[stations.length - 1];
    const radius = Math.max(first.rLeft, first.rRight, last.rLeft, last.rRight) * scale;
    const circle: ContourPoint[] = new Array<ContourPoint>(16);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      circle[i] = {
        x: from.x + Math.cos(angle) * radius,
        y: from.y + Math.sin(angle) * radius,
      };
    }
    return circle;
  }

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const longitudinalSteps = 10;
  const pts: ContourPoint[] = [];

  // Proximal endcap around `from` (from -normal around -u to +normal)
  const startR = 0.5 * (stations[0].rLeft + stations[0].rRight) * scale;
  for (let k = 1; k < caps; k++) {
    const a = -Math.PI / 2 + (k / caps) * Math.PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pts.push({
      x: from.x + (-ux * ca + nx * sa) * startR,
      y: from.y + (-uy * ca + ny * sa) * startR,
    });
  }

  // +normal edge from t = 0 to t = 1
  for (let i = 0; i <= longitudinalSteps; i++) {
    const t = i / longitudinalSteps;
    const { rLeft } = sampleStation(stations, t);
    const bx = from.x + dx * t;
    const by = from.y + dy * t;
    pts.push({
      x: bx + nx * rLeft * scale,
      y: by + ny * rLeft * scale,
    });
  }

  // Distal endcap around `to` (from +normal around +u to -normal)
  const last = stations[stations.length - 1];
  const endR = 0.5 * (last.rLeft + last.rRight) * scale;
  for (let k = 1; k < caps; k++) {
    const a = Math.PI / 2 - (k / caps) * Math.PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pts.push({
      x: to.x + (ux * ca + nx * sa) * endR,
      y: to.y + (uy * ca + ny * sa) * endR,
    });
  }

  // -normal edge from t = 1 back to t = 0
  for (let i = longitudinalSteps; i >= 0; i--) {
    const t = i / longitudinalSteps;
    const { rRight } = sampleStation(stations, t);
    const bx = from.x + dx * t;
    const by = from.y + dy * t;
    pts.push({
      x: bx - nx * rRight * scale,
      y: by - ny * rRight * scale,
    });
  }

  return pts;
}

/** Builds a sleek, rounded hand/mitt contour extending past `wrist` along the forearm axis. */
export function buildHandContour(
  elbow: ContourPoint,
  wrist: ContourPoint,
  bodyScale: number,
): ContourPoint[] {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const forearmLen = Math.hypot(dx, dy);
  if (!Number.isFinite(forearmLen) || forearmLen < 1e-3 || !(bodyScale > 0)) {
    return [];
  }
  const scale = safeScale(bodyScale);
  const handLen = Math.min(forearmLen * 0.26, scale * 0.18);
  if (handLen < 1e-3) return [];
  const ux = dx / forearmLen;
  const uy = dy / forearmLen;
  const tip: ContourPoint = {
    x: wrist.x + ux * handLen,
    y: wrist.y + uy * handLen,
  };
  return buildLimbContour(wrist, tip, HAND_PROFILE, scale, 5);
}

/** Builds a subtle rounded foot/shoe silhouette extending slightly outward from `ankle`. */
export function buildFootContour(
  knee: ContourPoint,
  ankle: ContourPoint,
  bodyScale: number,
  outwardSign: 1 | -1,
): ContourPoint[] {
  const dx = ankle.x - knee.x;
  const dy = ankle.y - knee.y;
  const shinLen = Math.hypot(dx, dy);
  if (!Number.isFinite(shinLen) || shinLen < 1e-3 || !(bodyScale > 0)) {
    return [];
  }
  const scale = safeScale(bodyScale);
  const footLen = Math.min(shinLen * 0.20, scale * 0.15);
  if (footLen < 1e-3) return [];
  const ux = dx / shinLen;
  const uy = dy / shinLen;
  const nx = -uy;
  const ny = ux;
  const dirX = ux * 0.85 + nx * outwardSign * 0.35;
  const dirY = uy * 0.85 + ny * outwardSign * 0.35;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const toe: ContourPoint = {
    x: ankle.x + (dirX / dirLen) * footLen,
    y: ankle.y + (dirY / dirLen) * footLen,
  };
  return buildLimbContour(ankle, toe, FOOT_PROFILE, scale, 5);
}

/**
 * Builds a ~32-point sculpted human torso silhouette with arched collarbone, deltoid rounding,
 * athletic waist taper (at 60% down from shoulders), hip flare, and rounded pelvic arc.
 * Includes an anti-bowtie / sideways-turn guard so 90° spins stay smooth and non-degenerate.
 */
export function buildTorsoContour(
  lShoulder: ContourPoint,
  rShoulder: ContourPoint,
  lHip: ContourPoint,
  rHip: ContourPoint,
  bodyScale: number,
): ContourPoint[] {
  const scale = safeScale(bodyScale);
  const shoulderMid: ContourPoint = {
    x: (lShoulder.x + rShoulder.x) * 0.5,
    y: (lShoulder.y + rShoulder.y) * 0.5,
  };
  const hipMid: ContourPoint = {
    x: (lHip.x + rHip.x) * 0.5,
    y: (lHip.y + rHip.y) * 0.5,
  };

  const tDx = shoulderMid.x - hipMid.x;
  const tDy = shoulderMid.y - hipMid.y;
  const rawTorsoLen = Math.hypot(tDx, tDy);
  const upX = rawTorsoLen > 1e-3 ? tDx / rawTorsoLen : 0;
  const upY = rawTorsoLen > 1e-3 ? tDy / rawTorsoLen : -1;
  const torsoLen = Math.max(rawTorsoLen, scale * 0.45);

  const perpX = -upY;
  const perpY = upX;
  const sDx = lShoulder.x - rShoulder.x;
  const sDy = lShoulder.y - rShoulder.y;
  const dot = sDx * perpX + sDy * perpY;
  const sign = dot < 0 ? -1 : 1;
  const ax = perpX * sign;
  const ay = perpY * sign;

  const actualShoulderHalf = 0.5 * Math.hypot(sDx, sDy);
  const actualHipHalf = 0.5 * Math.hypot(lHip.x - rHip.x, lHip.y - rHip.y);

  const shoulderHalf = Math.max(actualShoulderHalf, scale * 0.20) + scale * 0.10;
  const hipHalf = Math.max(actualHipHalf, scale * 0.17) + scale * 0.07;
  const waistHalf = Math.min(shoulderHalf * 0.72, hipHalf * 0.90);

  const ptAt = (uFrac: number, acrossOffset: number): ContourPoint => {
    const bx = hipMid.x + upX * (uFrac * torsoLen);
    const by = hipMid.y + upY * (uFrac * torsoLen);
    return {
      x: bx + ax * acrossOffset,
      y: by + ay * acrossOffset,
    };
  };

  const profileRight: ReadonlyArray<readonly [number, number]> = [
    [0.98, shoulderHalf * 0.86],
    [0.92, shoulderHalf * 0.98],
    [0.84, shoulderHalf * 1.00],
    [0.74, waistHalf + (shoulderHalf - waistHalf) * 0.72],
    [0.62, waistHalf + (shoulderHalf - waistHalf) * 0.38],
    [0.50, waistHalf + (shoulderHalf - waistHalf) * 0.10],
    [0.40, waistHalf], // 60% down from shoulders -> natural waist
    [0.28, waistHalf + (hipHalf - waistHalf) * 0.45],
    [0.16, waistHalf + (hipHalf - waistHalf) * 0.85],
    [0.06, hipHalf * 1.00],
    [0.00, hipHalf * 0.92],
  ];

  const pts: ContourPoint[] = [
    // Collarbone / trapezius crown (left -> center -> right)
    ptAt(1.03, shoulderHalf * 0.62),
    ptAt(1.06, shoulderHalf * 0.28),
    ptAt(1.07, 0),
    ptAt(1.06, -shoulderHalf * 0.28),
    ptAt(1.03, -shoulderHalf * 0.62),
  ];

  // Right side (-across, top to bottom)
  for (const [u, w] of profileRight) {
    pts.push(ptAt(u, -w));
  }

  // Pelvic bottom arc (right -> center -> left)
  pts.push(
    ptAt(-0.04, -hipHalf * 0.66),
    ptAt(-0.06, -hipHalf * 0.26),
    ptAt(-0.07, 0),
    ptAt(-0.06, hipHalf * 0.26),
    ptAt(-0.04, hipHalf * 0.66),
  );

  // Left side (+across, bottom to top)
  for (let i = profileRight.length - 1; i >= 0; i--) {
    const [u, w] = profileRight[i];
    pts.push(ptAt(u, w));
  }

  return pts;
}

/**
 * Builds a sculpted upper-chest/ribcage bust contour for seated mode when hips are occluded.
 */
export function buildSeatedTorsoContour(
  lShoulder: ContourPoint,
  rShoulder: ContourPoint,
  bodyScale: number,
): ContourPoint[] {
  const scale = safeScale(bodyScale);
  const shoulderMid: ContourPoint = {
    x: (lShoulder.x + rShoulder.x) * 0.5,
    y: (lShoulder.y + rShoulder.y) * 0.5,
  };
  const sDx = lShoulder.x - rShoulder.x;
  const sDy = lShoulder.y - rShoulder.y;
  const span = Math.hypot(sDx, sDy);

  // Derive unit `up` perpendicular to shoulder line pointing screen-up (y <= 0)
  let upX = 0;
  let upY = -1;
  if (span > 1e-3) {
    const p1x = -sDy / span;
    const p1y = sDx / span;
    if (p1y <= 0) {
      upX = p1x;
      upY = p1y;
    } else {
      upX = -p1x;
      upY = -p1y;
    }
  }

  const bustLen = scale * 0.92;
  const hipMid: ContourPoint = {
    x: shoulderMid.x - upX * bustLen,
    y: shoulderMid.y - upY * bustLen,
  };
  const lHipVirtual: ContourPoint = {
    x: hipMid.x + (lShoulder.x - shoulderMid.x) * 0.72,
    y: hipMid.y + (lShoulder.y - shoulderMid.y) * 0.72,
  };
  const rHipVirtual: ContourPoint = {
    x: hipMid.x + (rShoulder.x - shoulderMid.x) * 0.72,
    y: hipMid.y + (rShoulder.y - shoulderMid.y) * 0.72,
  };

  return buildTorsoContour(lShoulder, rShoulder, lHipVirtual, rHipVirtual, scale);
}

/** Builds a slightly tapered human neck polygon anchored at `shoulderMid` along `up`. */
export function buildNeckContour(
  shoulderMid: ContourPoint,
  up: Vec2,
  bodyScale: number,
): ContourPoint[] {
  const scale = safeScale(bodyScale);
  const [upX, upY] = normalizeUp(up);
  const ax = -upY;
  const ay = upX;

  const baseHalf = 0.135 * scale;
  const topHalf = 0.105 * scale;
  const yStart = -0.06 * scale;
  const yEnd = 0.20 * scale;

  const pt = (uOffset: number, acrossOffset: number): ContourPoint => ({
    x: shoulderMid.x + upX * uOffset + ax * acrossOffset,
    y: shoulderMid.y + upY * uOffset + ay * acrossOffset,
  });

  return [
    pt(yStart, baseHalf),
    pt((yStart + yEnd) * 0.5, (baseHalf + topHalf) * 0.5),
    pt(yEnd, topHalf),
    pt(yEnd + 0.03 * scale, topHalf * 0.5),
    pt(yEnd + 0.04 * scale, 0),
    pt(yEnd + 0.03 * scale, -topHalf * 0.5),
    pt(yEnd, -topHalf),
    pt((yStart + yEnd) * 0.5, -(baseHalf + topHalf) * 0.5),
    pt(yStart, -baseHalf),
    pt(yStart - 0.02 * scale, -baseHalf * 0.5),
    pt(yStart - 0.03 * scale, 0),
    pt(yStart - 0.02 * scale, baseHalf * 0.5),
  ];
}

/**
 * Builds a 24-vertex sculpted oval head aligned with `up`, tapering gently along the lower 35%
 * for a natural human jawline and chin profile.
 */
export function buildHeadContour(
  headCenter: ContourPoint,
  up: Vec2,
  bodyScale: number,
): ContourPoint[] {
  const scale = safeScale(bodyScale);
  const [upX, upY] = normalizeUp(up);
  const ax = -upY;
  const ay = upX;

  const rx = 0.23 * scale;
  const ry = 0.29 * scale;
  const vertices = 24;
  const pts: ContourPoint[] = new Array<ContourPoint>(vertices);

  for (let i = 0; i < vertices; i++) {
    const theta = (i / vertices) * 2 * Math.PI;
    const side = Math.cos(theta);
    const u = Math.sin(theta); // +1 at crown, -1 at chin
    let taper = 1;
    if (u < -0.3) {
      const jawT = (-0.3 - u) / 0.7;
      taper = 1 - 0.14 * jawT * jawT;
    }
    const localX = side * rx * taper;
    const localY = u * ry;
    pts[i] = {
      x: headCenter.x + ax * localX + upX * localY,
      y: headCenter.y + ay * localX + upY * localY,
    };
  }

  return pts;
}

/** Traces a closed polygon path using only standard moveTo/lineTo/closePath calls. */
export function tracePolygon(
  ctx: Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "closePath">,
  pts: readonly ContourPoint[],
): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}
