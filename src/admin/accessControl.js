import { ALL_PERMISSIONS, getAvailablePermissions } from "./rbac.js";
import { adminNavigation } from "./navigation.js";

const PERMISSION_ALIASES = {
  "cases.manage": ["cases.manage", "cases.edit"],
  "customers.manage": ["customers.manage", "customers.edit"],
  "finance.manage": ["finance.manage", "finance.edit"],
  "leads.manage": ["leads.manage", "leads.edit"],
  "settings.manage": ["settings.manage", "settings.edit"],
  "tasks.manage": ["tasks.manage", "tasks.edit"],
};

const ROUTE_ALIASES = new Map([
  ["/admin/dashboard/main", "/admin"],
  ["/admin/dashboard/activity-log", "/admin/dashboard/activity"],
  ["/admin/people/employees", "/admin/people/users-roles"],
  ["/admin/finances", "/admin/finances/finance"],
  ["/admin/activity", "/admin/dashboard/activity"],
  ["/admin/marketing", "/admin/dashboard/marketing"],
  ["/admin/leads", "/admin/operations/leads"],
  ["/admin/cases", "/admin/operations/cases"],
  ["/admin/tasks", "/admin/operations/tasks"],
  ["/admin/documents", "/admin/operations/documents"],
  ["/admin/customers", "/admin/people/customers"],
  ["/admin/team", "/admin/people/users-roles"],
  ["/admin/referral", "/admin/people/referral"],
  ["/admin/finance", "/admin/finances/finance"],
  ["/admin/finance/payments", "/admin/finances/payments"],
  ["/admin/finance/revenue", "/admin/dashboard/revenue"],
  ["/admin/payments", "/admin/finances/payments"],
  ["/admin/revenue", "/admin/dashboard/revenue"],
  ["/admin/reports", "/admin/dashboard/revenue"],
  ["/admin/blog", "/admin/content/cms"],
  ["/admin/faq", "/admin/content/pages"],
  ["/admin/pages", "/admin/content/pages"],
  ["/admin/cms", "/admin/content/cms"],
  ["/admin/media", "/admin/content/media"],
  ["/admin/website", "/admin/content/website"],
  ["/admin/partner-commissions", "/admin/finances/partner-commissions"],
  ["/admin/partner-payouts", "/admin/finances/partner-payouts"],
]);

const ADMIN_ROUTE_RULES = [
  { matcher: "/admin", anyPermissions: ["dashboard.view"] },
  { matcher: "/admin/dashboard/marketing", anyPermissions: ["reports.view"] },
  { matcher: "/admin/dashboard/revenue", anyPermissions: ["reports.view", "finance.view"] },
  { matcher: "/admin/dashboard/activity", anyPermissions: ["activity.view"] },
  { matcher: "/admin/operations/leads", anyPermissions: ["leads.view"] },
  { matcher: "/admin/operations/cases", anyPermissions: ["cases.view"] },
  { matcher: "/admin/operations/tasks", anyPermissions: ["tasks.view"] },
  { matcher: "/admin/operations/documents", anyPermissions: ["documents.view"] },
  { matcher: "/admin/people/customers", anyPermissions: ["customers.view"] },
  { matcher: "/admin/people/users-roles", ownerOnly: true },
  { matcher: /^\/admin\/team\/[^/]+\/activity$/, ownerOnly: true },
  { matcher: "/admin/people/referral", anyPermissions: ["partners.view", "partner_applications.view", "referrals.view"] },
  { matcher: "/admin/finances/finance", anyPermissions: ["finance.view"] },
  { matcher: "/admin/finances/payments", anyPermissions: ["finance.view"] },
  { matcher: "/admin/finances/partner-payouts", anyPermissions: ["finance.view", "partners.view"] },
  { matcher: "/admin/finances/partner-commissions", anyPermissions: ["finance.view", "partners.view", "referrals.view"] },
  { matcher: "/admin/content/pages", anyPermissions: ["blog.view", "faq.view", "cms.view"] },
  { matcher: "/admin/content/media", anyPermissions: ["cms.view"] },
  { matcher: "/admin/content/website", anyPermissions: ["cms.view"] },
  { matcher: "/admin/content/cms", anyPermissions: ["blog.view", "blog.edit", "cms.view"] },
  { matcher: "/admin/settings", ownerOnly: true },
  { matcher: "/admin/settings/system", ownerOnly: true },
  { matcher: "/admin/communication", anyPermissions: ["communications.view"] },
  { matcher: "/admin/partner-applications", anyPermissions: ["partner_applications.view", "partners.view"] },
  { matcher: "/admin/referral-partners", anyPermissions: ["partners.view"] },
  { matcher: "/admin/referrals", anyPermissions: ["partners.view", "referrals.view"] },
  { matcher: "/admin/case-finance", anyPermissions: ["finance.view"] },
  { matcher: "/admin/access", ownerOnly: true },
  { matcher: "/admin/roles", ownerOnly: true },
  { matcher: "/admin/menu-builder", ownerOnly: true },
  { matcher: "/admin/trash", anyPermissions: ["trash.manage", "users.manage"] },
];

