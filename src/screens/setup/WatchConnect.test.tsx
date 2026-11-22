/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for the watch connect screen (Vitest node environment)
 * FRs: FR-04, FR-06, FR-29
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveMonitor } from "../../hr/activeMonitor";
import type { HeartRateMonitor, HeartRateStatus } from "../../types/pulse";
import WatchConnect from "./WatchConnect";

function fakeMonitor(status: HeartRateStatus): HeartRateMonitor {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    status: () => status,
  };
}

function renderWatch(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/watch"]}>
      <Routes>
        <Route path="/watch" element={<WatchConnect />} />
      </Routes>
    </MemoryRouter>,
  );
}

const continueButton = (html: string) => html.match(/<button[^>]*>Continue<\/button>/)?.[0] ?? "";

afterEach(() => setActiveMonitor(null));

describe("WatchConnect", () => {
  it("shows the not-connected state with no active monitor; Continue still enabled (FR-29)", () => {
    const html = renderWatch();
    expect(html).toContain("Connect your watch");
    expect(html).toContain('<span class="badge">Not connected</span>');
    expect(html).toContain("--");
    expect(html).toContain(">Connect watch</button>");
    expect(continueButton(html)).not.toBe("");
    expect(continueButton(html)).not.toContain("disabled");
    expect(html).toContain("No watch? You can still dance: points will come from your moves.");
  });

  it("never mentions simulated heart rate", () => {
    for (const m of [null, fakeMonitor("simulated"), fakeMonitor("disconnected"), fakeMonitor("live")]) {
      setActiveMonitor(m);
      const html = renderWatch();
      expect(html).not.toContain("Simulated");
      expect(html.toLowerCase()).not.toContain("simulated heart rate");
    }
  });

  it("hides Connect and allows Continue for a live BLE monitor", () => {
    setActiveMonitor(fakeMonitor("live"));
    const html = renderWatch();
    expect(html).toContain('<span class="badge watch-connect-badge-live">Live</span>');
    expect(html).not.toContain("No watch? You can still dance");
    expect(html).toContain("WHOOP / Garmin");
    expect(html).not.toContain(">Connect watch</button>");
    expect(html).not.toContain(">Reconnect</button>");
    expect(continueButton(html)).not.toBe("");
    expect(continueButton(html)).not.toContain("disabled");
  });

  it("shows Disconnect for a live BLE monitor", () => {
    setActiveMonitor(fakeMonitor("live"));
    expect(renderWatch()).toContain(">Disconnect</button>");
  });

  it("hides Disconnect with no active monitor", () => {
    expect(renderWatch()).not.toContain(">Disconnect</button>");
  });
});
