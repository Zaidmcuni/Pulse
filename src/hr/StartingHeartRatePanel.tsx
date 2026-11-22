/**
 * Owner: Mohamed
 * Purpose: Get-ready panel above "I'm ready": measuring / ready / fallback starting heart rate; nothing when simulated
 * FRs: FR-29, FR-06, FR-08
 */

import type { ReactElement } from "react";
import { BASELINE_WINDOW_SEC } from "./baseline";
import type { StartingHrState } from "./useStartingHeartRate";
import "../screens/dance/dance.css";

export function StartingHeartRatePanel({ state }: { state: StartingHrState }): ReactElement | null {
  if (state.kind === "simulated") return null; // the "Heart rate: simulated" chip already says it

  if (state.kind === "measuring") {
    const filled = (BASELINE_WINDOW_SEC - state.secondsLeft) / BASELINE_WINDOW_SEC;
    return (
      <div className="card start-hr-panel" role="status">
        <div className="start-hr-row">
          <span className="start-hr-dot" aria-hidden="true" />
          <span className="start-hr-text">Measuring your starting heart rate… {state.secondsLeft} s</span>
          <span className="start-hr-bpm">{state.latestBpm === null ? "--" : `${state.latestBpm} bpm`}</span>
        </div>
        <span className="start-hr-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${filled})` }} />
        </span>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="card start-hr-panel" role="status">
        <div className="start-hr-row">
          <span className="start-hr-icon is-ok" aria-hidden="true">✓</span>
          <span className="start-hr-text">Starting heart rate: {state.baseline.bpm} bpm</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card start-hr-panel is-fallback" role="status">
      <div className="start-hr-row">
        <span className="start-hr-icon" aria-hidden="true">ⓘ</span>
        <span className="start-hr-text">
          Couldn&rsquo;t read your watch. Using your profile value ({state.baseline.bpm} bpm).
        </span>
      </div>
    </div>
  );
}
