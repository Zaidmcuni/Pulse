/**
 * Owner: Mohamed
 * Purpose: unit tests for danceHud.ts
 */
import { describe, expect, it } from "vitest";
import { formatClock, hrBadgeText, progressFraction, ratingText, showReconnectBanner } from "./danceHud";

describe("ratingText (NFR-10)", () => {
  it("maps every rating to encouraging text, never 'Miss'", () => {
    expect(ratingText("perfect")).toBe("Perfect!");
    expect(ratingText("good")).toBe("Good!");
    expect(ratingText("ok")).toBe("OK");
    expect(ratingText("miss")).toBe("Keep going!");
    expect(ratingText("miss").toLowerCase()).not.toContain("miss");
  });
});

describe("formatClock", () => {
  it("formats M:SS", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(59_999)).toBe("0:59");
    expect(formatClock(600_000)).toBe("10:00");
  });
  it("clamps negatives to 0:00", () => {
    expect(formatClock(-500)).toBe("0:00");
  });
});

describe("progressFraction", () => {
  it("is the share of the song played", () => {
    expect(progressFraction(5000, 20)).toBe(0.25);
  });
  it("clamps below 0 and above 1", () => {
    expect(progressFraction(-100, 20)).toBe(0);
    expect(progressFraction(25_000, 20)).toBe(1);
  });
  it("is 0 for a zero-length dance", () => {
    expect(progressFraction(1000, 0)).toBe(0);
  });
});

describe("showReconnectBanner (FR-06)", () => {
  it("is true only when disconnected", () => {
    expect(showReconnectBanner("disconnected")).toBe(true);
    expect(showReconnectBanner("live")).toBe(false);
    expect(showReconnectBanner("simulated")).toBe(false);
    expect(showReconnectBanner(null)).toBe(false);
  });
});

describe("hrBadgeText (FR-08)", () => {
  it("always says Simulated for simulated readings", () => {
    for (const s of ["live", "holding", "none"] as const) expect(hrBadgeText("simulated", s)).toBe("Simulated");
  });
  it("describes the BLE state", () => {
    expect(hrBadgeText("ble", "live")).toBe("Live");
    expect(hrBadgeText("ble", "holding")).toBe("Holding");
    expect(hrBadgeText("ble", "none")).toBe("No signal");
  });
});
