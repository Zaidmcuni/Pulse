/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for the profile setup screen (Vitest node environment, memory store)
 * FRs: FR-01, FR-02, FR-03, NFR-06
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { store } from "../../data/store";
import type { PlayerProfile } from "../../types/pulse";
import { CurrentProfileCard } from "./CurrentProfileCard";
import ProfileSetup from "./ProfileSetup";
import { ProfileSwitcher } from "./ProfileSwitcher";

function renderSetup(path = "/profile/setup"): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/setup" element={<ProfileSetup />} />
      </Routes>
    </MemoryRouter>,
  );
}

const AMIRA: PlayerProfile = {
  id: "p-amira", handle: "amira-steps", displayName: "Amira", age: 37, sex: "female",
  weightKg: 88, heightCm: 165, restingHr: 60, mode: "seated", groupIds: [],
};
const THEO: PlayerProfile = { ...AMIRA, id: "p-theo", handle: "theo", displayName: "Theo", mode: "standing" };

function demoProfile(): PlayerProfile {
  const demo = store.getActiveProfile();
  if (!demo) throw new Error("memory store should have the demo profile");
  return demo;
}

const FORM_INPUT = /<input[^>]*id="profile-setup-/;

// The store has no delete, so other profile sets go through spies restored after each test.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfileSetup overview", () => {
  it("shows the demo profile in the current card with Edit profile, Log out and Continue, and no form", () => {
    const html = renderSetup();
    expect(html).toContain("You&#x27;re dancing as");
    expect(html).toContain("Demo Dancer");
    expect(html).toContain("@demo");
    expect(html).not.toContain("@@demo");
    expect(html).toMatch(/<button[^>]*>Edit profile<\/button>/);
    expect(html).toMatch(/<button[^>]*>Log out<\/button>/);
    expect(html).toMatch(/<button[^>]*>Continue<\/button>/);
    expect(html).not.toMatch(FORM_INPUT);
    expect(html).not.toContain("Save");
    expect(html).toContain('aria-labelledby="profile-current-label"');
    expect(html).toContain('id="profile-current-label"');
  });

  it("lists only the other accounts in Accounts on this laptop, never the active one", () => {
    const demo = demoProfile();
    vi.spyOn(store, "listProfiles").mockReturnValue([THEO, demo, AMIRA]);
    const html = renderSetup();
    expect(html).toContain("Accounts on this laptop");
    expect(html).not.toContain("Switch profile");
    expect(html.match(/<button[^>]*>Log in<\/button>/g)).toHaveLength(2);
    expect(html.indexOf("Amira")).toBeLessThan(html.indexOf("Theo"));
    expect(html).toContain("@amira-steps");
    expect(html.split("Demo Dancer")).toHaveLength(2); // exactly once, in the current card
    const switcher = html.slice(html.indexOf('class="card profile-switcher"'));
    expect(switcher).not.toContain("Demo Dancer");
    expect(html).not.toContain("Dancing now");
    expect(html).toContain("Switching person? Reconnect their watch on the next screen.");
  });

  it("shows the only-you line, + Create account and no reconnect hint with a single profile", () => {
    const html = renderSetup();
    expect(html).toContain("Only you on this laptop so far.");
    expect(html).toContain("+ Create account");
    expect(html).not.toContain("+ New profile");
    expect(html).not.toContain("Switching person?");
    expect(html).not.toMatch(/<button[^>]*>Log in<\/button>/);
  });

  it("never shows age, weight or height on the overview (FR-02)", () => {
    vi.spyOn(store, "listProfiles").mockReturnValue([AMIRA]);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(AMIRA);
    const html = renderSetup();
    expect(html).toContain("Amira");
    expect(html).toContain("Seated");
    expect(html).not.toContain("37");
    expect(html).not.toContain("88");
    expect(html).not.toContain("165");
  });

  it("never shows a @pulse.demo email on the profile page (FR-02)", () => {
    vi.spyOn(store, "listProfiles").mockReturnValue([THEO, demoProfile(), AMIRA]);
    const html = renderSetup();
    expect(html).toContain("@amira-steps");
    expect(html).not.toContain("@pulse.demo");
    expect(html).not.toContain("pulse.demo");
  });

  it("asks to choose who's dancing when profiles exist but none is active", () => {
    vi.spyOn(store, "listProfiles").mockReturnValue([THEO, AMIRA]);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(null);
    const html = renderSetup();
    expect(html).toContain("Choose who&#x27;s dancing");
    expect(html).not.toContain("You&#x27;re dancing as");
    expect(html.match(/<button[^>]*>Log in<\/button>/g)).toHaveLength(2);
    expect(html).not.toMatch(FORM_INPUT);
  });
});

