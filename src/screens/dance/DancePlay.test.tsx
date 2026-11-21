/**
 * Owner: Mohamed
 * Purpose: SSR tests for the dance screen's initial markup (effects don't run in SSR; the live pipeline is checked by hand)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import DancePlay from "./DancePlay";

function renderPlay(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dance/:id/play" element={<DancePlay />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DancePlay (SSR)", () => {
  it("shows 'Dance not found' with a way back for an unknown id", () => {
    const html = renderPlay("/dance/nope/play");
    expect(html).toContain("Dance not found");
    expect(html).toContain("Back to dances");
  });

  it("renders the HUD labels for a known dance with the demo profile", () => {
    const html = renderPlay(`/dance/${FAKE_DANCE.id}/play`);
    expect(html).toContain("Points");
    expect(html).toContain("Accuracy");
    expect(html).toContain("Heart rate");
    expect(html).toContain("Simulated"); // FR-08: no reading yet -> simulated label
  });

  it("never shows 'Miss' (NFR-10)", () => {
    for (const path of [`/dance/${FAKE_DANCE.id}/play`, "/dance/nope/play"]) {
      expect(renderPlay(path).toLowerCase()).not.toMatch(/\bmiss\b/);
    }
  });
});
