/**
 * Owner: Ali
 * Purpose: Verify rendered handles for current and legacy profiles.
 * FRs: FR-39, FR-41, FR-44
 */

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { PlayerProfile } from "../../types/pulse";
import { displayHandle } from "../setup/switcherHelpers";

it.each([
  ["amira-steps", "@amira-steps"],
  ["@demo", "@demo"],
])("renders profile handle %s as %s", (handle, expected) => {
  const profile: Pick<PlayerProfile, "handle"> = { handle };
  expect(renderToStaticMarkup(<span>{displayHandle(profile.handle)}</span>)).toBe(`<span>${expected}</span>`);
});
