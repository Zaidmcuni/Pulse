/**
 * Owner: Toufic
 * Purpose: #97 phase 0 preview drawing: the proposed human coach on the sunset loft stage for one MOCK
 *          pose. Shared by the /dev/extract panel and the offline proposal page.
 * FRs: FR-26
 */
import { stageCamera, type BodyPose3D } from "../../coach/coach3d";
import { buildMockPose, type MockPoseSpec } from "../../coach/coach3dFixtures";
import { drawFigure } from "../../coach/figure";
import { drawLoft } from "../../coach/loftStage";

export interface PreviewOptions {
  /** Extra turn on top of the pose's own facing (degrees). */
  turnDeg: number;
  /** Stage offsets (m): left/right, toward(-)/away(+), lift off the floor. */
  dx: number;
  dz: number;
  lift: number;
}

export const NO_OFFSET: PreviewOptions = { turnDeg: 0, dx: 0, dz: 0, lift: 0 };

export function previewPose(spec: MockPoseSpec, o: PreviewOptions): BodyPose3D {
  const pose = buildMockPose(spec, o.turnDeg);
  return { ...pose, root: [pose.root[0] + o.dx, pose.root[1] + o.lift, pose.root[2] + o.dz] };
}

/** Stage + coach, with fresh scratch layers (fine for a preview; the real loop keeps them). */
export function drawPreview(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, pose: BodyPose3D): void {
  const cam = stageCamera(widthPx, heightPx);
  drawLoft(ctx, cam, widthPx, heightPx);
  const layer = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null => {
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const c = canvas.getContext("2d");
    return c ? { canvas, ctx: c } : null;
  };
  const body = layer();
  const tint = layer();
  if (body && tint) drawFigure(ctx, cam, pose, { body, tint });
}
