/**
 * Owner: Toufic
 * Purpose: test helper: a 2D context fake that records every drawing call made by drawCoach
 * FRs: FR-26
 */
import type { CoachDrawContext } from "./silhouette";

export type DrawCall = readonly (string | number)[];

export function createRecordingContext(): { ctx: CoachDrawContext; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const ctx: CoachDrawContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    clearRect: (x, y, w, h) => void calls.push(["clearRect", x, y, w, h]),
    beginPath: () => void calls.push(["beginPath"]),
    moveTo: (x, y) => void calls.push(["moveTo", x, y]),
    lineTo: (x, y) => void calls.push(["lineTo", x, y]),
    closePath: () => void calls.push(["closePath"]),
    arc: (x, y, r) => void calls.push(["arc", x, y, r]),
    fill: () => void calls.push(["fill", String(ctx.fillStyle)]),
    stroke: () => void calls.push(["stroke", String(ctx.strokeStyle), ctx.lineWidth]),
  };
  return { ctx, calls };
}
