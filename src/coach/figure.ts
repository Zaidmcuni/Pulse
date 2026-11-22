/**
 * Owner: Toufic
 * Purpose: PHASE 0 PROTOTYPE for #97. Draws the human coach (our own character: a fitted cobalt satin blazer
 *          with white lapels and sequin sparkle over a silver top, a gold belt, high-waisted black satin wide-leg
 *          trousers, silver ankle boots, dark plum hair in two space buns, a smiling face)
 *          from buildFigure() parts, with soft shading, a bright white halo, a contact shadow and a faint
 *          reflection on the glossy floor.
 * FRs: FR-26
 */
import {
  buildFigure, project, type BlobPart, type BodyPose3D, type HeadPart, type LimbPart, type Material,
  type Pt, type StageCamera, type TorsoPart,
} from "./coach3d";

type Ctx = CanvasRenderingContext2D;

/** Each material: base colour, lit tone and shadow tone. */
const MAT: Record<Material, { base: string; light: string; dark: string }> = {
  skin: { base: "#f2cbb0", light: "#fde4d3", dark: "#c9937a" },
  jacket: { base: "#2856e8", light: "#7097ff", dark: "#122c8a" },
  pants: { base: "#24202f", light: "#5a5274", dark: "#0e0c15" },
  shoe: { base: "#d5d9e4", light: "#ffffff", dark: "#868ca1" },
  hair: { base: "#4a1d3f", light: "#b4558a", dark: "#1f0819" },
};
const TOP_LIGHT = "#ffffff";
const TOP_DARK = "#b9c3dc";
const LAPEL = "#f7f8ff";
const CUFF = "#f7f8ff";
const BELT = "#e6b549";
const SOLE = "#5b6178";
const GLOW = "rgba(255, 255, 255, 0.95)";
const OUTLINE = "#fffaf2";

/** Closed smooth curve through the midpoints of a polygon. */
function smoothPath(ctx: Ctx, pts: readonly Pt[]): void {
  const n = pts.length;
  ctx.beginPath();
  if (n < 3) {
    if (n > 0) ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    return;
  }
  const m = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = m(pts[n - 1], pts[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = m(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p.x, p.y, q.x, q.y);
  }
  ctx.closePath();
}

function polyPath(ctx: Ctx, pts: readonly Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** Gradient across a limb: key light from the upper left, shadow on the far edge. */
function crossGradient(ctx: Ctx, a: Pt, b: Pt, r: number, mat: Material): CanvasGradient {
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if (nx + ny > 0) {
    nx = -nx;
    ny = -ny; // point the lit side toward the upper left
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
  const m = MAT[mat];
  g.addColorStop(0, m.light);
  g.addColorStop(0.42, m.base);
  g.addColorStop(1, m.dark);
  return g;
}

function drawLimb(ctx: Ctx, p: LimbPart): void {
  const r = Math.max(p.ra, p.rb);
  ctx.fillStyle = crossGradient(ctx, p.a, p.b, r, p.mat);
  smoothPath(ctx, p.outline);
  ctx.fill();
  if (p.cuff) {
    // Ribbed cuff a little above the wrist.
    const t = 0.86;
    const c = { x: p.a.x + (p.b.x - p.a.x) * t, y: p.a.y + (p.b.y - p.a.y) * t };
    const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
    const nx = len > 1e-6 ? -(p.b.y - p.a.y) / len : 1;
    const ny = len > 1e-6 ? (p.b.x - p.a.x) / len : 0;
    ctx.strokeStyle = CUFF;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, p.rb * 0.55);
    ctx.beginPath();
    ctx.moveTo(c.x + nx * p.rb * 0.95, c.y + ny * p.rb * 0.95);
    ctx.lineTo(c.x - nx * p.rb * 0.95, c.y - ny * p.rb * 0.95);
    ctx.stroke();
  }
  const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
  const nx = len > 1e-6 ? -(p.b.y - p.a.y) / len : 1;
  const ny = len > 1e-6 ? (p.b.x - p.a.x) / len : 0;
  if (p.mat === "jacket") {
    // Sequin sparkle: a few bright points scattered along the satin sleeve.
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + i * 0.16;
      const side = ((i * 7) % 5) / 5 - 0.4;
      const rad = p.ra + (p.rb - p.ra) * t;
      ctx.beginPath();
      ctx.arc(p.a.x + (p.b.x - p.a.x) * t + nx * rad * side, p.a.y + (p.b.y - p.a.y) * t + ny * rad * side, Math.max(0.6, rad * 0.12), 0, 2 * Math.PI);
      ctx.fill();
    }
  } else if (p.mat === "pants") {
    // Pressed crease down the front of the leg.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(p.a.x, p.a.y);
    ctx.lineTo(p.b.x, p.b.y);
    ctx.stroke();
  }
}

function drawBlob(ctx: Ctx, p: BlobPart): void {
  const m = MAT[p.mat];
  const box = bounds(p.outline);
  const g = ctx.createLinearGradient(box.x0, box.y0, box.x1, box.y1);
  g.addColorStop(0, m.light);
  g.addColorStop(1, m.dark);
  ctx.fillStyle = g;
  ctx.strokeStyle = g;
  ctx.lineJoin = "round";
  ctx.lineWidth = 2 * p.strokePx;
  polyPath(ctx, p.outline);
  ctx.fill();
  ctx.stroke();
  if (p.sole) {
    const [h, t] = p.sole;
    ctx.strokeStyle = SOLE;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, p.strokePx * 0.55);
    const drop = p.strokePx * 0.75;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y + drop);
    ctx.lineTo(t.x, t.y + drop);
    ctx.stroke();
  }
}

