/**
 * Owner: Mohamed
 * Purpose: Get-ready corner tag on the camera: "Measuring…" or "Resting HR 72". Nothing at all when there is no watch.
 * FRs: FR-29, FR-06
 */

import type { ReactElement } from "react";
import type { StartingHrState } from "./useStartingHeartRate";
import "../screens/dance/dance.css";

export function StartingHeartRatePanel({ state }: { state: StartingHrState }): ReactElement | null {
  if (state.kind === "no-watch") return null;

  if (state.kind === "measuring") {
    return (
      <div className="start-hr-tag" role="status" aria-live="polite" aria-label="Resting heart rate">
        <span className="start-hr-dot" aria-hidden="true" />
        Measuring…
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
