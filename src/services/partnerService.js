import { requireSupabase } from "../lib/supabase.js";
import { getCurrentPartnerProfile, getCurrentProfile } from "./authService.js";

const APPLICATION_SELECT = [
  "id",
  "profile_id",
  "email",
  "full_name",
  "phone",
  "country",
  "preferred_language",
  "public_name",
  "website_url",
  "instagram_url",
  "tiktok_url",
  "youtube_url",
  "primary_platform",
  "audience_size",
  "audience_countries",
  "niche",
  "content_links",
  "motivation",
  "consent_accepted",
  "status",
  "rejection_reason",
  "reviewed_by",
  "reviewed_at",
  "created_at",
  "updated_at",
].join(", ");

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function parseListInput(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildApplicationPayload(input = {}, profile) {
  const fullName = normalizeString(input.full_name || input.fullName) || normalizeString(profile?.full_name);
  const email = normalizeString(input.email) || normalizeString(profile?.email);
  const preferredLanguage = normalizeString(input.preferred_language || input.preferredLanguage || input.language);

  return {
    profile_id: profile?.id || null,
    email,
    full_name: fullName,
    phone: normalizeString(input.phone) || normalizeString(profile?.phone),
    country: normalizeString(input.country),
    preferred_language: preferredLanguage,
    public_name: normalizeString(input.public_name || input.publicName),
    website_url: normalizeString(input.website_url),
    instagram_url: normalizeString(input.instagram_url),
    tiktok_url: normalizeString(input.tiktok_url),
    youtube_url: normalizeString(input.youtube_url),
    primary_platform: normalizeString(input.primary_platform || input.primaryPlatform),
    audience_size: normalizeString(input.audience_size || input.audienceSize),
    audience_countries: parseListInput(input.audience_countries || input.audienceCountries),
    niche: normalizeString(input.niche),
    content_links: parseListInput(input.content_links || input.contentLinks),
    motivation: normalizeString(input.motivation || input.reason),
    consent_accepted: Boolean(input.consent_accepted),
    status: "pending",
  };
}

function validateApplicationPayload(payload) {
  if (!payload.full_name) {
    throw new Error("Full name is required.");
  }

  if (!payload.email) {
    throw new Error("Email is required.");
  }

  if (!payload.country) {
    throw new Error("Country is required.");
  }

  if (!payload.preferred_language) {
    throw new Error("Preferred language is required.");
  }

  if (!payload.public_name) {
    throw new Error("Public name is required.");
  }

  if (!payload.primary_platform) {
    throw new Error("Primary platform is required.");
  }

  if (!payload.audience_size) {
    throw new Error("Audience size is required.");
  }

  if (!payload.motivation) {
    throw new Error("Motivation is required.");
  }

  if (!payload.consent_accepted) {
    throw new Error("You must accept the partner program terms before submitting.");
  }
}

async function getLatestApplicationForProfile(client, profileId) {
  if (!profileId) {
    return null;
  }

  const { data, error } = await client
    .from("partner_applications")
    .select(APPLICATION_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function getPartnerApplicationState() {
  const client = requireSupabase();
  const [profile, partnerProfile] = await Promise.all([
    getCurrentProfile().catch(() => null),
    getCurrentPartnerProfile().catch(() => null),
  ]);

  const application = profile?.id
    ? await getLatestApplicationForProfile(client, profile.id)
    : null;

  return { profile, partnerProfile, application };
}

export async function applyForPartner(input = {}) {
  const client = requireSupabase();
  const profile = await getCurrentProfile().catch(() => null);

  const existing = await getCurrentPartnerProfile().catch(() => null);
  if (existing?.id) {
    return existing;
  }

  const existingApplication = profile?.id
    ? await getLatestApplicationForProfile(client, profile.id)
    : null;

  if (existingApplication?.status && existingApplication.status !== "cancelled" && existingApplication.status !== "rejected") {
    return existingApplication;
  }

  const payload = buildApplicationPayload(input, profile);
  validateApplicationPayload(payload);

  const { data, error } = await client.functions.invoke("submit-partner-application", {
    body: payload,
  });
  if (error) {
    throw error;
  }

  if (data?.error?.message) {
    throw new Error(data.error.message);
  }

  return data?.application || data?.existing || null;
}
