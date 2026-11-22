/**
 * Owner: Ali
 * Purpose: Share dialog form → post input tests.
 * FRs: FR-38
 * Edited: Toufic (#154)
 */
import { describe, expect, it } from "vitest";
import { postChoicesFromForm } from "./postComposer";

function form(entries: Array<[string, string]>): FormData {
  const values = new FormData();
  for (const [key, value] of entries) values.append(key, value);
  return values;
}

const ctx = { groupIds: ["mine", "also-mine"], canShareClip: true, avgBpm: 134 };

describe("postChoicesFromForm", () => {
  it("shares nothing extra by default", () => {
    expect(postChoicesFromForm(form([]), ctx)).toEqual({ groupIds: [], showCalories: false, showHeartRate: false, hasClip: false });
  });

  it("keeps ticked boxes and only the dancer's groups, in group order", () => {
    const values = form([["group", "also-mine"], ["group", "not-mine"], ["group", "mine"], ["showCalories", "on"], ["showHeartRate", "on"], ["hasClip", "on"]]);
    expect(postChoicesFromForm(values, ctx)).toEqual({ groupIds: ["mine", "also-mine"], showCalories: true, showHeartRate: true, hasClip: true });
  });

  it("never shares heart rate without watch data or a clip that does not exist", () => {
    const values = form([["showHeartRate", "on"], ["hasClip", "on"]]);
    expect(postChoicesFromForm(values, { ...ctx, avgBpm: null, canShareClip: false })).toMatchObject({ showHeartRate: false, hasClip: false });
  });
});
