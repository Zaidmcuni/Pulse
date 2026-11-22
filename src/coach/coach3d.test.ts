/**
 * Owner: Toufic
 * Purpose: pure geometry of the #97 phase 0 prototype: projection, facing yaw, depth order, fixtures
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { seatedCamera, LOOK, BODY_TRACK_INDICES, BT, buildFigure, convexHull, facingYawRad, headFrame, project, stageCamera, toStage, type FigurePart, type HeadPart, type TorsoPart, type Vec3 } from "./coach3d";
import { MOCK_POSES, buildMockPose } from "./coach3dFixtures";
import { bodyFromSegments } from "./segmentsToBody";

const cam = stageCamera(360, 480);
const deg = (r: number): number => (r * 180) / Math.PI;
const spec = (id: string) => MOCK_POSES.find((p) => p.id === id)!;

describe("project", () => {
  it("puts a point straight ahead at camera height on the centre column, and farther points smaller", () => {
    const near = project(cam, [0.5, cam.heightM, 3]);
    const far = project(cam, [0.5, cam.heightM, 6]);
    expect(project(cam, [0, cam.heightM, 3]).x).toBeCloseTo(180);
    expect(near.x - 180).toBeGreaterThan(far.x - 180);
    expect(far.depth).toBeGreaterThan(near.depth);
  });

  it("draws the floor below the camera lower on screen when it is nearer", () => {
    expect(project(cam, [0, 0, 2.5]).y).toBeGreaterThan(project(cam, [0, 0, 5]).y);
  });

  it("maps body y-down local points to stage y-up", () => {
    const p = toStage([0.1, -0.5, 0.2], [1, 0.9, 3.6]);
    [1.1, 1.4, 3.8].forEach((v, i) => expect(p[i]).toBeCloseTo(v));
  });
});

describe("facingYawRad", () => {
  it.each([0, 45, 90, 135, -90, -135])("recovers a fixture turned %i degrees", (yaw) => {
    const pose = buildMockPose({ ...spec("front"), yawDeg: yaw });
    expect(deg(facingYawRad(pose.world))).toBeCloseTo(yaw, 5);
  });

  it("reads 180 for the back pose", () => {
    expect(Math.abs(deg(facingYawRad(buildMockPose(spec("back")).world)))).toBeCloseTo(180, 5);
  });
});

describe("buildFigure", () => {
  const head = (ps: FigurePart[]): HeadPart => ps.find((p): p is HeadPart => p.kind === "head")!;
  const torso = (ps: FigurePart[]): TorsoPart => ps.find((p): p is TorsoPart => p.kind === "torso")!;
  const hands = (ps: FigurePart[]): number[] =>
    ps.flatMap((p, i) => (p.kind === "blob" && p.mat === "skin" ? [i] : []));

  it("returns parts sorted far to near", () => {
    for (const s of MOCK_POSES) {
      const parts = buildFigure(buildMockPose(s), cam);
      for (let i = 1; i < parts.length; i++) expect(parts[i - 1].depth).toBeGreaterThanOrEqual(parts[i].depth);
    }
  });

  it("draws the far hand behind the torso and the near hand in front when side-on", () => {
    const parts = buildFigure(buildMockPose(spec("side")), cam);
    const t = parts.indexOf(torso(parts));
    const [first, second] = hands(parts);
    expect(first).toBeLessThan(t);
    expect(second).toBeGreaterThan(t);
  });

  it("shows the face and the tee facing the camera, and the jacket back facing away", () => {
    const front = buildFigure(buildMockPose(spec("front")), cam);
    const back = buildFigure(buildMockPose(spec("back")), cam);
    expect(head(front).features.eyes).toHaveLength(2);
    expect(head(front).features.mouth).toBeDefined();
    expect(head(front).face.length).toBeGreaterThan(5);
    expect(torso(front).tee).toBeDefined();
    expect(torso(back).tee).toBeUndefined();
    expect(torso(back).backBand).toBeDefined();
    expect(head(front).buns.every((b) => b.behind)).toBe(true);
  });

  it("never turns the head past profile, even with the back to the camera (#156)", () => {
    // The bundled dances only read backward on tracking glitches, so the face stays in the camera's half.
    expect(head(buildFigure(buildMockPose(spec("back")), cam)).face.length).toBeGreaterThan(5);
  });

  it("shows one eye in profile", () => {
    expect(head(buildFigure(buildMockPose(spec("side")), cam)).features.eyes).toHaveLength(1);
  });

  it("keeps the torso wide side-on (chest-to-back depth)", () => {
    const t = torso(buildFigure(buildMockPose(spec("side")), cam));
    const xs = t.jacket.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(25);
  });

  it("fades low-visibility parts instead of dropping them", () => {
    const parts = buildFigure(buildMockPose(spec("side")), cam);
    const faded = parts.filter((p) => p.alpha < 1);
    expect(faded.length).toBeGreaterThan(0);
    for (const p of faded) expect(p.alpha).toBeGreaterThan(0);
  });

  it("keeps the dancer's right on the viewer's right when the back faces the camera (no mirror flip)", () => {
    const pose = buildMockPose(spec("back"));
    const l = project(cam, toStage(pose.world[BT.lShoulder], pose.root));
    const r = project(cam, toStage(pose.world[BT.rShoulder], pose.root));
    expect(r.x).toBeGreaterThan(l.x);
  });
});

describe("headFrame (#156, #168)", () => {
  const deg2 = (f: Vec3) => ({ yaw: deg(Math.atan2(-f[0], -f[2])), pitchDown: deg(Math.asin(f[1])) });
  const front = buildMockPose(spec("front")).world;
  const chest: Vec3 = [0, 0, -1];
  const withHead = (nose: Vec3, lEar: Vec3, rEar: Vec3): Vec3[] =>
    front.map((p, i) => (i === BT.nose ? nose : i === BT.lEar ? lEar : i === BT.rEar ? rEar : p));
  const isFinite3 = (v: Vec3) => v.every(Number.isFinite);

  it("keeps the face toward the viewer when the head leans far forward of the shoulders (#168)", () => {
    // Tip Toe 1:59.7: head well in front of the shoulders, nose 12 cm in front of the ears.
    const shY = front[BT.lShoulder][1];
    const w = withHead([0, shY - 0.13, -0.42], [0.075, shY - 0.13, -0.3], [-0.075, shY - 0.13, -0.3]);
    const { hf } = headFrame(w, chest);
    expect(Math.abs(deg2(hf).yaw)).toBeLessThan(10);
    expect(Math.abs(deg2(hf).pitchDown)).toBeLessThan(10);
    const parts = buildFigure({ ...buildMockPose(spec("front")), world: w }, cam);
    const h = parts.find((p): p is HeadPart => p.kind === "head")!;
    expect(h.features.eyes).toHaveLength(2);
    expect(Math.abs(h.hair.rot)).toBeLessThan(0.3);
  });

  it.each([0, 45, 90, 135, 180, 225, 270, 315])("stays within the profile limit for a head turned %i degrees", (turn) => {
    const r = (turn * Math.PI) / 180;
    const rot = (p: Vec3): Vec3 => [p[0] * Math.cos(r) + p[2] * Math.sin(r), p[1], -p[0] * Math.sin(r) + p[2] * Math.cos(r)];
    const c = front[BT.lEar].map((v, i) => (v + front[BT.rEar][i]) / 2) as unknown as Vec3;
    const at = (o: Vec3): Vec3 => { const q = rot(o); return [c[0] + q[0], c[1] + q[1], c[2] + q[2]]; };
    const { hf, hu } = headFrame(withHead(at([0, 0.03, -0.1]), at([0.075, 0, 0]), at([-0.075, 0, 0])), chest);
    expect(hf[2]).toBeLessThan(0);
    expect(Math.abs(deg2(hf).yaw)).toBeLessThanOrEqual(LOOK.head.maxYawDeg + 1e-9);
    expect(hu[1]).toBeLessThan(0); // skull up, never upside down
  });

  it("stays front-facing and NaN-free for swapped ears, a nose behind the ears, or collapsed points", () => {
    const e = front[BT.lEar];
    const cases: Vec3[][] = [
      withHead(front[BT.nose], front[BT.rEar], front[BT.lEar]),
      withHead([e[0] - 0.075, e[1], e[2] + 0.1], front[BT.lEar], front[BT.rEar]),
      withHead(e, e, e),
    ];
    for (const w of cases) {
      const { hf, hl, hu } = headFrame(w, chest);
      for (const v of [hf, hl, hu]) expect(isFinite3(v)).toBe(true);
      expect(hf[2]).toBeLessThan(0);
      expect(hu[1]).toBeLessThan(0);
      const parts = buildFigure({ ...buildMockPose(spec("front")), world: w }, cam);
      expect(parts.find((p): p is HeadPart => p.kind === "head")!.face.length).toBeGreaterThan(5);
    }
  });

  it("hangs the head upside down in a deep forward fold (spine pointing at the floor)", () => {
    const folded = front.map((p, i) => (i === BT.lShoulder || i === BT.rShoulder ? ([p[0], 0.5, p[2]] as Vec3) : p));
    expect(headFrame(folded, chest).hu[1]).toBeGreaterThan(0);
  });

  it("faces the viewer for the flat fallback coach and in the seated view", () => {
    const seg = bodyFromSegments({ torso: [0, -1], l_upper_arm: [1, 0], r_upper_arm: [-1, 0] })!;
    for (const [pose, c, seated] of [
      [seg, cam, false],
      [{ ...seg, root: [0, LOOK.seated.hipHeightM, LOOK.homeZ] as const }, seatedCamera(360, 480), true],
    ] as const) {
      const h = buildFigure(pose, c, seated).find((p): p is HeadPart => p.kind === "head")!;
      expect(h.features.eyes).toHaveLength(2);
      expect(h.centre.y).toBeGreaterThan(0);
      expect(h.centre.y).toBeLessThan(480);
    }
  });
});

describe("convexHull", () => {
  it("drops interior points", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 1 }]);
    expect(hull).toHaveLength(4);
  });
});

describe("mock fixtures", () => {
  it("has a full body track per pose and stands on the floor", () => {
    expect(BODY_TRACK_INDICES).toHaveLength(25);
    for (const s of MOCK_POSES) {
      const pose = buildMockPose(s);
      expect(pose.world).toHaveLength(25);
      const lowest = Math.max(...pose.world.map((p) => p[1]));
      expect(pose.root[1]).toBeCloseTo(lowest);
    }
  });

  it("brings both hands together for the clap", () => {
    const w = buildMockPose(spec("clap")).world;
    const gap = Math.hypot(w[BT.lIndex][0] - w[BT.rIndex][0], w[BT.lIndex][1] - w[BT.rIndex][1], w[BT.lIndex][2] - w[BT.rIndex][2]);
    expect(gap).toBeLessThan(0.08);
  });

  it("fits every pose inside the 360 x 480 coach canvas", () => {
    for (const s of MOCK_POSES) {
      for (const p of buildFigure(buildMockPose(s), cam)) {
        const pts = p.kind === "torso" ? p.jacket : p.kind === "head" ? [p.hair] : p.outline;
        for (const q of pts) {
          expect(q.x, `${s.id} ${p.kind}`).toBeGreaterThan(0);
          expect(q.x).toBeLessThan(360);
          expect(q.y).toBeGreaterThan(0);
          expect(q.y).toBeLessThan(480);
        }
      }
    }
  });
});

describe("seated view (FR-20)", () => {
  const seatedCam = seatedCamera(360, 480);
  const seatedPose = (id: string) => ({ ...buildMockPose(spec(id)), root: [0, LOOK.seated.hipHeightM, LOOK.homeZ] as const });

  it("leaves out the legs and boots and keeps the upper body", () => {
    const parts = buildFigure(seatedPose("front"), seatedCam, true);
    expect(parts.some((p) => p.kind === "limb" && p.mat === "pants")).toBe(false);
    expect(parts.some((p) => p.kind === "blob" && p.mat === "shoe")).toBe(false);
    expect(parts.filter((p) => p.kind === "limb" && p.mat === "jacket")).toHaveLength(4);
    expect(parts.some((p) => p.kind === "torso")).toBe(true);
    expect(parts.some((p) => p.kind === "head")).toBe(true);
  });

  it("frames the hips at the bottom edge and the head inside the canvas", () => {
    const hips = project(seatedCam, [0, LOOK.seated.hipHeightM, LOOK.homeZ]);
    expect(hips.y).toBeGreaterThan(480 * 0.95);
    expect(hips.y).toBeLessThanOrEqual(480);
    const head = buildFigure(seatedPose("front"), seatedCam, true).find((p) => p.kind === "head");
    expect(head && head.kind === "head" && head.centre.y).toBeGreaterThan(0);
  });
});
