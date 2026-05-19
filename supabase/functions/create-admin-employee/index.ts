import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPublicAuthUrl } from "../_shared/site-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIVILEGED_ROLE_CODES = new Set([
  "owner",
  "super_admin",
  "admin",
]);

type RequestBody = {
  email?: string;
  password?: string;
  full_name?: string | null;
  phone?: string | null;
  role_id?: string | null;
  status?: string | null;
  send_setup_link?: boolean | null;
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    const source = error as Error & { code?: string; details?: string; hint?: string };
    return {
      message: source.message,
      code: source.code || null,
      details: source.details || null,
      hint: source.hint || null,
    };
  }

  if (error && typeof error === "object") {
    const source = error as { message?: string; code?: string; details?: string; hint?: string };
    return {
      message: source.message || "Could not create admin employee.",
      code: source.code || null,
      details: source.details || null,
      hint: source.hint || null,
    };
  }

  return {
    message: String(error || "Could not create admin employee."),
    code: null,
    details: null,
    hint: null,
  };
}

function cleanObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function normalizeString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeStatus(value: unknown) {
  const normalized = String(value || "active").trim().toLowerCase();
  if (["active", "invited", "inactive", "suspended", "archived"].includes(normalized)) {
    return normalized;
  }
  return "active";
}

function isUserMissingError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("user not found")
    || message.includes("user with this email not found")
    || message.includes("not_found")
    || message.includes("no user")
    || message.includes("user does not exist");
}

function normalizeProfileRole(currentRole: string | null | undefined) {
  const role = String(currentRole || "").trim().toLowerCase();
  if (role === "owner" || role === "partner") {
    return role;
  }
  return null;
}

