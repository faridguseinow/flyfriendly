import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPartnerReactivatedEmail, sendPartnerSuspendedEmail } from "../_shared/partner-program-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGER_ROLE_CODES = new Set([
  "super_admin",
  "admin",
  "operations_manager",
  "case_manager",
  "finance_manager",
  "content_manager",
  "manager",
]);

type RequestBody = {
  partner_id?: string;
  portal_status?: string;
  notes?: string | null;
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

function normalizeString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
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
    message: String(error || "Partner portal status update failed."),
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

  const [rolesResponse, profileResponse] = await Promise.all([
    serviceRoleClient.from("user_admin_roles").select("role_code").eq("user_id", userId),
    serviceRoleClient.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
  ]);

  if (rolesResponse.error) throw rolesResponse.error;
  if (profileResponse.error) throw profileResponse.error;

  const assignedRoles = (rolesResponse.data || [])
    .map((item) => String(item.role_code || "").trim().toLowerCase())
    .filter(Boolean);
  const profileRole = String(profileResponse.data?.role || "").trim().toLowerCase();
  const isAuthorized = assignedRoles.some((role) => MANAGER_ROLE_CODES.has(role))
    || MANAGER_ROLE_CODES.has(profileRole);

  if (!isAuthorized) {
    throw new Response(JSON.stringify({ error: { message: "You are not allowed to update partner access." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { userId };
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
    const nextPortalStatus = String(body.portal_status || "").trim().toLowerCase();
    const notes = normalizeString(body.notes);

    if (!partnerId) {
      return json({ error: { message: "partner_id is required." } }, { status: 400 });
    }

    if (!["pending", "approved", "rejected", "suspended"].includes(nextPortalStatus)) {
      return json({ error: { message: "A valid portal_status is required." } }, { status: 400 });
    }

    const partnerResponse = await supabase
      .from("referral_partners")
      .select("*")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerResponse.error) {
      throw partnerResponse.error;
    }

    const partner = partnerResponse.data;
    if (!partner) {
      return json({ error: { message: "Partner was not found." } }, { status: 404 });
    }

    const previousPortalStatus = String(partner.portal_status || "").trim().toLowerCase() || "pending";
    const statusMap: Record<string, string> = {
      approved: "active",
      pending: "paused",
      rejected: "archived",
      suspended: "paused",
    };

    const timeField = nextPortalStatus === "approved"
      ? { approved_at: partner.approved_at || new Date().toISOString(), rejected_at: null, suspended_at: null }
      : nextPortalStatus === "rejected"
        ? { rejected_at: new Date().toISOString() }
        : nextPortalStatus === "suspended"
          ? { suspended_at: new Date().toISOString() }
          : {};

    const updatePayload = {
      portal_status: nextPortalStatus,
      status: statusMap[nextPortalStatus] || partner.status,
      updated_at: new Date().toISOString(),
      ...timeField,
    };

    const updatedResponse = await supabase
      .from("referral_partners")
      .update(updatePayload)
      .eq("id", partner.id)
      .select("*")
      .single();

    if (updatedResponse.error) {
      throw updatedResponse.error;
    }

    const updatedPartner = updatedResponse.data;

    const profilePromise = partner.profile_id
      ? supabase.from("profiles").select("id, full_name, email").eq("id", partner.profile_id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const applicationPromise = partner.application_id
      ? supabase.from("partner_applications").select("preferred_language, email, full_name").eq("id", partner.application_id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [profileResponse, applicationResponse] = await Promise.all([profilePromise, applicationPromise]);

    if (profileResponse.error) {
      throw profileResponse.error;
    }

    if (applicationResponse.error) {
      throw applicationResponse.error;
    }

    const recipientEmail = normalizeString(partner.contact_email)
      || normalizeString(profileResponse.data?.email)
      || normalizeString(applicationResponse.data?.email);
    const recipientName = normalizeString(profileResponse.data?.full_name)
      || normalizeString(applicationResponse.data?.full_name)
      || normalizeString(partner.contact_name);
    const preferredLanguage = normalizeString(applicationResponse.data?.preferred_language) || "en";

    let emailResult: { sent?: boolean; skipped?: boolean; messageId?: string | null; error?: string } = { sent: false, skipped: true };
    if (recipientEmail) {
      try {
        if (nextPortalStatus === "suspended") {
          emailResult = await sendPartnerSuspendedEmail({
            email: recipientEmail,
            fullName: recipientName,
            preferredLanguage,
            partner: updatedPartner,
            notes,
          });
        } else if (previousPortalStatus === "suspended" && nextPortalStatus === "approved") {
          emailResult = await sendPartnerReactivatedEmail({
            email: recipientEmail,
            fullName: recipientName,
            preferredLanguage,
            partner: updatedPartner,
            notes,
          });
        }
      } catch (emailError) {
        console.error("update-partner-portal-status email_failed", {
          partner_id: updatedPartner.id,
          portal_status: nextPortalStatus,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
        emailResult = {
          sent: false,
          skipped: false,
          messageId: null,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        };
      }
    }

    return json({
      success: true,
      partner: updatedPartner,
      email: emailResult,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("update-partner-portal-status failed", errorPayload(error));
    return json({ error: errorPayload(error) }, { status: 500 });
  }
});
