/**
 * Owner: Mohamed (Step 0)
 * Purpose: App shell, routes for every PULSE screen, and navigation (Dance, Feed, Me + avatar switcher)
 */

import type { ReactElement } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import BadgesPage from "./badges/BadgesPage";
import { WorkoutHistory } from "./health/HealthSummary";
import DancePlay from "./screens/dance/DancePlay";
import GetReady from "./screens/dance/GetReady";
import ExtractTool from "./screens/dev/ExtractTool";
import DancerProfile from "./screens/profile/DancerProfile";
import LoginScreen from "./screens/setup/LoginScreen";
import ProfileSetup from "./screens/setup/ProfileSetup";
import { RequireAuth } from "./screens/setup/RequireAuth";
import SignupScreen from "./screens/setup/SignupScreen";
import WatchConnect from "./screens/setup/WatchConnect";
import WhoIsDancing from "./screens/setup/WhoIsDancing";
import Catalogue from "./screens/social/Catalogue";
import Feed from "./screens/social/Feed";
import GroupDetail from "./screens/social/GroupDetail";
import Groups from "./screens/social/Groups";
import ProfilePage from "./screens/social/ProfilePage";
import Results from "./screens/social/Results";
import { AvatarMenu } from "./shell/AvatarMenu";
import { CrewTabs } from "./shell/CrewTabs";
import { MeSettings } from "./shell/MeSettings";
import "./shell/shell.css";

export default function App(): ReactElement {
  const { pathname } = useLocation();
  const isDanceSessionRoute = /^\/dance\/[^/]+\/(ready|play)$/.test(pathname);
  const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname === "/who";
  const hideNav = isDanceSessionRoute || isAuthRoute;
  const inCrew = pathname === "/feed" || pathname.startsWith("/groups");
  const inMe = pathname === "/me" || pathname.startsWith("/me/") || pathname === "/badges" || pathname === "/watch" || pathname.startsWith("/profile");

  return (
    <div className="app-shell">
      {!hideNav && (
        <header className="app-header">
          <NavLink to="/dances" className="app-brand">
            PULSE
          </NavLink>
          <nav className="app-tabs" aria-label="Main navigation">
            <NavLink to="/dances" className="app-tab">Dance</NavLink>
            <NavLink to="/feed" className={`app-tab${inCrew ? " active" : ""}`}>Feed</NavLink>
            <NavLink to="/me" className={`app-tab${inMe ? " active" : ""}`}>Me</NavLink>
          </nav>
          <AvatarMenu />
        </header>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/signup" element={<SignupScreen />} />
          <Route path="/who" element={<WhoIsDancing />} />
          <Route path="/" element={<RequireAuth><Navigate to="/me" replace /></RequireAuth>} />
          <Route path="/profile/setup" element={<RequireAuth><ProfileSetup /></RequireAuth>} />
          <Route path="/watch" element={<RequireAuth><WatchConnect /></RequireAuth>} />
          <Route path="/dances" element={<RequireAuth><Catalogue /></RequireAuth>} />
          <Route path="/dance/:id/ready" element={<RequireAuth><GetReady /></RequireAuth>} />
          <Route path="/dance/:id/play" element={<RequireAuth><DancePlay /></RequireAuth>} />
          <Route path="/results/:resultId" element={<RequireAuth><Results /></RequireAuth>} />
          <Route path="/feed" element={<RequireAuth><CrewTabs><Feed /></CrewTabs></RequireAuth>} />
          <Route path="/me" element={<RequireAuth><ProfilePage /><MeSettings /></RequireAuth>} />
          <Route path="/me/workouts" element={<RequireAuth><WorkoutHistory /></RequireAuth>} />
          <Route path="/badges" element={<RequireAuth><BadgesPage /></RequireAuth>} />
          <Route path="/u/:playerId" element={<RequireAuth><DancerProfile /></RequireAuth>} />
          <Route path="/u/:playerId/badges" element={<RequireAuth><BadgesPage /></RequireAuth>} />
          <Route path="/groups" element={<RequireAuth><CrewTabs><Groups /></CrewTabs></RequireAuth>} />
          <Route path="/groups/:id" element={<RequireAuth><CrewTabs><GroupDetail /></CrewTabs></RequireAuth>} />
          <Route path="/dev/extract" element={<ExtractTool />} />
          <Route path="*" element={<RequireAuth><Navigate to="/dances" replace /></RequireAuth>} />
        </Routes>
      </main>

      {!hideNav && (
        <nav className="bottom-nav" aria-label="Main navigation (bottom)">
          <NavLink to="/dances" className="bottom-nav-link">Dance</NavLink>
          <NavLink to="/feed" className={`bottom-nav-link${inCrew ? " active" : ""}`}>Feed</NavLink>
          <NavLink to="/me" className={`bottom-nav-link${inMe ? " active" : ""}`}>Me</NavLink>
        </nav>
      )}
    </div>
  );
}
