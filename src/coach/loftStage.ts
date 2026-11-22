/**
 * Owner: Toufic
 * Purpose: PHASE 0 PROTOTYPE for #97. The coach's stage, our own design: a sunset lounge seen from the same
 *          fixed camera as the dancer. A glass wall onto a pink-gold sky, soft warm spotlights, a glossy floor
 *          with a light ring on the home spot, plants, warm string lights and big floating silk sheets.
 *          Static (no flashing): draw it once to an offscreen canvas and reuse it every frame.
 * FRs: FR-26
 */
import { LOOK, project, type Projected, type Pt, type StageCamera } from "./coach3d";

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];

const ROOM = { x0: -3.4, x1: 3.4, zNear: 1.6, zBack: 7.2, height: 4.2 } as const;
const WINDOWS = [-2.05, 0, 2.05] as const; // window centres on the back wall (m)
const WIN = { half: 0.95, sill: 0.12, top: 3.7, transom: 2.5 } as const; // tall panes, nearly a glass wall

const C = {
  wallTop: "#5d3f6e",
  wallBottom: "#9c6a86",
  sideWall: "#4a3358",
  sideWallNear: "#2a1c36",
  skyTop: "#7a6bd6",
  skyMid: "#f29ac0",
  skyLow: "#ffc58f",
  frame: "#3a2840",
  floorFar: "#8a4f5f",
  floorNear: "#24101a",
  plank: "rgba(255, 255, 255, 0.05)",
  ring: "rgba(255, 241, 246, 0.75)",
  ring2: "rgba(255, 201, 168, 0.6)",
  pot: "#b0607a",
  leafA: "#3f7f62",
  leafB: "#2b5d48",
} as const

/** Warm light colours (r, g, b): rose, gold, cream. */
const WARM = ["255, 170, 210", "255, 210, 150", "255, 240, 225"] as const;


