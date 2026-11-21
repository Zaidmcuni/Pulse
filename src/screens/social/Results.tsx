/**
 * Owner: Ali
 * Purpose: Results screen (/results/:resultId)
 * FRs: FR-35, FR-36, FR-38
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { store } from "../../data/store";
import { formatDanceLength } from "../dance/GetReady";
import "./Results.css";

export default function Results(): ReactElement {
  const { resultId } = useParams();
  const result = resultId ? store.getResult(resultId) : undefined;
  const title = result ? (result.completed ? "Dance complete" : "Dance ended early") : "Result not found";

  return (
    <section className="card session-results" aria-labelledby="session-results-title">
      <h1 id="session-results-title">{title}</h1>
      {result ? (
        <dl className="session-results-metrics" aria-label="Session metrics">
          {result.completed && (
            <>
              <div className="session-results-points">
                <dt>Total points</dt>
                <dd>{result.totalPoints.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{result.accuracyPct}%</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd><span className="badge session-results-level">{result.level}</span></dd>
              </div>
            </>
          )}
          <div>
            <dt>Duration</dt>
            <dd>{formatDanceLength(result.durationSec)}</dd>
          </div>
          <div>
            <dt>Calories</dt>
            <dd>{result.caloriesKcal} kcal</dd>
            <dd className="session-results-privacy">Estimated and private</dd>
          </div>
        </dl>
      ) : (
        <p>This session result is unavailable.</p>
      )}
      <Link className="btn btn-secondary" to="/dances">Back to dances</Link>
    </section>
  );
}
