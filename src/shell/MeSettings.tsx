/**
 * Owner: Mohamed
 * Purpose: the settings part of the Me tab: watch, private details, switching dancer
 * FRs: FR-01, FR-02 (details are private and only shown to their owner), FR-03, FR-04, FR-29
 */

import type { ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { accounts } from "../auth/accounts";
import { getActiveMonitor } from "../hr/activeMonitor";

export function MeSettings(): ReactElement {
  const navigate = useNavigate();
  const connected = getActiveMonitor()?.status() === "live";
  return (
    <section className="me-settings" aria-labelledby="me-settings-title">
      <h2 id="me-settings-title">Settings</h2>
      <ul className="me-settings-list">
        <li>
          <span>
            <strong>Watch</strong>
            <span className="social-meta">{connected ? "Watch connected" : "No watch connected. Dances score your moves only."}</span>
          </span>
          <Link className="btn btn-secondary" to="/watch">{connected ? "Manage watch" : "Add your watch"}</Link>
        </li>
        <li>
          <span>
            <strong>Your details</strong>
            <span className="social-meta">Age, weight, height and resting heart rate. Private, used for calorie estimates.</span>
          </span>
          <Link className="btn btn-secondary" to="/profile/setup?edit=1">Edit</Link>
        </li>
        <li>
          <span>
            <strong>Shared laptop</strong>
            <span className="social-meta">Hand over to a friend in one tap.</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => { accounts.logOut(); navigate("/who"); }}>
            Switch dancer
          </button>
        </li>
      </ul>
    </section>
  );
}
