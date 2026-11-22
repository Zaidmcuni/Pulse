/**
 * Owner: Mohamed
 * Purpose: public dancer profile (/u/:playerId): name, handle, mode, points, groups, badges and posts
 * FRs: FR-39, FR-41, FR-02 (never shows body stats, email, heart rate or unposted calories)
 */

import type { ReactElement } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { BadgeIcon } from "../../badges/BadgeIcon";
import { getBadgeDef } from "../../badges/catalogue";
import "../../badges/badges.css";
import { store } from "../../data/store";
import { displayHandle, initialOf, modeLabel } from "../setup/switcherHelpers";
import { SocialPosts } from "../social/SocialPosts";
import "../social/Social.css";
import { profilePath, summarizeDancer } from "./dancerSummary";
import "./dancerProfile.css";

const MAX_BADGES_SHOWN = 6;

const num = (value: number): string => value.toLocaleString("en-US");

export default function DancerProfile(): ReactElement {
  const { playerId = "" } = useParams();
  const viewerId = store.getActiveProfile()?.id;
  if (playerId === viewerId) return <Navigate to="/me" replace />;

  const profile = store.listProfiles().find((entry) => entry.id === playerId);
  if (!profile) {
    return (
      <section className="social-page" aria-labelledby="dancer-title">
        <div className="card social-panel">
          <h1 id="dancer-title">Dancer not found</h1>
          <Link className="btn btn-secondary" to="/feed">Back to the feed</Link>
        </div>
      </section>
    );
  }

  const summary = summarizeDancer(profile.id, store.listResults(profile.id), store.listGroups(), store.listBadges(profile.id));
  const badgesPath = profilePath(profile.id) + "/badges";

  return (
    <section className="social-page" aria-labelledby="dancer-title">
      <header className="card social-panel">
        <div className="dancer-head">
          <span className="dancer-initial" aria-hidden="true">{initialOf(profile.displayName)}</span>
          <span className="dancer-who">
            <h1 id="dancer-title" className="dancer-name">{profile.displayName}</h1>
            <span className="social-meta">{displayHandle(profile.handle)}</span>
          </span>
          <span className="badge">{modeLabel(profile.mode)}</span>
        </div>
        <dl className="social-stats">
          <div><dt>Points this week</dt><dd>{num(summary.pointsThisWeek)}</dd></div>
          <div><dt>Total points</dt><dd>{num(summary.totalPoints)}</dd></div>
          <div><dt>Dances completed</dt><dd>{num(summary.completedDances)}</dd></div>
        </dl>
      </header>

      <section className="card social-panel" aria-labelledby="dancer-groups-title">
        <h2 id="dancer-groups-title">Groups</h2>
        {summary.groups.length > 0 ? (
          <ul className="dancer-groups">
            {summary.groups.map((group) => (
              <li key={group.id}>
                <Link to={`/groups/${encodeURIComponent(group.id)}`}>{group.name}</Link>
                <span className="social-meta">{num(group.memberIds.length)} {group.memberIds.length === 1 ? "member" : "members"}</span>
                {viewerId !== undefined && group.memberIds.includes(viewerId) && <span className="badge">✓ You're in this too</span>}
              </li>
            ))}
          </ul>
        ) : <p className="social-meta">Not in any group yet.</p>}
      </section>

      <section className="card social-panel" aria-labelledby="dancer-badges-title">
        <div className="badges-card-head">
          <h2 id="dancer-badges-title">Badges</h2>
          <Link to={badgesPath}>See all →</Link>
        </div>
        {summary.earnedBadges.length > 0 ? (
          <ul className="badges-mini-list">
            {summary.earnedBadges.slice(0, MAX_BADGES_SHOWN).map(({ badgeId }) => (
              <li key={badgeId}><BadgeIcon id={badgeId} earned size={48} />{getBadgeDef(badgeId).name}</li>
            ))}
          </ul>
        ) : <p className="social-meta">No badges yet.</p>}
      </section>

      <section className="social-panel" aria-labelledby="dancer-posts-title">
        <h2 id="dancer-posts-title">Posts</h2>
        <SocialPosts viewerId={viewerId} authorId={profile.id} emptyMessage="No posts yet." />
      </section>
    </section>
  );
}
