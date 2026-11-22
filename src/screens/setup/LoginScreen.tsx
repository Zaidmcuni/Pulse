/**
 * Owner: Mohamed
 * Purpose: Log in screen (/login): email + password against the local accounts adapter, plus this laptop's accounts
 * FRs: FR-03 (switching person = log out + log in), NFR-06 (demo accounts share one known password), FR-02 (no emails listed)
 */

import { useRef, useState, type ReactElement } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { accounts, DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "../../auth/accounts";
import { displayHandle } from "./switcherHelpers";
import "./setup.css";

export default function LoginScreen(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (accounts.isSignedIn()) return <Navigate to="/dances" replace />;

  const from = (location.state as { from?: string } | null)?.from;
  const list = accounts.listAccounts();

  async function handleSubmit(): Promise<void> {
    setChecking(true);
    const result = await accounts.logIn(email, password);
    setChecking(false);
    if (result === "ok") {
      navigate(from ?? "/dances", { replace: true });
      return;
    }
    setWrong(true);
    setPassword("");
    passwordRef.current?.focus();
  }

  function pick(accountEmail: string): void {
    setEmail(accountEmail);
    setWrong(false);
    passwordRef.current?.focus();
  }

  return (
    <main className="profile-setup">
      <div className="auth-page">
        <form
          className="card profile-setup-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <h1 className="profile-setup-title">Log in to PULSE</h1>
          <p className="auth-subtitle">Dance, sweat, share.</p>

          <div className="profile-setup-field">
            <label className="profile-setup-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="profile-setup-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="profile-setup-field">
            <label className="profile-setup-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              ref={passwordRef}
              className="profile-setup-input"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={wrong ? true : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {wrong && <p className="profile-setup-error" role="alert">Email or password is incorrect.</p>}

          <div className="profile-setup-actions">
            <button type="submit" className="btn btn-primary" disabled={checking}>{checking ? "Logging in…" : "Log in"}</button>
          </div>

          <Link className="auth-link" to="/signup">New here? Create an account</Link>
          <p className="profile-setup-helper">
            Demo accounts: {"{handle}"}@{DEMO_EMAIL_DOMAIN} · password {DEMO_PASSWORD}
          </p>
        </form>

        {list.length > 0 && (
          <section className="auth-accounts" aria-labelledby="auth-accounts-title">
            <h2 id="auth-accounts-title" className="auth-accounts-title">Accounts on this laptop</h2>
            <div className="auth-accounts-list">
              {list.map((a) => (
                <button key={a.profileId} type="button" className="btn btn-secondary auth-account" onClick={() => pick(a.email)}>
                  <strong>{a.displayName}</strong>
                  <span className="profile-switcher-handle">{displayHandle(a.handle)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
