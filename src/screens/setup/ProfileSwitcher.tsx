/**
 * Owner: Mohamed
 * Purpose: "Accounts on this laptop" card on /profile/setup: list the other local accounts, log in as one, create a new one
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

  // The active profile is shown in the current card, so it never appears here.
  const others = sortProfilesForSwitcher(profiles.filter((p) => p.id !== activeId), activeId);
  const title = activeId === null ? "Choose who's dancing" : "Accounts on this laptop";

  return (
    <section className="card profile-switcher" aria-labelledby="profile-switcher-title">
      <h2 id="profile-switcher-title" className="profile-switcher-title">{title}</h2>
      {others.length === 0 ? (
        <p className="profile-switcher-empty">Only you on this laptop so far.</p>
      ) : (
        <ul className="profile-switcher-list">
          {others.map((p) => (
            <li key={p.id} className="profile-switcher-row">
              <span className="profile-switcher-who">
                <strong>{p.displayName}</strong>
                <span className="profile-switcher-handle">{displayHandle(p.handle)}</span>
              </span>
              <span className="badge">{modeLabel(p.mode)}</span>
              <button type="button" className="btn btn-secondary" onClick={() => onUse(p.id)}>Log in</button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <p className="profile-switcher-hint">Switching person? Reconnect their watch on the next screen.</p>
      )}
      <button type="button" className="btn btn-secondary profile-switcher-new" onClick={onNew}>+ Create account</button>
    </section>
  );
}
