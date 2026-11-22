/**
 * Owner: Mohamed
 * Purpose: SSR rendering tests for /login, /signup and the auth gate (Vitest node environment, memory store)
 * FRs: FR-01, FR-02, FR-03, NFR-06
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, StaticRouter } from "react-router-dom";
import App from "../../App";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import LoginScreen from "./LoginScreen";
import { RequireAuth } from "./RequireAuth";
import SignupScreen from "./SignupScreen";

// Navigate is a no-op during static rendering, so record where each one points.
const navigations: string[] = [];
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  Navigate: ({ to }: { to: string }) => { navigations.push(to); return null; },
}));

function render(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/signup" element={<SignupScreen />} />
        <Route path="/private" element={<RequireAuth><p>secret child</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  accounts.logOut();
  navigations.length = 0;
});

describe("LoginScreen", () => {
  it("shows the title, labelled fields, sign-up link and demo hint", () => {
    const html = render("/login");
    expect(html).toContain("Log in to PULSE");
    expect(html).toContain("Dance, sweat, share.");
    expect(html).toMatch(/<label[^>]*for="login-email"[^>]*>Email<\/label>/);
    expect(html).toMatch(/<label[^>]*for="login-password"[^>]*>Password<\/label>/);
    expect(html).toMatch(/<input id="login-email"[^>]*type="email"[^>]*autoComplete="email"/);
    expect(html).toMatch(/<input id="login-password"[^>]*type="password"[^>]*autoComplete="current-password"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Log in<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/signup"[^>]*>New here\? Create an account<\/a>/);
    expect(html).toContain("Demo accounts: {handle}@pulse.demo · password dance123");
    expect(html).not.toMatch(/secure/i);
  });

  it("prefills the email from ?email=", () => {
    const html = render("/login?email=x%40y.co");
    expect(html).toMatch(/<input id="login-email"[^>]*value="x@y.co"/);
  });

  it("lists this laptop's accounts by name and handle, never by email", () => {
    const html = render("/login");
    expect(html).toContain("Accounts on this laptop");
    expect(html).toContain("Demo Dancer");
    expect(html).toContain("@demo<");
    expect(html).not.toContain("demo@pulse.demo");
  });

  it("redirects away when already signed in", async () => {
    await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
    expect(render("/login")).toBe("");
  });
});

describe("SignupScreen", () => {
  it("shows the account section, the profile fields and Create account", () => {
    const html = render("/signup");
    expect(html).toContain("Create your account");
    expect(html).toMatch(/<label[^>]*for="signup-email"[^>]*>Email<\/label>/);
    expect(html).toMatch(/<label[^>]*for="signup-password"[^>]*>Password<\/label>/);
    expect(html).toMatch(/<label[^>]*for="signup-confirm"[^>]*>Confirm password<\/label>/);
    expect(html).toMatch(/<input id="signup-password"[^>]*autoComplete="new-password"/);
    expect(html).toContain("At least 8 characters");
    expect(html).toContain(">Handle</label>");
    expect(html).toContain(">Age</label>");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Create account<\/button>/);
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Already have an account\? Log in<\/a>/);
    expect(html).not.toContain("Create your profile");
    expect(html).not.toContain("Save and continue");
  });

  it("gives every input a matching label", () => {
    const html = render("/signup");
    const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    const labelFors = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(15); // 3 account fields + 12 profile inputs
    for (const id of ids) expect(labelFors).toContain(id);
  });
});

describe("RequireAuth", () => {
  it("renders nothing from the child when signed out", () => {
    expect(render("/private")).not.toContain("secret child");
  });

  it("renders the child when signed in", async () => {
    await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
    expect(render("/private")).toContain("secret child");
  });
});

describe("Me is the landing page", () => {
  it("sends a signed-in visit to / to /me", async () => {
    await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
    renderToStaticMarkup(<StaticRouter location="/"><App /></StaticRouter>);
    expect(navigations).toEqual(["/me"]);
  });

  it("sends an already signed-in visit to /login or /signup to /me", async () => {
    await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
    render("/login");
    render("/signup");
    expect(navigations).toEqual(["/me", "/me"]);
  });

  it("sends a signed-out visit to / to /who, remembering where it was headed", () => {
    renderToStaticMarkup(<StaticRouter location="/"><App /></StaticRouter>);
    expect(navigations).toEqual(["/who"]);
  });
});
