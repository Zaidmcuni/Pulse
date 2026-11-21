/**
 * Owner: Zaid
 * Purpose: Unit tests for drawSkeleton and SkeletonOverlay SSR smoke check (FR-23, FR-33)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LM } from "../config";
import { GOLDEN_RAW } from "../mocks/fixtures";
import { perfMs, type LandmarkPoint, type PoseFrame } from "../types/pulse";
import { SkeletonOverlay, drawSkeleton } from "./SkeletonOverlay";
import { computePoseFrame } from "./segments";

interface RecordedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
}

interface RecordedArc {
  x: number;
  y: number;
  radius: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

interface MockCanvasHandle {
  ctx: CanvasRenderingContext2D;
  clearRectSpy: ReturnType<typeof vi.fn>;
  beginPathSpy: ReturnType<typeof vi.fn>;
  moveToSpy: ReturnType<typeof vi.fn>;
  lineToSpy: ReturnType<typeof vi.fn>;
  strokeSpy: ReturnType<typeof vi.fn>;
  arcSpy: ReturnType<typeof vi.fn>;
  fillSpy: ReturnType<typeof vi.fn>;
  saveSpy: ReturnType<typeof vi.fn>;
  restoreSpy: ReturnType<typeof vi.fn>;
  lines: RecordedLine[];
  arcs: RecordedArc[];
}

function createMockCtx(): MockCanvasHandle {
  const lines: RecordedLine[] = [];
  const arcs: RecordedArc[] = [];
  let pendingMove: { x: number; y: number } | null = null;
  let pendingLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let pendingArc: { x: number; y: number; radius: number } | null = null;

  const clearRectSpy = vi.fn();
  const beginPathSpy = vi.fn(() => {
    pendingMove = null;
    pendingLine = null;
    pendingArc = null;
  });
  const moveToSpy = vi.fn((x: number, y: number) => {
    pendingMove = { x, y };
  });
  const lineToSpy = vi.fn((x: number, y: number) => {
    if (pendingMove) {
      pendingLine = { x1: pendingMove.x, y1: pendingMove.y, x2: x, y2: y };
    }
  });
  const strokeSpy = vi.fn(() => {
    if (pendingLine) {
      lines.push({
        ...pendingLine,
        strokeStyle: mockObj.strokeStyle,
        lineWidth: mockObj.lineWidth,
      });
    }
  });
  const arcSpy = vi.fn((x: number, y: number, radius: number) => {
    pendingArc = { x, y, radius };
  });
  const fillSpy = vi.fn(() => {
    if (pendingArc) {
      arcs.push({ ...pendingArc, fillStyle: mockObj.fillStyle });
    }
  });
  const saveSpy = vi.fn();
  const restoreSpy = vi.fn();

  const mockObj = {
    strokeStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    clearRect: clearRectSpy,
    beginPath: beginPathSpy,
    moveTo: moveToSpy,
    lineTo: lineToSpy,
    stroke: strokeSpy,
    arc: arcSpy,
    fill: fillSpy,
    save: saveSpy,
    restore: restoreSpy,
  };

  return {
    ctx: mockObj as unknown as CanvasRenderingContext2D,
    clearRectSpy,
    beginPathSpy,
    moveToSpy,
    lineToSpy,
    strokeSpy,
    arcSpy,
    fillSpy,
    saveSpy,
    restoreSpy,
    lines,
    arcs,
  };
}

function makeConfidentPoints(): LandmarkPoint[] {
  return [
    { x: 0.4, y: 0.25, v: 0.95 }, // 0: lShoulder
    { x: 0.6, y: 0.25, v: 0.95 }, // 1: rShoulder
    { x: 0.3, y: 0.38, v: 0.92 }, // 2: lElbow
    { x: 0.7, y: 0.38, v: 0.92 }, // 3: rElbow
    { x: 0.2, y: 0.50, v: 0.90 }, // 4: lWrist
    { x: 0.8, y: 0.50, v: 0.90 }, // 5: rWrist
    { x: 0.42, y: 0.55, v: 0.94 }, // 6: lHip
    { x: 0.58, y: 0.55, v: 0.94 }, // 7: rHip
    { x: 0.41, y: 0.75, v: 0.91 }, // 8: lKnee
    { x: 0.59, y: 0.75, v: 0.91 }, // 9: rKnee
    { x: 0.40, y: 0.95, v: 0.89 }, // 10: lAnkle
    { x: 0.60, y: 0.95, v: 0.89 }, // 11: rAnkle
  ];
}

function makePoseFrame(points: LandmarkPoint[], tracking: "ok" | "uncertain" = "ok"): PoseFrame {
  return {
    tFrameMs: perfMs(1000),
    segments: {},
    usableRatio: tracking === "ok" ? 1 : 0.2,
    tracking,
    points,
  };
}

describe("drawSkeleton", () => {
  it("clears the canvas and performs zero draws when frame is null", () => {
    const mock = createMockCtx();
    drawSkeleton(mock.ctx, null, 640, 360);

    expect(mock.clearRectSpy).toHaveBeenCalledWith(0, 0, 640, 360);
    expect(mock.beginPathSpy).not.toHaveBeenCalled();
    expect(mock.strokeSpy).not.toHaveBeenCalled();
    expect(mock.arcSpy).not.toHaveBeenCalled();
    expect(mock.fillSpy).not.toHaveBeenCalled();
  });

  it("clears the canvas and draws zero bones or joints on an all-zero invisible frame", () => {
    const mock = createMockCtx();
    const zeroPoints = Array.from({ length: 12 }, () => ({ x: 0, y: 0, v: 0 }));
    drawSkeleton(mock.ctx, makePoseFrame(zeroPoints, "uncertain"), 800, 600);

    expect(mock.clearRectSpy).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(mock.strokeSpy).not.toHaveBeenCalled();
    expect(mock.arcSpy).not.toHaveBeenCalled();
    expect(mock.fillSpy).not.toHaveBeenCalled();
    expect(mock.saveSpy).toHaveBeenCalledTimes(1);
    expect(mock.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it("draws all 9 SEGMENT_ENDPOINTS bones (including torso midpoint) and all 12 joints directly without re-mirroring", () => {
    const mock = createMockCtx();
    const width = 1000;
    const height = 500;
    const pts = makeConfidentPoints();

    drawSkeleton(mock.ctx, makePoseFrame(pts, "ok"), width, height);

    expect(mock.clearRectSpy).toHaveBeenCalledWith(0, 0, width, height);
    expect(mock.saveSpy).toHaveBeenCalledTimes(1);
    expect(mock.restoreSpy).toHaveBeenCalledTimes(1);

    // 2 structural lines + 9 bones * 2 glow/core passes = 20 strokes
    expect(mock.lines).toHaveLength(20);

    const hasBoneLine = (x1: number, y1: number, x2: number, y2: number): boolean =>
      mock.lines.some(
        (l) =>
          Math.abs(l.x1 - x1) < 1e-6 &&
          Math.abs(l.y1 - y1) < 1e-6 &&
          Math.abs(l.x2 - x2) < 1e-6 &&
          Math.abs(l.y2 - y2) < 1e-6,
      );

    // Verify left upper arm directly (x = 0.4*1000 = 400, NOT mirrored to 600)
    expect(hasBoneLine(400, 125, 300, 190)).toBe(true);
    // Verify torso midpoint: mid(hips) = (0.5*1000=500, 0.55*500=275) -> mid(shoulders) = (500, 125)
    expect(hasBoneLine(500, 275, 500, 125)).toBe(true);
    // Verify legs
    expect(hasBoneLine(420, 275, 410, 375)).toBe(true);
    expect(hasBoneLine(590, 375, 600, 475)).toBe(true);

    // All 12 confident joints: each gets glow circle + core dot = 24 arc draws
    expect(mock.arcs).toHaveLength(24);
    for (const pt of pts) {
      expect(
        mock.arcs.some(
          (a) => Math.abs(a.x - pt.x * width) < 1e-6 && Math.abs(a.y - pt.y * height) < 1e-6,
        ),
      ).toBe(true);
    }
  });

  it("handles seated / partial leg occlusion by drawing upper body and torso while skipping invisible legs", () => {
    const mock = createMockCtx();
    const pts = makeConfidentPoints();
    // Hide knees and ankles under a desk (hips + torso visible)
    pts[LM.lKnee] = { x: 0, y: 0, v: 0 };
    pts[LM.rKnee] = { x: 0, y: 0, v: 0 };
    pts[LM.lAnkle] = { x: 0, y: 0, v: 0 };
    pts[LM.rAnkle] = { x: 0, y: 0, v: 0 };

    drawSkeleton(mock.ctx, makePoseFrame(pts, "ok"), 640, 360);

    // 2 structural (shoulders + hips) + 5 upper/torso segments * 2 passes = 12 lines
    expect(mock.lines).toHaveLength(12);
    // 8 visible points * 2 circles = 16 arcs, none at (0, 0)
    expect(mock.arcs).toHaveLength(16);
    expect(mock.arcs.some((a) => a.x === 0 && a.y === 0)).toBe(false);

    // Also verify when all leg + hip points are occluded (v = 0), torso skips cleanly without throwing
    const chestOnly = makeConfidentPoints().map((p, idx) =>
      idx >= LM.lHip ? { x: 0, y: 0, v: 0 } : p,
    );
    const mockChest = createMockCtx();
    drawSkeleton(mockChest.ctx, makePoseFrame(chestOnly, "uncertain"), 640, 360);
    // 1 shoulder connector + 4 arm segments * 2 passes = 9 lines
    expect(mockChest.lines).toHaveLength(9);
    // 6 upper points * 2 circles = 12 arcs
    expect(mockChest.arcs).toHaveLength(12);
  });

  it("dims low-visibility limbs (0.15 <= v < visibilityMin) and switches to amber palette when tracking is uncertain", () => {
    const mock = createMockCtx();
    const pts = makeConfidentPoints();
    // Set left forearm wrist to low visibility 0.30 (below CONFIG.visibilityMin = 0.55)
    pts[LM.lWrist] = { x: 0.2, y: 0.5, v: 0.3 };

    drawSkeleton(mock.ctx, makePoseFrame(pts, "uncertain"), 640, 360);

    // Left forearm (elbow -> wrist) is drawn as a single dimmed stroke with amber dim alpha
    const wristEndLines = mock.lines.filter(
      (l) => Math.abs(l.x2 - 0.2 * 640) < 1e-6 && Math.abs(l.y2 - 0.5 * 360) < 1e-6,
    );
    expect(wristEndLines).toHaveLength(1);
    expect(String(wristEndLines[0].strokeStyle)).toContain("251, 191, 36");

    // Confident bones in uncertain tracking use warm amber core (#fbbf24)
    expect(mock.lines.some((l) => l.strokeStyle === "#fbbf24")).toBe(true);
    // Confident joints in uncertain tracking use warm cream core (#fef3c7)
    expect(mock.arcs.some((a) => a.fillStyle === "#fef3c7")).toBe(true);
    // Low-visibility wrist joint gets 1 dimmed dot (no glow halo)
    const wristArcs = mock.arcs.filter(
      (a) => Math.abs(a.x - 0.2 * 640) < 1e-6 && Math.abs(a.y - 0.5 * 360) < 1e-6,
    );
    expect(wristArcs).toHaveLength(1);
  });
});

describe("SkeletonOverlay component", () => {
  it("renders a non-interactive aria-hidden canvas for null and PoseFrame inputs", () => {
    const nullHtml = renderToStaticMarkup(<SkeletonOverlay frame={null} />);
    expect(nullHtml).toContain("<canvas");
    expect(nullHtml).toContain('aria-hidden="true"');
    expect(nullHtml).toContain("pointer-events:none");

    const realFrame = computePoseFrame(GOLDEN_RAW, "standing");
    const frameHtml = renderToStaticMarkup(
      <SkeletonOverlay frame={realFrame} width={320} height={180} />,
    );
    expect(frameHtml).toContain("<canvas");
    expect(frameHtml).toContain('aria-hidden="true"');
  });
});