describe("ProfileSetup form views", () => {
  it("opens the edit view on ?edit=1, prefilled, with Save changes and Cancel and no cards", () => {
    const html = renderSetup("/profile/setup?edit=1");
    expect(html).toContain("Edit profile");
    expect(html).toMatch(/<input id="profile-setup-handle"[^>]*value="demo"/);
    expect(html).toMatch(/<input id="profile-setup-displayName"[^>]*value="Demo Dancer"/);
    expect(html).toMatch(/<button[^>]*>Save changes<\/button>/);
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
    expect(html).not.toContain("Save and continue");
    expect(html).not.toContain("profile-current");
    expect(html).not.toContain("profile-switcher\"");
    expect(html).not.toContain("+ Create account");
  });

  it("logs out and redirects on ?new=1 instead of showing a form", async () => {
    expect(await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD)).toBe("ok");
    const html = renderSetup("/profile/setup?new=1");
    expect(accounts.isSignedIn()).toBe(false);
    expect(html).not.toMatch(FORM_INPUT);
    expect(html).not.toContain("profile-current");
  });

  it("shows the first-run form with no cards and no Cancel when there are no profiles", () => {
    vi.spyOn(store, "listProfiles").mockReturnValue([]);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(null);
    const html = renderSetup();
    expect(html).toContain("Create your profile");
    expect(html).toMatch(/<button[^>]*>Save and continue<\/button>/);
    expect(html).not.toContain("Cancel");
    expect(html).not.toContain("profile-current");
    expect(html).not.toContain("+ Create account");
  });

  it("falls back to first run on ?edit=1 when there is no active profile", () => {
    vi.spyOn(store, "listProfiles").mockReturnValue([]);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(null);
    const html = renderSetup("/profile/setup?edit=1");
    expect(html).toContain("Create your profile");
    expect(html).not.toContain("Cancel");
  });

  it("shows the privacy note and both mode descriptions in the form", () => {
    const html = renderSetup("/profile/setup?edit=1");
    // renderToStaticMarkup escapes the apostrophe.
    expect(html).toContain("Your age, weight, height and heart rate stay on this device. They&#x27;re never shown on posts or to other dancers.");
    expect(html).toContain("Full body: arms, torso and legs are scored.");
    expect(html).toContain("Upper body only: arms and torso are scored. For dancing in a chair or wheelchair.");
  });

  it("gives every input a matching label", () => {
    const html = renderSetup("/profile/setup?edit=1");
    const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    const labelFors = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
    const inputCount = (html.match(/<input/g) ?? []).length;
    expect(ids).toHaveLength(inputCount); // every input has an id
    expect(ids).toHaveLength(12); // 7 text fields + 3 sex radios + 2 mode radios
    for (const id of ids) expect(labelFors).toContain(id);
  });
});

describe("CurrentProfileCard", () => {
  it("shows the uppercase initial and only name, handle and mode", () => {
    const html = renderToStaticMarkup(
      <CurrentProfileCard profile={{ ...AMIRA, displayName: "jules roy" }} onEdit={() => {}} onLogOut={() => {}} onContinue={() => {}} />,
    );
    expect(html).toMatch(/<span class="profile-current-initial"[^>]*>J<\/span>/);
    expect(html).toContain("jules roy");
    expect(html).toContain("@amira-steps");
    expect(html).toContain("Seated");
    expect(html).not.toContain("37");
    expect(html).not.toContain("88");
  });

  it("shows ? for an empty name", () => {
    const html = renderToStaticMarkup(
      <CurrentProfileCard profile={{ ...AMIRA, displayName: "" }} onEdit={() => {}} onLogOut={() => {}} onContinue={() => {}} />,
    );
    expect(html).toMatch(/<span class="profile-current-initial"[^>]*>\?<\/span>/);
  });
});

describe("ProfileSwitcher", () => {
  it("never shows age, weight or height", () => {
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
});
