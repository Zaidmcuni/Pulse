/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for "Who's dancing?" (/who)
 * FRs: FR-01, FR-02, FR-03
 * Edited: Mohamed (task 25, signed-in dot)
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

  it("marks dancers remembered on this laptop with a green dot, and only them (task 25)", () => {
    const [other] = accounts.listDancers().filter((d) => !d.remembered); // seeded, never signed in here
    expect(other).toBeDefined();
    const demo = store.listProfiles()[0];
    accounts.startLocal({ ...demo, id: "p-dot-test", displayName: "Dot Tester", handle: "dot-tester" });
    accounts.logOut(); // still remembered, just not signed in

    const html = render("/who");
    const tileOf = (name: string): string =>
      html.split("<li>").find((li) => li.includes(name.replace("'", "&#x27;"))) ?? "";
    expect(tileOf("Dot Tester")).toContain('class="who-dot" aria-hidden="true"');
    expect(tileOf("Dot Tester")).toContain("Signed in on this laptop");
    expect(tileOf(other.displayName)).not.toContain("who-dot");
    expect(tileOf(other.displayName)).not.toContain("Signed in on this laptop");
    expect(html).toContain("Signed in on this laptop: one tap, no password.");
  });
});
