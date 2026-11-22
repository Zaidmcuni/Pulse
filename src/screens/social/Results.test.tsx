/**
 * Owner: Ali
 * Purpose: Results route rendering for completed, early-quit, and unavailable sessions.
 * FRs: FR-35, FR-36, FR-38
 * Edited: Mohamed (council redesign: early-quit check scoped to the page; medal, explanation and Share to Crew labels)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../../App";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { clearHighlightClips, saveHighlightClip } from "../../clip/highlightStore";
import { assertFeedPost, assertSessionResult } from "../../contracts/validators";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../../mocks/fakeSession";
import { songMs, type FeedPost } from "../../types/pulse";
import Results from "./Results";

const backToDances = /<a\b[^>]*\bhref="\/dances"[^>]*>Back to dances<\/a>/;

function renderApp(path: string): string {
  return renderToStaticMarkup(<StaticRouter location={path}><App /></StaticRouter>);
}

beforeEach(async () => {
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD); // App routes sit behind the auth gate (task 14)
  const fixtures = [FAKE_RESULT, FAKE_RESULT_QUIT];
  fixtures.forEach(assertSessionResult);
  vi.spyOn(store, "getResult").mockImplementation((id) => fixtures.find((result) => result.id === id));
  vi.spyOn(store, "getDance").mockReturnValue(undefined);
});

afterEach(() => {
  clearHighlightClips();
  vi.doUnmock("react");
  vi.doUnmock("react-router-dom");
  vi.restoreAllMocks();
});

it("shows all five metrics for a completed result even without a matching dance template", () => {
  const html = renderApp(`/results/${FAKE_RESULT.id}`);

  expect(store.getResult).toHaveBeenCalledWith(FAKE_RESULT.id);
  expect(html).toContain(">Dance complete</h1>");
  expect(html).toContain("<dt>Total points</dt><dd>842</dd>");
  expect(html).toContain("<dt>Accuracy</dt><dd>78%</dd>");
  expect(html).toContain('<dt>Level</dt><dd><span class="session-results-medal is-gold">gold</span></dd>');
  expect(html).toContain("Points = how hard your heart worked × how well you matched.");
  expect(html).toContain("<dt>Duration</dt><dd>0:20</dd>");
  expect(html).toContain("<dt>Calories</dt><dd>3.1 kcal</dd>");
  expect(html).toContain("Estimated and private");
  expect(html).not.toMatch(/heart rate|body weight|\bsamples\b|\bBPM\b/i);
});

it("displays stored values when accuracy has a fractional part and the saved level differs from its threshold", () => {
  const saved = { ...FAKE_RESULT, accuracyPct: 78.5, level: "silver" as const, durationSec: 125 };
  assertSessionResult(saved);
  vi.mocked(store.getResult).mockReturnValue(saved);

  const html = renderApp(`/results/${saved.id}`);

  expect(html).toContain("<dt>Accuracy</dt><dd>78.5%</dd>");
  expect(html).toContain(">silver</span>");
  expect(html).toContain("<dt>Duration</dt><dd>2:05</dd>");
});

it("shows only duration and estimated private calories for an early quit", () => {
  const html = renderApp(`/results/${FAKE_RESULT_QUIT.id}`);

  expect(store.getResult).toHaveBeenCalledWith(FAKE_RESULT_QUIT.id);
  expect(html).toContain(">Dance ended early</h1>");
  expect([...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1])).toEqual(["Duration", "Calories"]);
  expect(html).toContain("<dt>Duration</dt><dd>0:09</dd>");
  expect(html).toContain("<dt>Calories</dt><dd>1.2 kcal</dd>");
  expect(html).toContain("Estimated and private");
  const page = html.slice(html.indexOf("<main")); // the app header has its own avatar button
  expect(page).not.toMatch(/<button|class="badge|post to|heart rate|accuracy|total points/i);
  expect(html).toMatch(backToDances);
});

it("shows recovery for an unknown result ID", () => {
  const html = renderApp("/results/unknown");

  expect(store.getResult).toHaveBeenCalledWith("unknown");
  expect(html).toContain(">Result not found</h1>");
  expect(html).toMatch(backToDances);
  expect(html).not.toContain("<dt>");
});

it("shows the same recovery view when no route ID is supplied to the screen", () => {
  const html = renderToStaticMarkup(<StaticRouter location="/results"><Results /></StaticRouter>);

  expect(store.getResult).not.toHaveBeenCalled();
  expect(html).toContain(">Result not found</h1>");
  expect(html).toMatch(backToDances);
});

it("offers only the dancer's groups and opts out of calories and clips by default", () => {
  const profile = store.getActiveProfile()!;
  expect(profile.id).toBe(FAKE_RESULT.playerId);
  vi.spyOn(store, "listGroups").mockReturnValue([
    { id: "my-group", name: "My Group", kind: "friends", memberIds: [profile.id], groupDanceIds: [] },
    { id: "other-group", name: "Other Group", kind: "city", memberIds: [], groupDanceIds: [] },
  ]);
  const html = renderApp(`/results/${FAKE_RESULT.id}`);

  expect(html).toContain(">Share to Crew</button>");
  expect(html).toContain("My Group");
  expect(html).not.toContain("Other Group");
  expect(html).not.toContain("checked");
  expect(html).toMatch(/<input[^>]*name="hasClip"[^>]*disabled/);
});

it("hides posting when the active profile does not own the result or it is already posted", () => {
  const profile = store.getActiveProfile()!;
  vi.spyOn(store, "getActiveProfile").mockReturnValueOnce({ ...profile, id: "another-dancer" });
  expect(renderApp(`/results/${FAKE_RESULT.id}`)).not.toContain(">Share to Crew</button>");

  vi.spyOn(store, "listFeed").mockReturnValue([{
    id: "already-posted", authorId: profile.id, resultId: FAKE_RESULT.id, showCalories: false,
    hasClip: false, groupIds: [], kudosBy: [], createdAtIso: "2026-11-21T12:00:00Z",
  }]);
  const html = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(html).toContain("This result is already posted.");
  expect(html).not.toContain(">Share to Crew</button>");
});

it("shows the badge dialog for awards from the active dancer’s completed result", () => {
  vi.spyOn(store, "listBadges").mockReturnValue([
    { badgeId: "5k_club", playerId: FAKE_RESULT.playerId, earnedAtIso: FAKE_RESULT.createdAtIso },
    { badgeId: "first_steps", playerId: FAKE_RESULT.playerId, earnedAtIso: "2025-01-01T12:00:00Z" },
  ]);

  const html = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(html).toContain("Badges unlocked");
  expect(html).toContain("5K Club");
  expect(html).not.toContain("First Steps");
  expect(renderApp(`/results/${FAKE_RESULT_QUIT.id}`)).not.toContain("Badges unlocked");
});

it("displays dance cover art, title, and artist on completed and quit-early views when present, and falls back cleanly", () => {
  vi.mocked(store.getDance).mockReturnValue({ ...FAKE_DANCE, coverUrl: "/dances/dance3.jpg" });
  const completedHtml = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(completedHtml).toContain(`${FAKE_DANCE.title} — ${FAKE_DANCE.artist}`);
  expect(completedHtml).toContain('src="/dances/dance3.jpg"');

  const quitHtml = renderApp(`/results/${FAKE_RESULT_QUIT.id}`);
  expect(quitHtml).toContain(`${FAKE_DANCE.title} — ${FAKE_DANCE.artist}`);
  expect(quitHtml).toContain('src="/dances/dance3.jpg"');

  const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
  vi.mocked(store.getDance).mockReturnValue(noArtistDance);
  const plainHtml = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(plainHtml).toContain(`<p class="session-results-dance">${FAKE_DANCE.title}</p>`);
  expect(plainHtml).not.toContain("<img");
  expect(plainHtml).toContain("♪");
  expect(plainHtml).not.toContain("—");
  expect(plainHtml).not.toContain("undefined");
});

it("renders side-by-side highlight, privacy note, and 'Show body landmarks on my video' checkbox on completed results", () => {
  vi.mocked(store.getDance).mockReturnValue(FAKE_DANCE);
  saveHighlightClip({
    resultId: FAKE_RESULT.id,
    danceId: FAKE_DANCE.id,
    videoBlob: null,
    videoStartSongMs: 0,
    overlaySamples: [{ tSongMs: songMs(4000), points: Array.from({ length: 12 }, () => ({ x: 0.5, y: 0.5, v: 0.9 })) }],
    poseSamples: [{ tSongMs: songMs(4000), points: Array.from({ length: 12 }, () => ({ x: 0, y: 0, v: 0.9 })) }],
    showLandmarks: false,
  });

  const html = renderApp(`/results/${FAKE_RESULT.id}`);
  expect(html).toContain("<h2>Highlight</h2>");
  expect(html).toContain('width="960"');
  expect(html).toContain('height="540"');
  expect(html).toContain("Show body landmarks on my video");
  expect(html).toContain("Video stays in your browser memory only");
  expect(html).toContain(">Download highlight</button>");
  expect(html).not.toContain("checked");
  expect(html).not.toMatch(/<input[^>]*name="hasClip"[^>]*disabled/);
});

it("toggles showLandmarks in highlightStore and live preview before posting, while keeping FeedPost video-free", async () => {
  vi.resetModules();

  const stateValues: unknown[] = [];
  const stateSetters: Array<(val: unknown) => void> = [];
  let cursor = 0;

  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return {
      ...actual,
      useState: <T,>(init: T | (() => T)) => {
        const idx = cursor++;
        if (!(idx in stateValues)) {
          stateValues[idx] = typeof init === "function" ? (init as () => T)() : init;
          stateSetters[idx] = (next: unknown) => {
            stateValues[idx] = typeof next === "function" ? (next as (prev: unknown) => unknown)(stateValues[idx]) : next;
          };
        }
        return [stateValues[idx], stateSetters[idx]];
      },
      useEffect: () => {},
      useLayoutEffect: () => {},
      useMemo: <T,>(factory: () => T) => factory(),
      useRef: <T,>(initial: T) => ({ current: initial }),
    };
  });

  const navigateSpy = vi.fn();
  vi.doMock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
      ...actual,
      useParams: () => ({ resultId: FAKE_RESULT.id }),
      useNavigate: () => navigateSpy,
    };
  });

  const { saveHighlightClip: saveClip, getHighlightClip: getClip } = await import("../../clip/highlightStore");
  const { store: modStore } = await import("../../data/store");
  const { ClipReplay: ModClipReplay } = await import("../../clip/ClipReplay");
  const { default: HookedResults } = await import("./Results");

  const profile = modStore.getActiveProfile()!;
  vi.spyOn(modStore, "getResult").mockReturnValue({ ...FAKE_RESULT, playerId: profile.id });
  vi.spyOn(modStore, "getDance").mockReturnValue(FAKE_DANCE);
  vi.spyOn(modStore, "listBadges").mockReturnValue([]);
  vi.spyOn(modStore, "listFeed").mockReturnValue([]);
  vi.spyOn(modStore, "listGroups").mockReturnValue([]);

  let createdPost: FeedPost | null = null;
  vi.spyOn(modStore, "createPost").mockImplementation((input) => {
    const post: FeedPost = {
      ...input,
      id: "post-test-1",
      kudosBy: [],
      createdAtIso: "2026-11-21T16:00:00.000Z",
    };
    assertFeedPost(post);
    createdPost = post;
    return post;
  });

  saveClip({
    resultId: FAKE_RESULT.id,
    danceId: FAKE_DANCE.id,
    videoBlob: new Blob(["vid"], { type: "video/webm" }),
    videoStartSongMs: 0,
    overlaySamples: [{ tSongMs: songMs(4000), points: Array.from({ length: 12 }, () => ({ x: 0.5, y: 0.5, v: 0.9 })) }],
    poseSamples: [{ tSongMs: songMs(4000), points: Array.from({ length: 12 }, () => ({ x: 0, y: 0, v: 0.9 })) }],
    showLandmarks: false,
  });

  type WalkNode = { type?: unknown; props?: Record<string, unknown> } | WalkNode[] | string | number | boolean | null | undefined;
  const findNode = (
    node: WalkNode,
    pred: (el: { type: unknown; props: Record<string, unknown> }) => boolean,
  ): { type: unknown; props: Record<string, unknown> } | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = findNode(child, pred);
        if (hit) return hit;
      }
      return null;
    }
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type && el.props && pred({ type: el.type, props: el.props })) {
      return { type: el.type, props: el.props };
    }
    if (el.props?.children !== undefined) {
      return findNode(el.props.children as WalkNode, pred);
    }
    return null;
  };

  cursor = 0;
  const tree1 = HookedResults() as unknown as WalkNode;
  const replay1 = findNode(tree1, (el) => el.type === ModClipReplay);
  expect(replay1?.props.showLandmarks).toBe(false);

  const checkbox = findNode(tree1, (el) => el.type === "input" && el.props.type === "checkbox");
  expect(checkbox).not.toBeNull();
  (checkbox!.props.onChange as (e: { currentTarget: { checked: boolean } }) => void)({
    currentTarget: { checked: true },
  });
  expect(getClip(FAKE_RESULT.id)?.showLandmarks).toBe(true);

  cursor = 0;
  const tree2 = HookedResults() as unknown as WalkNode;
  const replay2 = findNode(tree2, (el) => el.type === ModClipReplay);
  expect(replay2?.props.showLandmarks).toBe(true);

  const postComp = findNode(tree2, (el) => typeof el.type === "function" && (el.type as { name?: string }).name === "PostResult");
  expect(postComp).not.toBeNull();
  const postTree = (postComp!.type as (p: Record<string, unknown>) => WalkNode)(postComp!.props);
  const form = findNode(postTree, (el) => el.type === "form");
  expect(form).not.toBeNull();

  const formData = new FormData();
  formData.set("hasClip", "on");
  const originalFormData = globalThis.FormData;
  vi.stubGlobal("FormData", class { constructor() { return formData; } });
  try {
    (form!.props.onSubmit as (e: { preventDefault(): void; currentTarget: unknown }) => void)({
      preventDefault: () => {},
      currentTarget: {},
    });
  } finally {
    vi.stubGlobal("FormData", originalFormData);
  }

  expect(createdPost).not.toBeNull();
  expect(createdPost!.hasClip).toBe(true);
  assertFeedPost(createdPost!);
  expect("videoBlob" in createdPost!).toBe(false);
  expect("showLandmarks" in createdPost!).toBe(false);
  expect(navigateSpy).toHaveBeenCalledWith("/feed", { state: { justPosted: "post-test-1" } });
  vi.doUnmock("react");
  vi.doUnmock("react-router-dom");
  vi.resetModules();
});
