/**
 * Owner: Ali
 * Edited: Mohamed (task 15, joined vs discover)
 * Purpose: Split the visible groups into "Your groups" and "Discover groups" for /groups.
 * FRs: FR-42
 */

import type { Group, GroupKind } from "../../types/pulse";

export interface GroupSections {
  joined: Group[];
  discover: Group[];
}

/** Joined groups sorted by name; the rest by member count (most first), then name. No viewer = all in discover. */
export function splitGroups(groups: readonly Group[], viewerId: string | undefined, category: "all" | GroupKind): GroupSections {
  const visible = groups.filter((group) => category === "all" || group.kind === category);
  const isMember = (group: Group): boolean => viewerId !== undefined && group.memberIds.includes(viewerId);
  const byName = (a: Group, b: Group): number => a.name.localeCompare(b.name);
  return {
    joined: visible.filter(isMember).sort(byName),
    discover: visible
      .filter((group) => !isMember(group))
      .sort((a, b) => b.memberIds.length - a.memberIds.length || byName(a, b)),
  };
}
