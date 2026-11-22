/**
 * Owner: Mohamed
 * Purpose: "Effort" card on the results page: workout intensity from the heart rate.
 * FRs: FR-29, FR-35
 * Privacy: never shows age or the HRmax value.
 */

import type { ReactElement } from "react";
import { resultHasHeartRate } from "../scoring/session";
import type { SessionResult } from "../types/pulse";
import { workoutIntensity, ZONE_LABELS, ZONE_ORDER, type WorkoutIntensity } from "./intensity";
import "./health.css";

function HeartIcon(): ReactElement {
  return (
    <svg className="health-card-icon is-heart" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function ZoneBar({ intensity }: { intensity: WorkoutIntensity }): ReactElement {
  const { secondsInZone, measuredSec } = intensity;
  return (
    <>
      <div className="health-zone-bar" aria-hidden="true">
        {ZONE_ORDER.map((zone) => (
          <span key={zone} className={`is-${zone}`} style={{ width: `${(secondsInZone[zone] / measuredSec) * 100}%` }} />
        ))}
      </div>
      <ul className="health-zone-legend">
        {ZONE_ORDER.filter((zone) => secondsInZone[zone] > 0).map((zone) => (
          <li key={zone}><span className={`health-zone-dot is-${zone}`} aria-hidden="true" />{ZONE_LABELS[zone]}</li>
        ))}
      </ul>
    </>
  );
}

export function EffortCard(props: { result: SessionResult; hrMax: number | null }): ReactElement {
  const { result, hrMax } = props;
  const hasWatch = resultHasHeartRate(result);
  const intensity = hasWatch && hrMax !== null ? workoutIntensity(result.samples, hrMax) : null;

  return (
    <section className="health-card" aria-label="Effort">
      <h2 className="health-card-title"><HeartIcon />Effort</h2>
      {intensity ? (
        <>
          <p className={`health-card-value is-${intensity.level}`}>{ZONE_LABELS[intensity.level]}</p>
          <ZoneBar intensity={intensity} />
          <p className="health-card-line">
            Avg {intensity.avgBpm} bpm · Peak {intensity.peakBpm} bpm · {intensity.activeMinutes} active min
          </p>
        </>
      ) : (
        <>
          <p className="health-card-value">--</p>
          <p className="health-card-line">
            {hasWatch ? "Not enough heart-rate data" : "No watch: connect one to see your effort"}
          </p>
        </>
      )}
    </section>
  );
}
