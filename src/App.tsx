/**
 * Owner: Mohamed (Step 0)
 * Purpose: App shell, routes for every PULSE screen, and bottom navigation
 */

import type { ReactElement } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import BadgesPage from "./badges/BadgesPage";
import DancePlay from "./screens/dance/DancePlay";
import GetReady from "./screens/dance/GetReady";
import ExtractTool from "./screens/dev/ExtractTool";
import DancerProfile from "./screens/profile/DancerProfile.tsx"; // explicit: "./DancerProfile" resolves to dancerProfile.ts on case-insensitive disks
import LoginScreen from "./screens/setup/LoginScreen";
import ProfileSetup from "./screens/setup/ProfileSetup";
import { RequireAuth } from "./screens/setup/RequireAuth";
import SignupScreen from "./screens/setup/SignupScreen";
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
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const hideNav = isDanceSessionRoute || isAuthRoute;

  return (
    <div className="app-shell">
      {!hideNav && (
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
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/signup" element={<SignupScreen />} />
          <Route path="/" element={<RequireAuth><Navigate to="/dances" replace /></RequireAuth>} />
          <Route path="/profile/setup" element={<RequireAuth><ProfileSetup /></RequireAuth>} />
          <Route path="/watch" element={<RequireAuth><WatchConnect /></RequireAuth>} />
          <Route path="/dances" element={<RequireAuth><Catalogue /></RequireAuth>} />
          <Route path="/dance/:id/ready" element={<RequireAuth><GetReady /></RequireAuth>} />
          <Route path="/dance/:id/play" element={<RequireAuth><DancePlay /></RequireAuth>} />
          <Route path="/results/:resultId" element={<RequireAuth><Results /></RequireAuth>} />
          <Route path="/feed" element={<RequireAuth><Feed /></RequireAuth>} />
          <Route path="/me" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/badges" element={<RequireAuth><BadgesPage /></RequireAuth>} />
          <Route path="/u/:playerId" element={<RequireAuth><DancerProfile /></RequireAuth>} />
          <Route path="/u/:playerId/badges" element={<RequireAuth><BadgesPage /></RequireAuth>} />
          <Route path="/groups" element={<RequireAuth><Groups /></RequireAuth>} />
          <Route path="/groups/:id" element={<RequireAuth><GroupDetail /></RequireAuth>} />
          <Route path="/dev/extract" element={<ExtractTool />} />
          <Route path="*" element={<RequireAuth><Navigate to="/dances" replace /></RequireAuth>} />
        </Routes>
      </main>

      {!hideNav && (
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
