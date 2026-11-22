/**
 * Owner: Mohamed
 * Purpose: auth gate: signed-out users go to "Who's dancing?" (/who), which returns them here after picking a dancer
 * FRs: FR-03, NFR-06
 */

import type { ReactElement, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { accounts } from "../../auth/accounts";

export function RequireAuth({ children }: { children: ReactNode }): ReactElement {
  const location = useLocation();
  if (!accounts.isSignedIn()) {
    return <Navigate to="/who" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
