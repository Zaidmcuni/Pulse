/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for "Who's dancing?" (/who)
 * FRs: FR-01, FR-02, FR-03
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { accounts } from "../../auth/accounts";
import { store } from "../../data/store";
import WhoIsDancing from "./WhoIsDancing";

function render(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/who" element={<WhoIsDancing />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  accounts.logOut();
});

describe("WhoIsDancing", () => {
  it("explains PULSE in one line and offers Guest and a new dancer", () => {
    const html = render("/who");
    expect(html).toContain("Who’s dancing?");
    expect(html).toContain("Dance along to a song. Your webcam and watch score you.");
    expect(html).toContain(">Guest<");
    expect(html).toContain(">New dancer<");
    expect(html).toContain('href="/login"');
  });

  it("shows a tile per dancer with name and handle only, never body stats", () => {
    const html = render("/who");
    for (const p of store.listProfiles()) {
      expect(html).toContain(p.displayName.replace("'", "&#x27;"));
    }
    expect(html).not.toMatch(/\bkg\b|\bcm\b|weight|height|\bage\b/i);
  });
});
