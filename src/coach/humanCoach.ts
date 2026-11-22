/**
 * Owner: Toufic
 * Purpose: the in-game renderer for the new human coach (#97): the lounge stage cached on an offscreen
 *          canvas, then the dancer: from the dance's 3D body track when it has one (fixed camera, real
 *          stage position and depth), else a flat body from the template's 2D segments. Plugged into
 *          startCoachLoop by CoachCanvas; the old silhouette stays the fallback.
 * FRs: FR-26
 */
import type { SongTimeMs } from "../types/pulse";
import { sampleBodyTrack, type BodyTrack } from "./bodyTrack";
import { stageCamera } from "./coach3d";
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

  return (widthPx, heightPx, sample, songTimeMs) => {
    const cam = stageCamera(widthPx, heightPx);
    if (widthPx !== stageW || heightPx !== stageH) {
      for (const l of [stage, body, tint]) {
        l.canvas.width = widthPx;
        l.canvas.height = heightPx;
      }
      drawLoft(stage.ctx, cam, widthPx, heightPx);
      stageW = widthPx;
      stageH = heightPx;
    }
    ctx.drawImage(stage.canvas, 0, 0);
    const track = getTrack();
    const pose = (track && sampleBodyTrack(track, songTimeMs)) ?? bodyFromSegments(sample.segments);
    if (pose) drawFigure(ctx, cam, pose, layers);
  };
}
