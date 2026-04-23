import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { requireSupabase } from "../lib/supabase.js";
import { getAvailablePermissions, getRoleDefinition, hasPermission, normalizeRoleCode } from "./rbac.js";

const AdminAuthContext = createContext(null);

function isMissingTableError(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

async function fetchProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

export function AdminAuthProvider({ children }) {
  const [state, setState] = useState({
    isLoading: true,
    user: null,
    profile: null,
    roles: [],
  });

  useEffect(() => {
    const client = requireSupabase();

    const loadSession = async () => {
      setState((current) => ({ ...current, isLoading: true }));

      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        setState({ isLoading: false, user: null, profile: null, roles: [] });
        return;
      }

      const user = sessionData.session?.user || null;

      if (!user) {
        setState({ isLoading: false, user: null, profile: null, roles: [] });
        return;
      }

      try {
        const [profile, assignedRoles] = await Promise.all([
          fetchProfile(client, user.id),
          fetchAssignedRoles(client, user.id),
        ]);

        const fallbackRole = normalizeRoleCode(profile?.role);
        const roleSet = new Set(assignedRoles);
        if (fallbackRole) {
          roleSet.add(fallbackRole);
        }

        setState({
          isLoading: false,
          user,
          profile,
          roles: Array.from(roleSet),
        });
      } catch {
        setState({
          isLoading: false,
          user,
          profile: null,
          roles: [],
        });
      }
    };

    loadSession();

    const { data: authListener } = client.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const primaryRole = state.roles[0] || null;
    const permissions = getAvailablePermissions(state.roles);
    const roleLabels = state.roles.map((role) => getRoleDefinition(role).label);

    return {
      ...state,
      primaryRole,
      primaryRoleLabel: primaryRole ? getRoleDefinition(primaryRole).label : null,
      roleLabels,
      permissions,
      hasPermission: (permission) => hasPermission(state.roles, permission),
      isAdminUser: state.roles.length > 0,
      refreshAuth: async () => {
        const client = requireSupabase();
        const { data } = await client.auth.getSession();
        if (!data.session?.user) {
          setState({ isLoading: false, user: null, profile: null, roles: [] });
          return;
        }

        const [profile, assignedRoles] = await Promise.all([
          fetchProfile(client, data.session.user.id),
          fetchAssignedRoles(client, data.session.user.id),
        ]);
        const fallbackRole = normalizeRoleCode(profile?.role);
        const roleSet = new Set(assignedRoles);
        if (fallbackRole) {
          roleSet.add(fallbackRole);
        }

        setState({
          isLoading: false,
          user: data.session.user,
          profile,
          roles: Array.from(roleSet),
        });
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
