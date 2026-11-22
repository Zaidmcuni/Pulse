/**
 * Owner: Mohamed
 * Purpose: top of the Me page: Today ring (estimated calories vs a daily goal) and recent workout tiles;
 *          plus the full workout list at /me/workouts.
 * FRs: FR-32, FR-41, FR-02
 * Privacy: only for the signed-in profile (never on /u/:id); never shows age, weight, HRmax or heart rate.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { DanceCover } from "../components/DanceCover";
import { store } from "../data/store";
import { maxHeartRate } from "../scoring/effort";
import { formatDanceLength } from "../screens/dance/GetReady";
import { DAILY_KCAL_GOAL, formatWorkoutDate, recentWorkouts, todaySummary, type RecentWorkout, type TodaySummary } from "./healthSummaryLogic";
import { ZONE_LABELS } from "./intensity";
import "./health.css";

const RING_SIZE_PX = 120;
const RING_STROKE_PX = 10;
const RING_RADIUS_PX = (RING_SIZE_PX - RING_STROKE_PX) / 2;
const RING_CIRCUMFERENCE_PX = 2 * Math.PI * RING_RADIUS_PX;

function TodayRing({ summary }: { summary: TodaySummary }): ReactElement {
  const center = RING_SIZE_PX / 2;
  const offset = RING_CIRCUMFERENCE_PX * (1 - summary.goalFraction);
  const done = summary.goalFraction === 1;
  return (
    <div className="health-ring">
      <svg width={RING_SIZE_PX} height={RING_SIZE_PX} viewBox={`0 0 ${RING_SIZE_PX} ${RING_SIZE_PX}`} aria-hidden="true">
        <circle className="health-ring-track" cx={center} cy={center} r={RING_RADIUS_PX} strokeWidth={RING_STROKE_PX} fill="none" />
        <circle
          className={`health-ring-progress${done ? " is-done" : ""}`}
          cx={center}
          cy={center}
          r={RING_RADIUS_PX}
          strokeWidth={RING_STROKE_PX}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE_PX}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="health-ring-center">
        <span className="health-ring-value">{summary.kcal === null ? "--" : Math.round(summary.kcal)}</span>
        <span className="health-ring-goal">/ {DAILY_KCAL_GOAL} kcal</span>
      </div>
    </div>
  );
}

function TodayCard({ summary, now }: { summary: TodaySummary; now: Date }): ReactElement {
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return (
    <section className="card health-today" aria-label="Today">
      <h2 className="health-summary-title">Today <span className="health-muted">{dateLabel}</span></h2>
      <div className="health-today-body">
        <TodayRing summary={summary} />
        <div className="health-today-stats">
          <p className="health-today-stat">{summary.activeMinutes} active min</p>
          <p className="health-today-stat">{summary.dances} {summary.dances === 1 ? "dance" : "dances"} today</p>
          {summary.goalFraction === 1 && <p className="health-today-goal">Daily goal reached!</p>}
          <p className="health-muted">Calories are estimated.</p>
        </div>
      </div>
      {summary.kcal === null && <p className="health-muted">Connect a watch to track calories.</p>}
    </section>
  );
}

/** Square tiles shown in the Recent workouts row; more than this shows a "See all" tile. */
const RECENT_TILE_LIMIT = 5;

function kcalLabel(workout: RecentWorkout): string {
  return workout.kcal === null ? "--" : `${Math.round(workout.kcal)} kcal`;
}

function IntensityChip({ workout }: { workout: RecentWorkout }): ReactElement {
  return workout.intensity === null
    ? <span className="health-chip is-none">No watch</span>
    : <span className={`health-chip is-${workout.intensity}`}>{ZONE_LABELS[workout.intensity]}</span>;
}