function path(ctx: Ctx, pts: readonly Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** A tall window pane on the back wall (3D corners, projected). */
function windowPoints(cam: StageCamera, cx: number, inset = 0): Projected[] {
  const z = ROOM.zBack - 0.001;
  const half = WIN.half - inset;
  const pts: V3[] = [
    [cx - half, WIN.sill + inset, z], [cx + half, WIN.sill + inset, z],
    [cx + half, WIN.top - inset, z], [cx - half, WIN.top - inset, z],
  ];
  return pts.map((p) => project(cam, p));
}

function ribbon(ctx: Ctx, w: number, h: number, pts: readonly [number, number][], widthPx: number, colour: string): void {
  // Silk sheet: many fine parallel strands, brightest in the middle, twisting along the curve.
  for (let s = -6; s <= 6; s++) {
    const off = (s / 6) * widthPx * 0.5;
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.2 - Math.abs(s) * 0.022;
    ctx.lineWidth = Math.max(1, widthPx * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h + off);
    ctx.bezierCurveTo(pts[1][0] * w, pts[1][1] * h + off * 1.6, pts[2][0] * w, pts[2][1] * h - off * 1.4, pts[3][0] * w, pts[3][1] * h + off * 0.4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function plant(ctx: Ctx, cam: StageCamera, x: number, z: number): void {
  const base = project(cam, [x, 0, z]);
  const k = cam.focalPx / base.depth; // px per meter here
  const potTop = project(cam, [x, 0.45, z]);
  ctx.fillStyle = C.pot;
  path(ctx, [
    { x: base.x - 0.17 * k, y: base.y }, { x: base.x + 0.17 * k, y: base.y },
    { x: potTop.x + 0.22 * k, y: potTop.y }, { x: potTop.x - 0.22 * k, y: potTop.y },
  ]);
  ctx.fill();
  const leaves = [-70, -45, -20, 0, 20, 45, 70, -30, 30];
  leaves.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const len = (0.55 + (i % 3) * 0.18) * k;
    ctx.fillStyle = i % 2 ? C.leafA : C.leafB;
    ctx.save();
    ctx.translate(potTop.x, potTop.y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -len / 2, len * 0.16, len / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  });
}

/** The full static stage, filling a widthPx x heightPx canvas. */
export function drawLoft(ctx: Ctx, cam: StageCamera, widthPx: number, heightPx: number): void {
  const P = (x: number, y: number, z: number): Projected => project(cam, [x, y, z]);
  ctx.fillStyle = C.sideWall;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // Side walls.
  for (const x of [ROOM.x0, ROOM.x1]) {
    const wall = [P(x, 0, ROOM.zNear), P(x, 0, ROOM.zBack), P(x, ROOM.height, ROOM.zBack), P(x, ROOM.height, ROOM.zNear)];
    const g = ctx.createLinearGradient(wall[0].x, 0, wall[1].x, 0);
    g.addColorStop(0, C.sideWallNear);
    g.addColorStop(1, C.sideWall);
    ctx.fillStyle = g;
    path(ctx, wall);
    ctx.fill();
  }

  // Back wall.
  const back = [P(ROOM.x0, ROOM.height, ROOM.zBack), P(ROOM.x1, ROOM.height, ROOM.zBack), P(ROOM.x1, 0, ROOM.zBack), P(ROOM.x0, 0, ROOM.zBack)];
  const bg = ctx.createLinearGradient(0, back[0].y, 0, back[2].y);
  bg.addColorStop(0, C.wallTop);
  bg.addColorStop(1, C.wallBottom);
  ctx.fillStyle = bg;
  path(ctx, back);
  ctx.fill();

  // Windows: sunset sky, a low sun, far hills, then the frames.
  for (const cx of WINDOWS) {
    const outer = windowPoints(cam, cx);
    ctx.fillStyle = C.frame;
    path(ctx, outer);
    ctx.fill();
    const glass = windowPoints(cam, cx, 0.05);
    ctx.save();
    path(ctx, glass);
    ctx.clip();
    const top = P(cx, WIN.top, ROOM.zBack).y;
    const bottom = P(cx, WIN.sill, ROOM.zBack).y;
    const sky = ctx.createLinearGradient(0, top, 0, bottom);
    sky.addColorStop(0, C.skyTop);
    sky.addColorStop(0.55, C.skyMid);
    sky.addColorStop(1, C.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, top - 2, widthPx, bottom - top + 4);
    const sun = P(0.3, 1.1, ROOM.zBack);
    const sr = (cam.focalPx * 0.9) / sun.depth;
    const sg = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sr);
    sg.addColorStop(0, "rgba(255, 246, 214, 0.95)");
    sg.addColorStop(0.25, "rgba(255, 214, 160, 0.7)");
    sg.addColorStop(1, "rgba(255, 214, 160, 0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, top - 2, widthPx, bottom - top + 4);
    ctx.fillStyle = "rgba(150, 92, 140, 0.55)"; // far hills
    ctx.beginPath();
    const hillY = P(cx, 0.6, ROOM.zBack).y;
    ctx.moveTo(glass[0].x, bottom);
    for (let i = 0; i <= 8; i++) {
      const x = glass[0].x + ((glass[1].x - glass[0].x) * i) / 8;
      ctx.lineTo(x, hillY - Math.sin(i * 1.3 + cx) * (bottom - hillY) * 0.35);
    }
    ctx.lineTo(glass[1].x, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Mullions.
    ctx.strokeStyle = C.frame;
    ctx.lineWidth = Math.max(1, (cam.focalPx * 0.035) / outer[0].depth);
    const m1 = P(cx, WIN.sill, ROOM.zBack);
    const m2 = P(cx, WIN.top, ROOM.zBack);
    const h1 = P(cx - WIN.half, WIN.transom, ROOM.zBack);
    const h2 = P(cx + WIN.half, WIN.transom, ROOM.zBack);
    ctx.beginPath();
    ctx.moveTo(m1.x, m1.y);
    ctx.lineTo(m2.x, m2.y);
    ctx.moveTo(h1.x, h1.y);
    ctx.lineTo(h2.x, h2.y);
    ctx.stroke();
  }

  // Floor: warm wood, planks running toward the back wall.
  const floor = [P(ROOM.x0, 0, ROOM.zBack), P(ROOM.x1, 0, ROOM.zBack), P(ROOM.x1, 0, ROOM.zNear), P(ROOM.x0, 0, ROOM.zNear)];
  const fg = ctx.createLinearGradient(0, floor[0].y, 0, heightPx);
  fg.addColorStop(0, C.floorFar);
  fg.addColorStop(1, C.floorNear);
  ctx.fillStyle = fg;
  path(ctx, floor);
  ctx.fill();
  ctx.fillRect(0, Math.max(floor[2].y, floor[3].y), widthPx, heightPx); // below the near edge
  ctx.strokeStyle = C.plank;
  ctx.lineWidth = 1;
  for (let x = ROOM.x0; x <= ROOM.x1 + 1e-6; x += 0.24) {
    const a = P(x, 0, ROOM.zNear);
    const b = P(x, 0, ROOM.zBack);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Window glow on the glossy floor, and soft shafts of light through the air.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const cx of WINDOWS) {
    const a = P(cx - WIN.half * 0.8, 0, ROOM.zBack);
    const b = P(cx + WIN.half * 0.8, 0, ROOM.zBack);
    const c = P(cx + WIN.half * 0.9 - cx * 0.25, 0, ROOM.zBack - 2.6);
    const d = P(cx - WIN.half * 0.9 - cx * 0.25, 0, ROOM.zBack - 2.6);
    const g = ctx.createLinearGradient(0, a.y, 0, c.y);
    g.addColorStop(0, "rgba(255, 140, 190, 0.35)");
    g.addColorStop(1, "rgba(255, 140, 190, 0)");
    ctx.fillStyle = g;
    path(ctx, [a, b, c, d]);
    ctx.fill();

    const wTop = P(cx, WIN.top * 0.85, ROOM.zBack);
    const fl = P(cx - cx * 0.4 - 0.7, 0, LOOK.homeZ + 0.4);
    const fr = P(cx - cx * 0.4 + 0.7, 0, LOOK.homeZ + 0.4);
    const sh = ctx.createLinearGradient(0, wTop.y, 0, fl.y);
    sh.addColorStop(0, "rgba(255, 170, 210, 0.10)");
    sh.addColorStop(1, "rgba(255, 170, 210, 0.01)");
    ctx.fillStyle = sh;
    path(ctx, [P(cx - WIN.half * 0.7, WIN.top * 0.85, ROOM.zBack), P(cx + WIN.half * 0.7, WIN.top * 0.85, ROOM.zBack), fr, fl]);
    ctx.fill();
  }
  ctx.restore();

  // Soft warm spotlights from the ceiling, each with a pool on the floor.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const spots: readonly [number, number, number][] = [[-2.6, -0.9, 0], [2.6, 0.9, 1], [0, 0, 2], [-1.2, 0.5, 3], [1.3, -0.6, 0]];
  spots.forEach(([fromX, toX, ci], i) => {
    const colour = WARM[ci % WARM.length];
    const src = P(fromX, ROOM.height, LOOK.homeZ + 1.6);
    const zPool = LOOK.homeZ + (i % 2 ? 0.6 : -0.2);
    const pl = P(toX - 0.55, 0, zPool);
    const pr = P(toX + 0.55, 0, zPool);
    const beam = ctx.createLinearGradient(src.x, src.y, (pl.x + pr.x) / 2, pl.y);
    beam.addColorStop(0, `rgba(${colour}, 0.22)`);
    beam.addColorStop(1, `rgba(${colour}, 0.03)`);
    ctx.fillStyle = beam;
    path(ctx, [src, pr, pl]);
    ctx.fill();
    const c = P(toX, 0, zPool);
    const prx = Math.abs(pr.x - pl.x) / 2;
    const pry = Math.max(2, Math.abs(P(toX, 0, zPool + 0.4).y - P(toX, 0, zPool - 0.4).y) / 2);
    const pool = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, prx);
    pool.addColorStop(0, `rgba(${colour}, 0.3)`);
    pool.addColorStop(1, `rgba(${colour}, 0)`);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, pry / prx);
    ctx.translate(-c.x, -c.y);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(c.x, c.y, prx, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // Soft light ring on the home spot.
  const home = P(0, 0, LOOK.homeZ);
  const rx = Math.abs(P(1.05, 0, LOOK.homeZ).x - home.x);
  const ry = Math.abs(P(0, 0, LOOK.homeZ + 0.75).y - P(0, 0, LOOK.homeZ - 0.75).y) / 2;
  ctx.fillStyle = "rgba(255, 220, 235, 0.10)";
  ctx.beginPath();
  ctx.ellipse(home.x, home.y, rx, ry, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.save();
  ctx.shadowBlur = ry * 0.5;
  for (const [k, colour, wk] of [[0.95, C.ring, 0.05], [0.72, C.ring2, 0.03]] as const) {
    ctx.shadowColor = colour;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.5, ry * wk);
    ctx.beginPath();
    ctx.ellipse(home.x, home.y, rx * k, ry * k, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  plant(ctx, cam, -2.75, 5.6);
  plant(ctx, cam, 2.8, 5.2);

  // String lights along the top of the back wall.
  const bulbs: Pt[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const x = ROOM.x0 + (ROOM.x1 - ROOM.x0) * t;
    const sag = 0.35 * Math.sin(Math.PI * ((t * 3) % 1));
    bulbs.push(P(x, 3.75 - sag, ROOM.zBack - 0.05));
  }
  ctx.strokeStyle = "rgba(90, 50, 40, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  bulbs.forEach((b, i) => (i ? ctx.lineTo(b.x, b.y) : ctx.moveTo(b.x, b.y)));
  ctx.stroke();
  bulbs.forEach((b) => {
    const r = Math.max(2, heightPx * 0.012);
    const colour = WARM[1];
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 2.6);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.35, `rgba(${colour}, 0.75)`);
    g.addColorStop(1, `rgba(${colour}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 2.6, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Big floating silk sheets drifting across the room, mostly to the sides of the dancer.
  ribbon(ctx, widthPx, heightPx, [[-0.15, 0.3], [0.2, 0.12], [0.3, 0.48], [0.05, 0.6]], heightPx * 0.12, "#ffd9a8");
  ribbon(ctx, widthPx, heightPx, [[1.15, 0.18], [0.75, 0.08], [0.72, 0.42], [1.05, 0.5]], heightPx * 0.11, "#ffc9dc");
  ribbon(ctx, widthPx, heightPx, [[0.3, 0.2], [0.45, 0.1], [0.6, 0.28], [0.75, 0.16]], heightPx * 0.06, "#fff0dc");
  ribbon(ctx, widthPx, heightPx, [[-0.05, 0.72], [0.12, 0.64], [0.2, 0.8], [0.32, 0.74]], heightPx * 0.05, "#ffd9a8");

  // Warm haze and a soft vignette.
  const haze = ctx.createLinearGradient(0, 0, 0, heightPx);
  haze.addColorStop(0, "rgba(255, 170, 200, 0.10)");
  haze.addColorStop(0.6, "rgba(255, 190, 170, 0.06)");
  haze.addColorStop(1, "rgba(20, 5, 15, 0.2)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, widthPx, heightPx);
  const v = ctx.createRadialGradient(widthPx / 2, heightPx * 0.45, heightPx * 0.25, widthPx / 2, heightPx * 0.45, heightPx * 0.8);
  v.addColorStop(0, "rgba(30, 10, 20, 0)");
  v.addColorStop(1, "rgba(25, 8, 25, 0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, widthPx, heightPx);
}

