import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGER_ROLE_CODES = new Set([
  "owner",
  "super_admin",
  "admin",
  "partner_manager",
  "operations_manager",
  "case_manager",
  "finance_manager",
  "content_manager",
  "manager",
]);

const REQUIRED_PERMISSION = "partners.edit";

type RequestBody = {
  partner_id?: string;
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

  return {
    message: String(error || "Partner delete failed."),
    code: null,
    details: null,
    hint: null,
  };
}

async function requireAuthorizedReviewer(
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
    global: { headers: { Authorization: authHeader } },
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

  const [rolesResponse, profileResponse, teamMemberResponse] = await Promise.all([
    serviceRoleClient.from("user_admin_roles").select("role_code").eq("user_id", userId),
    serviceRoleClient.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    serviceRoleClient.from("admin_team_members").select("role_id, status").eq("profile_id", userId).maybeSingle(),
  ]);

  if (rolesResponse.error) throw rolesResponse.error;
  if (profileResponse.error) throw profileResponse.error;
  if (teamMemberResponse.error) throw teamMemberResponse.error;

  let teamRoleCode = "";
  if (teamMemberResponse.data?.role_id && teamMemberResponse.data?.status === "active") {
    const roleResponse = await serviceRoleClient
      .from("admin_roles")
      .select("code")
      .eq("id", teamMemberResponse.data.role_id)
      .maybeSingle();

    if (roleResponse.error) throw roleResponse.error;
    teamRoleCode = String(roleResponse.data?.code || "").trim().toLowerCase();
  }

  const assignedRoles = (rolesResponse.data || [])
    .map((item) => String(item.role_code || "").trim().toLowerCase())
    .filter(Boolean);
  const profileRoleCode = String(profileResponse.data?.role || "").trim().toLowerCase();
  const effectiveRoles = Array.from(new Set([
    profileRoleCode,
    ...assignedRoles,
    teamRoleCode,
  ].filter(Boolean)));
  let isAuthorized = effectiveRoles.some((role) => MANAGER_ROLE_CODES.has(role));

  if (!isAuthorized && effectiveRoles.length) {
    const permissionsResponse = await serviceRoleClient
      .from("admin_role_permissions")
      .select("role_code, permission_code, is_allowed")
      .in("role_code", effectiveRoles)
      .eq("permission_code", REQUIRED_PERMISSION);

    if (permissionsResponse.error) throw permissionsResponse.error;

    isAuthorized = (permissionsResponse.data || []).some((item) => item.is_allowed !== false);
  }

  if (!isAuthorized) {
    throw new Response(JSON.stringify({ error: { message: "You are not allowed to delete partners." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json({ error: { message: "Supabase environment variables are missing." } }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    await requireAuthorizedReviewer(req, supabaseUrl, supabaseAnonKey, supabase);
    const body = await req.json().catch(() => ({})) as RequestBody;
    const partnerId = String(body.partner_id || "").trim();

    if (!partnerId) {
      return json({ error: { message: "partner_id is required." } }, { status: 400 });
    }

    const partnerResponse = await supabase
      .from("referral_partners")
      .select("id, profile_id, application_id, name, public_name, contact_email, referral_code, portal_status")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerResponse.error) {
      throw partnerResponse.error;
    }

    const partner = partnerResponse.data;
    if (!partner) {
      return json({ error: { message: "Partner was not found." } }, { status: 404 });
    }

    const [referralsCount, commissionsCount, payoutsCount, leadsCount, casesCount] = await Promise.all([
      supabase.from("referrals").select("id", { count: "exact", head: true }).eq("partner_id", partner.id),
      supabase.from("partner_commissions").select("id", { count: "exact", head: true }).eq("partner_id", partner.id),
      supabase.from("referral_partner_payouts").select("id", { count: "exact", head: true }).eq("partner_id", partner.id),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("referral_partner_id", partner.id),
      supabase.from("cases").select("id", { count: "exact", head: true }).eq("referral_partner_id", partner.id),
    ]);

    const countResponses = [referralsCount, commissionsCount, payoutsCount, leadsCount, casesCount];
    const countError = countResponses.find((item) => item.error)?.error;
    if (countError) {
      throw countError;
    }

    const linkedCounts = {
      referrals: referralsCount.count ?? 0,
      commissions: commissionsCount.count ?? 0,
      payouts: payoutsCount.count ?? 0,
      leads: leadsCount.count ?? 0,
      cases: casesCount.count ?? 0,
    };

    if (Object.values(linkedCounts).some((value) => value > 0)) {
      return json({
        error: {
          message: "This partner already has linked referrals, leads, cases, commissions, or payouts and cannot be deleted from admin. Suspend the partner instead.",
        },
        linkedCounts,
      }, { status: 409 });
    }

    if (partner.profile_id) {
      const profileUpdate = await supabase
        .from("profiles")
        .update({ role: "client" })
        .eq("id", partner.profile_id)
        .eq("role", "partner");

      if (profileUpdate.error) {
        throw profileUpdate.error;
      }
    }

    if (partner.application_id) {
      const applicationDelete = await supabase
        .from("partner_applications")
        .delete()
        .eq("id", partner.application_id);

      if (applicationDelete.error) {
        throw applicationDelete.error;
      }
    }

    const deleteResponse = await supabase
      .from("referral_partners")
      .delete()
      .eq("id", partner.id)
      .select("id, profile_id, application_id")
      .single();

    if (deleteResponse.error) {
      throw deleteResponse.error;
    }

    return json({
      success: true,
      partner: deleteResponse.data,
      profile: partner.profile_id ? { id: partner.profile_id, role: "client" } : null,
      application: partner.application_id ? { id: partner.application_id, deleted: true } : null,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("delete-partner-account failed", errorPayload(error));
    return json({ error: errorPayload(error) }, { status: 500 });
  }
});
