/**
 * Owner: Ali / Shared
 * Purpose: SSR tests for Catalogue screen verifying dance titles and optional artist display.
 * FRs: FR-09 to FR-12
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import Catalogue from "./Catalogue";

afterEach(() => vi.restoreAllMocks());

function renderCatalogue(): string {
  return renderToStaticMarkup(
    <StaticRouter location="/dances">
      <Catalogue />
    </StaticRouter>,
  );
}

describe("Catalogue (SSR)", () => {
  it("displays both dance title and artist when artist is present", () => {
    vi.spyOn(store, "listDances").mockReturnValue([
      { ...FAKE_DANCE, id: "d1", title: "Don't Call Me Up", artist: "Mabel", coverUrl: "/dances/dance2.jpg" },
    ]);
    const html = renderCatalogue();
    expect(html).toContain("<h2>Don&#x27;t Call Me Up</h2>");
    expect(html).toContain('<p class="catalogue-card-artist">Mabel</p>');
    expect(html).toContain('src="/dances/dance2.jpg"');
    expect(html).toContain('alt="Don&#x27;t Call Me Up by Mabel cover art"');
  });

  it("omits artist element, renders cover fallback, and avoids dangling separators when artist/coverUrl is missing or blank", () => {
    const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
    vi.spyOn(store, "listDances").mockReturnValue([
      noArtistDance,
      { ...noArtistDance, id: "d2", title: "Whitespace Artist", artist: "   " },
    ]);
    const html = renderCatalogue();
    expect(html).toContain(`<h2>${FAKE_DANCE.title}</h2>`);
    expect(html).toContain("<h2>Whitespace Artist</h2>");
    expect(html).not.toContain("catalogue-card-artist");
    expect(html).not.toContain("<img");
    expect(html).toContain("♪");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("—");
  });
});
