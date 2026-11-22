/**
 * Owner: Mohamed
 * Purpose: Medal art: labels, locked styling, club text, tier colours and unique SVG ids.
 * FRs: FR-46
 */

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BadgeIcon } from "./BadgeIcon";
import { BADGE_CATALOGUE } from "./catalogue";

it("renders an svg with the right label for every badge, earned and locked", () => {
  for (const { id, name } of BADGE_CATALOGUE) {
    const earned = renderToStaticMarkup(<BadgeIcon id={id} earned />);
    const locked = renderToStaticMarkup(<BadgeIcon id={id} earned={false} />);
    expect(earned).toMatch(/^<svg/);
    expect(earned).toContain(`aria-label="${name} badge, earned"`);
    expect(locked).toContain(`aria-label="${name} badge, locked"`);
  }
  expect(BADGE_CATALOGUE).toHaveLength(9);
});

it("greys out and padlocks only locked badges", () => {
  const earned = renderToStaticMarkup(<BadgeIcon id="on_fire" earned />);
  const locked = renderToStaticMarkup(<BadgeIcon id="on_fire" earned={false} />);
  expect(locked).toContain("badge-icon-lock");
  expect(locked).toContain('type="saturate" values="0"');
  expect(locked).toContain(' opacity="0.35"');
  expect(earned).not.toContain("badge-icon-lock");
  expect(earned).not.toContain("saturate");
  expect(earned).not.toContain(' opacity="0.35"');
});

it("writes the club amount and uses the tier ring colour", () => {
  const clubs = [["1k_club", "1K"], ["3k_club", "3K"], ["5k_club", "5K"], ["10k_club", "10K"]] as const;
  for (const [id, text] of clubs) expect(renderToStaticMarkup(<BadgeIcon id={id} earned />)).toContain(`>${text}</text>`);
  expect(renderToStaticMarkup(<BadgeIcon id="1k_club" earned />)).toContain('stroke="#cd7f32"');
  expect(renderToStaticMarkup(<BadgeIcon id="10k_club" earned />)).toContain('stroke="#7dd3fc"');
});

it("gives two icons of the same badge different gradient ids", () => {
  const html = renderToStaticMarkup(<><BadgeIcon id="podium" earned={false} /><BadgeIcon id="podium" earned={false} /></>);
  const ids = [...html.matchAll(/<radialGradient id="([^"]+)"/g)].map((match) => match[1]);
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
  expect(ids[0]).toContain("podium");
});
