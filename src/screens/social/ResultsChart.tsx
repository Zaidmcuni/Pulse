/**
 * Owner: Ali
 * Written: Toufic (UI sprint, #142)
 * Purpose: Results chart card: heart rate over the song shaded by the four effort zones (watch runs),
 *          or move accuracy over the song when there is no watch data.
 * FRs: FR-29, FR-35
 * Privacy: never shows HRmax, age or body stats. Average and peak bpm stay on the Effort card.
 */

import type { ReactElement } from "react";
import { workoutIntensity, ZONE_LABELS, ZONE_ORDER } from "../../health/intensity";
import "../../health/health.css";
import { accuracyTimeline, heartRateTimeline, toPolylinePoints, toY, zoneBands, type Timeline, type ZoneBand } from "../../data/heartRateTimeline";
import type { SessionResult } from "../../types/pulse";
import { formatDanceLength } from "../dance/GetReady";
import "./ResultsChart.css";

const CHART_WIDTH_PX = 320;
const CHART_HEIGHT_PX = 96;

function ChartSvg({ timeline, lineClass, bands }: {
  timeline: Timeline;
  lineClass: string;
  bands: ZoneBand[];
}): ReactElement {
  return (
    <svg
      className="results-chart-svg"
      viewBox={`0 0 ${CHART_WIDTH_PX} ${CHART_HEIGHT_PX}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect className="results-chart-track" x={0} y={0} width={CHART_WIDTH_PX} height={CHART_HEIGHT_PX} />
      {bands.map(({ zone, fromValue, toValue }) => {
        const top = toY(toValue, timeline, CHART_HEIGHT_PX);
        return (
          <rect
            key={zone}
            className={`results-chart-band is-${zone}`}
            x={0}
            y={top}
            width={CHART_WIDTH_PX}
            height={toY(fromValue, timeline, CHART_HEIGHT_PX) - top}
          />
        );
      })}
      {timeline.segments.map((segment) => (
        <polyline
          key={segment[0].tSec}
          className={`results-chart-line ${lineClass}`}
          points={toPolylinePoints(segment, timeline, CHART_WIDTH_PX, CHART_HEIGHT_PX)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function TimeAxis({ durationSec }: { durationSec: number }): ReactElement {
  return (
    <div className="results-chart-axis" aria-hidden="true">
      <span>0:00</span>
      <span>{formatDanceLength(durationSec)}</span>
    </div>
  );
}

/** Completed runs only (Results decides). Renders nothing when there are fewer than two usable seconds. */
export function ResultsChart({ result, hrMax }: { result: SessionResult; hrMax: number | null }): ReactElement | null {
  // Same rule as the Effort card, so a curve never sits next to "Not enough heart-rate data".
  const intensity = hrMax !== null ? workoutIntensity(result.samples, hrMax) : null;
  const heart = intensity && hrMax !== null ? heartRateTimeline(result.samples, result.durationSec) : null;

  if (heart && intensity && hrMax !== null) {
    return (
      <section className="health-card results-chart" aria-label="Heart rate">
        <h2 className="health-card-title">Heart rate</h2>
        <figure className="results-chart-figure">
          <ChartSvg timeline={heart} lineClass="is-heart" bands={zoneBands(heart, hrMax)} />
          <TimeAxis durationSec={heart.durationSec} />
          <figcaption>
            <p className="health-card-line">Across the song, shaded by effort zone.</p>
            <ul className="health-zone-legend">
              {ZONE_ORDER.filter((zone) => intensity.secondsInZone[zone] > 0).map((zone) => (
                <li key={zone}>
                  <span className={`health-zone-dot is-${zone}`} aria-hidden="true" />
                  {`${ZONE_LABELS[zone]} ${formatDanceLength(intensity.secondsInZone[zone])}`}
                </li>
              ))}
            </ul>
          </figcaption>
        </figure>
      </section>
    );
  }

  const accuracy = accuracyTimeline(result.samples, result.durationSec);
  if (!accuracy) return null;
  return (
    <section className="health-card results-chart" aria-label="Accuracy over the song">
      <h2 className="health-card-title">Accuracy over the song</h2>
      <figure className="results-chart-figure">
        <ChartSvg timeline={accuracy} lineClass="is-accuracy" bands={[]} />
        <TimeAxis durationSec={accuracy.durationSec} />
        <figcaption className="health-card-line">
          {`Your best moment: ${Math.round(accuracy.peak.value)}% at ${formatDanceLength(accuracy.peak.tSec)}.`}
        </figcaption>
      </figure>
    </section>
  );
}
