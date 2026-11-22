/**
 * Owner: Mohamed
 * Purpose: server-render tests for the Moves and Effort cards.
 * FRs: FR-29, FR-35
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { HeartRateSource, SessionResult } from "../types/pulse";
import { EffortCard } from "./EffortCard";
import { MovesCard } from "./MovesCard";

const HR_MAX = 194;

function withHeartRates(bpms: number[], hrSource: HeartRateSource = "ble"): SessionResult {
  return {
    ...FAKE_RESULT,
    samples: bpms.map((heartRate, tSec) => ({ tSec, heartRate, hrSource, effort: 0, accuracy: 0.78, points: 0 })),
  };
}

describe("EffortCard", () => {
  // 10 easy (100), 20 moderate (125), 20 hard (150), 10 max (180) -> shares 1/6, 1/3, 1/3, 1/6; max 16.7%, hard + max 50% -> Hard
  const result = withHeartRates([
    ...Array<number>(10).fill(100),
    ...Array<number>(20).fill(125),
    ...Array<number>(20).fill(150),
    ...Array<number>(10).fill(180),
  ]);

  it("shows the level, the zone bar and the bpm line", () => {
    const html = renderToStaticMarkup(<EffortCard result={result} hrMax={HR_MAX} />);
    expect(html).toContain(">Effort</h2>");
    expect(html).toContain('class="health-card-value is-hard">Hard</p>');
    expect(html).toContain("Avg 138 bpm · Peak 180 bpm · 0.8 active min");
    const widths = [...html.matchAll(/<span class="is-(\w+)" style="width:([\d.]+)%"/g)].map((m) => [m[1], Number(m[2])]);
    expect(widths.map(([zone]) => zone)).toEqual(["easy", "moderate", "hard", "max"]);
    const expected = [1 / 6, 1 / 3, 1 / 3, 1 / 6];
    widths.forEach(([, width], i) => expect(width).toBeCloseTo(expected[i] * 100, 6));
    expect(html).toContain("Easy</li>");
    expect(html).toContain("Max</li>");
  });

  it("lists only zones with time in the legend", () => {
    const html = renderToStaticMarkup(<EffortCard result={withHeartRates(Array<number>(60).fill(150))} hrMax={HR_MAX} />);
    expect(html).toContain("Hard</li>");
    expect(html).not.toMatch(/(Easy|Moderate|Max)<\/li>/);
  });

  it("never shows the HRmax value or age", () => {
    const html = renderToStaticMarkup(<EffortCard result={result} hrMax={HR_MAX} />);
    expect(html).not.toContain(String(HR_MAX));
    expect(html).not.toMatch(/\bage\b/i);
  });

  it("shows -- and a hint without a watch", () => {
    const html = renderToStaticMarkup(<EffortCard result={withHeartRates(Array<number>(60).fill(0), "none")} hrMax={HR_MAX} />);
    expect(html).toContain(">--</p>");
    expect(html).toContain("No watch: connect one to see your effort");
    expect(html).not.toContain("health-zone-bar");
  });

  it("shows -- when the watch gave too little data", () => {
    const html = renderToStaticMarkup(<EffortCard result={withHeartRates(Array<number>(5).fill(150))} hrMax={HR_MAX} />);
    expect(html).toContain(">--</p>");
    expect(html).toContain("Not enough heart-rate data");
    expect(html).not.toContain("health-zone-bar");
  });

  it("shows -- when the profile is unknown", () => {
    const html = renderToStaticMarkup(<EffortCard result={result} hrMax={null} />);
    expect(html).toContain(">--</p>");
  });
});

describe("MovesCard", () => {
  it("shows the medal and accuracy", () => {
    const html = renderToStaticMarkup(<MovesCard level="gold" accuracyPct={78} />);
    expect(html).toContain(">Moves</h2>");
    expect(html).toContain('<span class="session-results-medal is-gold">gold</span>');
    expect(html).toContain("78% accuracy");
  });
});
