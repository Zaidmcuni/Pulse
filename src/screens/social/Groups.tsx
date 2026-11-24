/**
 * Owner: Ali
 * Edited: Mohamed (task 15, joined vs discover; just-joined highlight)
 * Purpose: Groups screen (/groups)
 * FRs: FR-42
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
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

/** Decorative overlapping circles (people together) behind each group card; the same on every card. */
function GroupMotif(): ReactElement {
  return (
    <svg className="group-card-motif" viewBox="0 0 120 64" aria-hidden="true" focusable="false">
      <circle cx="38" cy="38" r="22" />
      <circle cx="60" cy="28" r="22" />
      <circle cx="82" cy="38" r="22" />
    </svg>
  );
}

export default function Groups(): ReactElement {
  const [category, setCategory] = useState<keyof typeof categories>("all");
  const [groups, setGroups] = useState(() => store.listGroups());
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [justJoinedId, setJustJoinedId] = useState<string>();
  const justJoinedRef = useRef<HTMLElement>(null);
  const viewerId = store.getActiveProfile()?.id;
  const { joined, discover } = splitGroups(groups, viewerId, category);
  const noneVisible = joined.length + discover.length === 0;

  useEffect(() => {
    setGroups(store.listGroups());
    return store.subscribe?.(() => {
      setGroups(store.listGroups());
    });
  }, []);

  // The joined card lands in "Your groups", usually above the Join button, so bring it into view.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    justJoinedRef.current?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [justJoinedId]);

  function chooseCategory(key: keyof typeof categories): void {
    setCategory(key);
    setStatus("");
    setJustJoinedId(undefined);
  }

  function toggleMembership(group: Group, playerId: string): void {
    const leaving = group.memberIds.includes(playerId);
    try {
      if (leaving) store.leaveGroup(group.id, playerId);
      else store.joinGroup(group.id, playerId);
      setGroups(store.listGroups());
      setJustJoinedId(leaving ? undefined : group.id);
      setError("");
      setStatus(leaving ? `Left ${group.name}.` : `Joined ${group.name}!`);
    } catch (err) {
      setStatus("");
      const msg = err instanceof Error && err.message.includes("Create an account")
        ? err.message
        : "Could not update your group membership. Try again.";
      setError(msg);
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
                <article
                  className={`card social-panel group-card-joined${group.id === justJoinedId ? " is-just-joined" : ""}`}
                  key={group.id}
                  ref={group.id === justJoinedId ? justJoinedRef : undefined}
                >
                  <GroupMotif />
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
                <GroupMotif />
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
