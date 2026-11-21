/**
 * Owner: Shared (Step 0)
 * Purpose: in-memory Store (no localStorage) with the same interface as data/store.ts. Use until Ali's store lands.
 */
import type { EarnedBadge, FeedPost, Group, Meetup, PlayerProfile, SessionResult, Store } from "../types/pulse";
import { FAKE_DANCE } from "./fakeDance";
import { FAKE_RESULT } from "./fakeSession";

export function createMemoryStore(): Store {
  const demo: PlayerProfile = {
    id: "p-demo", handle: "@demo", displayName: "Demo Dancer", age: 21, sex: "other",
    weightKg: 70, heightCm: 175, restingHr: 65, mode: "standing", groupIds: ["g-friends"],
  };
  let profiles: PlayerProfile[] = [demo];
  let activeId: string | null = demo.id;
  let results: SessionResult[] = [FAKE_RESULT];
  let posts: FeedPost[] = [];
  let groups: Group[] = [{ id: "g-friends", name: "McGill Friday Night Crew", kind: "friends", memberIds: [demo.id], groupDanceIds: [FAKE_DANCE.id] }];
  let meetups: Meetup[] = [];
  let badges: EarnedBadge[] = [];
  const dances = [FAKE_DANCE];

  return {
    async init() {},
    listProfiles: () => profiles,
    getActiveProfile: () => profiles.find((p) => p.id === activeId) ?? null,
    saveProfile: (p) => { profiles = [...profiles.filter((x) => x.id !== p.id), p]; },
    setActiveProfile: (id) => { activeId = id; },
    listDances: () => dances,
    getDance: (id) => dances.find((d) => d.id === id),
    saveResult: (r) => { results = [...results.filter((x) => x.id !== r.id), r]; },
    getResult: (id) => results.find((r) => r.id === id),
    listResults: (playerId) => results.filter((r) => r.playerId === playerId),
    createPost: (p) => {
      const post: FeedPost = { ...p, id: `post-${posts.length + 1}`, kudosBy: [], createdAtIso: new Date().toISOString() };
      posts = [post, ...posts];
      return post;
    },
    listFeed: (groupId) => posts.filter((p) => !groupId || p.groupIds.includes(groupId)),
    toggleKudos: (postId, playerId) => {
      posts = posts.map((p) => p.id !== postId ? p : { ...p, kudosBy: p.kudosBy.includes(playerId) ? p.kudosBy.filter((x) => x !== playerId) : [...p.kudosBy, playerId] });
    },
    listGroups: () => groups,
    joinGroup: (g, pl) => { groups = groups.map((x) => x.id === g && !x.memberIds.includes(pl) ? { ...x, memberIds: [...x.memberIds, pl] } : x); },
    leaveGroup: (g, pl) => { groups = groups.map((x) => x.id === g ? { ...x, memberIds: x.memberIds.filter((m) => m !== pl) } : x); },
    weeklyLeaderboard: () => [],
    listMeetups: (g) => meetups.filter((m) => m.groupId === g),
    toggleRsvp: (id, pl) => { meetups = meetups.map((m) => m.id !== id ? m : { ...m, rsvpIds: m.rsvpIds.includes(pl) ? m.rsvpIds.filter((x) => x !== pl) : [...m.rsvpIds, pl] }); },
    listBadges: (pl) => badges.filter((b) => b.playerId === pl),
    awardBadge: (b) => { badges = [...badges, b]; },
    resetDemo: () => {},
  };
}
