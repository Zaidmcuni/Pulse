/**
 * Owner: Mohamed
 * Purpose: Detail view for one badge on the badges page: big medal, how to earn it, and earned date or progress.
 * FRs: FR-46, NFR-10
 */

import type { ReactElement } from "react";
import { BadgeIcon } from "./BadgeIcon";
import { FAMILY_LABELS, getBadgeDef } from "./catalogue";
import type { BadgeProgress } from "./progress";

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function ProgressBar({ current, target }: { current: number; target: number }): ReactElement {
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;
  return (
    <div className="badges-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={current}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BadgeDetail({ progress, onBack }: { progress: BadgeProgress; onBack: () => void }): ReactElement {
  const def = getBadgeDef(progress.id);
  const kind = def.tier ? `${FAMILY_LABELS[def.family]} · ${capitalise(def.tier)}` : FAMILY_LABELS[def.family];

  return (
    <section className="card badges-detail" aria-labelledby="badge-detail-title">
      <button className="btn btn-secondary" type="button" onClick={onBack}>← All badges</button>
      <BadgeIcon id={progress.id} earned={progress.earned} size={160} />
      <h2 id="badge-detail-title">{def.name}</h2>
      <p className="badges-muted">{kind}</p>
      <div className="badges-how">
        <h3>How to earn</h3>
        <p>{def.howToEarn}</p>
      </div>
      {progress.earned && progress.earnedAtIso ? (
        <p className="badges-earned-on">
          Earned on {new Date(progress.earnedAtIso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      ) : (
        <div className="badges-detail-progress">
          <p>{progress.label}</p>
          {progress.target > 1 && <ProgressBar current={progress.current} target={progress.target} />}
          <p className="badges-muted">{progress.current > 0 ? "Keep dancing, you're on your way!" : "Dance to start this one."}</p>
        </div>
      )}
    </section>
  );
}
