/**
 * Owner: Mohamed
 * Purpose: unit tests for the pure profile switcher helpers
 * FRs: FR-03
 */

import { describe, expect, it } from "vitest";
import type { PlayerProfile } from "../../types/pulse";
import { displayHandle, modeLabel, sortProfilesForSwitcher } from "./profileSwitcher";

function profile(id: string, displayName: string): PlayerProfile {
  return {
    id, handle: id, displayName, age: 21, sex: "other",
    weightKg: 70, heightCm: 175, restingHr: 65, mode: "standing", groupIds: [],
  };
}

const zoe = profile("p-zoe", "Zoe");
const amira = profile("p-amira", "amira");
const theo = profile("p-theo", "Theo");
const ids = (ps: PlayerProfile[]) => ps.map((p) => p.id);

describe("sortProfilesForSwitcher", () => {
  it("puts the active profile first, then the rest by name, case-insensitive", () => {
    expect(ids(sortProfilesForSwitcher([amira, zoe, theo], "p-zoe"))).toEqual(["p-zoe", "p-amira", "p-theo"]);
  });

  it("sorts just by name when activeId is null or unknown", () => {
    expect(ids(sortProfilesForSwitcher([zoe, theo, amira], null))).toEqual(["p-amira", "p-theo", "p-zoe"]);
    expect(ids(sortProfilesForSwitcher([zoe, theo, amira], "p-gone"))).toEqual(["p-amira", "p-theo", "p-zoe"]);
  });

  it("returns a new array and does not mutate the input", () => {
    const input = [zoe, theo, amira];
    const out = sortProfilesForSwitcher(input, "p-theo");
    expect(out).not.toBe(input);
    expect(ids(input)).toEqual(["p-zoe", "p-theo", "p-amira"]);
  });
});

describe("displayHandle", () => {
  it("always shows exactly one leading @", () => {
    expect(displayHandle("amira-steps")).toBe("@amira-steps");
    expect(displayHandle("@demo")).toBe("@demo");
  });
});

describe("modeLabel", () => {
  it("labels both modes", () => {
    expect(modeLabel("standing")).toBe("Standing");
    expect(modeLabel("seated")).toBe("Seated");
  });
});
