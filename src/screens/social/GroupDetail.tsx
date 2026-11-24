/**
 * Owner: Ali
 * Purpose: GroupDetail screen (/groups/:id)
 * FRs: FR-43 to FR-45
 * Edited: Mohamed (task 18, profile links)
 * Edited: Toufic (#157, shared-routine and in-person cues, Friday night heading; weekly dance card, no meetups)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { DanceCover } from "../../components/DanceCover";
import { store } from "../../data/store";
import { useStoreRevision } from "../../data/useStoreRevision";
import type { Group } from "../../types/pulse";
import { profilePath } from "../profile/dancerSummary";
import { displayHandle } from "../setup/switcherHelpers";
import { formatDanceLabel } from "../dance/GetReady";
import { SocialPosts } from "./SocialPosts";
import "./Social.css";
import "./Groups.css";

/** #157: demo weekly-dance heading per group id; every other group keeps "This week's dance". No new data field. */
const WEEKLY_DANCE_HEADINGS: Readonly<Record<string, string>> = {
  "mcgill-friday-night-crew": "Friday Night Fun",
};

function GroupActivity({ group }: { group: Group }): ReactElement {
  const viewerId = store.getActiveProfile()?.id;
  const isMember = viewerId !== undefined && group.memberIds.includes(viewerId);
  const profiles = new Map(store.listProfiles().map((profile) => [profile.id, profile]));
  const dances = group.groupDanceIds.map((danceId) => {
    const dance = store.getDance(danceId);
    return { danceId, dance, title: dance ? formatDanceLabel(dance) : "Featured dance" };
  });

  return (
    <>
      <section className="card social-panel" aria-labelledby="group-dance">
        <h2 id="group-dance">{WEEKLY_DANCE_HEADINGS[group.id] ?? "This week's dance"}</h2>
        <p className="group-cue">Put your phone down and meet your crew for a dance in person.</p>
        {viewerId !== undefined && !isMember && dances.length > 0 && (
          <p className="social-meta">
            Join {group.name} in <Link to="/groups">Discover groups</Link> to compete on its leaderboard.
          </p>
        )}
        {dances.length === 0 && <p>No featured dances yet.</p>}
        {dances.map(({ danceId, dance, title }) => (
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
          </div>
        ))}
      </section>
      <section className="card social-panel" aria-labelledby="group-ranking">
        <h2 id="group-ranking">Weekly leaderboard</h2>
        <p className="group-cue">Dance the same routine on your own time and see how your crew did this week.</p>
        <p className="social-meta">Best score per member, Monday through Sunday.</p>
        {dances.map(({ danceId, title }) => {
          const rows = store.weeklyLeaderboard(group.id, danceId);
          return (
            <div key={danceId}>
              {dances.length > 1 && <h3>{title}</h3>}
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
      <section className="social-panel" aria-labelledby="group-feed">
        <h2 id="group-feed">Group feed</h2>
        <SocialPosts viewerId={viewerId} groupId={group.id} emptyMessage="No posts shared with this group yet." />
      </section>
    </>
  );
}

export default function GroupDetail(): ReactElement {
  useStoreRevision();
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
