/**
 * Owner: Mohamed
 * Purpose: Create account screen (/signup): email + password, then the existing profile form
 * FRs: FR-01 (same profile fields and validation), FR-03 (one account per person on this laptop)
 */

import { useState, type ReactElement } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { accounts, isValidEmail, MIN_PASSWORD_LENGTH } from "../../auth/accounts";
import { ProfileForm } from "./ProfileForm";
import { profileFromForm, type ProfileFormValues } from "./profileFormLogic";
import "./setup.css";

type AccountField = "email" | "password" | "confirm";
type AccountErrors = Partial<Record<AccountField, string>>;

const ACCOUNT_ORDER: AccountField[] = ["email", "password", "confirm"];
const accountId = (name: AccountField) => `signup-${name}`;

function validateAccount(email: string, password: string, confirm: string): AccountErrors {
  const errors: AccountErrors = {};
  if (!isValidEmail(email)) errors.email = "Enter a valid email";
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (confirm !== password) errors.confirm = "Passwords don't match";
  return errors;
}

function AccountInput(props: {
  name: AccountField; label: string; type: "email" | "password"; autoComplete: string;
  value: string; error: string | undefined; helper?: string; onChange: (value: string) => void;
}): ReactElement {
  const { name, label, type, autoComplete, value, error, helper, onChange } = props;
  const id = accountId(name);
  const describedBy = [helper ? `${id}-helper` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className="profile-setup-field">
      <label className="profile-setup-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="profile-setup-input"
        type={type}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && <p id={`${id}-helper`} className="profile-setup-helper">{helper}</p>}
      {error && <p id={`${id}-error`} className="profile-setup-error">{error}</p>}
    </div>
  );
}

export default function SignupScreen(): ReactElement {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);

  if (accounts.isSignedIn()) return <Navigate to="/me" replace />;

  // Errors appear after the first submit, then update live.
  const errors = submitted ? validateAccount(email, password, confirm) : {};
  if (!errors.email && emailTaken) errors.email = "An account already uses this email";

  function validateBefore(): boolean {
    setSubmitted(true);
    const first = ACCOUNT_ORDER.find((k) => validateAccount(email, password, confirm)[k]);
    if (first) document.getElementById(accountId(first))?.focus();
    return first === undefined;
  }

  async function handleSubmit(values: ProfileFormValues): Promise<void> {
    const profile = profileFromForm(values, null, () => "p-" + crypto.randomUUID());
    const result = await accounts.signUp(profile, email, password);
    if (result === "email-taken") {
      setEmailTaken(true);
      document.getElementById(accountId("email"))?.focus();
      return;
    }
    navigate("/watch");
  }

  const accountSection = (
    <>
      <h1 className="profile-setup-title">Create your account</h1>
      <fieldset className="profile-setup-fieldset auth-account-section">
        <legend className="profile-setup-label">Account</legend>
        <AccountInput
          name="email" label="Email" type="email" autoComplete="email" value={email} error={errors.email}
          onChange={(v) => { setEmail(v); setEmailTaken(false); }}
        />
        <AccountInput
          name="password" label="Password" type="password" autoComplete="new-password" value={password}
          error={errors.password} helper={`At least ${MIN_PASSWORD_LENGTH} characters`} onChange={setPassword}
        />
        <AccountInput
          name="confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm}
          error={errors.confirm} onChange={setConfirm}
        />
      </fieldset>
    </>
  );

  return (
    <main className="profile-setup">
      <div className="auth-page">
        <ProfileForm
          existing={null}
          mode="signup"
          beforeFields={accountSection}
          validateBefore={validateBefore}
          onSubmit={(values) => void handleSubmit(values)}
        />
        <Link className="auth-link" to="/login">Already have an account? Log in</Link>
      </div>
    </main>
  );
}
