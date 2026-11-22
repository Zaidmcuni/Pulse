/**
 * Owner: Mohamed
 * Purpose: "Moves" card on the results page: the accuracy medal, kept apart from the Effort level.
 * FRs: FR-35
 */

import type { ReactElement } from "react";
import type { AccuracyLevel } from "../types/pulse";
import "./health.css";

function StarIcon(): ReactElement {
  return (
    <svg className="health-card-icon is-star" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  );
}

export function MovesCard(props: { level: AccuracyLevel; accuracyPct: number }): ReactElement {
  const { level, accuracyPct } = props;
  return (
    <section className="health-card" aria-label="Moves">
      <h2 className="health-card-title"><StarIcon />Moves</h2>
      <p className="health-card-value"><span className={`session-results-medal is-${level}`}>{level}</span></p>
      <p className="health-card-line">{accuracyPct}% accuracy</p>
    </section>
  );
}
