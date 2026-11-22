/**
 * Owner: Mohamed
 * Purpose: tests for the quick switch dialog on Get Ready: SSR markup and the card-tap logic
 * FRs: FR-01, FR-02, FR-03
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { accounts, createAccounts, type KeyValue } from "../../auth/accounts";
import { store } from "../../data/store";
import type { PlayerProfile } from "../../types/pulse";
import { pickDancer, QuickSwitchDialog } from "./QuickSwitchDialog";

const noop = (): void => undefined;

function render(open: boolean): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dance/fake-arms/ready"]}>
      <QuickSwitchDialog open={open} onClose={noop} onSwitched={noop} />
    </MemoryRouter>,
  );
}

const tileOf = (html: string, name: string): string =>
  html.split("<li>").find((li) => li.includes(name.replace("'", "&#x27;"))) ?? "";

describe("QuickSwitchDialog", () => {
  const demo = store.listProfiles()[0];
  const current: PlayerProfile = { ...demo, id: "p-qs-current", displayName: "Current Dancer", handle: "current" };
  const other: PlayerProfile = { ...demo, id: "p-qs-other", displayName: "Other Dancer", handle: "other" };
  let forgotten: string;

  beforeAll(() => {
    forgotten = accounts.listDancers().find((d) => !d.remembered)?.displayName ?? ""; // seeded, never signed in here
    expect(forgotten).not.toBe("");
    accounts.startLocal(other);
    accounts.startLocal(current); // both remembered, current signed in
  });

  it("renders nothing when closed", () => {
    expect(render(false)).toBe("");
  });

  it("lists only dancers remembered on this laptop, as square cards", () => {
    const html = render(true);
    expect(html).toContain("Who’s dancing?");
    expect(tileOf(html, current.displayName)).toContain("who-tile-square");
    expect(tileOf(html, other.displayName)).toContain("who-tile-square");
    expect(html).not.toContain(forgotten.replace("'", "&#x27;"));
  });

  it("marks the current dancer 'Dancing now', and only them", () => {
    const html = render(true);
    expect(tileOf(html, current.displayName)).toContain("Dancing now");
    expect(tileOf(html, current.displayName)).toContain("is-active");
    expect(tileOf(html, other.displayName)).not.toContain("Dancing now");
    expect(html.match(/Dancing now/g)).toHaveLength(1);
  });

  it("links someone else to /who and back to this dance", () => {
    const html = render(true);
    expect(html).toContain('href="/who"');
    expect(html).toContain("Someone else? Sign in");
  });

  it("shows names and handles, never an email or body data (FR-02)", () => {
    const html = render(true);
    expect(html).not.toContain("@pulse.demo");
    expect(html).not.toMatch(/@[^\s<"]*\.[a-z]{2,}/i);
    expect(html).not.toMatch(/\bkg\b|\bcm\b|weight|height|\bage\b/i);
  });
});

describe("pickDancer", () => {
  const A: PlayerProfile = {
    id: "p-a", handle: "a", displayName: "A", age: 30, sex: "female",
    weightKg: 60, heightCm: 160, restingHr: 60, mode: "standing", groupIds: [],
  };
  const B: PlayerProfile = { ...A, id: "p-b", handle: "b", displayName: "B" };

  function memory(): KeyValue {
    const map = new Map<string, string>();
    return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
  }

  function setup() {
    const list: PlayerProfile[] = [];
    const acc = createAccounts({
      store: {
        listProfiles: () => [...list],
        isSeededProfile: () => false,
        saveProfile: (p) => void list.push(p),
        setActiveProfile: noop,
      },
      session: memory(),
      local: memory(),
    });
    acc.startLocal(B);
    acc.startLocal(A); // both remembered, A signed in
    return acc;
  }

  it("switches to another remembered dancer and reports it", () => {
    const acc = setup();
    const switchTo = vi.spyOn(acc, "switchTo");
    const onSwitched = vi.fn();
    pickDancer(acc, B.id, A.id, onSwitched);
    expect(switchTo).toHaveBeenCalledWith(B.id);
    expect(onSwitched).toHaveBeenCalledWith(B.id);
    expect(acc.signedInProfileId()).toBe(B.id);
  });

  it("does nothing for the current dancer or a failed switch", () => {
    const acc = setup();
    const switchTo = vi.spyOn(acc, "switchTo");
    const onSwitched = vi.fn();
    pickDancer(acc, A.id, A.id, onSwitched);
    expect(switchTo).not.toHaveBeenCalled();
    pickDancer(acc, "p-unknown", A.id, onSwitched);
    expect(switchTo).toHaveBeenCalledWith("p-unknown");
    expect(onSwitched).not.toHaveBeenCalled();
  });
});