function WorkoutRow({ workout, now }: { workout: RecentWorkout; now: Date }): ReactElement {
  const dance = store.getDance(workout.danceId);
  const title = dance?.title ?? workout.danceId;
  return (
    <li>
      <Link to={`/results/${workout.resultId}`} className="health-workout">
        <DanceCover title={title} artist={dance?.artist} coverUrl={dance?.coverUrl} size="sm" />
        <span className="health-workout-main">
          <strong className="health-workout-title">{title}</strong>
          <span className="health-muted">{formatWorkoutDate(workout.createdAtIso, now)}</span>
          {!workout.completed && <span className="health-tag">Ended early</span>}
        </span>
        <span className="health-workout-stats">
          <span>{formatDanceLength(workout.durationSec)}</span>
          <span>{kcalLabel(workout)}</span>
          <IntensityChip workout={workout} />
        </span>
      </Link>
    </li>
  );
}

function WorkoutTile({ workout, now }: { workout: RecentWorkout; now: Date }): ReactElement {
  const dance = store.getDance(workout.danceId);
  const title = dance?.title ?? workout.danceId;
  return (
    <li>
      <Link to={`/results/${workout.resultId}`} className="health-tile">
        <span className="health-tile-top">
          <DanceCover title={title} artist={dance?.artist} coverUrl={dance?.coverUrl} size="sm" />
          <IntensityChip workout={workout} />
        </span>
        <strong className="health-workout-title">{title}</strong>
        <span className="health-tag">{formatWorkoutDate(workout.createdAtIso, now)}</span>
        <span className="health-tile-stats">{`${formatDanceLength(workout.durationSec)} · ${kcalLabel(workout)}`}</span>
        {!workout.completed && <span className="health-tag">Ended early</span>}
      </Link>
    </li>
  );
}

function RecentCard({ workouts, hasMore, now }: { workouts: RecentWorkout[]; hasMore: boolean; now: Date }): ReactElement {
  return (
    <section className="card health-recent" aria-label="Recent workouts">
      <h2 className="health-summary-title">Recent workouts</h2>
      {workouts.length === 0 ? (
        <p className="health-muted">No workouts yet. <Link to="/dances">Pick a dance to get started.</Link></p>
      ) : (
        <ul className="health-tiles">
          {workouts.map((w) => <WorkoutTile key={w.resultId} workout={w} now={now} />)}
          {hasMore && (
            <li>
              <Link to="/me/workouts" className="health-tile health-tile-more" aria-label="See all workouts">
                <span className="health-tile-dots" aria-hidden="true">…</span>
                <span className="health-tag">See all</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function HealthSummary(): ReactElement | null {
  const profile = store.getActiveProfile();
  if (!profile) return null;
  const now = new Date();
  const hrMax = maxHeartRate(profile);
  const results = store.listResults(profile.id);
  return (
    <div className="health-summary">
      <TodayCard summary={todaySummary(results, hrMax, now)} now={now} />
      <RecentCard workouts={recentWorkouts(results, hrMax, RECENT_TILE_LIMIT)} hasMore={results.length > RECENT_TILE_LIMIT} now={now} />
    </div>
  );
}

/** /me/workouts: every workout of the signed-in profile, newest first, top to bottom. */
export function WorkoutHistory(): ReactElement | null {
  const profile = store.getActiveProfile();
  if (!profile) return null;
  const now = new Date();
  const results = store.listResults(profile.id);
  const workouts = recentWorkouts(results, maxHeartRate(profile), results.length);
  return (
    <section className="card health-recent" aria-label="All workouts">
      <Link to="/me" className="health-tag">← Back to Me</Link>
      <h1 className="health-summary-title">All workouts</h1>
      {workouts.length === 0 ? (
        <p className="health-muted">No workouts yet. <Link to="/dances">Pick a dance to get started.</Link></p>
      ) : (
        <ul className="health-workouts">
          {workouts.map((w) => <WorkoutRow key={w.resultId} workout={w} now={now} />)}
        </ul>
      )}
    </section>
  );
}
