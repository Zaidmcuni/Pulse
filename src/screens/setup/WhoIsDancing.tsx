/**
 * Owner: Mohamed
 * Purpose: "Who's dancing?" (/who): the front door. One tap for dancers remembered on this laptop,
 *          a password once for the others, a shared Guest, and a quick start with name, handle and mode.
 * FRs: FR-01, FR-03, FR-02 (only names and handles are shown), NFR-06
 */

import { useState, type FormEvent, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { accounts, type DancerSummary } from "../../auth/accounts";
import { store } from "../../data/store";
import type { PosturalMode } from "../../types/pulse";
import { displayHandle, initialOf, modeLabel } from "./switcherHelpers";
import { GUEST_ID, guestProfile, handleTaken, quickStartProfile, validateQuickStart, type QuickErrors } from "./whoDancingLogic";
import "./setup.css";

export default function WhoIsDancing(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [askingFor, setAskingFor] = useState<DancerSummary | null>(null);
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [mode, setMode] = useState<PosturalMode>("standing");
  const [errors, setErrors] = useState<QuickErrors>({});

  const activeId = accounts.signedInProfileId();
  const dancers = accounts.listDancers().filter((d) => d.profileId !== GUEST_ID);
  const go = (): void => { void navigate(from && from !== "/who" ? from : "/dances", { replace: true }); };

  function pick(dancer: DancerSummary): void {
    setCreating(false);
    if (accounts.switchTo(dancer.profileId)) return go();
    setAskingFor(dancer);
    setPassword("");
    setWrong(false);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!askingFor) return;
    setChecking(true);
    const result = await accounts.logIn(accounts.emailFor(askingFor.profileId) ?? "", password);
    setChecking(false);
    if (result === "ok") return go();
    setWrong(true);
    setPassword("");
  }

  function startGuest(): void {
    if (!accounts.switchTo(GUEST_ID)) accounts.startLocal(guestProfile());
    go();
  }

  function submitNew(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validateQuickStart(name, handle);
    if (!found.handle && handleTaken(handle, store.listProfiles())) found.handle = "That handle is taken. Try another.";
    setErrors(found);
    if (found.displayName || found.handle) return;
    accounts.startLocal(quickStartProfile(name, handle, mode, () => "p-" + crypto.randomUUID()));
    go();
  }

  return (
    <main className="who">
      <header className="who-head">
        <p className="who-brand">PULSE</p>
        <h1 className="who-title">Who&rsquo;s dancing?</h1>
        <p className="who-pitch">Dance along to a song. Your webcam and watch score you.</p>
      </header>

      <ul className="who-grid">
        {dancers.map((d) => (
          <li key={d.profileId}>
            <button
              type="button"
              className={`who-tile${d.profileId === activeId ? " is-active" : ""}${askingFor?.profileId === d.profileId ? " is-asking" : ""}`}
              onClick={() => pick(d)}
            >
              <span className="who-avatar" aria-hidden="true">{initialOf(d.displayName)}</span>
              <span className="who-name">{d.displayName}</span>
              <span className="who-handle">{displayHandle(d.handle)}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="who-tile who-tile-quiet" onClick={startGuest}>
            <span className="who-avatar" aria-hidden="true">G</span>
            <span className="who-name">Guest</span>
            <span className="who-handle">No account needed</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`who-tile who-tile-quiet${creating ? " is-asking" : ""}`}
            onClick={() => { setCreating(true); setAskingFor(null); }}
          >
            <span className="who-avatar" aria-hidden="true">+</span>
            <span className="who-name">New dancer</span>
            <span className="who-handle">Name and go</span>
          </button>
        </li>
      </ul>

      {askingFor && (
        <form className="card who-panel" onSubmit={(e) => void submitPassword(e)} noValidate>
          <h2>Welcome back, {askingFor.displayName}</h2>
          <p className="profile-setup-helper">Enter your password once. Next time on this laptop, one tap is enough.</p>
          <div className="profile-setup-field">
            <label className="profile-setup-label" htmlFor="who-password">Password</label>
            <input
              id="who-password"
              className="profile-setup-input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              aria-invalid={wrong ? true : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {wrong && <p className="profile-setup-error" role="alert">That password didn&rsquo;t match. Try again.</p>}
          <div className="profile-setup-actions">
            <button type="submit" className="btn btn-primary" disabled={checking}>{checking ? "Checking…" : "Let’s dance"}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setAskingFor(null)}>Cancel</button>
          </div>
        </form>
      )}

      {creating && (
        <form className="card who-panel" onSubmit={submitNew} noValidate>
          <h2>New dancer</h2>
          <div className="profile-setup-field">
            <label className="profile-setup-label" htmlFor="who-name">Name</label>
            <input
              id="who-name" className="profile-setup-input" autoFocus value={name}
              aria-invalid={errors.displayName ? true : undefined}
              aria-describedby={errors.displayName ? "who-name-error" : undefined}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.displayName && <p id="who-name-error" className="profile-setup-error">{errors.displayName}</p>}
          </div>
          <div className="profile-setup-field">
            <label className="profile-setup-label" htmlFor="who-handle">Handle</label>
            <input
              id="who-handle" className="profile-setup-input" value={handle} placeholder="e.g. mina-moves"
              aria-invalid={errors.handle ? true : undefined}
              aria-describedby={errors.handle ? "who-handle-error" : undefined}
              onChange={(e) => setHandle(e.target.value)}
            />
            {errors.handle && <p id="who-handle-error" className="profile-setup-error">{errors.handle}</p>}
          </div>
          <fieldset className="profile-setup-fieldset">
            <legend className="profile-setup-label">How will you dance?</legend>
            <div className="mode-toggle" role="radiogroup" aria-label="Dance mode">
              {(["standing", "seated"] as const).map((m) => (
                <label key={m} className={`mode-toggle-option${mode === m ? " is-on" : ""}`}>
                  <input type="radio" name="who-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {modeLabel(m)}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="profile-setup-helper">Add your age, weight and height later in Me for better calorie estimates. They stay private.</p>
          <div className="profile-setup-actions">
            <button type="submit" className="btn btn-primary">Start dancing</button>
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      <p className="who-foot">
        <Link className="auth-link" to="/login">Log in with email</Link>
        <span aria-hidden="true"> · </span>
        <Link className="auth-link" to="/signup">Create an account with email</Link>
      </p>
    </main>
  );
}
