/**
 * Owner: Ali
 * Purpose: GroupDetail screen (/groups/:id)
 * FRs: FR-43 to FR-45
 * Edited: Mohamed (task 18, profile links)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { DanceCover } from "../../components/DanceCover";
import { store } from "../../data/store";
import type { Group } from "../../types/pulse";
import { profilePath } from "../profile/dancerSummary";
import { displayHandle } from "../setup/switcherHelpers";
import { formatDanceLabel } from "../dance/GetReady";
import { SocialPosts } from "./SocialPosts";
import "./Social.css";
import "./Groups.css";

function GroupActivity({ group }: { group: Group }): ReactElement {
  const [meetups, setMeetups] = useState(() => store.listMeetups(group.id));
  const [error, setError] = useState("");
  const viewerId = store.getActiveProfile()?.id;
  const isMember = viewerId !== undefined && group.memberIds.includes(viewerId);
  const profiles = new Map(store.listProfiles().map((profile) => [profile.id, profile]));
  const now = Date.now();
  const upcoming = meetups.filter((meetup) => Date.parse(meetup.startsAtIso) >= now)
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));

  function toggleRsvp(meetupId: string, playerId: string): void {
    try {
      store.toggleRsvp(meetupId, playerId);
      setMeetups(store.listMeetups(group.id));
      setError("");
    } catch {
      setError("Could not update your RSVP. Try again.");
    }
  }

  return (
    <>
      <section className="card social-panel" aria-labelledby="group-ranking">
        <h2 id="group-ranking">Weekly leaderboard</h2>
        <p className="social-meta">Best score per member, Monday through Sunday.</p>
        {viewerId !== undefined && !isMember && group.groupDanceIds.length > 0 && (
          <p className="social-meta">
            Join {group.name} in <Link to="/groups">Discover groups</Link> to compete on its leaderboard.
          </p>
        )}
        {group.groupDanceIds.length === 0 && <p>No featured dances yet.</p>}
        {group.groupDanceIds.map((danceId) => {
          const dance = store.getDance(danceId);
          const title = dance ? formatDanceLabel(dance) : "Featured dance";
          const rows = store.weeklyLeaderboard(group.id, danceId);
          return (
            <div key={danceId}>
              <div className="group-actions">
                <div className="group-dance-head">
                  <DanceCover
                    title={dance ? dance.title : title}
                    artist={dance?.artist}
                    coverUrl={dance?.coverUrl}
                    size="sm"
                  />
                  <h3>{title}</h3>
                </div>
                {isMember && dance && (
                  <Link
                    className="btn btn-primary"
                    to={`/dance/${encodeURIComponent(dance.id)}/ready`}
                    aria-label={`Start dance: ${title}`}
                  >
                    Start dance
                  </Link>
                )}
              </div>
              {!dance && <p className="social-meta">This featured dance is unavailable right now.</p>}
              {rows.length === 0 ? <p className="social-meta">No scores this week yet.</p> : (
                <table className="group-ranking-table" aria-label={`${title} leaderboard`}>
                  <thead><tr><th scope="col">Rank</th><th scope="col">Dancer</th><th scope="col">Points</th></tr></thead>
                  <tbody>
                    {rows.map(({ playerId, points }, index) => {
                      const profile = profiles.get(playerId);
                      return <tr key={playerId}><td>{index + 1}</td><td>{profile ? <Link to={profilePath(playerId)}>{displayHandle(profile.handle)}</Link> : "PULSE dancer"}</td><td>{points.toLocaleString()}</td></tr>;
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </section>
      <section className="social-panel" aria-labelledby="group-meetups">
        <h2 id="group-meetups">Upcoming meetups</h2>
        {error && <p role="alert">{error}</p>}
        {upcoming.length === 0 && <p className="card social-panel social-meta">No upcoming meetups.</p>}
        {upcoming.map((meetup) => {
          const going = viewerId !== undefined && meetup.rsvpIds.includes(viewerId);
          return (
            <article className="card social-panel" key={meetup.id}>
              <h3>{meetup.title}</h3>
              <p>{meetup.place}</p>
              <time dateTime={meetup.startsAtIso}>
                {new Date(meetup.startsAtIso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
              <p aria-live="polite" className="social-meta">{meetup.rsvpIds.length} going</p>
              {viewerId !== undefined && (
                <button className="btn btn-secondary" type="button" aria-pressed={going} onClick={() => toggleRsvp(meetup.id, viewerId)}>
                  RSVP
                </button>
              )}
            </article>
          );
        })}
      </section>
      <section className="social-panel" aria-labelledby="group-feed">
        <h2 id="group-feed">Group feed</h2>
        <SocialPosts viewerId={viewerId} groupId={group.id} emptyMessage="No posts shared with this group yet." />
      </section>
    </>
  );
}

export default function GroupDetail(): ReactElement {
  const { id } = useParams();
  const group = store.listGroups().find((entry) => entry.id === id);
  return (
    <section className="social-page" aria-labelledby="group-detail-title">
      <Link className="group-back" to="/groups">Back to groups</Link>
      <h1 id="group-detail-title">{group?.name ?? "Group not found"}</h1>
      {group ? <GroupActivity group={group} key={group.id} /> : <p>This group is unavailable.</p>}
    </section>
  );
}
