import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase.js";
import { ALL_PERMISSIONS, getAvailablePermissions, getRoleDefinition, hasPermission, isAdminRoleCode, normalizeRoleCode } from "./rbac.js";
import { buildAdminPermissionsFromPageAccess } from "./adminPages.js";

const AdminAuthContext = createContext(null);
const ADMIN_PROFILE_SELECTS = [
  "id, full_name, email, phone, role, preferred_language, avatar_url, deleted_at, purge_after, created_at",
  "id, full_name, email, phone, role, preferred_language, deleted_at, purge_after, created_at",
  "id, full_name, email, phone, role, avatar_url, deleted_at, purge_after, created_at",
  "id, full_name, email, phone, role, deleted_at, purge_after, created_at",
  "id, full_name, email, phone, role, deleted_at, created_at",
  "id, full_name, email, phone, role",
];

function isMissingTableError(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.message?.includes("column") || error?.message?.includes("schema cache");
}

async function selectMaybeSingleWithFallback(buildQuery, selectVariants) {
  let lastError = null;

  for (const fields of selectVariants) {
    const { data, error } = await buildQuery(fields);
    if (!error) {
      return data || null;
    }

    if (!isMissingColumnError(error)) {
      throw error;
    }

    lastError = error;
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function fetchProfile(client, userId) {
  return selectMaybeSingleWithFallback(
    (fields) => client
      .from("profiles")
      .select(fields)
      .eq("id", userId)
      .maybeSingle(),
    ADMIN_PROFILE_SELECTS,
  );
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

  return (response.data || []).map((item) => normalizeRoleCode(item.role_code)).filter(Boolean);
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

async function fetchDynamicRole(client, teamMember, roleCodes = []) {
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

  if (!roleCodes.length) {
    return null;
  }

  const response = await client
    .from("admin_roles")
    .select("id, code, label, name, is_owner_role, is_system_role, is_active, rank")
    .in("code", roleCodes);

  if (response.error) {
    if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
      return null;
    }

    throw response.error;
  }

  return (response.data || [])
    .filter((item) => item?.is_active !== false)
    .sort((left, right) => Number(right.rank || 0) - Number(left.rank || 0))[0] || null;
}

async function fetchDynamicPermissions(client, dynamicRole) {
  if (!dynamicRole?.code && !dynamicRole?.id) {
    return { permissions: [], loaded: false };
  }

  if (dynamicRole.is_owner_role || dynamicRole.code === "owner" || dynamicRole.code === "super_admin") {
    return { permissions: ["*"], loaded: true };
  }

  const orParts = [];
  if (dynamicRole.id) {
    orParts.push(`role_id.eq.${dynamicRole.id}`);
  }
  if (dynamicRole.code) {
    orParts.push(`role_code.eq.${dynamicRole.code}`);
  }

  if (!orParts.length) {
    return { permissions: [], loaded: false };
  }

  const response = await client
    .from("admin_role_permissions")
    .select("permission_code, permission_id, is_allowed")
    .or(orParts.join(","));

  if (response.error) {
    if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
      return { permissions: [], loaded: false };
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

  const permissions = Array.from(new Set(
    rows
      .filter((item) => item.is_allowed !== false)
      .map((item) => item.permission_code || permissionsById.get(item.permission_id) || null)
      .filter(Boolean),
  ));

  return { permissions, loaded: true };
}

async function fetchEmployeePageAccess(client, teamMemberId) {
  if (!teamMemberId) {
    return { rows: [], loaded: false };
  }

  const response = await client
    .from("admin_employee_page_access")
    .select("menu_item_key, can_view, can_edit")
    .eq("team_member_id", teamMemberId);

  if (response.error) {
    if (isMissingTableError(response.error) || isMissingColumnError(response.error)) {
      return { rows: [], loaded: false };
    }

    throw response.error;
  }

  return {
    rows: (response.data || [])
      .filter((item) => item.menu_item_key && item.can_view !== false)
      .map((item) => ({
        pageKey: item.menu_item_key,
        canView: item.can_view !== false,
        canEdit: item.can_edit === true,
      })),
    loaded: true,
  };
}

async function loadAdminAccessState(client, user) {
  const [profile, assignedRoles, teamMember] = await Promise.all([
    fetchProfile(client, user.id),
    fetchAssignedRoles(client, user.id),
    fetchAdminTeamMember(client, user.id),
  ]);

  const staticRoles = profile?.deleted_at
    ? []
    : Array.from(new Set([
      ...(isAdminRoleCode(profile?.role) ? [normalizeRoleCode(profile.role)] : []),
      ...assignedRoles.filter((role) => isAdminRoleCode(role)),
    ]));
  const dynamicRole = await fetchDynamicRole(client, teamMember, staticRoles);
  const dynamicPermissions = await fetchDynamicPermissions(client, dynamicRole);
  const employeePageAccess = await fetchEmployeePageAccess(client, teamMember?.id || null);
  const dynamicRoleCode = dynamicRole?.code
    ? (isAdminRoleCode(dynamicRole.code) ? normalizeRoleCode(dynamicRole.code) : dynamicRole.code)
    : null;
  const roles = Array.from(new Set([
    ...(dynamicRoleCode ? [dynamicRoleCode] : []),
    ...staticRoles,
  ]));
  const roleLabels = roles.map((role) => (
    role === dynamicRole?.code
      ? (dynamicRole.label || dynamicRole.name || getRoleDefinition(role).label)
      : getRoleDefinition(role).label
  ));
  const isOwner = roles.includes("owner") || roles.includes("super_admin") || !!dynamicRole?.is_owner_role;
  const teamStatus = teamMember?.status || null;
  const teamAccessBlocked = !!teamMember && teamStatus !== "active";
  const permissionSource = isOwner
    ? "owner"
    : (employeePageAccess.loaded ? "page_access" : (dynamicPermissions.loaded ? "dynamic" : "static"));
  const permissions = teamAccessBlocked
    ? []
    : (isOwner
      ? ["*"]
      : (
        employeePageAccess.loaded
          ? buildAdminPermissionsFromPageAccess(employeePageAccess.rows)
          : (dynamicPermissions.loaded ? dynamicPermissions.permissions : getAvailablePermissions(roles))
      ));

  return {
    profile,
    assignedRoles: roles,
    roleLabels,
    teamMember,
    dynamicRole,
    permissions,
    permissionSource,
    teamAccessBlocked,
    isOwner,
    pageAccessRows: employeePageAccess.rows,
    allowedAdminPageKeys: employeePageAccess.rows.filter((item) => item.canView).map((item) => item.pageKey),
  };
}

export function AdminAuthProvider({ children }) {
  const [state, setState] = useState({
    isLoading: true,
    user: null,
    profile: null,
    roles: [],
    permissions: [],
    permissionSource: "static",
    teamMember: null,
    dynamicRole: null,
    teamAccessBlocked: false,
    pageAccessRows: [],
    allowedAdminPageKeys: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({
        isLoading: false,
        user: null,
        profile: null,
        roles: [],
        permissions: [],
        permissionSource: "static",
        teamMember: null,
        dynamicRole: null,
        teamAccessBlocked: false,
      });
      return;
    }

    const client = requireSupabase();

    const loadSession = async ({ silent = false } = {}) => {
      if (!silent) {
        setState((current) => ({ ...current, isLoading: true }));
      }

      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        setState({
          isLoading: false,
          user: null,
          profile: null,
          roles: [],
          permissions: [],
          permissionSource: "static",
          teamMember: null,
          dynamicRole: null,
          teamAccessBlocked: false,
          pageAccessRows: [],
          allowedAdminPageKeys: [],
        });
        return;
      }

      const user = sessionData.session?.user || null;

      if (!user) {
        setState({
          isLoading: false,
          user: null,
          profile: null,
          roles: [],
          permissions: [],
          permissionSource: "static",
          teamMember: null,
          dynamicRole: null,
          teamAccessBlocked: false,
          pageAccessRows: [],
          allowedAdminPageKeys: [],
        });
        return;
      }

      try {
        const accessState = await loadAdminAccessState(client, user);

        setState({
          isLoading: false,
          user,
          profile: accessState.profile,
          roles: accessState.assignedRoles,
          permissions: accessState.permissions,
          permissionSource: accessState.permissionSource,
          teamMember: accessState.teamMember,
          dynamicRole: accessState.dynamicRole,
          teamAccessBlocked: accessState.teamAccessBlocked,
          pageAccessRows: accessState.pageAccessRows,
          allowedAdminPageKeys: accessState.allowedAdminPageKeys,
        });
      } catch {
        setState({
          isLoading: false,
          user,
          profile: null,
          roles: [],
          permissions: [],
          permissionSource: "static",
          teamMember: null,
          dynamicRole: null,
          teamAccessBlocked: false,
          pageAccessRows: [],
          allowedAdminPageKeys: [],
        });
      }
    };

    loadSession();

    const { data: authListener } = client.auth.onAuthStateChange(() => {
      loadSession({ silent: true });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const primaryRole = state.roles[0] || null;
    const permissions = state.permissions || [];
    const roleLabels = state.roleLabels || state.roles.map((role) => getRoleDefinition(role).label);
    const permissionList = permissions.includes("*")
      ? ALL_PERMISSIONS
      : permissions;

    const checkPermission = (permission) => {
      if (!permission) {
        return (state.isOwner || Boolean(state.teamMember?.id)) && !state.teamAccessBlocked;
      }

      if (state.teamAccessBlocked) {
        return false;
      }

      if (permissions.includes("*") || permissionList.includes(permission)) {
        return true;
      }

      if (state.permissionSource === "dynamic" || state.permissionSource === "page_access") {
        return false;
      }

      return hasPermission(state.roles, permission);
    };

    return {
      ...state,
      primaryRole,
      primaryRoleLabel: primaryRole ? getRoleDefinition(primaryRole).label : null,
      roleLabels,
      isOwner: state.isOwner || state.roles.includes("owner"),
      isSuperAdmin: state.roles.includes("super_admin"),
      isOwnerOrSuperAdmin: state.isOwner || state.roles.includes("owner") || state.roles.includes("super_admin"),
      permissions: permissionList,
      pageAccessRows: state.pageAccessRows || [],
      allowedAdminPageKeys: state.allowedAdminPageKeys || [],
      permissionSource: state.permissionSource || "static",
      hasPermission: checkPermission,
      hasAnyPermission: (keys = []) => !keys?.length || keys.some((key) => checkPermission(key)),
      hasAllPermissions: (keys = []) => !keys?.length || keys.every((key) => checkPermission(key)),
      isAdminUser: (state.isOwner || Boolean(state.teamMember?.id)) && !state.teamAccessBlocked,
      refreshAuth: async () => {
        if (!isSupabaseConfigured) {
          setState({
            isLoading: false,
            user: null,
            profile: null,
            roles: [],
            permissions: [],
            permissionSource: "static",
            teamMember: null,
            dynamicRole: null,
            teamAccessBlocked: false,
            pageAccessRows: [],
            allowedAdminPageKeys: [],
          });
          return {
            isLoading: false,
            user: null,
            profile: null,
            roles: [],
            permissions: [],
            permissionSource: "static",
            teamMember: null,
            dynamicRole: null,
            teamAccessBlocked: false,
            pageAccessRows: [],
            allowedAdminPageKeys: [],
            isAdminUser: false,
          };
        }

        const client = requireSupabase();
        const { data } = await client.auth.getSession();
        if (!data.session?.user) {
          setState({
            isLoading: false,
            user: null,
            profile: null,
            roles: [],
            permissions: [],
            permissionSource: "static",
            teamMember: null,
            dynamicRole: null,
            teamAccessBlocked: false,
            pageAccessRows: [],
            allowedAdminPageKeys: [],
          });
          return {
            isLoading: false,
            user: null,
            profile: null,
            roles: [],
            permissions: [],
            permissionSource: "static",
            teamMember: null,
            dynamicRole: null,
            teamAccessBlocked: false,
            pageAccessRows: [],
            allowedAdminPageKeys: [],
            isAdminUser: false,
          };
        }

        const accessState = await loadAdminAccessState(client, data.session.user);

        const nextState = {
          isLoading: false,
          user: data.session.user,
          profile: accessState.profile,
          roles: accessState.assignedRoles,
          permissions: accessState.permissions,
          permissionSource: accessState.permissionSource,
          teamMember: accessState.teamMember,
          dynamicRole: accessState.dynamicRole,
          teamAccessBlocked: accessState.teamAccessBlocked,
          roleLabels: accessState.roleLabels,
          isOwner: accessState.isOwner,
          pageAccessRows: accessState.pageAccessRows,
          allowedAdminPageKeys: accessState.allowedAdminPageKeys,
        };

        setState(nextState);

        return {
          ...nextState,
          isAdminUser: (nextState.isOwner || Boolean(nextState.teamMember?.id)) && !nextState.teamAccessBlocked,
        };
      },
    };
  }, [state]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider.");
  }

  return context;
}

export function useAdminPermissions() {
  const {
    permissions,
    permissionSource,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  } = useAdminAuth();

  return {
    permissions,
    permissionSource,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
