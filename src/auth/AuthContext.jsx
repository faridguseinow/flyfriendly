import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase.js";
import {
  ensureCurrentUserProfile,
  getCurrentPartnerProfile,
  getCurrentSession,
  getCurrentUser,
  signOut as signOutUser,
} from "../services/authService.js";
import { getNormalizedRole, resolveDashboardPath } from "./routeUtils.js";

const AuthContext = createContext(null);

async function buildAuthState() {
  const session = await getCurrentSession();
  const user = session?.user || null;

  if (!user) {
    return {
      user: null,
      session: null,
      profile: null,
      partnerProfile: null,
    };
  }

  const profile = await ensureCurrentUserProfile({
    email: user.email || null,
    fullName: user.user_metadata?.full_name || null,
    phone: user.user_metadata?.phone || null,
  });

  if (profile?.deleted_at) {
    return {
      user: null,
      session: null,
      profile,
      partnerProfile: null,
    };
  }

  const partnerProfile = await getCurrentPartnerProfile().catch(() => null);

  return {
    user,
    session,
    profile,
    partnerProfile,
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    user: null,
    session: null,
    profile: null,
    partnerProfile: null,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({
        loading: false,
        user: null,
        session: null,
        profile: null,
        partnerProfile: null,
      });
      return;
    }

    const client = requireSupabase();
    let active = true;

    const load = async () => {
      setState((current) => ({ ...current, loading: true }));

      try {
        const next = await buildAuthState();
        if (active) {
          setState({
            loading: false,
            ...next,
          });
        }
      } catch {
        if (active) {
          const user = await getCurrentUser().catch(() => null);
          setState({
            loading: false,
            user,
            session: null,
            profile: null,
            partnerProfile: null,
          });
        }
      }
    };

    load();

    const { data: authListener } = client.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const role = getNormalizedRole(state.profile, state.partnerProfile);
    const dashboardPath = resolveDashboardPath(state.profile, state.partnerProfile);

    return {
      ...state,
      isAuthenticated: Boolean(state.user),
      role,
      dashboardPath,
      refreshProfile: async () => {
        if (!isSupabaseConfigured) {
          const fallback = {
            loading: false,
            user: null,
            session: null,
            profile: null,
            partnerProfile: null,
          };
          setState(fallback);
          return fallback;
        }

        setState((current) => ({ ...current, loading: true }));
        const next = await buildAuthState();
        const resolved = {
          loading: false,
          ...next,
        };
        setState(resolved);
        return resolved;
      },
      signOut: async () => {
        await signOutUser();
        setState({
          loading: false,
          user: null,
          session: null,
          profile: null,
          partnerProfile: null,
        });
      },
    };
  }, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