async function requireAuthorizedAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleClient: ReturnType<typeof createClient>,
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: { message: "Missing authorization header." } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authedClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const authUser = await authedClient.auth.getUser();
  if (authUser.error || !authUser.data.user) {
    throw new Response(JSON.stringify({ error: { message: "Unauthorized request." } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = authUser.data.user.id;

  const [rolesResponse, teamMemberResponse] = await Promise.all([
    serviceRoleClient
      .from("user_admin_roles")
      .select("role_code")
      .eq("user_id", userId),
    serviceRoleClient
      .from("admin_team_members")
      .select("role_id, status")
      .eq("profile_id", userId)
      .maybeSingle(),
  ]);

  if (rolesResponse.error) {
    throw rolesResponse.error;
  }

  if (teamMemberResponse.error && teamMemberResponse.error.code !== "PGRST116") {
    throw teamMemberResponse.error;
  }

  const assignedRoleCodes = new Set((rolesResponse.data || []).map((item) => String(item.role_code || "").trim().toLowerCase()));
  const hasPrivilegedRole = Array.from(assignedRoleCodes).some((roleCode) => PRIVILEGED_ROLE_CODES.has(roleCode));

  let hasDynamicManagePermission = false;
  if (teamMemberResponse.data?.role_id && teamMemberResponse.data?.status === "active") {
    const permissionsResponse = await serviceRoleClient
      .from("admin_role_permissions")
      .select("permission_code, is_allowed")
      .eq("role_id", teamMemberResponse.data.role_id)
      .in("permission_code", ["team.manage", "roles.manage"]);

    if (permissionsResponse.error) {
      throw permissionsResponse.error;
    }

    hasDynamicManagePermission = (permissionsResponse.data || []).some((item) => item.is_allowed !== false);
  }

  if (!hasPrivilegedRole && !hasDynamicManagePermission) {
    throw new Response(JSON.stringify({ error: { message: "You do not have permission to create employees." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return authUser.data.user;
}

async function createOrUpdateAuthUser(
  serviceRoleClient: ReturnType<typeof createClient>,
  email: string,
  password: string,
  metadata: Record<string, unknown>,
) {
  const redirectTo = buildPublicAuthUrl("/auth/reset-password");
  const recoveryAttempt = await serviceRoleClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  });

  if (!recoveryAttempt.error && recoveryAttempt.data.user) {
    const updateResponse = await serviceRoleClient.auth.admin.updateUserById(recoveryAttempt.data.user.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (updateResponse.error || !updateResponse.data.user) {
      throw updateResponse.error || new Error("Could not update existing employee account.");
    }

    return {
      user: updateResponse.data.user,
      existed: true,
    };
  }

  if (!isUserMissingError(recoveryAttempt.error)) {
    throw recoveryAttempt.error;
  }

  const createdUser = await serviceRoleClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (createdUser.error || !createdUser.data.user) {
    throw createdUser.error || new Error("Could not create employee account.");
  }

  return {
    user: createdUser.data.user,
    existed: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase environment variables are not configured.");
    }

    const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const actor = await requireAuthorizedAdmin(req, supabaseUrl, anonKey, serviceRoleClient);

    const body = await req.json() as RequestBody;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = normalizeString(body.full_name);
    const phone = normalizeString(body.phone);
    const roleId = String(body.role_id || "").trim();
    const status = normalizeStatus(body.status);

    if (!email) {
      throw new Error("Email is required.");
    }

    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (!roleId) {
      throw new Error("Role is required.");
    }

    const [roleResponse, existingProfileResponse] = await Promise.all([
      serviceRoleClient
        .from("admin_roles")
        .select("id, code, name, label, is_active")
        .eq("id", roleId)
        .maybeSingle(),
      serviceRoleClient
        .from("profiles")
        .select("id, email, full_name, phone, role, status")
        .eq("email", email)
        .maybeSingle(),
    ]);

    if (roleResponse.error) {
      throw roleResponse.error;
    }

    if (!roleResponse.data?.id) {
      throw new Error("Role not found.");
    }

    if (roleResponse.data.is_active === false) {
      throw new Error("Selected role is inactive.");
    }

    if (existingProfileResponse.error && existingProfileResponse.error.code !== "PGRST116") {
      throw existingProfileResponse.error;
    }

    const authAccount = await createOrUpdateAuthUser(
      serviceRoleClient,
      email,
      password,
      cleanObject({
        full_name: fullName,
        phone,
      }),
    );

    const existingProfile = existingProfileResponse.data || null;
    if (existingProfile?.id && existingProfile.id !== authAccount.user.id) {
      throw new Error("An existing profile with this email is linked to a different auth account.");
    }

    const profilePayload = {
      id: authAccount.user.id,
      email,
      full_name: fullName || existingProfile?.full_name || null,
      phone: phone || existingProfile?.phone || null,
      role: normalizeProfileRole(existingProfile?.role),
      status: existingProfile?.status || "active",
    };

    const profileResponse = await serviceRoleClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select("id, email, full_name, phone, role, status")
      .single();

    if (profileResponse.error) {
      throw profileResponse.error;
    }

    const teamMemberResponse = await serviceRoleClient
      .from("admin_team_members")
      .upsert({
        profile_id: authAccount.user.id,
        email,
        full_name: fullName || profileResponse.data.full_name || null,
        role_id: roleResponse.data.id,
        status,
        invited_by: actor.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id" })
      .select("id, profile_id, email, full_name, role_id, status")
      .single();

    if (teamMemberResponse.error) {
      throw teamMemberResponse.error;
    }

    const removeRolesResponse = await serviceRoleClient
      .from("user_admin_roles")
      .delete()
      .eq("user_id", authAccount.user.id);

    if (removeRolesResponse.error) {
      throw removeRolesResponse.error;
    }

    if (status === "active") {
      const insertRolesResponse = await serviceRoleClient
        .from("user_admin_roles")
        .insert({
          user_id: authAccount.user.id,
          role_code: String(roleResponse.data.code || "").trim(),
          assigned_by: actor.id,
        });

      if (insertRolesResponse.error) {
        throw insertRolesResponse.error;
      }
    }

    return json({
      success: true,
      profile: profileResponse.data,
      profile_id: profileResponse.data.id,
      team_member: teamMemberResponse.data,
      role: {
        id: roleResponse.data.id,
        code: roleResponse.data.code,
        name: roleResponse.data.name || roleResponse.data.label || roleResponse.data.code,
      },
      auth_user_id: authAccount.user.id,
      auth_user_existed: authAccount.existed,
      send_setup_link: Boolean(body.send_setup_link),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return json({ error: errorPayload(error) }, { status: 400 });
  }
});
