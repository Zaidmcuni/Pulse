/**
 * Owner: Mohamed
 * Purpose: Account screen order: watch first, profile form open for editing, Log out last.
 * FRs: FR-01, FR-02, FR-03
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { beforeEach, expect, it } from "vitest";
import App from "../../App";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";

beforeEach(async () => {
  accounts.logOut();
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
});

it("shows the watch row first, the edit form open, and Log out last", () => {
  const html = renderToStaticMarkup(<StaticRouter location="/account"><App /></StaticRouter>);
  const main = html.slice(html.indexOf('<main class="profile-setup">'));
  const watch = main.indexOf("account-row");
  const form = main.indexOf("Edit profile");
  const save = main.indexOf("Save changes");
  const logOut = main.indexOf(">Log out</button>");
  expect(watch).toBeGreaterThan(-1);
  expect(main).toContain('href="/watch"');
  expect(form).toBeGreaterThan(watch);
  expect(save).toBeGreaterThan(form);
  expect(logOut).toBeGreaterThan(save);
});
