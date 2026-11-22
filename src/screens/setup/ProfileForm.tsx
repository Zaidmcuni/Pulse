/**
 * Owner: Mohamed
 * Purpose: the profile form used by /profile/setup (create, edit, new) and /signup (signup)
 * FRs: FR-01, FR-02
 */

import { useState, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { store } from "../../data/store";
import type { PlayerProfile, PosturalMode, Sex } from "../../types/pulse";
import {
  emptyFormValues,
  formValuesFromProfile,
  profileFromForm,
  validateProfileForm,
  type ProfileFormValues,
} from "./profileFormLogic";
import "./setup.css";

type TextField = "handle" | "displayName" | "age" | "weightKg" | "heightCm" | "restingHr" | "hrMaxOverride";

// Order used to focus the first invalid field after Save (sex and mode are radios and always valid).
const FIELD_ORDER: TextField[] = ["handle", "displayName", "age", "weightKg", "heightCm", "restingHr", "hrMaxOverride"];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const MODE_OPTIONS: { value: PosturalMode; label: string; description: string }[] = [
  { value: "standing", label: "Standing", description: "Full body: arms, torso and legs are scored." },
  { value: "seated", label: "Seated", description: "Upper body only: arms and torso are scored. For dancing in a chair or wheelchair." },
];

const fieldId = (name: keyof ProfileFormValues) => `profile-setup-${name}`;

interface TextInputProps {
  name: TextField;
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  helper?: string;
}

function TextInput({ name, label, value, error, onChange, inputMode, placeholder, helper }: TextInputProps): ReactElement {
  const id = fieldId(name);
  const describedBy = [helper ? `${id}-helper` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className="profile-setup-field">
      <label className="profile-setup-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="profile-setup-input"
        type="text"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && <p id={`${id}-helper`} className="profile-setup-helper">{helper}</p>}
      {error && <p id={`${id}-error`} className="profile-setup-error">{error}</p>}
    </div>
  );
}

function RadioGroup({ legend, children }: { legend: string; children: ReactNode }): ReactElement {
  return (
    <fieldset className="profile-setup-fieldset">
      <legend className="profile-setup-label">{legend}</legend>
      {children}
    </fieldset>
  );
}

export type FormMode = "create" | "edit" | "new" | "signup";

/**
 * Signup mode: no title of its own; `beforeFields` renders above the profile fields, `validateBefore` checks
 * that section on Save (and focuses its first invalid field), and `onSubmit` receives the valid values.
 */
export function ProfileForm(props: {
  existing: PlayerProfile | null;
  mode: FormMode;
  beforeFields?: ReactNode;
  validateBefore?: () => boolean;
  onSubmit?: (values: ProfileFormValues) => void;
}): ReactElement {
  const { existing, mode, beforeFields, validateBefore, onSubmit } = props;
  const navigate = useNavigate();
  const [values, setValues] = useState<ProfileFormValues>(() =>
    existing ? formValuesFromProfile(existing) : emptyFormValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  // Errors appear after the first Save attempt, then update live.
  const errors = submitted ? validateProfileForm(values) : {};

  function set<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function textProps(name: TextField) {
    return { name, value: values[name], error: errors[name], onChange: (v: string) => set(name, v) };
  }

  function handleSave(): void {
    setSubmitted(true);
    const beforeValid = validateBefore ? validateBefore() : true;
    const found = validateProfileForm(values);
    const firstInvalid = FIELD_ORDER.find((k) => found[k]);
    if (!beforeValid) return;
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }
    if (onSubmit) {
      onSubmit(values);
      return;
    }
    const profile = profileFromForm(values, existing, () => "p-" + crypto.randomUUID());
    store.saveProfile(profile);
    if (mode === "edit") {
      navigate("/profile/setup", { replace: true, state: { notice: "saved" } });
      return;
    }
    store.setActiveProfile(profile.id);
    navigate("/watch");
  }

  const title = mode === "new" ? "New profile" : mode === "edit" ? "Edit profile" : "Create your profile";
  const submitLabel = mode === "edit" ? "Save changes" : mode === "signup" ? "Create account" : "Save and continue";

  return (
      <form
        className="card profile-setup-card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {mode !== "signup" && <h1 className="profile-setup-title">{title}</h1>}
        {beforeFields}
        <p className="profile-setup-privacy">
          Your age, weight, height and heart rate stay on this device. They're never shown on posts or to other dancers.
        </p>

        <TextInput {...textProps("handle")} label="Handle" placeholder="@yourname" />
        <TextInput {...textProps("displayName")} label="Display name" />
        <TextInput {...textProps("age")} label="Age" inputMode="numeric" />

        <RadioGroup legend="Sex">
          <div className="profile-setup-radios">
            {SEX_OPTIONS.map((o) => (
              <label key={o.value} className="profile-setup-radio" htmlFor={`${fieldId("sex")}-${o.value}`}>
                <input
                  id={`${fieldId("sex")}-${o.value}`}
                  type="radio"
                  name="profile-setup-sex"
                  value={o.value}
                  checked={values.sex === o.value}
                  onChange={() => set("sex", o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </RadioGroup>

        <TextInput {...textProps("weightKg")} label="Weight (kg)" inputMode="decimal" helper="Used only to estimate calories." />
        <TextInput {...textProps("heightCm")} label="Height (cm)" inputMode="decimal" />
        <TextInput
          {...textProps("restingHr")}
          label="Resting heart rate (bpm, optional)"
          inputMode="numeric"
          placeholder="65"
          helper="We measure your starting heart rate before each dance. This is only used if your watch can't. Leave empty to use 65."
        />
        <TextInput
          {...textProps("hrMaxOverride")}
          label="Max heart rate (bpm, optional)"
          inputMode="numeric"
          helper="Leave empty and we'll estimate it from your age."
        />

        <RadioGroup legend="Mode">
          <div className="profile-setup-modes">
            {MODE_OPTIONS.map((o) => (
              <label
                key={o.value}
                htmlFor={`${fieldId("mode")}-${o.value}`}
                className={`profile-setup-mode${values.mode === o.value ? " profile-setup-mode-selected" : ""}`}
              >
                <input
                  id={`${fieldId("mode")}-${o.value}`}
                  type="radio"
                  name="profile-setup-mode"
                  value={o.value}
                  checked={values.mode === o.value}
                  onChange={() => set("mode", o.value)}
                />
                <span className="profile-setup-mode-text">
                  <strong>{o.label}</strong>
                  <span className="profile-setup-helper">{o.description}</span>
                </span>
              </label>
            ))}
          </div>
        </RadioGroup>

        <div className="profile-setup-actions">
          <button type="submit" className="btn btn-primary">{submitLabel}</button>
          {mode === "new" && (
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/profile/setup")}>Cancel</button>
          )}
          {mode === "signup" && (
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/login")}>Cancel</button>
          )}
          {mode === "edit" && (
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/profile/setup", { replace: true })}>Cancel</button>
          )}
        </div>
      </form>
  );
}
