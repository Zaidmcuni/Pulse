/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for the profile setup screen (Vitest node environment, memory store)
 * FRs: FR-01, FR-02, FR-03
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import type { PlayerProfile } from "../../types/pulse";
import ProfileSetup from "./ProfileSetup";
import { ProfileSwitcher } from "./ProfileSwitcher.tsx"; // explicit extension: profileSwitcher.ts differs only in case

function renderSetup(path = "/profile/setup"): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
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
    expect(html).toMatch(/<input id="profile-setup-handle"[^>]*value="demo"/);
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

const AMIRA: PlayerProfile = {
  id: "p-amira", handle: "amira-steps", displayName: "Amira", age: 37, sex: "female",
  weightKg: 88, heightCm: 165, restingHr: 60, mode: "seated", groupIds: [],
};

describe("ProfileSetup switcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the demo profile as dancing now and a new-profile button", () => {
    const html = renderSetup();
    expect(html).toContain("Who&#x27;s dancing?");
    expect(html).toContain("Demo Dancer");
    expect(html).toContain("Dancing now");
    expect(html).toContain("+ New profile");
    expect(html).not.toContain("Switching person?");
  });

  it("lists a second profile with a Use button and its handle shown with @", () => {
    // The store has no delete, so add the second profile through a spy that is restored after the test.
    const demo = store.getActiveProfile();
    if (!demo) throw new Error("memory store should have the demo profile");
    vi.spyOn(store, "listProfiles").mockReturnValue([demo, AMIRA]);
    const html = renderSetup();
    expect(html).toContain("Amira");
    expect(html).toContain("@amira-steps");
    expect(html).toContain("@demo");
    expect(html).toMatch(/<button[^>]*>Use<\/button>/);
    expect(html).toContain("Switching person? Reconnect their watch on the next screen.");
  });

  it("never shows age, weight or height in the switcher", () => {
    const html = renderToStaticMarkup(
      <ProfileSwitcher profiles={[AMIRA]} activeId={null} onUse={() => {}} onNew={() => {}} />,
    );
    expect(html).toContain("Amira");
    expect(html).toContain("Seated");
    expect(html).not.toContain("37");
    expect(html).not.toContain("88");
    expect(html).not.toContain("165");
  });

  it("renders nothing when there are no profiles", () => {
    const html = renderToStaticMarkup(
      <ProfileSwitcher profiles={[]} activeId={null} onUse={() => {}} onNew={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("opens an empty form with Cancel on /profile/setup?new=1", () => {
    const html = renderSetup("/profile/setup?new=1");
    expect(html).toContain("New profile");
    expect(html).not.toContain("Your profile");
    expect(html).toMatch(/<input id="profile-setup-handle"[^>]*value=""/);
    expect(html).toContain("Cancel");
  });
});
