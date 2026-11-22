/**
 * Owner: Mohamed
 * Purpose: "You're dancing as" card on /profile/setup: who is active now, with Edit profile, Log out and Continue
 * FRs: FR-02 (shows only display name, handle and mode), FR-03, NFR-06 (one-click Continue)
 */

import type { ReactElement } from "react";
import type { PlayerProfile } from "../../types/pulse";
import { displayHandle, initialOf, modeLabel } from "./switcherHelpers";

export function CurrentProfileCard(props: {
  profile: PlayerProfile; onEdit: () => void; onLogOut: () => void; onContinue: () => void;
}): ReactElement {
  const { profile, onEdit, onLogOut, onContinue } = props;
  return (
    <section className="card profile-current" aria-labelledby="profile-current-label">
      <p id="profile-current-label" className="profile-current-label">You're dancing as</p>
      <div className="profile-current-row">
        <span className="profile-current-initial" aria-hidden="true">{initialOf(profile.displayName)}</span>
        <span className="profile-current-who">
          <strong className="profile-current-name">{profile.displayName}</strong>
          <span className="profile-current-handle">{displayHandle(profile.handle)}</span>
        </span>
        <span className="badge">{modeLabel(profile.mode)}</span>
      </div>
      <div className="profile-current-actions">
        <button type="button" className="btn btn-secondary" onClick={onEdit}>Edit profile</button>
        <button type="button" className="btn btn-secondary" onClick={onLogOut}>Log out</button>
        <button type="button" className="btn btn-primary" onClick={onContinue}>Continue</button>
      </div>
    </section>
  );
}
