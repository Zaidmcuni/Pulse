/**
 * Owner: Toufic
 * Purpose: pure geometry of the #97 phase 0 prototype: projection, facing yaw, depth order, fixtures
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { seatedCamera, LOOK, BODY_TRACK_INDICES, BT, buildFigure, convexHull, facingYawRad, project, stageCamera, toStage, type FigurePart, type HeadPart, type TorsoPart } from "./coach3d";
import { MOCK_POSES, buildMockPose } from "./coach3dFixtures";

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

  it("shows the face and the tee facing the camera, and only hair and the jacket back facing away", () => {
    const front = buildFigure(buildMockPose(spec("front")), cam);
    const back = buildFigure(buildMockPose(spec("back")), cam);
    expect(head(front).features.eyes).toHaveLength(2);
    expect(head(front).features.mouth).toBeDefined();
    expect(head(front).face.length).toBeGreaterThan(5);
    expect(torso(front).tee).toBeDefined();
    expect(head(back).features.eyes).toHaveLength(0);
    expect(head(back).face).toHaveLength(0);
    expect(torso(back).tee).toBeUndefined();
    expect(torso(back).backBand).toBeDefined();
    expect(head(front).buns.every((b) => b.behind)).toBe(true);
    expect(head(back).buns.some((b) => b.behind)).toBe(false);
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
