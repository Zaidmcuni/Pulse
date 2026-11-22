/**
 * Owner: Mohamed
 * Purpose: "Crew" tab: one place for the feed and groups (council redesign), switched with a segmented control
 * FRs: FR-39, FR-42
 */

import type { ReactElement, ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function CrewTabs({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="crew">
      <nav className="crew-tabs" aria-label="Crew">
        <NavLink to="/feed" className="crew-tab">Feed</NavLink>
        <NavLink to="/groups" className="crew-tab">Groups</NavLink>
      </nav>
      {children}
    </div>
  );
}
