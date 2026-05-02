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

export function getNormalizedRole(profile, partnerProfile) {
  if (profile?.deleted_at) {
    return null;
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

export function resolveDashboardPath(profile, partnerProfile) {
  const normalizedRole = getNormalizedRole(profile, partnerProfile);

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

export function hasAllowedRole(allowedRoles = [], profile, partnerProfile) {
  const normalizedRole = getNormalizedRole(profile, partnerProfile);
  return allowedRoles.includes(normalizedRole);
}
