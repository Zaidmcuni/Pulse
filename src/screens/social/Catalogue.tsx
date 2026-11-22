/**
 * Owner: Ali
 * Purpose: Catalogue screen (/dances)
 * FRs: FR-09 to FR-12
 * Edited: Mohamed (council redesign: Popular only, Standing/Seated toggle, difficulty chips, 2x2 song cards)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { store } from "../../data/store";
import type { Difficulty, PosturalMode } from "../../types/pulse";
import { formatDanceLength } from "../dance/GetReady";
import { modeLabel } from "../setup/switcherHelpers";
import "./Catalogue.css";

const difficultyLabels = { easy: "Easy", medium: "Medium", hard: "Hard" } satisfies Record<Difficulty, string>;
const difficulties = ["easy", "medium", "hard"] as const;
type DifficultyFilter = "all" | Difficulty;

function DifficultyDots({ level }: { level: Difficulty }): ReactElement {
  const filled = difficulties.indexOf(level) + 1;
  return (
    <span className="catalogue-dots" aria-label={`Difficulty: ${difficultyLabels[level]}`}>
      {difficulties.map((d, i) => <span key={d} className={i < filled ? "is-on" : undefined} aria-hidden="true" />)}
      <span className="catalogue-dots-label" aria-hidden="true">{difficultyLabels[level]}</span>
    </span>
  );
}

export default function Catalogue(): ReactElement {
  const [filter, setFilter] = useState<DifficultyFilter>("all");
  const [profile, setProfile] = useState(() => store.getActiveProfile());

  // Popular only (the council cut "For You": with four songs it means nothing).
  const dances = store.listDances();
  const visibleDances = [...dances]
    .sort((a, b) => b.popularity - a.popularity)
    .filter((dance) => filter === "all" || dance.difficulty === filter);

  function chooseMode(mode: PosturalMode): void {
    if (!profile || profile.mode === mode) return;
    const next = { ...profile, mode };
    store.saveProfile(next);
    setProfile(next);
  }

  return (
    <section className="catalogue" aria-labelledby="catalogue-title">
      <header className="catalogue-head">
        <h1 id="catalogue-title">Pick a song</h1>
        {profile && (
          <div className="mode-toggle" role="radiogroup" aria-label="How you'll dance">
            {(["standing", "seated"] as const).map((m) => (
              <label key={m} className={`mode-toggle-option${profile.mode === m ? " is-on" : ""}`}>
                <input type="radio" name="catalogue-mode" value={m} checked={profile.mode === m} onChange={() => chooseMode(m)} />
                {modeLabel(m)}
              </label>
            ))}
          </div>
        )}
      </header>

      <div className="catalogue-chips" role="group" aria-label="Difficulty">
        {(["all", ...difficulties] as const).map((d) => (
          <button
            key={d}
            type="button"
            className="catalogue-chip"
            aria-pressed={filter === d}
            onClick={() => setFilter(d)}
          >
            {d === "all" ? "All" : difficultyLabels[d]}
          </button>
        ))}
      </div>

      {visibleDances.length ? (
        <ul className="catalogue-grid">
          {visibleDances.map((dance) => (
            <li key={dance.id}>
              <Link className="catalogue-card" to={`/dance/${encodeURIComponent(dance.id)}/ready`}>
                <span className="catalogue-cover" aria-hidden="true">
                  <span className="catalogue-cover-mark">{dance.title.charAt(0)}</span>
                  <span className="catalogue-cover-bpm">{dance.bpm} BPM</span>
                </span>
                <span className="catalogue-card-body">
                  <span className="catalogue-card-text">
                    <h2>{dance.title}</h2>
                    <span className="catalogue-genre">{dance.genre} · {formatDanceLength(dance.lengthSec)}</span>
                  </span>
                  <span className="catalogue-card-footer">
                    <DifficultyDots level={dance.difficulty} />
                    {profile?.mode === "seated" && <span className="badge catalogue-seated">Seated · upper body</span>}
                    <span className="catalogue-play">Play</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card catalogue-empty" role="status">
          {dances.length ? "No songs at this difficulty yet. Try another one." : "No dances are available yet."}
        </p>
      )}
    </section>
  );
}
