import { requireSupabase } from "../lib/supabase.js";
import { buildPublicAuthUrl } from "../lib/siteUrl.js";

const PROFILE_SELECTS = [
  "id, full_name, email, phone, role, status, deleted_at, purge_after, created_at, updated_at",
  "id, full_name, email, phone, role, deleted_at, purge_after, created_at, updated_at",
  "id, full_name, email, phone, role, deleted_at, created_at",
  "id, full_name, email, phone, role, created_at",
];

const PARTNER_SELECTS = [
  "id, profile_id, name, public_name, slug, referral_code, referral_link, commission_type, commission_rate, status, portal_status, total_earned, total_paid, bio, avatar_url, website_url, instagram_url, tiktok_url, youtube_url, created_at, updated_at",
  "id, profile_id, name, public_name, slug, referral_code, referral_link, commission_type, commission_rate, status, bio, avatar_url, website_url, instagram_url, tiktok_url, youtube_url, created_at, updated_at",
  "id, name, referral_code, referral_link, commission_type, commission_rate, status, created_at, updated_at",
];

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || error?.message?.includes("column");
}

function isMissingRpcError(error) {
  return error?.code === "PGRST202"
    || error?.code === "42883"
    || error?.message?.includes("Could not find the function")
    || error?.message?.includes("sync_current_profile_claim_data");
}

function cleanObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function normalizeProfileInput(input = {}) {
  return {
    full_name: input.full_name ?? input.fullName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    status: input.status,
  };
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

async function fetchProfileById(client, profileId) {
  return selectMaybeSingleWithFallback(
    (fields) => client.from("profiles").select(fields).eq("id", profileId).maybeSingle(),
    PROFILE_SELECTS,
  );
}

async function fetchPartnerByProfileId(client, profileId) {
  return selectMaybeSingleWithFallback(
    (fields) => client.from("referral_partners").select(fields).eq("profile_id", profileId).maybeSingle(),
    PARTNER_SELECTS,
  );
}

async function upsertProfile(client, payload) {
  const variants = [
    cleanObject(payload),
    cleanObject({
      id: payload.id,
      email: payload.email,
      full_name: payload.full_name,
      phone: payload.phone,
      role: payload.role,
    }),
    cleanObject({
      id: payload.id,
      email: payload.email,
      full_name: payload.full_name,
      phone: payload.phone,
    }),
  ];

  let lastError = null;

  for (const variant of variants) {
    const { error } = await client.from("profiles").upsert(variant, { onConflict: "id" });
    if (!error) {
      return;
    }

    if (!isMissingColumnError(error)) {
      throw error;
    }

    lastError = error;
  }

  if (lastError) {
    throw lastError;
  }
}

function isExistingUserError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already registered")
    || message.includes("already been registered")
    || message.includes("user already")
    || message.includes("already exists");
}

