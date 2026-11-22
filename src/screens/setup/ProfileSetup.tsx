/**
 * Owner: Mohamed
 * Purpose: ProfileSetup screen (/profile/setup)
 * FRs: FR-01, FR-02, FR-03, NFR-06
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { accounts } from "../../auth/accounts";
import { store } from "../../data/store";
import { CurrentProfileCard } from "./CurrentProfileCard";
import { ProfileForm } from "./ProfileForm";
import { ProfileSwitcher } from "./ProfileSwitcher";
import "./setup.css";

export default function ProfileSetup(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // A new person now creates an account (FR-03: switching person = log out + log in). logOut is idempotent.
  if (searchParams.get("new") === "1") {
    accounts.logOut();
    return <Navigate to="/signup" replace />;
  }

  const profiles = store.listProfiles();
  const active = store.getActiveProfile();

  function logOutTo(path: string): void {
    accounts.logOut();
    navigate(path);
  }

  function handleLogIn(id: string): void {
    logOutTo("/login?email=" + encodeURIComponent(accounts.emailFor(id) ?? ""));
  }

  // The form views. Each is keyed so it always starts from saved (or empty) values.
  let form: ReactElement | null = null;
  if (profiles.length === 0 || !active) {
    // Edit with no active profile falls back to first run; profiles but no active one shows the overview.
    if (profiles.length === 0 || searchParams.get("edit") === "1") form = <ProfileForm key="create" existing={null} mode="create" />;
  } else if (searchParams.get("edit") === "1") {
    form = <ProfileForm key={active.id} existing={active} mode="edit" />;
  }

  return (
    <main className="profile-setup">
      <div className="profile-switcher-page">
        {form ?? (
          <>
            {active && (
              <CurrentProfileCard
                profile={active}
                onEdit={() => navigate("/profile/setup?edit=1")}
                onLogOut={() => logOutTo("/who")}
                onContinue={() => navigate("/watch")}
              />
            )}
            <ProfileSwitcher profiles={profiles} activeId={active?.id ?? null} onUse={handleLogIn} onNew={() => logOutTo("/signup")} />
          </>
        )}
      </div>
    </main>
  );
}
