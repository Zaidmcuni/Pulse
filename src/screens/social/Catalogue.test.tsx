/**
 * Owner: Ali / Shared
 * Added by: Mohamed (council redesign) and Zaid (artist names)
 * Purpose: Catalogue rendering: Popular only, mode toggle, difficulty chips, song cards linking to Get Ready,
 *          and the optional artist line
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

  it("lists songs by popularity with a Play link to Get Ready", () => {
    const html = render();
    expect(html.indexOf("Hard One")).toBeLessThan(html.indexOf("Easy One"));
    expect(html).toContain('href="/dance/hard-one/ready"');
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
  it("displays both dance title and artist when artist is present", () => {
    vi.spyOn(store, "listDances").mockReturnValue([
      { ...FAKE_DANCE, id: "d1", title: "Don't Call Me Up", artist: "Mabel" },
    ]);
    const html = render();
    expect(html).toContain("<h2>Don&#x27;t Call Me Up</h2>");
    expect(html).toContain('<span class="catalogue-card-artist">Mabel</span>');
  });

  it("omits artist element and dangling separators when artist is missing or blank", () => {
    const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
    vi.spyOn(store, "listDances").mockReturnValue([
      noArtistDance,
      { ...noArtistDance, id: "d2", title: "Whitespace Artist", artist: "   " },
    ]);
    const html = render();
    expect(html).toContain(`<h2>${FAKE_DANCE.title}</h2>`);
    expect(html).toContain("<h2>Whitespace Artist</h2>");
    expect(html).not.toContain("catalogue-card-artist");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("—");
  });
});
