/**
 * Owner: Mohamed
 * Purpose: Account screen (/account), opened from the avatar menu: watch first, the profile form open for editing,
 *   and Log out at the bottom.
 * FRs: FR-01, FR-02, FR-03, FR-04
 */

import type { ReactElement } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { accounts } from "../../auth/accounts";
import { store } from "../../data/store";
import { getActiveMonitor } from "../../hr/activeMonitor";
import { ProfileForm } from "./ProfileForm";
import "./setup.css";

export default function AccountPage(): ReactElement {
  const navigate = useNavigate();
  const active = store.getActiveProfile();
  if (!active) return <Navigate to="/profile/setup" replace />;

  const connected = getActiveMonitor()?.status() === "live";

  return (
    <main className="profile-setup">
      <div className="profile-switcher-page">
        <div className="card account-row">
          <span>
            <strong>Watch</strong>
            <span className="social-meta">{connected ? "Watch connected" : "No watch connected. Dances score your moves only."}</span>
          </span>
          <Link className="btn btn-secondary" to="/watch">{connected ? "Manage watch" : "Add your watch"}</Link>
        </div>
        <ProfileForm key={active.id} existing={active} mode="edit" />
        <button
          type="button"
          className="btn btn-secondary account-logout"
          onClick={() => {
            accounts.logOut();
            navigate("/who");
          }}
        >
          Log out
        </button>
      </div>
    </main>
  );
}
