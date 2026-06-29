import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const EDIT_PERMISSION_CODES = ["blog.edit", "cms.edit"];

type TranslationRequestBody = {
  source_locale?: string;
  target_locale?: string;
  fields?: {
    title?: string;
    excerpt?: string;
    content?: string;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string[];
    cover_image_alt?: string;
  };
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

function normalizeLocale(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeKeywords(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];
}

async function requireAuthorizedAdmin(
  request: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
) {
  const authHeader = request.headers.get("Authorization");
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

  const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

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

  let hasEditPermission = false;
  if (teamMemberResponse.data?.role_id && teamMemberResponse.data?.status === "active") {
    const permissionsResponse = await serviceRoleClient
      .from("admin_role_permissions")
      .select("permission_code, is_allowed")
      .eq("role_id", teamMemberResponse.data.role_id)
      .in("permission_code", EDIT_PERMISSION_CODES);

    if (permissionsResponse.error) {
      throw permissionsResponse.error;
    }

    hasEditPermission = (permissionsResponse.data || []).some((item) => item.is_allowed !== false);
  }

  if (!hasPrivilegedRole && !hasEditPermission) {
    throw new Response(JSON.stringify({ error: { message: "You do not have permission to translate blog posts." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function translateWithGoogle({
  text,
  sourceLocale,
  targetLocale,
  format = "text",
  apiKey,
}: {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  format?: "text" | "html";
  apiKey: string;
}) {
  if (!text) {
    return "";
  }

  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: text,
      source: sourceLocale,
      target: targetLocale,
      format,
    }),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    const errorMessage = (
      (payload?.error as { message?: string } | undefined)?.message
      || String(payload?.error || payload?.message || `Google Translate request failed with status ${response.status}.`)
    );
    throw new Error(errorMessage);
  }

  const translations = ((payload?.data as { translations?: Array<{ translatedText?: string }> } | undefined)?.translations) || [];
  return normalizeText(translations[0]?.translatedText);
}

async function translateFields(body: TranslationRequestBody, apiKey: string) {
  const sourceLocale = normalizeLocale(body.source_locale);
  const targetLocale = normalizeLocale(body.target_locale);

  if (!sourceLocale || !targetLocale) {
    throw new Error("Source and target locales are required.");
  }

  if (sourceLocale === targetLocale) {
    throw new Error("Source and target locales must be different.");
  }

  const fields = body.fields || {};
  const seoKeywords = normalizeKeywords(fields.seo_keywords);

  const [
    title,
    excerpt,
    content,
    seoTitle,
    seoDescription,
    coverImageAlt,
    translatedKeywords,
  ] = await Promise.all([
    translateWithGoogle({ text: normalizeText(fields.title), sourceLocale, targetLocale, apiKey }),
    translateWithGoogle({ text: normalizeText(fields.excerpt), sourceLocale, targetLocale, apiKey }),
    translateWithGoogle({ text: normalizeText(fields.content), sourceLocale, targetLocale, format: "html", apiKey }),
    translateWithGoogle({ text: normalizeText(fields.seo_title), sourceLocale, targetLocale, apiKey }),
    translateWithGoogle({ text: normalizeText(fields.seo_description), sourceLocale, targetLocale, apiKey }),
    translateWithGoogle({ text: normalizeText(fields.cover_image_alt), sourceLocale, targetLocale, apiKey }),
    Promise.all(seoKeywords.map((keyword) => translateWithGoogle({
      text: keyword,
      sourceLocale,
      targetLocale,
      apiKey,
    }))),
  ]);

  return {
    provider: "google-cloud-translate-v2",
    fields: {
      title,
      excerpt,
      content,
      seo_title: seoTitle || title,
      seo_description: seoDescription || excerpt,
      seo_keywords: translatedKeywords.filter(Boolean),
      cover_image_alt: coverImageAlt,
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, { status: 405 });
  }

  try {
    const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
    const anonKey = normalizeText(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const googleApiKey = normalizeText(Deno.env.get("GOOGLE_TRANSLATE_API_KEY"));

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase function secrets are not configured.");
    }

    if (!googleApiKey) {
      throw new Error("GOOGLE_TRANSLATE_API_KEY is not configured in Supabase Edge Function secrets.");
    }

    await requireAuthorizedAdmin(request, supabaseUrl, anonKey, serviceRoleKey);

    const body = await request.json() as TranslationRequestBody;
    const result = await translateFields(body, googleApiKey);
    return json(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error || "Could not translate the blog post.");
    return json({ error: { message } }, { status: 500 });
  }
});
