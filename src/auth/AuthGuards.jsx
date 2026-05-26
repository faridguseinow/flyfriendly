import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedPath } from "../i18n/useLocalizedPath.js";
import { useAuth } from "./AuthContext.jsx";
import { getPartnerAccessState, getNormalizedRole, hasAllowedRole } from "./routeUtils.js";

function LoadingState() {
  const { t } = useTranslation();

  return <div className="placeholder-page"><p>{t("common.loadingAccount", { defaultValue: "Loading account..." })}</p></div>;
}

function getSafeReturnTo(search = "") {
  const params = new URLSearchParams(search);
  const raw = params.get("returnTo");
  return raw && raw.startsWith("/") ? raw : null;
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
  const location = useLocation();
  const toLocalizedPath = useLocalizedPath();
  const { loading, isAuthenticated, dashboardPath } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (isAuthenticated) {
    const returnTo = getSafeReturnTo(location.search);
    return <Navigate to={toLocalizedPath(returnTo || dashboardPath || "/client/dashboard")} replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ allowedRoles = [], ignorePartnerStatus = false }) {
  const toLocalizedPath = useLocalizedPath();
  const { loading, isAuthenticated, profile, partnerProfile, adminAccess, dashboardPath } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return <Navigate to={toLocalizedPath("/auth/login")} replace />;
  }

  if (!hasAllowedRole(allowedRoles, profile, partnerProfile, adminAccess)) {
    return <Navigate to={toLocalizedPath(dashboardPath || "/client/dashboard")} replace />;
  }

  if (!ignorePartnerStatus && allowedRoles.includes("partner") && partnerProfile) {
    const partnerState = getPartnerAccessState(partnerProfile);
    if (partnerState !== "approved") {
      return <Navigate to={toLocalizedPath(`/partner/${partnerState}`)} replace />;
    }
  }

  return <Outlet />;
}

export function PartnerRoute() {
  const location = useLocation();
  const toLocalizedPath = useLocalizedPath();
  const { loading, isAuthenticated, profile, partnerProfile, adminAccess, dashboardPath } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={toLocalizedPath(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`)} replace />;
  }

  const normalizedRole = getNormalizedRole(profile, partnerProfile, adminAccess);
  if (normalizedRole !== "partner") {
    return <Navigate to={toLocalizedPath(dashboardPath || "/client/dashboard")} replace />;
  }

  if (!partnerProfile) {
    return <Navigate to={toLocalizedPath("/partner/pending")} replace />;
  }

  const partnerState = getPartnerAccessState(partnerProfile);
  if (partnerState === "approved") {
    return <Outlet />;
  }

  if (partnerState === "suspended") {
    return <Navigate to={toLocalizedPath("/partner/suspended")} replace />;
  }

  if (partnerState === "rejected") {
    return <Navigate to={toLocalizedPath("/partner/rejected")} replace />;
  }

  return <Navigate to={toLocalizedPath("/partner/pending")} replace />;
}
