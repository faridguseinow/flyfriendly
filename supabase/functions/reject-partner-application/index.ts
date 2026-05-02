import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPartnerRejectionEmail } from "../_shared/partner-program-email.ts";

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
  application_id?: string;
  rejection_reason?: string | null;
  notes?: string | null;
};

type PartnerApplicationRow = {
  id: string;
  profile_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  country: string | null;
  preferred_language: string | null;
  public_name: string | null;
  website_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  primary_platform: string | null;
  audience_size: string | null;
  audience_countries: unknown;
  niche: string | null;
  content_links: unknown;
  motivation: string | null;
  consent_accepted: boolean | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
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
      message: source.message || "Partner rejection failed.",
      code: source.code || null,
      details: source.details || null,
      hint: source.hint || null,
    };
  }

  return {
    message: String(error || "Partner rejection failed."),
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

function normalizeLanguage(value: unknown) {
  return String(value || "en").trim().toLowerCase() || "en";
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

  const [rolesResponse, profileResponse] = await Promise.all([
    serviceRoleClient
      .from("user_admin_roles")
      .select("role_code")
      .eq("user_id", userId),
    serviceRoleClient
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (rolesResponse.error) {
    throw rolesResponse.error;
  }

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  const assignedRoles = (rolesResponse.data || [])
    .map((item) => String(item.role_code || "").trim().toLowerCase())
    .filter(Boolean);
  const profileRole = String(profileResponse.data?.role || "").trim().toLowerCase();
  const isAuthorized = assignedRoles.some((role) => MANAGER_ROLE_CODES.has(role))
    || MANAGER_ROLE_CODES.has(profileRole);

  if (!isAuthorized) {
    throw new Response(JSON.stringify({ error: { message: "You are not allowed to reject partner applications." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return {
    userId,
    profile: profileResponse.data || null,
    roles: assignedRoles,
  };
}

async function loadApplication(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
) {
  const response = await supabase
    .from("partner_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return (response.data || null) as PartnerApplicationRow | null;
}

async function markApplicationRejected(
  supabase: ReturnType<typeof createClient>,
  application: PartnerApplicationRow,
  reviewerUserId: string,
  rejectionReason: string,
) {
  const payload = {
    status: "rejected",
    rejection_reason: rejectionReason,
    reviewed_by: reviewerUserId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("partner_applications")
    .update(payload)
    .eq("id", application.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PartnerApplicationRow;
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
    const reviewer = await requireAuthorizedReviewer(req, supabaseUrl, supabaseAnonKey, supabase);
    const body = await req.json().catch(() => ({})) as RequestBody;
    const applicationId = String(body.application_id || "").trim();
    const rejectionReason = normalizeString(body.rejection_reason);

    if (!applicationId) {
      return json({ error: { message: "application_id is required." } }, { status: 400 });
    }

    if (!rejectionReason) {
      return json({ error: { message: "rejection_reason is required." } }, { status: 400 });
    }

    const application = await loadApplication(supabase, applicationId);
    if (!application) {
      return json({ error: { message: "Partner application was not found." } }, { status: 404 });
    }

    if (application.status !== "pending") {
      return json({
        error: {
          message: `Only pending applications can be rejected. Current status: ${application.status}.`,
        },
      }, { status: 409 });
    }

    const rejectedApplication = await markApplicationRejected(
      supabase,
      application,
      reviewer.userId,
      rejectionReason,
    );

    let emailResult: { sent: boolean; skipped?: boolean; messageId?: string | null; error?: string } = { sent: false, skipped: true };
    try {
      emailResult = await sendPartnerRejectionEmail({
        application,
        rejectionReason,
        notes: normalizeString(body.notes),
      });
    } catch (emailError) {
      emailResult = {
        sent: false,
        skipped: false,
        messageId: null,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      };
      console.error("reject-partner-application email_error", errorPayload(emailError));
    }

    return json({
      success: true,
      application: rejectedApplication,
      email: emailResult,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("reject-partner-application failed", errorPayload(error));
    return json({ error: errorPayload(error) }, { status: 500 });
  }
});
