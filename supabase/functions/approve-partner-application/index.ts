import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPublicAuthUrl } from "../_shared/site-url.ts";
import { sendPartnerApprovalEmail } from "../_shared/partner-program-email.ts";

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
  commission_rate?: number | string | null;
  referral_code?: string | null;
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
  notes?: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PortalAccountResult = {
  userId: string;
  email: string;
  isNewUser: boolean;
  accessLink: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
};

type PartnerRow = {
  id: string;
  profile_id: string | null;
  application_id: string | null;
  name: string;
  public_name: string | null;
  referral_code: string;
  referral_link: string | null;
  commission_rate: number;
  commission_type: string;
  status: string;
  portal_status: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  notes: string | null;
  approved_at: string | null;
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
      message: source.message || "Partner approval failed.",
      code: source.code || null,
      details: source.details || null,
      hint: source.hint || null,
    };
  }

  return {
    message: String(error || "Partner approval failed."),
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

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLanguage(value: unknown) {
  return String(value || "en").trim().toLowerCase() || "en";
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildCandidate(base: string, index: number, limit: number) {
  const normalized = String(base || "partner").replace(/^-+|-+$/g, "") || "partner";
  return (index === 0 ? normalized : `${normalized}-${index + 1}`).slice(0, limit);
}

function normalizeRecoveryActionLink(actionLink: string | null | undefined, language: string) {
  const canonicalUrl = buildPublicAuthUrl(language, "/auth/reset-password");
  const rawLink = String(actionLink || "").trim();

  if (!rawLink) {
    return canonicalUrl;
  }

  try {
    const parsed = new URL(rawLink);
    return `${canonicalUrl}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return canonicalUrl;
  }
}

function isUserMissingError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("user not found")
    || message.includes("user with this email not found")
    || message.includes("not_found")
    || message.includes("no user")
    || message.includes("user does not exist");
}

function randomPassword() {
  return `FlyFriendly!${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function normalizePartnerProfileRole(currentRole: string | null | undefined) {
  const role = String(currentRole || "").trim().toLowerCase();

  if (MANAGER_ROLE_CODES.has(role)) {
    return role;
  }

  if (role === "support" || role === "customer_support_agent") {
    return role;
  }

  return "partner";
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
    throw new Response(JSON.stringify({ error: { message: "You are not allowed to approve partner applications." } }), {
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

async function createOrRecoverPortalAccount(
  supabase: ReturnType<typeof createClient>,
  language: string,
  application: PartnerApplicationRow,
): Promise<PortalAccountResult> {
  const email = String(application.email || "").trim().toLowerCase();
  const redirectTo = buildPublicAuthUrl(language, "/auth/reset-password");

  const recoveryAttempt = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  });

  if (!recoveryAttempt.error && recoveryAttempt.data.user) {
    return {
      userId: recoveryAttempt.data.user.id,
      email,
      isNewUser: false,
      accessLink: normalizeRecoveryActionLink(recoveryAttempt.data.properties?.action_link || null, language),
    };
  }

  if (!isUserMissingError(recoveryAttempt.error)) {
    throw recoveryAttempt.error;
  }

  const createdUser = await supabase.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: cleanObject({
      full_name: normalizeString(application.full_name),
      phone: normalizeString(application.phone),
    }),
  });

  if (createdUser.error || !createdUser.data.user) {
    throw createdUser.error || new Error("Could not create partner auth user.");
  }

  const newRecoveryAttempt = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  });

  if (newRecoveryAttempt.error || !newRecoveryAttempt.data.user) {
    throw newRecoveryAttempt.error || new Error("Could not generate partner access link.");
  }

  return {
    userId: newRecoveryAttempt.data.user.id,
    email,
    isNewUser: true,
    accessLink: normalizeRecoveryActionLink(newRecoveryAttempt.data.properties?.action_link || null, language),
  };
}

async function upsertPartnerProfile(
  supabase: ReturnType<typeof createClient>,
  account: PortalAccountResult,
  application: PartnerApplicationRow,
) {
  const existingProfileResponse = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role, status")
    .eq("id", account.userId)
    .maybeSingle();

  if (existingProfileResponse.error) {
    throw existingProfileResponse.error;
  }

  const existingProfile = (existingProfileResponse.data || null) as ProfileRow | null;
  const profilePayload = {
    id: account.userId,
    email: account.email,
    full_name: normalizeString(application.full_name) || existingProfile?.full_name || null,
    phone: normalizeString(application.phone) || existingProfile?.phone || null,
    role: normalizePartnerProfileRole(existingProfile?.role),
    status: existingProfile?.status || "active",
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (error) {
    throw error;
  }

  return {
    ...existingProfile,
    ...profilePayload,
  };
}

async function generateUniquePartnerIdentity(
  supabase: ReturnType<typeof createClient>,
  application: PartnerApplicationRow,
  referralCodeOverride?: string | null,
) {
  const publicName = normalizeString(application.public_name) || normalizeString(application.full_name) || "partner";
  const slugSeed = slugify(publicName) || "partner";
  const codeBase = normalizeString(referralCodeOverride)
    || String(publicName).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
    || "PARTNER";

  for (let index = 0; index < 50; index += 1) {
    const slug = buildCandidate(slugSeed, index, 40);
    const referralCode = buildCandidate(codeBase.toUpperCase(), index, 24).toUpperCase();

    const existing = await supabase
      .from("referral_partners")
      .select("id")
      .or(`slug.eq.${slug},referral_code.eq.${referralCode}`)
      .limit(1);

    if (existing.error) {
      throw existing.error;
    }

    if (!(existing.data || []).length) {
      return { slug, referralCode };
    }
  }

  throw new Error("Could not generate a unique referral code.");
}

async function createOrLinkPartnerRecord(
  supabase: ReturnType<typeof createClient>,
  profile: ProfileRow,
  application: PartnerApplicationRow,
  input: RequestBody,
) {
  const existingByApplication = await supabase
    .from("referral_partners")
    .select("*")
    .eq("application_id", application.id)
    .maybeSingle();

  if (existingByApplication.error) {
    throw existingByApplication.error;
  }

  if (existingByApplication.data) {
    return existingByApplication.data as PartnerRow;
  }

  const existingByProfile = await supabase
    .from("referral_partners")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingByProfile.error) {
    throw existingByProfile.error;
  }

  const commissionRate = normalizeNumber(input.commission_rate, 20);
  const reviewNotes = normalizeString(input.notes);
  const publicName = normalizeString(application.public_name) || normalizeString(application.full_name) || "Partner";
  const contactName = normalizeString(application.full_name) || publicName;
  const socialNotes = [
    normalizeString(application.motivation),
    reviewNotes,
  ].filter(Boolean).join("\n\n");

  if (existingByProfile.data) {
    const existing = existingByProfile.data as PartnerRow;
    const updates = {
      application_id: existing.application_id || application.id,
      name: existing.name || publicName,
      public_name: publicName,
      contact_name: contactName,
      contact_email: normalizeString(application.email),
      contact_phone: normalizeString(application.phone),
      commission_rate: commissionRate,
      status: "active",
      portal_status: "approved",
      application_reason: normalizeString(application.motivation),
      website_url: normalizeString(application.website_url),
      instagram_url: normalizeString(application.instagram_url),
      tiktok_url: normalizeString(application.tiktok_url),
      youtube_url: normalizeString(application.youtube_url),
      notes: socialNotes || existing.notes || null,
      approved_at: new Date().toISOString(),
      rejected_at: null,
      suspended_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("referral_partners")
      .update(updates)
      .eq("id", existing.id);

    if (error) {
      throw error;
    }

    return {
      ...existing,
      ...updates,
    } as PartnerRow;
  }

  const identity = await generateUniquePartnerIdentity(supabase, application, input.referral_code || null);
  const partnerPayload = {
    id: crypto.randomUUID(),
    profile_id: profile.id,
    application_id: application.id,
    name: publicName,
    public_name: publicName,
    contact_name: contactName,
    contact_email: normalizeString(application.email),
    contact_phone: normalizeString(application.phone),
    slug: identity.slug,
    referral_code: identity.referralCode,
    referral_link: `/r/${identity.referralCode}`,
    commission_type: "percentage",
    commission_rate: commissionRate,
    status: "active",
    portal_status: "approved",
    application_reason: normalizeString(application.motivation),
    bio: null,
    website_url: normalizeString(application.website_url),
    instagram_url: normalizeString(application.instagram_url),
    tiktok_url: normalizeString(application.tiktok_url),
    youtube_url: normalizeString(application.youtube_url),
    notes: socialNotes || null,
    approved_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("referral_partners")
    .insert(partnerPayload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PartnerRow;
}

async function markApplicationApproved(
  supabase: ReturnType<typeof createClient>,
  application: PartnerApplicationRow,
  reviewerUserId: string,
) {
  const payload = {
    profile_id: application.profile_id,
    status: "approved",
    rejection_reason: null,
    reviewed_by: reviewerUserId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("partner_applications")
    .update(payload)
    .eq("id", application.id);

  if (error) {
    throw error;
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
    const reviewer = await requireAuthorizedReviewer(req, supabaseUrl, supabaseAnonKey, supabase);
    const body = await req.json().catch(() => ({})) as RequestBody;
    const applicationId = String(body.application_id || "").trim();

    if (!applicationId) {
      return json({ error: { message: "application_id is required." } }, { status: 400 });
    }

    const application = await loadApplication(supabase, applicationId);
    if (!application) {
      return json({ error: { message: "Partner application was not found." } }, { status: 404 });
    }

    const existingPartnerByApplication = await supabase
      .from("referral_partners")
      .select("*")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existingPartnerByApplication.error) {
      throw existingPartnerByApplication.error;
    }

    if (existingPartnerByApplication.data) {
      if (application.status !== "approved") {
        await markApplicationApproved(supabase, application, reviewer.userId);
      }

      return json({
        success: true,
        alreadyApproved: true,
        partner: existingPartnerByApplication.data,
      });
    }

    if (application.status !== "pending") {
      return json({
        error: {
          message: `Only pending applications can be approved. Current status: ${application.status}.`,
        },
      }, { status: 409 });
    }

    const language = normalizeLanguage(application.preferred_language);
    const account = await createOrRecoverPortalAccount(supabase, language, application);
    const profile = await upsertPartnerProfile(supabase, account, application);
    const partner = await createOrLinkPartnerRecord(supabase, profile, {
      ...application,
      profile_id: profile.id,
    }, body);
    await markApplicationApproved(supabase, {
      ...application,
      profile_id: profile.id,
    }, reviewer.userId);

    let emailResult: { sent: boolean; skipped?: boolean; messageId?: string | null; error?: string } = { sent: false, skipped: true };
    try {
      emailResult = await sendPartnerApprovalEmail({
        application,
        partner,
        account,
        notes: normalizeString(body.notes),
      });
    } catch (emailError) {
      emailResult = {
        sent: false,
        skipped: false,
        messageId: null,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      };
      console.error("approve-partner-application email_error", errorPayload(emailError));
    }

    return json({
      success: true,
      account: {
        userId: account.userId,
        email: account.email,
        isNewUser: account.isNewUser,
        accessLinkGenerated: Boolean(account.accessLink),
      },
      profile,
      partner,
      email: emailResult,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("approve-partner-application failed", errorPayload(error));
    return json({ error: errorPayload(error) }, { status: 500 });
  }
});
