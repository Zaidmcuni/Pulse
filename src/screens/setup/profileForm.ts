/**
 * Owner: Mohamed
 * Purpose: pure form logic for the profile setup screen: defaults, prefill, validation, conversion to PlayerProfile
 * FRs: FR-01, FR-02
 */

import { CONFIG } from "../../config";
import type { PlayerProfile, PosturalMode, Sex } from "../../types/pulse";

// input sanity bounds, not tuning numbers
const HANDLE_PATTERN = /^[a-z0-9_-]{3,20}$/;
const DISPLAY_NAME_MAX = 40;
const AGE_MIN = 13;
const AGE_MAX = 100;
const WEIGHT_KG_MIN = 30;
const WEIGHT_KG_MAX = 250;
const HEIGHT_CM_MIN = 100;
const HEIGHT_CM_MAX = 230;
const RESTING_HR_MIN = 30;
const RESTING_HR_MAX = 120;
const HR_MAX_MIN = 100;
const HR_MAX_MAX = 230;

const WHOLE = /^\d+$/;
const DECIMAL = /^\d+(\.\d+)?$/;

export interface ProfileFormValues {
  handle: string;
  displayName: string;
  age: string;
  sex: Sex;
  weightKg: string;
  heightCm: string;
  restingHr: string;
  hrMaxOverride: string;
  mode: PosturalMode;
}

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

export function emptyFormValues(): ProfileFormValues {
  return {
    handle: "", displayName: "", age: "", sex: "other",
    weightKg: "", heightCm: "", restingHr: "", hrMaxOverride: "", mode: "standing",
  };
}

export function formValuesFromProfile(p: PlayerProfile): ProfileFormValues {
  return {
    handle: p.handle.startsWith("@") ? p.handle.slice(1) : p.handle,
    displayName: p.displayName,
    age: String(p.age),
    sex: p.sex,
    weightKg: String(p.weightKg),
    heightCm: String(p.heightCm),
    restingHr: String(p.restingHr),
    hrMaxOverride: p.hrMaxOverride === undefined ? "" : String(p.hrMaxOverride),
    mode: p.mode,
  };
}

/** Lowercase, then strip one leading "@". */
function normalizeHandle(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return lower.startsWith("@") ? lower.slice(1) : lower;
}

/** Parse a trimmed string against a pattern; undefined when it doesn't match. */
function parse(raw: string, pattern: RegExp): number | undefined {
  const s = raw.trim();
  return pattern.test(s) ? Number(s) : undefined;
}

function inRange(n: number | undefined, min: number, max: number): n is number {
  return n !== undefined && n >= min && n <= max;
}

export function validateProfileForm(v: ProfileFormValues): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  if (!HANDLE_PATTERN.test(normalizeHandle(v.handle))) {
    errors.handle = "Use 3–20 letters, numbers, - or _";
  }
  const name = v.displayName.trim();
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX) {
    errors.displayName = "Add a name, up to 40 characters";
  }
  if (!inRange(parse(v.age, WHOLE), AGE_MIN, AGE_MAX)) {
    errors.age = "Enter an age from 13 to 100";
  }
  if (!inRange(parse(v.weightKg, DECIMAL), WEIGHT_KG_MIN, WEIGHT_KG_MAX)) {
    errors.weightKg = "Enter a weight from 30 to 250 kg";
  }
  if (!inRange(parse(v.heightCm, DECIMAL), HEIGHT_CM_MIN, HEIGHT_CM_MAX)) {
    errors.heightCm = "Enter a height from 100 to 230 cm";
  }

  // Empty resting HR is valid and saves as the default.
  let restingHr: number | undefined = CONFIG.restingHrDefault;
  if (v.restingHr.trim() !== "") {
    restingHr = parse(v.restingHr, WHOLE);
    if (!inRange(restingHr, RESTING_HR_MIN, RESTING_HR_MAX)) {
      errors.restingHr = "Enter a resting heart rate from 30 to 120, or leave it empty";
      restingHr = undefined;
    }
  }

  // Empty HRmax is valid (no override). Only compare with resting HR when that one is valid.
  if (v.hrMaxOverride.trim() !== "") {
    const hrMax = parse(v.hrMaxOverride, WHOLE);
    const belowResting = hrMax !== undefined && restingHr !== undefined && hrMax <= restingHr;
    if (!inRange(hrMax, HR_MAX_MIN, HR_MAX_MAX) || belowResting) {
      errors.hrMaxOverride = "Enter a max heart rate from 100 to 230, above your resting rate, or leave it empty";
    }
  }

  return errors;
}

/** Build the profile to save. Only call after validateProfileForm returned {}. */
export function profileFromForm(
  v: ProfileFormValues,
  existing: PlayerProfile | null,
  newId: () => string,
): PlayerProfile {
  const profile: PlayerProfile = {
    id: existing?.id ?? newId(),
    handle: normalizeHandle(v.handle), // stored without "@", like the seed; screens add it
    displayName: v.displayName.trim(),
    age: Number(v.age.trim()),
    sex: v.sex,
    weightKg: Number(v.weightKg.trim()),
    heightCm: Number(v.heightCm.trim()),
    restingHr: v.restingHr.trim() === "" ? CONFIG.restingHrDefault : Number(v.restingHr.trim()),
    mode: v.mode,
    groupIds: existing?.groupIds ?? [],
  };
  // Absent when not set: never undefined, null or 0.
  if (v.hrMaxOverride.trim() !== "") profile.hrMaxOverride = Number(v.hrMaxOverride.trim());
  return profile;
}
