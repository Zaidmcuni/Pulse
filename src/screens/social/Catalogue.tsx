/**
 * Owner: Ali
 * Purpose: Catalogue screen (/dances)
 * FRs: FR-09 to FR-12
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type KeyboardEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { rankForYou } from "../../data/forYou";
import { store } from "../../data/store";
import type { Difficulty } from "../../types/pulse";
import { formatDanceLength } from "../dance/GetReady";
import "./Catalogue.css";

const views = { popular: "Popular", "for-you": "For You" } as const;
type View = keyof typeof views;

const difficultyLabels = { easy: "Easy", medium: "Medium", hard: "Hard" } satisfies Record<Difficulty, string>;
const difficulties = ["easy", "medium", "hard"] as const;
type DifficultyFilter = "all" | Difficulty;
type DifficultySort = "default" | "easiest" | "hardest";

export default function Catalogue(): ReactElement {
  const [view, setView] = useState<View>("popular");
  const [filter, setFilter] = useState<DifficultyFilter>("all");
  const [sort, setSort] = useState<DifficultySort>("default");

  const dances = store.listDances();
  const profile = view === "for-you" ? store.getActiveProfile() : null;
  const ranked = view === "for-you"
    ? rankForYou(dances, profile ? store.listResults(profile.id) : [])
    : [...dances].sort((a, b) => b.popularity - a.popularity);
  const visibleDances = ranked.filter((dance) => filter === "all" || dance.difficulty === filter);

  if (sort !== "default") {
    const direction = sort === "easiest" ? 1 : -1;
    visibleDances.sort((a, b) => direction * (difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty)));
  }

  function switchViewWithKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    let nextView: View;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": nextView = view === "popular" ? "for-you" : "popular"; break;
      case "Home": nextView = "popular"; break;
      case "End": nextView = "for-you"; break;
      default: return;
    }
    event.preventDefault();
    setView(nextView);
    event.currentTarget.querySelector<HTMLButtonElement>(`#catalogue-tab-${nextView}`)?.focus();
  }

  return (
    <section className="catalogue" aria-labelledby="catalogue-title">
      <h1 id="catalogue-title">Dance catalogue</h1>

      <div className="catalogue-toolbar">
        <div className="catalogue-tabs" role="tablist" aria-label="Catalogue views" onKeyDown={switchViewWithKeyboard}>
          {(["popular", "for-you"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              id={`catalogue-tab-${option}`}
              aria-selected={view === option}
              aria-controls="catalogue-results"
              tabIndex={view === option ? 0 : -1}
              className="btn"
              onClick={() => setView(option)}
            >
              {views[option]}
            </button>
          ))}
        </div>

        <div className="catalogue-controls">
          <label>
            Difficulty
            <select value={filter} onChange={(event) => setFilter(event.currentTarget.value as DifficultyFilter)}>
              <option value="all">All</option>
              {difficulties.map((difficulty) => (
                <option key={difficulty} value={difficulty}>{difficultyLabels[difficulty]}</option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(event) => setSort(event.currentTarget.value as DifficultySort)}>
              <option value="default">View order</option>
              <option value="easiest">Easiest first</option>
              <option value="hardest">Hardest first</option>
            </select>
          </label>
        </div>
      </div>

      <div id="catalogue-results" role="tabpanel" aria-labelledby={`catalogue-tab-${view}`}>
        {visibleDances.length ? (
          <ul className="catalogue-grid">
            {visibleDances.map((dance) => (
              <li key={dance.id}>
                <Link
                  className="card catalogue-card"
                  to={`/dance/${encodeURIComponent(dance.id)}/ready`}
                >
                  <div>
                    <h2>{dance.title}</h2>
                    <p>{dance.genre}</p>
                  </div>
                  <div className="catalogue-card-footer">
                    <span className="badge">{difficultyLabels[dance.difficulty]}</span>
                    <span>{formatDanceLength(dance.lengthSec)}</span>
                    <span className="catalogue-card-arrow" aria-hidden="true">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card catalogue-empty" role="status">
            {dances.length ? "No dances match this view and difficulty. Try a different difficulty or view." : "No dances are available yet."}
          </p>
        )}
      </div>
    </section>
  );
}
