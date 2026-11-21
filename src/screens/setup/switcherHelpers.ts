/**
 * Owner: Mohamed
 * Purpose: pure helpers for the profile switcher on /profile/setup: ordering and display labels
 * FRs: FR-03, FR-02
 */

import type { PlayerProfile, PosturalMode } from "../../types/pulse";

/** Active profile first, then the rest by display name (case-insensitive). Returns a new array. */
export function sortProfilesForSwitcher(profiles: PlayerProfile[], activeId: string | null): PlayerProfile[] {
  const byName = (a: PlayerProfile, b: PlayerProfile) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  const active = profiles.filter((p) => p.id === activeId);
  const rest = profiles.filter((p) => p.id !== activeId).sort(byName);
  return [...active, ...rest];
}

/** Handles are stored without "@"; old ones may still have it. Always show exactly one. */
export function displayHandle(handle: string): string {
  return handle.startsWith("@") ? handle : "@" + handle;
}

export function modeLabel(mode: PosturalMode): string {
  return mode === "seated" ? "Seated" : "Standing";
}
