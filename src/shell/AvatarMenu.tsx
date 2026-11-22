/**
 * Owner: Mohamed
 * Purpose: avatar in the app header: shows who's dancing, switches to another remembered dancer in one tap
 * FRs: FR-03, FR-02 (names and handles only)
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { accounts } from "../auth/accounts";
import { store } from "../data/store";
import { displayHandle, initialOf } from "../screens/setup/switcherHelpers";

const MAX_QUICK_SWITCH = 4;

export function AvatarMenu(): ReactElement | null {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Read through accounts (not store.getActiveProfile) so the header never changes what screens read.
  const activeId = accounts.signedInProfileId();
  const active = store.listProfiles().find((p) => p.id === activeId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) {
        setOpen(false);
        setProfilesOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!active) return null;
  const others = accounts.listDancers()
    .filter((d) => d.remembered && d.profileId !== active.id)
    .slice(0, MAX_QUICK_SWITCH);

  function goTo(path: string, switchId?: string): void {
    setOpen(false);
    setProfilesOpen(false);
    if (switchId && !accounts.switchTo(switchId)) path = "/who";
    navigate(path);
  }

  return (
    <div className="avatar-menu" ref={root}>
      <button
        type="button"
        className="avatar-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${active.displayName}, switch dancer`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar-dot" aria-hidden="true">{initialOf(active.displayName)}</span>
      </button>
      {open && (
        <div className="avatar-menu-panel" role="menu">
          <p className="avatar-menu-who">
            <strong>{active.displayName}</strong>
            <span>{displayHandle(active.handle)}</span>
          </p>
          <button type="button" role="menuitem" className="avatar-menu-item" onClick={() => goTo("/me")}>Account</button>
          {/* Label opens /who; the arrow only expands the signed-in profiles below it. */}
          <div className="avatar-menu-split">
            <button type="button" role="menuitem" className="avatar-menu-item" onClick={() => goTo("/who")}>Switch profile</button>
            {others.length > 0 && (
              <button
                type="button"
                role="menuitem"
                className="avatar-menu-item avatar-menu-arrow"
                aria-expanded={profilesOpen}
                aria-controls="avatar-menu-profiles"
                aria-label={profilesOpen ? "Hide signed-in profiles" : "Show signed-in profiles"}
                onClick={() => setProfilesOpen((o) => !o)}
              >
                <svg className="avatar-menu-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
          </div>
          {profilesOpen && others.length > 0 && (
            <div id="avatar-menu-profiles" className="avatar-menu-profiles">
              {others.map((d) => (
                <button key={d.profileId} type="button" role="menuitem" className="avatar-menu-item" onClick={() => goTo("/dances", d.profileId)}>
                  <span className="avatar-dot avatar-dot-sm" aria-hidden="true">{initialOf(d.displayName)}</span>
                  {d.displayName}
                </button>
              ))}
              <button type="button" role="menuitem" className="avatar-menu-item avatar-menu-quiet" aria-label="All profiles" onClick={() => goTo("/who")}>…</button>
            </div>
          )}
          <hr className="avatar-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="avatar-menu-item avatar-menu-quiet"
            onClick={() => { accounts.logOut(); goTo("/who"); }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
