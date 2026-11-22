/**
 * Owner: Ali
 * Purpose: Turn the Share dialog's form into the post input, so the live preview and the saved post match (pure).
 * FRs: FR-38
 * Edited: Toufic (#154, live preview + opt-in average heart rate)
 */

import type { FeedPost } from "../types/pulse";

export type PostChoices = Pick<FeedPost, "groupIds" | "showCalories" | "showHeartRate" | "hasClip">;

/**
 * Every health toggle is off unless its box is ticked (FR-38). Only the dancer's own groups are kept;
 * the clip needs a highlight and average heart rate needs watch data, whatever the form says.
 */
export function postChoicesFromForm(values: FormData, ctx: { groupIds: readonly string[]; canShareClip: boolean; avgBpm: number | null }): PostChoices {
  const selected = new Set(values.getAll("group"));
  return {
    groupIds: ctx.groupIds.filter((id) => selected.has(id)),
    showCalories: values.has("showCalories"),
    showHeartRate: ctx.avgBpm !== null && values.has("showHeartRate"),
    hasClip: ctx.canShareClip && values.has("hasClip"),
  };
}
