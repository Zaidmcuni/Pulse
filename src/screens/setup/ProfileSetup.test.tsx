/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for the profile setup screen (Vitest node environment, memory store)
 * FRs: FR-01, FR-02
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ProfileSetup from "./ProfileSetup";

function renderSetup(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/profile/setup"]}>
      <Routes>
        <Route path="/profile/setup" element={<ProfileSetup />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfileSetup", () => {
  it("shows the demo profile in edit mode", () => {
    const html = renderSetup();
    expect(html).toContain("Your profile");
    expect(html).not.toContain("Create your profile");
    expect(html).toContain("Cancel");
    expect(html).toMatch(/<input id="profile-setup-handle"[^>]*value="@demo"/);
  });

  it("shows the privacy note and both mode descriptions", () => {
    const html = renderSetup();
    // renderToStaticMarkup escapes the apostrophe.
    expect(html).toContain("Your age, weight, height and heart rate stay on this device. They&#x27;re never shown on posts or to other dancers.");
    expect(html).toContain("Full body: arms, torso and legs are scored.");
    expect(html).toContain("Upper body only: arms and torso are scored. For dancing in a chair or wheelchair.");
  });

  it("gives every input a matching label", () => {
    const html = renderSetup();
    const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    const labelFors = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
    const inputCount = (html.match(/<input/g) ?? []).length;
    expect(ids).toHaveLength(inputCount); // every input has an id
    expect(ids).toHaveLength(12); // 7 text fields + 3 sex radios + 2 mode radios
    for (const id of ids) expect(labelFors).toContain(id);
  });
});
