import { getPathWithoutLanguage } from "../i18n/path.js";

const INTERNAL_ROLE_CODES = new Set([
  "admin",
  "manager",
  "super_admin",
  "operations_manager",
  "case_manager",
  "customer_support_agent",
  "content_manager",
  "finance_manager",
  "read_only",
  "support",
]);

export function isInternalRole(role) {
  return INTERNAL_ROLE_CODES.has(String(role || "").toLowerCase());
}

export function getPartnerAccessState(partnerProfile) {
  if (!partnerProfile) {
    return null;
  }

  const status = String(partnerProfile.portal_status || partnerProfile.status || "").toLowerCase();

  if (status === "approved" || status === "active") {
    return "approved";
  }

  if (status === "suspended" || status === "paused") {
    return "suspended";
  }

  if (status === "rejected" || status === "archived") {
    return "rejected";
  }

  return "pending";
}

function hasAdminAccess(adminAccess) {
  if (typeof adminAccess === "boolean") {
    return adminAccess;
  }

  return Boolean(adminAccess?.isAdminUser);
}

export function getNormalizedRole(profile, partnerProfile, adminAccess = null) {
  if (profile?.deleted_at) {
    return null;
  }

  if (hasAdminAccess(adminAccess)) {
    return "admin";
  }

  const role = String(profile?.role || "").toLowerCase();

  if (isInternalRole(role)) {
    return "admin";
  }

  if (role === "partner") {
    return "partner";
  }

  if (profile) {
    return "client";
  }

  return null;
}

export function resolveDashboardPath(profile, partnerProfile, adminAccess = null) {
  const normalizedRole = getNormalizedRole(profile, partnerProfile, adminAccess);

  if (normalizedRole === "admin") {
    return "/admin";
  }

  if (normalizedRole === "partner") {
    if (!partnerProfile) {
      return "/partner/pending";
    }

    const partnerState = getPartnerAccessState(partnerProfile);

    if (partnerState === "approved") {
      return "/partner/dashboard";
    }

    return `/partner/${partnerState}`;
  }

  return "/client/dashboard";
}

export function resolveProfilePath(profile, partnerProfile, adminAccess = null) {
  const normalizedRole = getNormalizedRole(profile, partnerProfile, adminAccess);

  if (normalizedRole === "admin") {
    return "/admin";
  }

  if (normalizedRole === "partner") {
    return "/partner/profile";
  }

  return "/client/account";
}

function isClientPath(path) {
  return getPathWithoutLanguage(String(path || ""))?.startsWith("/client");
}

function isPartnerPath(path) {
  return getPathWithoutLanguage(String(path || ""))?.startsWith("/partner");
}

export function resolvePostAuthPath(returnTo, profile, partnerProfile, adminAccess = null) {
  const dashboardPath = resolveDashboardPath(profile, partnerProfile, adminAccess);
  const normalizedRole = getNormalizedRole(profile, partnerProfile, adminAccess);
  const safeReturnTo = typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : "";

  if (!safeReturnTo) {
    return dashboardPath;
  }

  if (normalizedRole === "partner" && isClientPath(safeReturnTo)) {
    return dashboardPath;
  }

  if (normalizedRole === "client" && isPartnerPath(safeReturnTo)) {
    return dashboardPath;
  }

  return safeReturnTo;
}

export function hasAllowedRole(allowedRoles = [], profile, partnerProfile, adminAccess = null) {
  const normalizedRole = getNormalizedRole(profile, partnerProfile, adminAccess);
  return allowedRoles.includes(normalizedRole);
}
