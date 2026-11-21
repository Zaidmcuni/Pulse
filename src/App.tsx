/**
 * Owner: Mohamed (Step 0)
 * Purpose: App shell, routes for every PULSE screen, and bottom navigation
 */

import type { ReactElement } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import DancePlay from "./screens/dance/DancePlay";
import GetReady from "./screens/dance/GetReady";
import ExtractTool from "./screens/dev/ExtractTool";
import ProfileSetup from "./screens/setup/ProfileSetup";
import WatchConnect from "./screens/setup/WatchConnect";
import Catalogue from "./screens/social/Catalogue";
import Feed from "./screens/social/Feed";
import GroupDetail from "./screens/social/GroupDetail";
import Groups from "./screens/social/Groups";
import ProfilePage from "./screens/social/ProfilePage";
import Results from "./screens/social/Results";

export default function App(): ReactElement {
  const { pathname } = useLocation();
  const isDanceSessionRoute = /^\/dance\/[^/]+\/(ready|play)$/.test(pathname);

  return (
    <div className="app-shell">
      {!isDanceSessionRoute && (
        <header className="app-header">
          <NavLink to="/dances" className="app-brand">
            PULSE
          </NavLink>
          <div className="app-header-links">
            <NavLink to="/watch" className="app-header-link">
              Watch
            </NavLink>
            <NavLink to="/profile/setup" className="app-header-link">
              Profile Setup
            </NavLink>
          </div>
        </header>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/dances" replace />} />
          <Route path="/profile/setup" element={<ProfileSetup />} />
          <Route path="/watch" element={<WatchConnect />} />
          <Route path="/dances" element={<Catalogue />} />
          <Route path="/dance/:id/ready" element={<GetReady />} />
          <Route path="/dance/:id/play" element={<DancePlay />} />
          <Route path="/results/:resultId" element={<Results />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/dev/extract" element={<ExtractTool />} />
          <Route path="*" element={<Navigate to="/dances" replace />} />
        </Routes>
      </main>

      {!isDanceSessionRoute && (
        <nav className="bottom-nav" aria-label="Main navigation">
          <NavLink to="/feed" className="bottom-nav-link">
            Feed
          </NavLink>
          <NavLink to="/dances" className="bottom-nav-link">
            Dances
          </NavLink>
          <NavLink to="/groups" className="bottom-nav-link">
            Groups
          </NavLink>
          <NavLink to="/me" className="bottom-nav-link">
            Profile
          </NavLink>
        </nav>
      )}
    </div>
  );
}
