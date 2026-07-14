import { ALL_PERMISSIONS } from "./rbac.js";
import { adminNavigation } from "./navigation.js";
import { getAdminPageByPath } from "./adminPages.js";

const PERMISSION_ALIASES = {
  "cases.manage": ["cases.manage", "cases.edit"],
  "customers.manage": ["customers.manage", "customers.edit"],
  "finance.manage": ["finance.manage", "finance.edit"],
  "leads.manage": ["leads.manage", "leads.edit"],
  "settings.manage": ["settings.manage", "settings.edit"],
  "tasks.manage": ["tasks.manage", "tasks.edit"],
};

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

function expandPermissionAliases(permissionCode) {
  const normalized = String(permissionCode || "").trim();
  if (!normalized) {
    return [];
  }

  return Array.from(new Set([normalized, ...(PERMISSION_ALIASES[normalized] || [])]));
}

function getAllowedPageKeys(adminUser) {
  return new Set((adminUser?.allowedAdminPageKeys || []).filter(Boolean));
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

  return false;
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

  return explicitPermissions.includes("*") ? ALL_PERMISSIONS : explicitPermissions;
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
  if (!pathname?.startsWith?.("/admin")) {
    return true;
  }

  if (pathname === "/admin/login" || pathname === "/admin/forbidden") {
    return true;
  }

  if (!adminUser?.isAdminUser || adminUser?.teamAccessBlocked) {
    return false;
  }

  if (isOwnerAdmin(adminUser)) {
    return true;
  }

  const page = getAdminPageByPath(pathname);
  if (!page) {
    return false;
  }

  if (page.ownerOnly) {
    return false;
  }

  return getAllowedPageKeys(adminUser).has(page.key);
}

export function getVisibleAdminNavigation(adminUser, navigationConfig = adminNavigation) {
  const canonicalNavigation = flattenNavigationItems(navigationConfig);

  if (isOwnerAdmin(adminUser)) {
    return dedupeByPath(canonicalNavigation);
  }

  return dedupeByPath(canonicalNavigation).filter((item) => canAccessAdminRoute(adminUser, item.path));
}

export function getFirstAccessibleAdminRoute(adminUser, navigationConfig = adminNavigation) {
  const visibleNavigation = getVisibleAdminNavigation(adminUser, navigationConfig);
  return visibleNavigation[0]?.path || "/admin/forbidden";
}
