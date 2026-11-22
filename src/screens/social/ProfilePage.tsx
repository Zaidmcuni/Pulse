/**
 * Owner: Ali
 * Purpose: ProfilePage screen (/me)
 * FRs: FR-41, FR-52
 * Edited: Mohamed (task 17, badges link)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { BadgeIcon } from "../../badges/BadgeIcon";
import "../../badges/badges.css";
import { store } from "../../data/store";
import { displayHandle } from "../setup/switcherHelpers";
import { badgeNames } from "./badgeNames";
import { SocialPosts } from "./SocialPosts";
import "./Social.css";

export default function ProfilePage(): ReactElement {
  const [resetVersion, setResetVersion] = useState(0);
  const [resetStatus, setResetStatus] = useState<"success" | "error">();
  const profile = store.getActiveProfile();

  function resetDemo(): void {
    try {
      store.resetDemo();
      setResetVersion((version) => version + 1);
      setResetStatus("success");
    } catch {
      setResetStatus("error");
    }
  }

  const resetAction = (
    <div className="card social-panel">
      <p className="social-meta">Resetting replaces your local PULSE changes with the original demo data.</p>
      <button className="btn btn-secondary" type="button" onClick={resetDemo}>Reset demo data</button>
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
      <header className="card social-panel">
        <div>
          <h1 id="profile-title">{profile.displayName}</h1>
          <p className="social-meta">{displayHandle(profile.handle)}</p>
        </div>
        <dl className="social-stats">
          <div><dt>Total points</dt><dd>{points.toLocaleString()}</dd></div>
          <div><dt>Completed dances</dt><dd>{completed.length}</dd></div>
        </dl>
      </header>
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
