import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useLocalizedPath } from "../i18n/useLocalizedPath.js";
import { useAuth } from "./AuthContext.jsx";
import { getPartnerAccessState, hasAllowedRole } from "./routeUtils.js";

function LoadingState() {
  return <div className="placeholder-page"><p>Loading account...</p></div>;
}

export function ProtectedRoute() {
  const location = useLocation();
  const toLocalizedPath = useLocalizedPath();
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={toLocalizedPath(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`)} replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { loading, isAuthenticated, dashboardPath } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (isAuthenticated) {
    return <Navigate to={dashboardPath} replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ allowedRoles = [], ignorePartnerStatus = false }) {
  const { loading, isAuthenticated, profile, partnerProfile, dashboardPath } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!hasAllowedRole(allowedRoles, profile, partnerProfile)) {
    return <Navigate to={dashboardPath} replace />;
  }

  if (!ignorePartnerStatus && allowedRoles.includes("partner") && partnerProfile) {
    const partnerState = getPartnerAccessState(partnerProfile);
    if (partnerState !== "approved") {
      return <Navigate to={`/partner/${partnerState}`} replace />;
    }
  }

  return <Outlet />;
}
