/**
 * Owner: Mohamed
 * Purpose: Tests for the shared active heart-rate monitor
 * FRs: FR-04, FR-06, FR-08
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeartRateMonitor } from "../types/pulse";
import { getActiveMonitor, setActiveMonitor } from "./activeMonitor";

function fakeMonitor(): HeartRateMonitor {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    status: vi.fn(() => "disconnected" as const),
  };
}

afterEach(() => setActiveMonitor(null));

describe("activeMonitor", () => {
  it("starts null", () => {
    expect(getActiveMonitor()).toBeNull();
  });

  it("returns the monitor that was set", () => {
    const m = fakeMonitor();
    setActiveMonitor(m);
    expect(getActiveMonitor()).toBe(m);
  });

  it("disconnects the old monitor when replaced", () => {
    const a = fakeMonitor();
    const b = fakeMonitor();
    setActiveMonitor(a);
    setActiveMonitor(b);
    expect(a.disconnect).toHaveBeenCalledTimes(1);
    expect(b.disconnect).not.toHaveBeenCalled();
    expect(getActiveMonitor()).toBe(b);
  });

  it("does not disconnect when the same monitor is set again", () => {
    const m = fakeMonitor();
    setActiveMonitor(m);
    setActiveMonitor(m);
    expect(m.disconnect).not.toHaveBeenCalled();
  });

  it("setActiveMonitor(null) disconnects and clears", () => {
    const m = fakeMonitor();
    setActiveMonitor(m);
    setActiveMonitor(null);
    expect(m.disconnect).toHaveBeenCalledTimes(1);
    expect(getActiveMonitor()).toBeNull();
  });
});
