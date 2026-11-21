/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for the watch connect screen (Vitest node environment)
 * FRs: FR-04, FR-06, FR-08
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
  it("shows the not-connected state with no active monitor", () => {
    const html = renderWatch();
    expect(html).toContain("Connect your watch");
    expect(html).toContain('<span class="badge">Not connected</span>');
    expect(html).toContain("--");
    expect(html).toContain(">Connect watch</button>");
    expect(html).toContain(">Use simulated heart rate</button>");
    expect(continueButton(html)).toContain("disabled");
  });

  it("labels an active simulated monitor Simulated and allows Continue", () => {
    setActiveMonitor(fakeMonitor("simulated"));
    const html = renderWatch();
    expect(html).toContain('<span class="badge">Simulated</span>');
    expect(html).toContain("Simulated heart rate");
    expect(html).toContain('<p class="watch-connect-bpm-simulated">Simulated</p>');
    expect(html).not.toContain(">Use simulated heart rate</button>");
    expect(continueButton(html)).not.toBe("");
    expect(continueButton(html)).not.toContain("disabled");
  });

  it("hides Connect and allows Continue for a live BLE monitor", () => {
    setActiveMonitor(fakeMonitor("live"));
    const html = renderWatch();
    expect(html).toContain('<span class="badge">Live</span>');
    expect(html).toContain("WHOOP / Garmin");
    expect(html).not.toContain(">Connect watch</button>");
    expect(html).not.toContain(">Reconnect</button>");
    expect(continueButton(html)).not.toBe("");
    expect(continueButton(html)).not.toContain("disabled");
  });
});
