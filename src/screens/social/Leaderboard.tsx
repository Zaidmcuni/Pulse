/**
 * Owner: Ali
 * Added by: Toufic (#141)
 * Purpose: Community leaderboard (/leaderboard, the Rankings tab of Feed): all dancers, all-time,
 *          by total points or by estimated calories that dancers shared on a post
 * FRs: FR-44, FR-35, FR-02, FR-38
 */

import { useState, type ReactElement } from "react";
import { communityLeaderboard, splitForViewer, type CommunityMetric } from "../../data/globalLeaderboard";
import { store } from "../../data/store";
import { RankingTable } from "./RankingTable";
import "./Social.css";

const METRICS = {
  points: {
    toggle: "Points",
    heading: "Points",
    caption: "Total points from every finished dance, across all dancers.",
    empty: "No finished dances yet. Be the first on the board!",
    format: (points: number) => points.toLocaleString(),
  },
  calories: {
    toggle: "Calories (est.)",
    heading: "Calories (est.)",
    caption: "Estimated calories from runs dancers chose to share with a watch connected.",
    empty: "No shared calories yet.",
    format: (kcal: number) => `${Math.round(kcal)} kcal`,
  },
} satisfies Record<CommunityMetric, unknown>;

export default function Leaderboard(): ReactElement {
  const [metric, setMetric] = useState<CommunityMetric>("points");
  const viewerId = store.getActiveProfile()?.id;
  const profiles = store.listProfiles();
  const results = profiles.flatMap((p) => store.listResults(p.id));
  const rows = communityLeaderboard(profiles, results, store.listFeed(), metric);
  const { top, you } = splitForViewer(rows, viewerId);
  const ranked = rows.some((row) => row.playerId === viewerId);
  const copy = METRICS[metric];

  return (
    <section className="social-page" aria-labelledby="leaderboard-title">
      <h1 id="leaderboard-title">Leaderboard</h1>
      <section className="card social-panel" aria-label="Community leaderboard">
        <div className="mode-toggle" role="radiogroup" aria-label="Rank by">
          {(["points", "calories"] as const).map((m) => (
            <label key={m} className={`mode-toggle-option${metric === m ? " is-on" : ""}`}>
              <input type="radio" name="leaderboard-metric" value={m} checked={metric === m} onChange={() => setMetric(m)} />
              {METRICS[m].toggle}
            </label>
          ))}
        </div>
        <p className="social-meta">{copy.caption}</p>
        {top.length === 0 ? <p>{copy.empty}</p> : (
          <RankingTable
            label={`Community leaderboard by ${copy.heading.toLowerCase()}`}
            valueHeading={copy.heading}
            top={top}
            you={you}
            profiles={profiles}
            formatValue={copy.format}
          />
        )}
        {metric === "points" && top.length > 0 && viewerId !== undefined && !ranked && (
          <p className="social-meta">Finish a dance to join the leaderboard.</p>
        )}
      </section>
    </section>
  );
}