function generateClaimPassword() {
  return `FlyFriendly!${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function getCurrentUser() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

export async function getCurrentSession() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signUpWithEmail(email, password, metadata = {}) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: cleanObject({
        full_name: metadata.fullName ?? metadata.full_name,
        phone: metadata.phone,
      }),
    },
  });

  if (error) {
    throw error;
  }

  if (data.session?.user) {
    await ensureCurrentUserProfile({
      fullName: metadata.fullName ?? metadata.full_name,
      email,
      phone: metadata.phone,
      role: "client",
      status: "active",
    });
    await syncCurrentUserClaimData().catch(() => null);
  }

  return data;
}

export async function signInWithEmail(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (data.session?.user) {
    await ensureCurrentUserProfile({ email });
    await syncCurrentUserClaimData().catch(() => null);
  }

  return data;
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function resetPassword(email) {
  const client = requireSupabase();
  const preferredLanguage = typeof window !== "undefined"
    ? document.documentElement.lang || localStorage.getItem("fly-friendly-language") || "en"
    : "en";
  const redirectTo = buildPublicAuthUrl(preferredLanguage, "/auth/reset-password");

  const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePassword(newPassword) {
  const client = requireSupabase();
  const { data, error } = await client.auth.updateUser({ password: newPassword });

  if (error) {
    throw error;
  }

  return data;
}

export async function getCurrentProfile() {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return fetchProfileById(client, user.id);
}

export async function syncCurrentUserClaimData() {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  if (!user) {
    return null;
  }

  const { data, error } = await client.rpc("sync_current_profile_claim_data");
  if (error) {
    if (isMissingRpcError(error)) {
      return null;
    }

    throw error;
  }

  return data || null;
}

export async function createProfileForCurrentUser(input = {}) {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Please sign in before creating a profile.");
  }

  const normalized = normalizeProfileInput(input);
  const payload = cleanObject({
    id: user.id,
    email: normalized.email || user.email || null,
    full_name: normalized.full_name ?? user.user_metadata?.full_name ?? null,
    phone: normalized.phone ?? user.user_metadata?.phone ?? null,
    role: normalized.role || "client",
    status: normalized.status || "active",
  });

  await upsertProfile(client, payload);
  return fetchProfileById(client, user.id);
}

export async function ensureCurrentUserProfile(input = {}) {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const existing = await getCurrentProfile();
  if (existing) {
    await syncCurrentUserClaimData().catch(() => null);
    return existing;
  }

  const createdProfile = await createProfileForCurrentUser({
    ...input,
    email: input.email || user.email || null,
  });
  await syncCurrentUserClaimData().catch(() => null);
  return createdProfile;
}

export async function updateCurrentProfile(input = {}) {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Please sign in before updating your profile.");
  }

  const normalized = normalizeProfileInput(input);
  const payload = cleanObject({
    full_name: normalized.full_name,
    email: normalized.email,
    phone: normalized.phone,
  });

  if (!Object.keys(payload).length) {
    return getCurrentProfile();
  }

  const { error } = await client
    .from("profiles")
    .update(payload)
    .eq("id", user.id);

  if (error) {
    throw error;
  }

  return getCurrentProfile();
}

export async function getCurrentPartnerProfile() {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return fetchPartnerByProfileId(client, user.id);
}

export async function getPartnerByReferralCode(referralCode) {
  const client = requireSupabase();
  const code = String(referralCode || "").trim();

  if (!code) {
    return null;
  }

  const rpcResponse = await client.rpc("get_partner_by_referral_code", { input_code: code });
  if (!rpcResponse.error) {
    const row = Array.isArray(rpcResponse.data) ? rpcResponse.data[0] : rpcResponse.data;
    return row || null;
  }

  const directLookup = await selectMaybeSingleWithFallback(
    (fields) => client
      .from("referral_partners")
      .select(fields)
      .eq("referral_code", code)
      .eq("portal_status", "approved")
      .maybeSingle(),
    PARTNER_SELECTS,
  ).catch(() => null);

  return directLookup;
}

export async function ensureClaimAccount(input = {}) {
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    await updateCurrentProfile({
      full_name: input.fullName || input.full_name,
      email: input.email || user.email || null,
      phone: input.phone,
    }).catch(() => null);
    await syncCurrentUserClaimData().catch(() => null);

    return {
      created: false,
      authenticated: true,
      existingAccount: true,
      resetSent: false,
    };
  }

  if (!input.email) {
    return {
      created: false,
      authenticated: false,
      existingAccount: false,
      resetSent: false,
    };
  }

  try {
    const result = await signUpWithEmail(input.email, generateClaimPassword(), {
      fullName: input.fullName || input.full_name,
      phone: input.phone,
    });

    let resetSent = false;
    if (!result.session) {
      try {
        await resetPassword(input.email);
        resetSent = true;
      } catch {
        resetSent = false;
      }
    }

    return {
      created: true,
      authenticated: Boolean(result.session),
      existingAccount: false,
      resetSent,
      requiresEmailConfirmation: !result.session,
    };
  } catch (error) {
    if (!isExistingUserError(error)) {
      throw error;
    }

    let resetSent = false;
    try {
      await resetPassword(input.email);
      resetSent = true;
    } catch {
      resetSent = false;
    }

    return {
      created: false,
      authenticated: false,
      existingAccount: true,
      resetSent,
    };
  }
}

export async function signUpCustomer({ email, password, fullName, phone }) {
  return signUpWithEmail(email, password, { fullName, phone });
}

export async function signInCustomer({ email, password }) {
  return signInWithEmail(email, password);
}
