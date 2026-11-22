/**
 * Owner: Ali
 * Added by: Mohamed (council redesign)
 * Purpose: Catalogue rendering: Popular only, mode toggle, difficulty chips, song cards linking to Get Ready
 * FRs: FR-09 to FR-12
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import Catalogue from "./Catalogue";

const render = (): string => renderToStaticMarkup(<MemoryRouter><Catalogue /></MemoryRouter>);

beforeEach(async () => {
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
  vi.spyOn(store, "listDances").mockReturnValue([
    { ...FAKE_DANCE, id: "easy-one", title: "Easy One", difficulty: "easy", popularity: 1 },
    { ...FAKE_DANCE, id: "hard-one", title: "Hard One", difficulty: "hard", popularity: 9 },
  ]);
});

afterEach(() => vi.restoreAllMocks());

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
