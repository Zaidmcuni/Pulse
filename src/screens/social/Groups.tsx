/**
 * Owner: Ali
 * Edited: Mohamed (task 15, joined vs discover)
 * Purpose: Groups screen (/groups)
 * FRs: FR-42
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { store } from "../../data/store";
import type { Group, GroupKind } from "../../types/pulse";
import { splitGroups } from "./groupSections";
import "./Social.css";
import "./Groups.css";

const categories = {
  all: "All",
  friends: "Friends",
  city: "City",
  dance_type: "Dance type",
} satisfies Record<"all" | GroupKind, string>;
const categoryKeys = ["all", "friends", "city", "dance_type"] as const;

function groupPath(group: Group): string {
  return `/groups/${encodeURIComponent(group.id)}`;
}

function GroupMeta({ group }: { group: Group }): ReactElement {
  const count = group.memberIds.length;
  return <p className="social-meta">{categories[group.kind]} · {count} {count === 1 ? "member" : "members"}</p>;
}

export default function Groups(): ReactElement {
  const [category, setCategory] = useState<keyof typeof categories>("all");
  const [groups, setGroups] = useState(() => store.listGroups());
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const viewerId = store.getActiveProfile()?.id;
  const { joined, discover } = splitGroups(groups, viewerId, category);
  const noneVisible = joined.length + discover.length === 0;

  function chooseCategory(key: keyof typeof categories): void {
    setCategory(key);
    setStatus("");
  }

  function toggleMembership(group: Group, playerId: string): void {
    const leaving = group.memberIds.includes(playerId);
    try {
      if (leaving) store.leaveGroup(group.id, playerId);
      else store.joinGroup(group.id, playerId);
      setGroups(store.listGroups());
      setError("");
      setStatus(leaving ? `Left ${group.name}.` : `Joined ${group.name}!`);
    } catch {
      setStatus("");
      setError("Could not update your group membership. Try again.");
    }
  }

  return (
    <section className="social-page" aria-labelledby="groups-title">
      <h1 id="groups-title">Groups</h1>
      <div className="groups-filters" role="group" aria-label="Group category">
        {categoryKeys.map((key) => (
          <button key={key} type="button" className="btn btn-secondary" aria-pressed={category === key} onClick={() => chooseCategory(key)}>
            {categories[key]}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status" className="groups-status">{status}</p>}
      {noneVisible && <p className="card social-panel social-meta">No groups in this category.</p>}
      {!noneVisible && (
        <div className="groups-sections">
          {viewerId !== undefined && (
            <section className="groups-section" aria-labelledby="groups-yours">
              <h2 id="groups-yours">Your groups<span className="groups-count"> · {joined.length}</span></h2>
              {joined.length === 0 && <p className="social-meta">You haven't joined a group here yet. Pick one below.</p>}
              {joined.map((group) => (
                <article className="card social-panel group-card-joined" key={group.id}>
                  <div className="group-card-head">
                    <h3><Link to={groupPath(group)}>{group.name}</Link></h3>
                    <span className="badge group-joined-badge">✓ Joined</span>
                  </div>
                  <GroupMeta group={group} />
                  <div className="group-actions">
                    <Link className="btn btn-primary" to={groupPath(group)}>Open</Link>
                    <button
                      className="btn btn-secondary group-leave"
                      type="button"
                      aria-label={`Leave ${group.name}`}
                      onClick={() => toggleMembership(group, viewerId)}
                    >
                      Leave
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          <section className="groups-section" aria-labelledby="groups-discover">
            <h2 id="groups-discover">Discover groups<span className="groups-count"> · {discover.length}</span></h2>
            {discover.length === 0 && <p className="social-meta">You're in every group here.</p>}
            {discover.map((group) => (
              <article className="card social-panel group-card-discover" key={group.id}>
                <h3><Link to={groupPath(group)}>{group.name}</Link></h3>
                <GroupMeta group={group} />
                {viewerId !== undefined && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    aria-label={`Join ${group.name}`}
                    onClick={() => toggleMembership(group, viewerId)}
                  >
                    Join
                  </button>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
