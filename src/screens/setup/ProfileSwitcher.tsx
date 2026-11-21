/**
 * Owner: Mohamed
 * Purpose: "Who's dancing?" card on /profile/setup: list local profiles, switch the active one, add a new one
 * FRs: FR-03, FR-02 (shows only display name, handle and mode)
 */

import type { ReactElement } from "react";
import type { PlayerProfile } from "../../types/pulse";
import { displayHandle, modeLabel, sortProfilesForSwitcher } from "./switcherHelpers";

export function ProfileSwitcher(props: {
  profiles: PlayerProfile[]; activeId: string | null;
  onUse: (id: string) => void; onNew: () => void;
}): ReactElement {
  const { profiles, activeId, onUse, onNew } = props;
  if (profiles.length === 0) return <></>;

  return (
    <section className="card profile-switcher" aria-labelledby="profile-switcher-title">
      <h2 id="profile-switcher-title" className="profile-switcher-title">Who's dancing?</h2>
      <ul className="profile-switcher-list">
        {sortProfilesForSwitcher(profiles, activeId).map((p) => (
          <li key={p.id} className="profile-switcher-row">
            <span className="profile-switcher-who">
              <strong>{p.displayName}</strong>
              <span className="profile-switcher-handle">{displayHandle(p.handle)}</span>
            </span>
            <span className="badge">{modeLabel(p.mode)}</span>
            {p.id === activeId ? (
              <span className="badge profile-switcher-active">Dancing now</span>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => onUse(p.id)}>Use</button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary profile-switcher-new" onClick={onNew}>+ New profile</button>
    </section>
  );
}
