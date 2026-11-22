/**
 * Owner: Mohamed
 * Purpose: pure helpers for "Who's dancing?": quick-start and guest profiles, quick-start validation
 * FRs: FR-01, FR-03, FR-02 (body stats are private placeholders until the dancer edits them in Me)
 */

import type { PlayerProfile, PosturalMode } from "../../types/pulse";
import { emptyFormValues, profileFromForm, validateProfileForm, type ProfileFormValues } from "./profileFormLogic";

export const GUEST_ID = "p-guest";
const GUEST_HANDLE = "guest";

// Placeholder body stats so a dancer can start with just a name. They only feed the
// estimated calorie figure and are replaced when the dancer adds their details in Me.
const PLACEHOLDER_STATS = { age: "25", weightKg: "70", heightCm: "170" } as const;

export interface QuickErrors { displayName?: string; handle?: string }

function quickValues(displayName: string, handle: string, mode: PosturalMode): ProfileFormValues {
  return { ...emptyFormValues(), ...PLACEHOLDER_STATS, displayName, handle, mode };
}

/** Only the name and handle can be wrong; the placeholders always validate. */
export function validateQuickStart(displayName: string, handle: string): QuickErrors {
  const { displayName: nameError, handle: handleError } = validateProfileForm(quickValues(displayName, handle, "standing"));
  const errors: QuickErrors = {};
  if (nameError) errors.displayName = nameError;
  if (handleError) errors.handle = handleError;
  return errors;
}

/** Only call after validateQuickStart returned {}. */
export function quickStartProfile(displayName: string, handle: string, mode: PosturalMode, newId: () => string): PlayerProfile {
  return profileFromForm(quickValues(displayName, handle, mode), null, newId);
}

/** One shared guest per laptop, reused on every tap. */
export function guestProfile(): PlayerProfile {
  return quickStartProfile("Guest", GUEST_HANDLE, "standing", () => GUEST_ID);
}

/** True when the handle is already used by another profile on this laptop. */
export function handleTaken(handle: string, profiles: readonly PlayerProfile[]): boolean {
  const bare = handle.trim().toLowerCase().replace(/^@/, "");
  return profiles.some((p) => p.handle.replace(/^@/, "").toLowerCase() === bare);
}
