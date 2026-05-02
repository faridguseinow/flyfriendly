import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPartnerApplicationReceivedEmail } from "../_shared/partner-program-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  full_name?: string;
  email?: string;
  phone?: string | null;
  country?: string;
  preferred_language?: string;
  public_name?: string;
  primary_platform?: string;
  audience_size?: string;
  audience_countries?: string[] | string;
  website_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  niche?: string | null;
  content_links?: string[] | string;
  motivation?: string;
  consent_accepted?: boolean;
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

function parseListInput(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildApplicationPayload(input: RequestBody, profile?: { id: string; email?: string | null; full_name?: string | null; phone?: string | null } | null) {
  return {
    profile_id: profile?.id || null,
    email: normalizeString(input.email) || normalizeString(profile?.email),
    full_name: normalizeString(input.full_name) || normalizeString(profile?.full_name),
    phone: normalizeString(input.phone) || normalizeString(profile?.phone),
    country: normalizeString(input.country),
    preferred_language: normalizeString(input.preferred_language) || "en",
    public_name: normalizeString(input.public_name),
    website_url: normalizeString(input.website_url),
    instagram_url: normalizeString(input.instagram_url),
    tiktok_url: normalizeString(input.tiktok_url),
    youtube_url: normalizeString(input.youtube_url),
    primary_platform: normalizeString(input.primary_platform),
    audience_size: normalizeString(input.audience_size),
    audience_countries: parseListInput(input.audience_countries),
    niche: normalizeString(input.niche),
    content_links: parseListInput(input.content_links),
    motivation: normalizeString(input.motivation),
    consent_accepted: Boolean(input.consent_accepted),
    status: "pending",
  };
}

function validateApplicationPayload(payload: ReturnType<typeof buildApplicationPayload>) {
  if (!payload.full_name) throw new Error("Full name is required.");
  if (!payload.email) throw new Error("Email is required.");
  if (!payload.country) throw new Error("Country is required.");
  if (!payload.preferred_language) throw new Error("Preferred language is required.");
  if (!payload.public_name) throw new Error("Public name is required.");
  if (!payload.primary_platform) throw new Error("Primary platform is required.");
  if (!payload.audience_size) throw new Error("Audience size is required.");
  if (!payload.motivation) throw new Error("Motivation is required.");
  if (!payload.consent_accepted) throw new Error("You must accept the partner program terms before submitting.");
}

async function maybeGetAuthedProfile(req: Request, supabaseUrl: string, anonKey: string, serviceRoleClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return null;
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
    return null;
  }

  const profileResponse = await serviceRoleClient
    .from("profiles")
    .select("id, email, full_name, phone")
    .eq("id", authUser.data.user.id)
    .maybeSingle();

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  return profileResponse.data || {
    id: authUser.data.user.id,
    email: authUser.data.user.email || null,
    full_name: (authUser.data.user.user_metadata?.full_name as string | undefined) || null,
    phone: (authUser.data.user.user_metadata?.phone as string | undefined) || null,
  };
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
    const body = await req.json().catch(() => ({})) as RequestBody;
    const profile = await maybeGetAuthedProfile(req, supabaseUrl, supabaseAnonKey, supabase);
    const payload = buildApplicationPayload(body, profile);
    validateApplicationPayload(payload);

    let existingQuery = supabase
      .from("partner_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (profile?.id) {
      existingQuery = existingQuery.eq("profile_id", profile.id);
    } else {
      existingQuery = existingQuery.eq("email", payload.email);
    }

    const existingResponse = await existingQuery.maybeSingle();
    if (existingResponse.error) {
      throw existingResponse.error;
    }

    const existing = existingResponse.data || null;
    if (existing?.status && !["cancelled", "rejected"].includes(String(existing.status).toLowerCase())) {
      return json({
        success: true,
        alreadyExists: true,
        application: existing,
      });
    }

    const insertResponse = await supabase
      .from("partner_applications")
      .insert(payload)
      .select("*")
      .single();

    if (insertResponse.error) {
      throw insertResponse.error;
    }

    const application = insertResponse.data;

    let emailResult: { sent?: boolean; skipped?: boolean; messageId?: string | null; error?: string } = { sent: false };
    try {
      emailResult = await sendPartnerApplicationReceivedEmail(application);
    } catch (emailError) {
      console.error("submit-partner-application email_failed", {
        application_id: application.id,
        email: application.email,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
      emailResult = {
        sent: false,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      };
    }

    return json({
      success: true,
      application,
      email: emailResult,
    });
  } catch (error) {
    console.error("submit-partner-application failed", error);
    return json({
      error: {
        message: error instanceof Error ? error.message : "Could not submit partner application.",
      },
    }, { status: 400 });
  }
});
