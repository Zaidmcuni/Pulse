/**
 * Owner: Ali
 * Purpose: ProfilePage screen (/me)
 * FRs: FR-41, FR-52
 * Edited: Mohamed (task 17, badges link)
 * Edited: Toufic (#143, private "This week" card under Start Workout)
 * Edited: Mohamed (task 22, Today ring in the name card and Recent workouts under it; pulse line on Start Workout)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeIcon } from "../../badges/BadgeIcon";
import "../../badges/badges.css";
import { accounts } from "../../auth/accounts";
import { store } from "../../data/store";
import { HealthToday, RecentWorkouts } from "../../health/HealthSummary";
import { maxHeartRate } from "../../scoring/effort";
import { displayHandle } from "../setup/switcherHelpers";
import { badgeNames } from "./badgeNames";
import { SocialPosts } from "./SocialPosts";
import { WeeklyGoalCard } from "./WeeklyGoalCard";
import "./Social.css";

export default function ProfilePage(): ReactElement {
  const navigate = useNavigate();
  const [resetVersion, setResetVersion] = useState(0);
  const [resetStatus, setResetStatus] = useState<"pending" | "success" | "error">();
  const profile = store.getActiveProfile();

  async function resetDemo(): Promise<void> {
    setResetStatus("pending");
    const profileId = accounts.signedInProfileId();
    try {
      await store.resetDemo(profileId ?? undefined);
      if (profileId && store.getActiveProfile()?.id !== profileId) {
        accounts.logOut();
        navigate("/login", { replace: true });
        return;
      }
      setResetVersion((version) => version + 1);
      setResetStatus("success");
    } catch {
      setResetStatus("error");
    }
  }

  const resetAction = (
    <div className="card social-panel">
      <p className="social-meta">Resetting restores the current demo data and clears local activity. Your registered account and profile are kept.</p>
      <button className="btn btn-secondary" type="button" onClick={resetDemo} disabled={resetStatus === "pending"}>
        {resetStatus === "pending" ? "Resetting…" : "Reset demo data"}
      </button>
      {resetStatus === "success" && <p role="status">Demo data restored.</p>}
      {resetStatus === "error" && <p role="alert">Could not reset demo data. Try again.</p>}
    </div>
  );

  if (!profile) {
    return (
      <section className="social-page" aria-labelledby="profile-title">
        <h1 id="profile-title">Profile</h1>
        <div className="card social-panel">
          <p>Choose or create a dancer profile to see your activity.</p>
          <Link className="btn btn-primary" to="/profile/setup">Profile setup</Link>
        </div>
        {resetAction}
      </section>
    );
  }

  const completed = store.listResults(profile.id).filter((result) => result.completed);
  const points = completed.reduce((total, result) => total + result.totalPoints, 0);
  const badges = store.listBadges(profile.id);
  return (
    <section className="social-page" aria-labelledby="profile-title">
      <header className="card social-panel health-profile-head">
        <HealthToday />
        <div>
          <h1 id="profile-title">{profile.displayName}</h1>
          <p className="social-meta">{displayHandle(profile.handle)}</p>
        </div>
        <dl className="social-stats">
          <div><dt>Total points</dt><dd>{points.toLocaleString()}</dd></div>
          <div><dt>Completed dances</dt><dd>{completed.length}</dd></div>
        </dl>
      </header>
      {/* Main call to action of a health app: start dancing, right under today's progress. */}
      <Link to="/dances" className="profile-start-workout">
        {/* Same decorative heartbeat as the feed cards, in white. */}
        <svg className="profile-start-pulse" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 20H60L66 8L72 32L78 2L86 38L92 20H120L128 14L136 20H200" />
        </svg>
        <span>
          <strong>Start Workout</strong>
          <span>Pick a dance and get moving</span>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
      <WeeklyGoalCard results={store.listResults(profile.id)} hrMax={maxHeartRate(profile)} />
      <RecentWorkouts />
      <section className="card social-panel" aria-labelledby="profile-badges-title">
        <div className="badges-card-head">
          <h2 id="profile-badges-title"><Link to="/badges">Badges</Link></h2>
          <Link to="/badges">See all →</Link>
        </div>
        {badges.length > 0 ? (
          <ul className="badges-mini-list">
            {badges.map(({ badgeId }) => (
              <li key={badgeId}><BadgeIcon id={badgeId} earned size={40} />{badgeNames[badgeId]}</li>
            ))}
          </ul>
        ) : <p className="social-meta">No badges earned yet.</p>}
      </section>
      <section className="social-panel" aria-labelledby="profile-posts-title">
        <h2 id="profile-posts-title">Your posts</h2>
        <SocialPosts key={resetVersion} viewerId={profile.id} authorId={profile.id} emptyMessage="You haven’t shared a dance yet." />
      </section>
      {resetAction}
    </section>
  );
}
