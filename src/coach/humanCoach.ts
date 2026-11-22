/**
 * Owner: Toufic
 * Purpose: the in-game renderer for the new human coach (#97): the lounge stage cached on an offscreen
 *          canvas, then the dancer: from the dance's 3D body track when it has one (fixed camera, real
 *          stage position and depth), else a flat body from the template's 2D segments. Plugged into
 *          startCoachLoop by CoachCanvas; the old silhouette stays the fallback.
 * FRs: FR-26
 */
import type { PosturalMode, SongTimeMs } from "../types/pulse";
import { sampleBodyTrack, type BodyTrack } from "./bodyTrack";
import { LOOK, seatedCamera, stageCamera } from "./coach3d";
import { drawFigure, type FigureLayers } from "./figure";
import { drawLoft } from "./loftStage";
import type { SampledTemplatePose } from "./sampleTemplate";
import { bodyFromSegments } from "./segmentsToBody";

export type CoachFrameDraw = (
  widthPx: number,
  heightPx: number,
  sample: SampledTemplatePose,
  songTimeMs: SongTimeMs,
) => void;

type Layer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

/**
 * Returns a draw function bound to `ctx`, or null when scratch canvases aren't available (the caller
 * then keeps the old renderer). `makeCanvas` creates a detached canvas (document.createElement in the app).
 */
export function createHumanCoachDraw(
  ctx: CanvasRenderingContext2D,
  makeCanvas: () => HTMLCanvasElement,
  getTrack: () => BodyTrack | null = () => null,
  getMode: () => PosturalMode = () => "standing",
): CoachFrameDraw | null {
  const layer = (): Layer | null => {
    const canvas = makeCanvas();
    const c = canvas.getContext("2d");
    return c ? { canvas, ctx: c } : null;
  };
  const stage = layer();
  const body = layer();
  const tint = layer();
  if (!stage || !body || !tint) return null;
  const layers: FigureLayers = { body, tint };
  let stageW = -1;
  let stageH = -1;
  let stageMode: PosturalMode | null = null;

  return (widthPx, heightPx, sample, songTimeMs) => {
    const mode = getMode();
    const seated = mode === "seated";
    const cam = seated ? seatedCamera(widthPx, heightPx) : stageCamera(widthPx, heightPx);
    if (widthPx !== stageW || heightPx !== stageH || mode !== stageMode) {
      for (const l of [stage, body, tint]) {
        l.canvas.width = widthPx;
        l.canvas.height = heightPx;
      }
      drawLoft(stage.ctx, cam, widthPx, heightPx);
      stageW = widthPx;
      stageH = heightPx;
      stageMode = mode;
    }
    ctx.drawImage(stage.canvas, 0, 0);
    const track = getTrack();
    const pose = (track && sampleBodyTrack(track, songTimeMs)) ?? bodyFromSegments(sample.segments);
    if (!pose) return;
    // Seated (FR-20): upper body only, held centred at a fixed height like a seated player.
    if (seated) drawFigure(ctx, cam, { ...pose, root: [0, LOOK.seated.hipHeightM, LOOK.homeZ] }, layers, true);
    else drawFigure(ctx, cam, pose, layers);
  };
}
