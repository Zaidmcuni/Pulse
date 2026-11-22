/**
 * Owner: Mohamed
 * Purpose: Get Ready resting heart rate: a measuring panel with a progress bar above "I'm ready", then a corner tag
 *   on the camera ("Resting HR 72"). Nothing at all when there is no watch.
 * FRs: FR-29, FR-06
 */

import type { ReactElement } from "react";
import { BASELINE_WINDOW_SEC } from "./baseline";
import type { StartingHrState } from "./useStartingHeartRate";
import "../screens/dance/dance.css";

export function StartingHeartRatePanel({ state }: { state: StartingHrState }): ReactElement | null {
  if (state.kind === "no-watch") return null;

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

  return (
    <div
      className="start-hr-tag"
      role="status"
      aria-live="polite"
      aria-label="Resting heart rate"
      title={state.kind === "fallback" ? "Watch not responding, using your profile" : undefined}
    >
      Resting HR {state.baseline.bpm}
    </div>
  );
}
