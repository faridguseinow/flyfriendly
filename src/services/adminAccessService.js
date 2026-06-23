import { canAdminPermission, isOwnerAdmin } from "../admin/accessControl.js";
import { getAvailablePermissions, isAdminRoleCode, normalizeRoleCode } from "../admin/rbac.js";
import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser } from "./authService.js";

function isMissingTableError(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function isMissingColumnError(error) {
  return error?.code === "42703" || error?.code === "PGRST204" || error?.message?.includes("column");
}

async function fetchAssignedRoles(client, userId) {
  const response = await client
    .from("user_admin_roles")
    .select("role_code")
    .eq("user_id", userId);

  if (response.error) {
    if (isMissingTableError(response.error)) {
      return [];
    }

    throw response.error;
  }

  return (response.data || [])
    .map((item) => normalizeRoleCode(item.role_code))
    .filter(Boolean);
}

async function fetchAdminTeamMember(client, userId) {
  const response = await client
    .from("admin_team_members")
    .select("id, profile_id, role_id, status, invited_by, last_login_at, created_at, updated_at")
    .eq("profile_id", userId)
    .maybeSingle();

  if (response.error) {
    if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
      return null;
    }

    throw response.error;
  }

  return response.data || null;
}

async function fetchAvailableAdminRoles(client, roleCodes = []) {
  if (!roleCodes.length) {
    return [];
  }

  const response = await client
    .from("admin_roles")
    .select("id, code, label, name, is_owner_role, is_system_role, is_active, rank")
    .in("code", roleCodes);

  if (response.error) {
    if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
      return [];
    }

    throw response.error;
  }

  return response.data || [];
}

async function fetchDynamicRole(client, teamMember, legacyRoleCodes = []) {
  if (teamMember?.role_id) {
    const response = await client
      .from("admin_roles")
      .select("id, code, label, name, is_owner_role, is_system_role, is_active, rank")
      .eq("id", teamMember.role_id)
      .maybeSingle();

    if (response.error) {
      if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
        return null;
      }

      throw response.error;
    }

    return response.data || null;
  }

  const candidates = await fetchAvailableAdminRoles(client, legacyRoleCodes);
  return candidates
    .filter((item) => item?.is_active !== false)
    .sort((left, right) => Number(right.rank || 0) - Number(left.rank || 0))[0] || null;
}

async function fetchDynamicPermissions(client, dynamicRole) {
  if (!dynamicRole?.id && !dynamicRole?.code) {
    return { loaded: false, permissions: [] };
  }

  if (dynamicRole.is_owner_role || dynamicRole.code === "owner" || dynamicRole.code === "super_admin") {
    return { loaded: true, permissions: ["*"] };
  }

  const roleFilters = [];
  if (dynamicRole.id) {
    roleFilters.push(`role_id.eq.${dynamicRole.id}`);
  }
  if (dynamicRole.code) {
    roleFilters.push(`role_code.eq.${dynamicRole.code}`);
  }

  if (!roleFilters.length) {
    return { loaded: false, permissions: [] };
  }

  const response = await client
    .from("admin_role_permissions")
    .select("permission_code, permission_id, is_allowed")
    .or(roleFilters.join(","));

  if (response.error) {
    if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
      return { loaded: false, permissions: [] };
    }

    throw response.error;
  }

  const rows = response.data || [];
  const permissionIds = rows.map((item) => item.permission_id).filter(Boolean);
  let permissionsById = new Map();

  if (permissionIds.length) {
    const permissionsResponse = await client
      .from("admin_permissions")
      .select("id, code, key")
      .in("id", permissionIds);

    if (permissionsResponse.error) {
      if (!isMissingTableError(permissionsResponse.error) && !isMissingColumnError(permissionsResponse.error)) {
        throw permissionsResponse.error;
      }
    } else {
      permissionsById = new Map((permissionsResponse.data || []).map((item) => [item.id, item.code || item.key]));
    }
  }

  return {
    loaded: true,
    permissions: Array.from(new Set(
      rows
        .filter((item) => item.is_allowed !== false)
        .map((item) => item.permission_code || permissionsById.get(item.permission_id) || null)
        .filter(Boolean),
    )),
  };
}

export async function getCurrentAdminActor() {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  if (!user) {
    return {
      user: null,
      isAdminUser: false,
      roles: [],
      assignedRoles: [],
      permissions: [],
      permissionSource: "static",
      dynamicRole: null,
      teamMember: null,
      teamAccessBlocked: false,
      isOwner: false,
      isSuperAdmin: false,
      isOwnerOrSuperAdmin: false,
    };
  }

  const [assignedRoles, teamMember] = await Promise.all([
    fetchAssignedRoles(client, user.id),
    fetchAdminTeamMember(client, user.id),
  ]);

  const staticRoles = Array.from(new Set(assignedRoles.filter((role) => isAdminRoleCode(role))));
  const dynamicRole = await fetchDynamicRole(client, teamMember, staticRoles);
  const dynamicPermissions = await fetchDynamicPermissions(client, dynamicRole);
  const dynamicRoleCode = dynamicRole?.code
    ? (isAdminRoleCode(dynamicRole.code) ? normalizeRoleCode(dynamicRole.code) : dynamicRole.code)
    : null;
  const roles = Array.from(new Set([
    ...(dynamicRoleCode ? [dynamicRoleCode] : []),
    ...staticRoles,
  ]));
  const isOwner = roles.includes("owner") || roles.includes("super_admin") || Boolean(dynamicRole?.is_owner_role);
  const teamAccessBlocked = Boolean(teamMember) && teamMember.status !== "active";
  const permissions = teamAccessBlocked
    ? []
    : (isOwner
      ? ["*"]
      : (dynamicPermissions.loaded ? dynamicPermissions.permissions : getAvailablePermissions(roles)));

  return {
    user,
    isAdminUser: roles.length > 0 && !teamAccessBlocked,
    roles,
    assignedRoles: roles,
    permissions,
    permissionSource: dynamicPermissions.loaded ? "dynamic" : "static",
    dynamicRole,
    teamMember,
    teamAccessBlocked,
    isOwner,
    isSuperAdmin: roles.includes("super_admin"),
    isOwnerOrSuperAdmin: isOwner,
  };
}

export async function assertCurrentAdminPermission(permissionCode, options = {}) {
  const actor = await getCurrentAdminActor();
  const anyPermissions = Array.isArray(options.anyPermissions) ? options.anyPermissions : [];
  const allPermissions = Array.isArray(options.allPermissions) ? options.allPermissions : [];
  const message = options.message || "You do not have access to this admin action.";
  const anyPermissionCandidates = Array.from(new Set([
    ...(permissionCode ? [permissionCode] : []),
    ...anyPermissions,
  ]));

  if (!actor?.isAdminUser) {
    throw new Error(message);
  }

  const allowed = (
    (!anyPermissionCandidates.length || anyPermissionCandidates.some((candidate) => canAdminPermission(actor, candidate)))
    && (!allPermissions.length || allPermissions.every((candidate) => canAdminPermission(actor, candidate)))
  );

  if (!allowed) {
    throw new Error(message);
  }

  return actor;
}

export async function assertCurrentOwnerAdmin(message = "You do not have access to this admin section.") {
  const actor = await getCurrentAdminActor();

  if (!actor?.isAdminUser || !isOwnerAdmin(actor)) {
    throw new Error(message);
  }

  return actor;
}
