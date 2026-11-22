/**
 * Owner: Toufic (UI sprint lane D)
 * Purpose: "This week" card on the Me page: minutes danced vs the weekly movement goal, Mon–Sun day buttons
 *          that open that day's calorie ring and workouts, and chips for finished dances, day streak and calories.
 * FRs: FR-41, FR-02
 * Privacy: rendered only on /me for the signed-in dancer (never on /u/:id); no body stats or heart rate.
 */

import { useState, type KeyboardEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { computeWeeklySummary, resultsOnDay, WEEKLY_MOVEMENT_GOAL_MIN } from "../../data/weeklySummary";
import { TodayRing, WorkoutTile } from "../../health/HealthSummary";
import { recentWorkouts, todaySummary } from "../../health/healthSummaryLogic";
import type { SessionResult } from "../../types/pulse";
import "../../health/health.css"; // reuses the Today ring, workout tiles, .health-muted and .health-tag
import "./WeeklyGoalCard.css";

const PANEL_ID = "weekly-day-panel";

function formatWeekRange(weekStartMs: number): string {
  const sunday = new Date(weekStartMs);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (date: Date): string => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(new Date(weekStartMs))} – ${fmt(sunday)}`;
}

const dancesLabel = (count: number): string => `${count} ${count === 1 ? "dance" : "dances"}`;

/** One day's dropdown: the Today-style calorie ring (no card of its own), its totals, then a tile per workout. */
export function WeekDayPanel({ results, hrMax, dayMs, now }: {
  results: readonly SessionResult[]; hrMax: number; dayMs: number; now: Date;
}): ReactElement {
  const day = new Date(dayMs);
  const summary = todaySummary(results, hrMax, day);
  const dayRuns = resultsOnDay(results, dayMs);
  const workouts = recentWorkouts(dayRuns, hrMax, dayRuns.length);
  const dateLabel = day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <div id={PANEL_ID} className="card weekly-day-panel" role="region" aria-label={dateLabel}>
      <div className="weekly-day-summary">
        <TodayRing summary={summary} />
        <div className="health-today-stats">
          <p className="health-today-stat">{`${dateLabel} · ${summary.activeMinutes} active min · ${dancesLabel(summary.dances)}`}</p>
          {summary.kcal === null
            ? <p className="health-tag">Connect a watch to track calories.</p>
            : summary.goalFraction === 1
              ? <p className="health-today-goal">Daily goal reached!</p>
              : <p className="health-tag">{`${Math.round(summary.goalFraction * 100)}% of the daily goal`}</p>}
          <p className="health-tag">Calories are estimated.</p>
        </div>
      </div>
      {workouts.length === 0 ? (
        <p className="health-muted">No dances this day.</p>
      ) : (
        <ul className="health-tiles" aria-label={`Dances on ${dateLabel}`}>
          {workouts.map((w) => <WorkoutTile key={w.resultId} workout={w} now={now} />)}
        </ul>
      )}
    </div>
  );
}

export function WeeklyGoalCard({ results, hrMax, now = new Date() }: {
  results: readonly SessionResult[]; hrMax: number; now?: Date;
}): ReactElement {
  const [selected, setSelected] = useState<number | null>(null);
  const week = computeWeeklySummary(results, now);
  const done = week.goalFraction === 1;
  const activeDays = week.days.filter((day) => day.active);
  const daysLabel = activeDays.length === 0
    ? "No dance days yet this week"
    : `Danced on ${activeDays.length} of 7 days this week: ${activeDays.map((day) => day.name).join(", ")}`;
  const selectedDay = week.days.find((day) => day.dayMs === selected);

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || selected === null) return;
    setSelected(null);
    document.getElementById(`weekly-day-${selected}`)?.focus();
  }

  return (
    <section className="card social-panel weekly-card" aria-labelledby="weekly-title">
      <div className="weekly-head">
        <h2 id="weekly-title">This week</h2>
        <span className="health-muted">{formatWeekRange(week.weekStartMs)}</span>
      </div>
      <div className="weekly-progress">
        <p className="weekly-value">{`${week.minutes} min danced`}</p>
        <p className="health-tag">{`Weekly movement goal · ${WEEKLY_MOVEMENT_GOAL_MIN} min`}</p>
        <div className="weekly-bar" aria-hidden="true">
          <span className={`weekly-bar-fill${done ? " is-done" : ""}`} style={{ width: `${week.goalFraction * 100}%` }} />
        </div>
        {done && <p className="weekly-goal-done">Weekly goal reached!</p>}
      </div>
      <div className="weekly-days-wrap" onKeyDown={closeOnEscape}>
        <div className="weekly-days" role="group" aria-label={daysLabel}>
          {week.days.map((day) => {
            const isSelected = day.dayMs === selected;
            const date = new Date(day.dayMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const label = day.isFuture ? `${day.name}, ${date}` : `${day.name}, ${date} — ${dancesLabel(resultsOnDay(results, day.dayMs).length)}`;
            return (
              <button
                key={day.name}
                id={`weekly-day-${day.dayMs}`}
                type="button"
                className="weekly-day-btn"
                aria-label={label}
                aria-expanded={isSelected}
                aria-controls={isSelected ? PANEL_ID : undefined}
                disabled={day.isFuture}
                onClick={() => setSelected(isSelected ? null : day.dayMs)}
              >
                <span
                  className={`weekly-day${day.active ? " is-active" : ""}${day.isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
                  aria-hidden="true"
                >
                  {day.initial}
                </span>
              </button>
            );
          })}
        </div>
        {selectedDay && <WeekDayPanel results={results} hrMax={hrMax} dayMs={selectedDay.dayMs} now={now} />}
      </div>
      {week.dances === 0 ? (
        <>
          <p className="health-muted">A fresh week! <Link to="/dances">Pick a dance</Link> to get moving.</p>
          {week.streakDays > 0 && <ul className="weekly-chips"><li className="badge">{`${week.streakDays}-day streak`}</li></ul>}
        </>
      ) : (
        <ul className="weekly-chips">
          <li className="badge">{`${week.dances} ${week.dances === 1 ? "dance" : "dances"} finished`}</li>
          <li className="badge">{week.streakDays > 0 ? `${week.streakDays}-day streak` : "Dance today to start a streak"}</li>
          <li className="badge">{week.kcal === null ? "-- kcal · no watch" : `${Math.round(week.kcal)} kcal est.`}</li>
        </ul>
      )}
    </section>
  );
}
