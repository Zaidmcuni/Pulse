/**
 * Owner: Ali
 * Purpose: ProfilePage screen (/me)
 * FRs: FR-41
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { store } from "../../data/store";
import type { BadgeId } from "../../types/pulse";
import { displayHandle } from "../setup/switcherHelpers";
import { SocialPosts } from "./SocialPosts";
import "./Social.css";

const badgeNames: Record<BadgeId, string> = {
  first_steps: "First Steps",
  on_fire: "On Fire",
  superstar: "Superstar",
  "1k_club": "1K Club",
  crew_player: "Crew Player",
  podium: "Podium",
};

export default function ProfilePage(): ReactElement {
  const profile = store.getActiveProfile();
  if (!profile) {
    return (
      <section className="social-page" aria-labelledby="profile-title">
        <h1 id="profile-title">Profile</h1>
        <div className="card social-panel">
          <p>Choose or create a dancer profile to see your activity.</p>
          <Link className="btn btn-primary" to="/profile/setup">Profile setup</Link>
        </div>
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
        <h2 id="profile-badges-title">Badges</h2>
        {badges.length > 0 ? (
          <ul className="social-badges">
            {badges.map(({ badgeId }) => <li key={badgeId} className="badge">{badgeNames[badgeId]}</li>)}
          </ul>
        ) : <p className="social-meta">No badges earned yet.</p>}
      </section>
      <section className="social-panel" aria-labelledby="profile-posts-title">
        <h2 id="profile-posts-title">Your posts</h2>
        <SocialPosts viewerId={profile.id} authorId={profile.id} emptyMessage="You haven’t shared a dance yet." />
      </section>
    </section>
  );
}
