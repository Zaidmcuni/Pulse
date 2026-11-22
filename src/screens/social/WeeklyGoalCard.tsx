/**
 * Owner: Toufic (UI sprint lane D)
 * Purpose: "This week" card on the Me page: minutes danced vs the weekly movement goal, Mon–Sun days danced,
 *          and chips for finished dances, day streak and estimated calories.
 * FRs: FR-41, FR-02
 * Privacy: rendered only on /me for the signed-in dancer (never on /u/:id); no body stats or heart rate.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { computeWeeklySummary, WEEKLY_MOVEMENT_GOAL_MIN } from "../../data/weeklySummary";
import type { SessionResult } from "../../types/pulse";
import "../../health/health.css"; // reuses .health-muted and .health-tag from the Today ring
import "./WeeklyGoalCard.css";

function formatWeekRange(weekStartMs: number): string {
  const sunday = new Date(weekStartMs);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (date: Date): string => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(new Date(weekStartMs))} – ${fmt(sunday)}`;
}

export function WeeklyGoalCard({ results, now = new Date() }: { results: readonly SessionResult[]; now?: Date }): ReactElement {
  const week = computeWeeklySummary(results, now);
  const done = week.goalFraction === 1;
  const activeDays = week.days.filter((day) => day.active);
  const daysLabel = activeDays.length === 0
    ? "No dance days yet this week"
    : `Danced on ${activeDays.length} of 7 days this week: ${activeDays.map((day) => day.name).join(", ")}`;

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
      <div className="weekly-days" role="img" aria-label={daysLabel}>
        {week.days.map((day) => (
          <span key={day.name} className={`weekly-day${day.active ? " is-active" : ""}${day.isToday ? " is-today" : ""}`}>
            {day.initial}
          </span>
        ))}
      </div>
      {week.dances === 0 && (
        <p className="health-muted">A fresh week! <Link to="/dances">Pick a dance</Link> to get moving.</p>
      )}
      {(week.dances > 0 || week.streakDays > 0) && (
        <ul className="weekly-chips">
          {week.dances > 0 && <li className="badge">{`${week.dances} ${week.dances === 1 ? "dance" : "dances"} finished`}</li>}
          <li className="badge">{week.streakDays > 0 ? `${week.streakDays}-day streak` : "Dance today to start a streak"}</li>
          {week.dances > 0 && <li className="badge">{week.kcal === null ? "-- kcal · no watch" : `${Math.round(week.kcal)} kcal est.`}</li>}
        </ul>
      )}
    </section>
  );
}
