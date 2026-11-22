/**
 * Owner: Mohamed
 * Purpose: Get-ready panel above "I'm ready": one-line measuring / ready / fallback resting heart rate, or the no-watch line
 * FRs: FR-29, FR-06
 */

import type { ReactElement } from "react";
import { BASELINE_WINDOW_SEC } from "./baseline";
import type { StartingHrState } from "./useStartingHeartRate";
import "../screens/dance/dance.css";

export function StartingHeartRatePanel({ state }: { state: StartingHrState }): ReactElement | null {
  if (state.kind === "no-watch") {
    return (
      <div className="card start-hr-panel is-no-watch" role="status" aria-live="polite" aria-label="Heart rate">
        <span className="start-hr-icon" aria-hidden="true">ⓘ</span>
        <span className="start-hr-text">No watch connected · points will come from your moves</span>
      </div>
    );
  }

  if (state.kind === "measuring") {
    const filled = (BASELINE_WINDOW_SEC - state.secondsLeft) / BASELINE_WINDOW_SEC;
    return (
      <div className="card start-hr-panel" role="status" aria-live="polite" aria-label="Resting heart rate">
        <span className="start-hr-dot" aria-hidden="true" />
        <span className="start-hr-text">Measuring resting heart rate · {state.secondsLeft} s</span>
        <span className="start-hr-bpm">{state.latestBpm === null ? "--" : `${state.latestBpm} bpm`}</span>
        <span className="start-hr-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${filled})` }} />
        </span>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="card start-hr-panel" role="status" aria-live="polite" aria-label="Resting heart rate">
        <span className="start-hr-icon is-ok" aria-hidden="true">✓</span>
        <span className="start-hr-text">Resting heart rate</span>
        <span className="start-hr-bpm">{state.baseline.bpm} bpm</span>
      </div>
    );
  }

  return (
    <div className="card start-hr-panel is-fallback" role="status" aria-live="polite" aria-label="Resting heart rate">
      <span className="start-hr-icon" aria-hidden="true">ⓘ</span>
      <span className="start-hr-text">Watch not responding · using your profile</span>
      <span className="start-hr-bpm">{state.baseline.bpm} bpm</span>
    </div>
  );
}
