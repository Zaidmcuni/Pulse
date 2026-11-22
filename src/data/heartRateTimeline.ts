/**
 * Owner: Ali
 * Written: Toufic (UI sprint, #142)
 * Purpose: pure chart data for the Results heart-rate curve (watch runs) and its accuracy-over-time fallback.
 * FRs: FR-29, FR-35
 * Pure: inputs are never mutated. Never uses or returns HRmax except to place the effort-zone bands.
 */

import { ZONE_BOUNDS, ZONE_ORDER, type IntensityZone } from "../health/intensity";
import type { ScoreSample } from "../types/pulse";

/** Smallest bpm span on the y-axis, so a flat heart rate still draws as a line in the middle. */
const MIN_BPM_SPAN = 10;
/** A lone reading between gaps is drawn this many seconds either side, so it stays visible. */
const LONE_POINT_HALF_SEC = 0.5;
/** Accuracy is plotted on a fixed 0..100% axis. */
const ACCURACY_RANGE_PCT = { min: 0, max: 100 } as const;

export interface ChartPoint { tSec: number; value: number }

export interface Timeline {
  segments: ChartPoint[][];  // each segment is drawn as its own line; gaps stay empty
  minValue: number;          // y-axis bottom
  maxValue: number;          // y-axis top (always > minValue)
  durationSec: number;       // x-axis end (always > 0)
  peak: ChartPoint;          // first highest point
}

export interface ZoneBand { zone: IntensityZone; fromValue: number; toValue: number }

/** Split points into runs of consecutive seconds; a missing second or an unusable sample starts a new run. */
function toSegments(samples: readonly ScoreSample[], valueOf: (s: ScoreSample) => number | null): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  let lastTSec: number | null = null;
  for (const sample of samples) {
    const value = valueOf(sample);
    if (value === null || !Number.isFinite(value) || (lastTSec !== null && sample.tSec - lastTSec > 1)) {
      if (current.length > 0) segments.push(current);
      current = [];
    }
    if (value !== null && Number.isFinite(value)) current.push({ tSec: sample.tSec, value });
    lastTSec = sample.tSec;
  }
  if (current.length > 0) segments.push(current);
  return segments.map((segment) => segment.length > 1 ? segment : [
    { tSec: segment[0].tSec - LONE_POINT_HALF_SEC, value: segment[0].value },
    { tSec: segment[0].tSec + LONE_POINT_HALF_SEC, value: segment[0].value },
  ]);
}

function buildTimeline(
  samples: readonly ScoreSample[],
  durationSec: number,
  valueOf: (s: ScoreSample) => number | null,
  range: (min: number, max: number) => { minValue: number; maxValue: number },
): Timeline | null {
  const valid = samples.filter((s) => { const v = valueOf(s); return v !== null && Number.isFinite(v); });
  if (valid.length < 2) return null;
  const values = valid.map((s) => valueOf(s) as number);
  const peakIndex = values.indexOf(Math.max(...values));
  const lastTSec = valid[valid.length - 1].tSec;
  return {
    segments: toSegments(samples, valueOf),
    ...range(Math.min(...values), Math.max(...values)),
    durationSec: Math.max(durationSec, lastTSec, 1),
    peak: { tSec: valid[peakIndex].tSec, value: values[peakIndex] },
  };
}

/** Watch heart rate over the song: only "ble" seconds with a reading; null below 2 readings. */
export function heartRateTimeline(samples: readonly ScoreSample[], durationSec: number): Timeline | null {
  return buildTimeline(
    samples,
    durationSec,
    (s) => (s.hrSource === "ble" && s.heartRate > 0 ? s.heartRate : null),
    (min, max) => {
      if (max - min >= MIN_BPM_SPAN) return { minValue: min, maxValue: max };
      const mid = (min + max) / 2;
      return { minValue: mid - MIN_BPM_SPAN / 2, maxValue: mid + MIN_BPM_SPAN / 2 };
    },
  );
}

/** Rolling move accuracy (0..100%) over the song, for runs without watch data; null below 2 samples. */
export function accuracyTimeline(samples: readonly ScoreSample[], durationSec: number): Timeline | null {
  return buildTimeline(
    samples,
    durationSec,
    (s) => s.accuracy * 100,
    () => ({ minValue: ACCURACY_RANGE_PCT.min, maxValue: ACCURACY_RANGE_PCT.max }),
  );
}

/** The four effort zones (src/health/intensity.ts) as bpm bands, clipped to the timeline's y-axis. */
export function zoneBands(timeline: Timeline, hrMax: number): ZoneBand[] {
  if (!(hrMax > 0)) return [];
  const starts: Record<IntensityZone, number> = {
    easy: Number.NEGATIVE_INFINITY,
    moderate: ZONE_BOUNDS.moderate * hrMax,
    hard: ZONE_BOUNDS.hard * hrMax,
    max: ZONE_BOUNDS.max * hrMax,
  };
  return ZONE_ORDER.flatMap((zone, i) => {
    const next = ZONE_ORDER[i + 1];
    const fromValue = Math.max(starts[zone], timeline.minValue);
    const toValue = Math.min(next ? starts[next] : Number.POSITIVE_INFINITY, timeline.maxValue);
    return toValue > fromValue ? [{ zone, fromValue, toValue }] : [];
  });
}

/** y pixel for a value: maxValue at the top (0), minValue at the bottom (heightPx). */
export function toY(value: number, timeline: Timeline, heightPx: number): number {
  return ((timeline.maxValue - value) / (timeline.maxValue - timeline.minValue)) * heightPx;
}

/** SVG polyline "x,y x,y" for one segment; x runs from 0 s at 0 to durationSec at widthPx. */
export function toPolylinePoints(segment: readonly ChartPoint[], timeline: Timeline, widthPx: number, heightPx: number): string {
  const round = (n: number): number => Math.round(n * 100) / 100;
  return segment
    .map(({ tSec, value }) => {
      const x = Math.min(widthPx, Math.max(0, (tSec / timeline.durationSec) * widthPx));
      return `${round(x)},${round(toY(value, timeline, heightPx))}`;
    })
    .join(" ");
}
