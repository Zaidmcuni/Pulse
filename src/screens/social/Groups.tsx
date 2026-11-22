/**
 * Owner: Ali
 * Purpose: Groups screen (/groups)
 * FRs: FR-42
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { store } from "../../data/store";
import type { Group, GroupKind } from "../../types/pulse";
import "./Social.css";
import "./Groups.css";

const categories = {
  all: "All",
  friends: "Friends",
  city: "City",
  dance_type: "Dance type",
} satisfies Record<"all" | GroupKind, string>;
const categoryKeys = ["all", "friends", "city", "dance_type"] as const;

export default function Groups(): ReactElement {
  const [category, setCategory] = useState<keyof typeof categories>("all");
  const [groups, setGroups] = useState(() => store.listGroups());
  const [error, setError] = useState("");
  const viewerId = store.getActiveProfile()?.id;
  const visible = groups.filter((group) => category === "all" || group.kind === category);

  function toggleMembership(group: Group, playerId: string): void {
    try {
      if (group.memberIds.includes(playerId)) store.leaveGroup(group.id, playerId);
      else store.joinGroup(group.id, playerId);
      setGroups(store.listGroups());
      setError("");
    } catch {
      setError("Could not update your group membership. Try again.");
    }
  }

  return (
    <section className="social-page" aria-labelledby="groups-title">
      <h1 id="groups-title">Groups</h1>
      <div className="groups-filters" role="group" aria-label="Group category">
        {categoryKeys.map((key) => (
          <button key={key} type="button" className="btn btn-secondary" aria-pressed={category === key} onClick={() => setCategory(key)}>
            {categories[key]}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {visible.length === 0 && <p className="card social-panel social-meta">No groups in this category.</p>}
      {visible.map((group) => {
        const joined = viewerId !== undefined && group.memberIds.includes(viewerId);
        return (
          <article className="card social-panel" key={group.id}>
            <h2><Link to={`/groups/${encodeURIComponent(group.id)}`}>{group.name}</Link></h2>
            <p className="social-meta">{categories[group.kind]} · {group.memberIds.length} {group.memberIds.length === 1 ? "member" : "members"}</p>
            {viewerId !== undefined && (
              <button
                className="btn btn-secondary"
                type="button"
                aria-label={`${joined ? "Leave" : "Join"} ${group.name}`}
                onClick={() => toggleMembership(group, viewerId)}
              >
                {joined ? "Leave" : "Join"}
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
