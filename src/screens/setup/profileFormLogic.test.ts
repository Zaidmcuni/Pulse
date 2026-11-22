/**
 * Owner: Mohamed
 * Purpose: unit tests for the pure profile form logic
 * FRs: FR-01, FR-02
 */

import { describe, expect, it } from "vitest";
import { CONFIG } from "../../config";
import type { PlayerProfile } from "../../types/pulse";
import {
  emptyFormValues,
  formValuesFromProfile,
  profileFromForm,
  validateProfileForm,
  type ProfileFormValues,
} from "./profileFormLogic";

const VALID: ProfileFormValues = {
  handle: "@Mo_Dance", displayName: "Mo", age: "21", sex: "male",
  weightKg: "70", heightCm: "175", restingHr: "", hrMaxOverride: "", mode: "standing",
};

const newId = () => "p-new";

function errorsFor(patch: Partial<ProfileFormValues>) {
  return validateProfileForm({ ...VALID, ...patch });
}

describe("validateProfileForm", () => {
  it("flags every required field on an empty form, but not resting HR or HRmax", () => {
    const errors = validateProfileForm(emptyFormValues());
    for (const key of ["handle", "displayName", "age", "weightKg", "heightCm"] as const) {
      expect(errors[key]).toBeTruthy();
    }
    expect(errors.restingHr).toBeUndefined();
    expect(errors.hrMaxOverride).toBeUndefined();
  });

  it("accepts a full valid form", () => {
    expect(validateProfileForm(VALID)).toEqual({});
  });

  it("validates the handle", () => {
    for (const handle of ["@Mo_Dance", "amira-steps", "theo-on-beat"]) {
      expect(errorsFor({ handle }).handle).toBeUndefined();
    }
    for (const handle of ["ab", "--", "has space", "émile", "a".repeat(21)]) {
      expect(errorsFor({ handle }).handle).toBe("Use 3–20 letters, numbers, - or _");
    }
  });

  it("prefills the handle without a leading @", () => {
    const base: PlayerProfile = {
      id: "p-x", handle: "@demo", displayName: "D", age: 21, sex: "other",
      weightKg: 70, heightCm: 175, restingHr: 65, mode: "standing", groupIds: [],
    };
    expect(formValuesFromProfile(base).handle).toBe("demo");
    expect(formValuesFromProfile({ ...base, handle: "amira-steps" }).handle).toBe("amira-steps");
  });

  it("validates the display name", () => {
    expect(errorsFor({ displayName: "   " }).displayName).toBe("Add a name, up to 40 characters");
    expect(errorsFor({ displayName: "a".repeat(41) }).displayName).toBeTruthy();
    expect(errorsFor({ displayName: "a".repeat(40) }).displayName).toBeUndefined();
  });

  it("validates age", () => {
    for (const age of ["12", "101", "20.5", "abc", "1e2", "   ", "-5", "0x10", "12abc"]) {
      expect(errorsFor({ age }).age).toBe("Enter an age from 13 to 100");
    }
    expect(errorsFor({ age: "13" }).age).toBeUndefined();
    expect(errorsFor({ age: "100" }).age).toBeUndefined();
  });

  it("validates weight and height", () => {
    expect(errorsFor({ weightKg: "70.5" }).weightKg).toBeUndefined();
    expect(errorsFor({ weightKg: "29" }).weightKg).toBe("Enter a weight from 30 to 250 kg");
    expect(errorsFor({ weightKg: "251" }).weightKg).toBeTruthy();
    expect(errorsFor({ heightCm: "172.5" }).heightCm).toBeUndefined();
    expect(errorsFor({ heightCm: "99" }).heightCm).toBe("Enter a height from 100 to 230 cm");
    expect(errorsFor({ heightCm: "231" }).heightCm).toBeTruthy();
    expect(errorsFor({ heightCm: "100" }).heightCm).toBeUndefined();
    expect(errorsFor({ heightCm: "230" }).heightCm).toBeUndefined();
  });

  it("treats empty resting HR as valid and saves the default", () => {
    for (const restingHr of ["", "  "]) {
      expect(errorsFor({ restingHr }).restingHr).toBeUndefined();
      expect(profileFromForm({ ...VALID, restingHr }, null, newId).restingHr).toBe(CONFIG.restingHrDefault);
    }
    expect(CONFIG.restingHrDefault).toBe(65);
    for (const restingHr of ["29", "121", "60.5"]) {
      expect(errorsFor({ restingHr }).restingHr).toBe("Enter a resting heart rate from 30 to 120, or leave it empty");
    }
  });

  it("validates the HRmax override", () => {
    const empty = profileFromForm({ ...VALID, hrMaxOverride: "" }, null, newId);
    expect(errorsFor({ hrMaxOverride: "" }).hrMaxOverride).toBeUndefined();
    expect("hrMaxOverride" in empty).toBe(false);
    expect(profileFromForm({ ...VALID, hrMaxOverride: "190" }, null, newId).hrMaxOverride).toBe(190);
    for (const hrMaxOverride of ["99", "231"]) {
      expect(errorsFor({ hrMaxOverride }).hrMaxOverride).toBeTruthy();
    }
    expect(errorsFor({ hrMaxOverride: "110", restingHr: "115" }).hrMaxOverride)
      .toBe("Enter a max heart rate from 100 to 230, above your resting rate, or leave it empty");
    expect(errorsFor({ hrMaxOverride: "110", restingHr: "" }).hrMaxOverride).toBeUndefined();
  });
});

describe("profileFromForm", () => {
  const existing: PlayerProfile = {
    id: "p-1", handle: "amira-steps", displayName: "Mo", age: 30, sex: "female",
    weightKg: 62.5, heightCm: 168, restingHr: 58, mode: "seated", groupIds: ["g-a", "g-b"],
  };

  it("saves the normalized handle without @", () => {
    expect(profileFromForm(VALID, null, newId).handle).toBe("mo_dance");
  });

  it("round-trips a handle stored as @demo to demo", () => {
    const old = { ...existing, handle: "@demo" };
    expect(profileFromForm(formValuesFromProfile(old), old, newId).handle).toBe("demo");
  });

  it("keeps id and groupIds of an existing profile", () => {
    const p = profileFromForm(VALID, existing, newId);
    expect(p.id).toBe("p-1");
    expect(p.groupIds).toEqual(["g-a", "g-b"]);
  });

  it("uses newId() and no groups for a new profile", () => {
    const p = profileFromForm(VALID, null, newId);
    expect(p.id).toBe("p-new");
    expect(p.groupIds).toEqual([]);
  });

  it("round-trips a profile with and without an override", () => {
    const withOverride: PlayerProfile = { ...existing, hrMaxOverride: 185 };
    for (const p of [existing, withOverride]) {
      const values = formValuesFromProfile(p);
      expect(validateProfileForm(values)).toEqual({});
      expect(profileFromForm(values, p, newId)).toEqual(p);
    }
    expect("hrMaxOverride" in profileFromForm(formValuesFromProfile(existing), existing, newId)).toBe(false);
  });

  it("never mutates its inputs", () => {
    const values = { ...VALID, hrMaxOverride: "190" };
    const valuesCopy = structuredClone(values);
    const existingCopy = structuredClone(existing);
    validateProfileForm(values);
    const p = profileFromForm(values, existing, newId);
    formValuesFromProfile(existing);
    expect(values).toEqual(valuesCopy);
    expect(existing).toEqual(existingCopy);
    expect(p.groupIds).toEqual(existing.groupIds);
  });
});
