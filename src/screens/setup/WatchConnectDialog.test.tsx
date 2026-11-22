/**
 * Owner: Mohamed
 * Purpose: SSR tests for the watch connect pop-up on Get Ready (effects don't run in SSR)
 * FRs: FR-04, FR-29
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WatchConnectDialog } from "./WatchConnectDialog";

const render = (open: boolean): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <WatchConnectDialog open={open} onClose={() => {}} />
    </MemoryRouter>,
  );

describe("WatchConnectDialog", () => {
  it("renders nothing while closed", () => {
    expect(render(false)).toBe("");
  });

  it("shows the connect panel in a labelled dialog, with Done instead of Continue", () => {
    const html = render(true);
    expect(html).toContain('<dialog class="watch-dialog" aria-labelledby="watch-dialog-title"');
    expect(html).toContain('id="watch-dialog-title"');
    expect(html).toContain("Connect your watch");
    expect(html).toContain(">Connect watch</button>");
    expect(html).toContain(">Done</button>");
    expect(html).not.toContain(">Continue</button>");
  });
});
