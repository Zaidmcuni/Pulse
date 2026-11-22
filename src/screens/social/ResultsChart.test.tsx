/**
 * Owner: Ali
 * Written: Toufic (UI sprint, #142)
 * Purpose: server-render tests for the Results heart-rate / accuracy chart card.
 * FRs: FR-29, FR-35
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { HeartRateSource, SessionResult } from "../../types/pulse";
import { ResultsChart } from "./ResultsChart";

const HR_MAX = 194;

function withHeartRates(bpms: number[], hrSource: HeartRateSource = "ble"): SessionResult {
  return {
    ...FAKE_RESULT,
    durationSec: bpms.length,
    samples: bpms.map((heartRate, tSec) => ({ tSec, heartRate, hrSource, effort: 0, accuracy: 0.5 + (tSec % 5) / 10, points: 0 })),
  };
}

describe("ResultsChart", () => {
  // 10 easy (100), 20 moderate (125), 5 dropped, 20 hard (150), 10 max (180)
  const watchRun = withHeartRates([
    ...Array<number>(10).fill(100),
    ...Array<number>(20).fill(125),
    ...Array<number>(5).fill(0),
    ...Array<number>(20).fill(150),
    ...Array<number>(10).fill(180),
  ]);

  it("draws the heart-rate curve with zone bands, a gap where the watch dropped, and time in each zone", () => {
    const html = renderToStaticMarkup(<ResultsChart result={watchRun} hrMax={HR_MAX} />);
    expect(html).toContain(">Heart rate</h2>");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.match(/<polyline/g)).toHaveLength(2);
    expect(html).toContain('class="results-chart-band is-easy"');
    expect(html).toContain('class="results-chart-band is-max"');
    expect(html).toContain("Across the song, shaded by effort zone.");
    expect(html).toContain("Easy 0:10</li>");
    expect(html).toContain("Moderate 0:20</li>");
    expect(html).toContain("Hard 0:20</li>");
    expect(html).toContain("Max 0:10</li>");
    expect(html).toContain("<span>1:05</span>");
    expect(html).not.toContain("NaN");
  });

  it("never shows HRmax, age or the Effort card's average and peak", () => {
    const html = renderToStaticMarkup(<ResultsChart result={watchRun} hrMax={HR_MAX} />);
    expect(html).not.toContain(String(HR_MAX));
    expect(html).not.toMatch(/\bage\b|\bbpm\b|avg|peak/i);
  });

  it("falls back to accuracy over the song without a watch", () => {
    const html = renderToStaticMarkup(<ResultsChart result={withHeartRates(Array<number>(20).fill(0), "none")} hrMax={HR_MAX} />);
    expect(html).toContain(">Accuracy over the song</h2>");
    expect(html).toContain("Your best moment: 90% at 0:04.");
    expect(html.match(/<polyline/g)).toHaveLength(1);
    expect(html).not.toContain("results-chart-band");
    expect(html).not.toMatch(/heart|watch/i);
  });

  it("uses the accuracy fallback for simulated heart rate, too little watch data or an unknown profile", () => {
    for (const html of [
      renderToStaticMarkup(<ResultsChart result={withHeartRates(Array<number>(20).fill(130), "simulated")} hrMax={HR_MAX} />),
      renderToStaticMarkup(<ResultsChart result={withHeartRates(Array<number>(5).fill(130))} hrMax={HR_MAX} />),
      renderToStaticMarkup(<ResultsChart result={watchRun} hrMax={null} />),
    ]) {
      expect(html).toContain(">Accuracy over the song</h2>");
      expect(html).not.toContain(">Heart rate</h2>");
    }
  });

  it("renders nothing with fewer than two seconds of data", () => {
    expect(renderToStaticMarkup(<ResultsChart result={{ ...FAKE_RESULT, samples: [] }} hrMax={HR_MAX} />)).toBe("");
    expect(renderToStaticMarkup(<ResultsChart result={{ ...FAKE_RESULT, samples: FAKE_RESULT.samples.slice(0, 1) }} hrMax={HR_MAX} />)).toBe("");
  });
});