function normalizePathname(pathname = "") {
  const [pathWithoutHash] = String(pathname || "").split("#");
  const [pathWithoutSearch] = pathWithoutHash.split("?");
  const normalized = pathWithoutSearch || "/";

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function resolveRouteAlias(pathname) {
  let current = normalizePathname(pathname);
  let previous = "";

  while (current && current !== previous && ROUTE_ALIASES.has(current)) {
    previous = current;
    current = ROUTE_ALIASES.get(current) || current;
  }

  return current;
}

function matchesRoute(matcher, pathname) {
  if (matcher instanceof RegExp) {
    return matcher.test(pathname);
  }

  return matcher === pathname;
}

function getRouteRule(pathname) {
  const resolvedPath = resolveRouteAlias(pathname);
  return ADMIN_ROUTE_RULES.find((rule) => matchesRoute(rule.matcher, resolvedPath)) || null;
}

function flattenNavigationItems(navigationConfig = []) {
  if (!Array.isArray(navigationConfig) || !navigationConfig.length) {
    return [];
  }

  if (navigationConfig[0]?.pages) {
    return navigationConfig.flatMap((section) => section.pages || []);
  }

  return navigationConfig;
}

function dedupeByPath(items = []) {
  const seen = new Set();

  return items.filter((item) => {
    const itemPath = item?.path;
    if (!itemPath || seen.has(itemPath)) {
      return false;
    }

    seen.add(itemPath);
    return true;
  });
}

function normalizeRoles(adminUser) {
  return Array.from(
    new Set(
      [
        ...(adminUser?.roles || []),
        ...(adminUser?.assignedRoles || []),
      ]
        .map((role) => String(role || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function expandPermissionAliases(permissionCode) {
  const normalized = String(permissionCode || "").trim();
  if (!normalized) {
    return [];
  }

  return Array.from(new Set([normalized, ...(PERMISSION_ALIASES[normalized] || [])]));
}

export function isOwnerAdmin(adminUser) {
  if (!adminUser) {
    return false;
  }

  if (adminUser.isOwner || adminUser.isOwnerOrSuperAdmin || adminUser.isSuperAdmin) {
    return true;
  }

  if (adminUser.dynamicRole?.is_owner_role || adminUser.dynamicRole?.isOwnerRole) {
    return true;
  }

  return normalizeRoles(adminUser).some((role) => role === "owner" || role === "super_admin");
}

export function getEffectiveAdminPermissions(adminUser) {
  if (!adminUser?.isAdminUser) {
    return [];
  }

  if (isOwnerAdmin(adminUser)) {
    return ALL_PERMISSIONS;
  }

  const explicitPermissions = Array.from(
    new Set(
      (adminUser.permissions || [])
        .map((permission) => String(permission || "").trim())
        .filter(Boolean),
    ),
  );

  if (explicitPermissions.includes("*")) {
    return ALL_PERMISSIONS;
  }

  if (explicitPermissions.length) {
    return explicitPermissions;
  }

  const hasDynamicRole = Boolean(adminUser.dynamicRole?.id || adminUser.dynamicRole?.code || adminUser.teamMember?.role_id);
  if (adminUser.permissionSource === "dynamic" || hasDynamicRole) {
    return [];
  }

  return getAvailablePermissions(normalizeRoles(adminUser));
}

export function canAdminPermission(adminUser, permissionCode) {
  if (!permissionCode) {
    return Boolean(adminUser?.isAdminUser);
  }

  if (isOwnerAdmin(adminUser)) {
    return true;
  }

  const effectivePermissions = new Set(getEffectiveAdminPermissions(adminUser));
  return expandPermissionAliases(permissionCode).some((candidate) => effectivePermissions.has(candidate));
}

export function canAccessAdminRoute(adminUser, pathname) {
  const normalizedPath = resolveRouteAlias(pathname);

  if (normalizedPath === "/admin/login" || normalizedPath === "/admin/forbidden") {
    return true;
  }

  if (!normalizedPath.startsWith("/admin")) {
    return true;
  }

  if (!adminUser?.isAdminUser) {
    return false;
  }

  if (isOwnerAdmin(adminUser)) {
    return true;
  }

  const rule = getRouteRule(normalizedPath);
  if (!rule) {
    return false;
  }

  if (rule.ownerOnly) {
    return false;
  }

  if (rule.anyPermissions?.length) {
    return rule.anyPermissions.some((permissionCode) => canAdminPermission(adminUser, permissionCode));
  }

  if (rule.allPermissions?.length) {
    return rule.allPermissions.every((permissionCode) => canAdminPermission(adminUser, permissionCode));
  }

  return true;
}

export function getVisibleAdminNavigation(adminUser, navigationConfig = adminNavigation, options = {}) {
  const canonicalNavigation = flattenNavigationItems(navigationConfig);
  const sourceItems = isOwnerAdmin(adminUser)
    ? canonicalNavigation
    : (options.menuItems?.length ? options.menuItems : canonicalNavigation);

  return dedupeByPath(sourceItems).filter((item) => canAccessAdminRoute(adminUser, item.path));
}

export function getFirstAccessibleAdminRoute(adminUser, navigationConfig = adminNavigation, options = {}) {
  const visibleNavigation = getVisibleAdminNavigation(adminUser, navigationConfig, options);
  return visibleNavigation[0]?.path || "/admin/forbidden";
}