function bounds(pts: readonly Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

function drawTorso(ctx: Ctx, t: TorsoPart): void {
  // Pelvis (trousers) under the jacket hem.
  const pb = bounds(t.pelvis);
  const pg = ctx.createLinearGradient(pb.x0, pb.y0, pb.x1, pb.y1);
  pg.addColorStop(0, MAT.pants.light);
  pg.addColorStop(0.5, MAT.pants.base);
  pg.addColorStop(1, MAT.pants.dark);
  ctx.fillStyle = pg;
  smoothPath(ctx, t.pelvis);
  ctx.fill();

  const jb = bounds(t.jacket);
  const jg = ctx.createLinearGradient(jb.x0, jb.y0, jb.x1, jb.y1);
  jg.addColorStop(0, MAT.jacket.light);
  jg.addColorStop(0.45, MAT.jacket.base);
  jg.addColorStop(1, MAT.jacket.dark);
  ctx.fillStyle = jg;
  smoothPath(ctx, t.jacket);
  ctx.fill();

  if (t.tee) {
    // Silver top with a soft metallic sheen.
    const tb = bounds(t.tee);
    const sg = ctx.createLinearGradient(tb.x0, tb.y0, tb.x1, tb.y1);
    sg.addColorStop(0, TOP_LIGHT);
    sg.addColorStop(0.5, TOP_DARK);
    sg.addColorStop(1, TOP_LIGHT);
    ctx.fillStyle = sg;
    smoothPath(ctx, t.tee);
    ctx.fill();
  }
  for (const lapel of t.lapels ?? []) {
    ctx.fillStyle = LAPEL;
    ctx.strokeStyle = MAT.jacket.dark;
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    polyPath(ctx, lapel);
    ctx.fill();
    ctx.stroke();
  }
  if (t.backBand) {
    ctx.fillStyle = MAT.jacket.dark;
    polyPath(ctx, t.backBand);
    ctx.fill();
  }
  // Gold belt at the high waist, with a buckle in front.
  ctx.strokeStyle = BELT;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.5, Math.hypot(t.top.x - t.bottom.x, t.top.y - t.bottom.y) * 0.05);
  ctx.beginPath();
  ctx.moveTo(t.waist[0].x, t.waist[0].y);
  for (let i = 1; i < t.waist.length; i++) ctx.lineTo(t.waist[i].x, t.waist[i].y);
  ctx.stroke();
  if (t.front) {
    const b = t.waist[Math.floor(t.waist.length / 2)];
    ctx.fillStyle = "#fff1c2";
    ctx.beginPath();
    ctx.arc(b.x, b.y, Math.max(1.2, ctx.lineWidth * 0.8), 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawHead(ctx: Ctx, h: HeadPart): void {
  const hair = MAT.hair;
  const buns = (behind: boolean): void => {
    for (const b of h.buns) {
      if (b.behind !== behind) continue;
      const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
      g.addColorStop(0, hair.light);
      g.addColorStop(1, hair.dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
      ctx.fill();
    }
  };
  buns(true);

  const e = h.hair;
  const hg = ctx.createRadialGradient(e.x - e.rx * 0.35, e.y - e.ry * 0.45, e.rx * 0.1, e.x, e.y, e.ry * 1.05);
  hg.addColorStop(0, hair.light);
  hg.addColorStop(0.55, hair.base);
  hg.addColorStop(1, hair.dark);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.rx, e.ry, e.rot, 0, 2 * Math.PI);
  ctx.fill();

  if (h.face.length >= 3) {
    const fb = bounds(h.face);
    const fg = ctx.createLinearGradient(fb.x0, fb.y0, fb.x1, fb.y1);
    fg.addColorStop(0, MAT.skin.light);
    fg.addColorStop(0.55, MAT.skin.base);
    fg.addColorStop(1, MAT.skin.dark);
    ctx.fillStyle = fg;
    smoothPath(ctx, h.face);
    ctx.fill();
  }

  const f = h.features;
  ctx.lineCap = "round";
  for (const c of f.cheeks) {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    g.addColorStop(0, "rgba(240, 120, 140, 0.45)");
    g.addColorStop(1, "rgba(240, 120, 140, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
    ctx.fill();
  }
  for (const eye of f.eyes) {
    // Lash line above the eye.
    ctx.strokeStyle = "#1c0f14";
    ctx.lineWidth = Math.max(0.8, eye.ry * 0.55);
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y, eye.rx * 1.25, eye.ry * 1.25, eye.rot, Math.PI * 1.1, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = "#24140f";
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y, eye.rx, eye.ry, eye.rot, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(eye.x - eye.rx * 0.3, eye.y - eye.ry * 0.35, Math.max(0.5, eye.ry * 0.35), 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.strokeStyle = "#5a2a40"; // brows a shade lighter than the hair
  for (const [a, b] of f.brows) {
    ctx.lineWidth = Math.max(0.8, Math.hypot(b.x - a.x, b.y - a.y) * 0.2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 1, b.x, b.y);
    ctx.stroke();
  }
  if (f.nose) {
    ctx.strokeStyle = "rgba(196, 128, 106, 0.6)";
    ctx.lineWidth = Math.max(0.8, Math.hypot(f.nose[1].x - f.nose[0].x, f.nose[1].y - f.nose[0].y) * 0.18);
    ctx.beginPath();
    ctx.moveTo(f.nose[0].x, f.nose[0].y);
    ctx.lineTo(f.nose[1].x, f.nose[1].y);
    ctx.stroke();
  }
  if (f.mouth) {
    // Open, happy smile: flat-ish upper lip, deep lower curve, a hint of teeth.
    const [l, m, r] = f.mouth;
    const midTop = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    const ctrl = { x: m.x, y: m.y + (m.y - midTop.y) };
    ctx.fillStyle = "#a8323f";
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, r.x, r.y);
    ctx.quadraticCurveTo(midTop.x, midTop.y + (m.y - midTop.y) * 0.15, l.x, l.y);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = Math.max(0.8, Math.hypot(r.x - l.x, r.y - l.y) * 0.12);
    ctx.beginPath();
    ctx.moveTo(l.x + (r.x - l.x) * 0.2, l.y + (r.y - l.y) * 0.2 + (m.y - midTop.y) * 0.25);
    ctx.lineTo(l.x + (r.x - l.x) * 0.8, l.y + (r.y - l.y) * 0.8 + (m.y - midTop.y) * 0.25);
    ctx.stroke();
  }
  buns(false);
}

/** Draws only the body (no glow), far to near. */
export function drawFigureBody(ctx: Ctx, cam: StageCamera, pose: BodyPose3D, upperBodyOnly = false): void {
  for (const part of buildFigure(pose, cam, upperBodyOnly)) {
    ctx.save();
    ctx.globalAlpha = part.alpha;
    if (part.kind === "limb") drawLimb(ctx, part);
    else if (part.kind === "blob") drawBlob(ctx, part);
    else if (part.kind === "torso") drawTorso(ctx, part);
    else drawHead(ctx, part);
    ctx.restore();
  }
}

/** Soft contact shadow on the floor under the hips; fades as the body leaves the floor. */
function drawShadow(ctx: Ctx, cam: StageCamera, pose: BodyPose3D): void {
  let lowest = Number.NEGATIVE_INFINITY;
  for (const p of pose.world) lowest = Math.max(lowest, p[1]);
  const gapM = Math.max(0, pose.root[1] - lowest);
  const c = project(cam, [pose.root[0], 0, pose.root[2]]);
  const rx = Math.abs(project(cam, [pose.root[0] + 0.42, 0, pose.root[2]]).x - c.x);
  const ry = Math.max(2, Math.abs(project(cam, [pose.root[0], 0, pose.root[2] + 0.25]).y - c.y));
  const k = 1 / (1 + gapM * 3);
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rx);
  g.addColorStop(0, "rgba(60, 25, 20, 0.5)");
  g.addColorStop(1, "rgba(60, 25, 20, 0)");
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(c.x, c.y);
  ctx.scale(1, ry / rx);
  ctx.translate(-c.x, -c.y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, rx * (0.7 + 0.3 * k), 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

/** Faint mirror image on the glossy floor, fading with distance below the feet. */
function drawReflection(ctx: Ctx, cam: StageCamera, pose: BodyPose3D, body: HTMLCanvasElement): void {
  const floorY = project(cam, [pose.root[0], 0, pose.root[2]]).y;
  const bands = 8;
  const bandPx = (body.height - floorY) / bands;
  if (bandPx <= 0) return;
  for (let i = 0; i < bands; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, floorY + i * bandPx, body.width, bandPx + 1);
    ctx.clip();
    ctx.globalAlpha = 0.2 * (1 - i / bands);
    ctx.translate(0, 2 * floorY);
    ctx.scale(1, -1);
    ctx.drawImage(body, 0, 0);
    ctx.restore();
  }
}

/** Scratch canvases for drawFigure, each the size of the target canvas. */
export interface FigureLayers {
  body: { canvas: HTMLCanvasElement; ctx: Ctx };
  tint: { canvas: HTMLCanvasElement; ctx: Ctx };
}

/**
 * The whole coach on top of an already drawn stage: contact shadow, a soft warm glow, a crisp white
 * outline (the body's silhouette stamped around it), then the body itself.
 */
export function drawFigure(
  ctx: Ctx,
  cam: StageCamera,
  pose: BodyPose3D,
  layers: FigureLayers,
  upperBodyOnly = false,
): void {
  const { body, tint } = layers;
  body.ctx.clearRect(0, 0, body.canvas.width, body.canvas.height);
  drawFigureBody(body.ctx, cam, pose, upperBodyOnly);

  // White silhouette of the body.
  tint.ctx.save();
  tint.ctx.clearRect(0, 0, tint.canvas.width, tint.canvas.height);
  tint.ctx.drawImage(body.canvas, 0, 0);
  tint.ctx.globalCompositeOperation = "source-in";
  tint.ctx.fillStyle = OUTLINE;
  tint.ctx.fillRect(0, 0, tint.canvas.width, tint.canvas.height);
  tint.ctx.restore();

  if (!upperBodyOnly) {
    // The floor is out of view in the seated framing.
    drawShadow(ctx, cam, pose);
    drawReflection(ctx, cam, pose, body.canvas);
  }

  ctx.save();
  ctx.shadowColor = GLOW;
  ctx.shadowBlur = cam.focalPx * 0.045;
  ctx.drawImage(tint.canvas, 0, 0);
  ctx.drawImage(tint.canvas, 0, 0);
  ctx.restore();
  const r = Math.max(2, cam.focalPx * 0.006);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 2 * Math.PI;
    ctx.drawImage(tint.canvas, Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.drawImage(body.canvas, 0, 0);
}
