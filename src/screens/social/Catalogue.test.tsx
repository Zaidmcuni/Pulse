/**
 * Owner: Ali / Shared
 * Added by: Mohamed (council redesign) and Zaid (artist names)
 * Purpose: Catalogue rendering: Popular only, mode toggle, difficulty chips, song cards linking to the song page,
 *          and the optional artist line
 * Edited: Toufic (#157 seated note, #144 intensity pill)
 * FRs: FR-09 to FR-12
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import Catalogue from "./Catalogue";

const render = (): string => renderToStaticMarkup(<MemoryRouter><Catalogue /></MemoryRouter>);

beforeEach(async () => {
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
});

afterEach(() => vi.restoreAllMocks());

describe("Catalogue layout", () => {
  beforeEach(() => {
    vi.spyOn(store, "listDances").mockReturnValue([
      { ...FAKE_DANCE, id: "easy-one", title: "Easy One", difficulty: "easy", popularity: 1 },
      { ...FAKE_DANCE, id: "hard-one", title: "Hard One", difficulty: "hard", popularity: 9 },
    ]);
  });

  it("lists songs by popularity with a Play link to the song page", () => {
    const html = render();
    expect(html.indexOf("Hard One")).toBeLessThan(html.indexOf("Easy One"));
    expect(html).toContain('href="/dances/hard-one"');
    expect(html).not.toContain("/ready");
    expect(html).toContain(">Play<");
    expect(html).toContain('aria-label="Difficulty: Hard"');
  });

  it("has no For You tab and offers a Standing/Seated toggle and difficulty chips", () => {
    const html = render();
    expect(html).not.toContain("For You");
    expect(html).toMatch(/<input[^>]*name="catalogue-mode"[^>]*value="standing"/);
    expect(html).toMatch(/<input[^>]*name="catalogue-mode"[^>]*value="seated"/);
    for (const label of ["All", "Easy", "Medium", "Hard"]) expect(html).toContain(`>${label}</button>`);
  });
});

describe("Catalogue artist names", () => {
  it("displays dance cover art, title, and artist when present", () => {
    vi.spyOn(store, "listDances").mockReturnValue([
      { ...FAKE_DANCE, id: "d1", title: "Don't Call Me Up", artist: "Mabel", coverUrl: "/dances/dance2.jpg" },
    ]);
    const html = render();
    expect(html).toContain("<h2>Don&#x27;t Call Me Up</h2>");
    expect(html).toContain('<span class="catalogue-card-artist">Mabel</span>');
    expect(html).toContain('src="/dances/dance2.jpg"');
    expect(html).toContain('alt="Don&#x27;t Call Me Up by Mabel cover art"');
  });

  it("omits artist element, renders cover fallback, and avoids dangling separators when artist/coverUrl is missing or blank", () => {
    const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
    vi.spyOn(store, "listDances").mockReturnValue([
      noArtistDance,
      { ...noArtistDance, id: "d2", title: "Whitespace Artist", artist: "   " },
    ]);
    const html = render();
    expect(html).toContain(`<h2>${FAKE_DANCE.title}</h2>`);
    expect(html).toContain("<h2>Whitespace Artist</h2>");
    expect(html).not.toContain("catalogue-card-artist");
    expect(html).not.toContain("<img");
    expect(html).toContain("♪");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("—");
  });
});

describe("Catalogue workout cues", () => {
  beforeEach(() => {
    vi.spyOn(store, "listDances").mockReturnValue([
      { ...FAKE_DANCE, id: "easy-slow", title: "Easy Slow", difficulty: "easy", bpm: 98, popularity: 9 },
      { ...FAKE_DANCE, id: "medium-fast", title: "Medium Fast", difficulty: "medium", bpm: 130, popularity: 1 },
    ]);
  });

  function setMode(mode: "standing" | "seated"): void {
    const profile = store.getActiveProfile()!;
    store.saveProfile({ ...profile, mode });
  }

  it("explains seated mode next to the toggle", () => {
    const html = render();
    expect(html).toContain('aria-describedby="catalogue-mode-note"');
    expect(html).toContain("Same song, your way. In seated mode, follow the same coach and score with upper-body moves.");
  });

  it("shows one intensity pill per card and keeps a single BPM pill", () => {
    const html = render();
    expect(html).toContain(">Light cardio<");
    expect(html).toContain(">High-energy cardio<");
    expect(html.match(/ BPM</g)).toHaveLength(2);
    expect(html).not.toContain("kcal");
  });

  it("shows the seated pill only in seated mode", () => {
    setMode("standing");
    expect(render()).not.toContain("Seated · upper body");
    setMode("seated");
    expect(render().match(/Seated · upper body/g)).toHaveLength(2);
    setMode("standing");
  });
});
