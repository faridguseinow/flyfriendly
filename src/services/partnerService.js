import { requireSupabase } from "../lib/supabase.js";
import { getCurrentPartnerProfile, getCurrentProfile } from "./authService.js";

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function isUniqueViolation(error) {
  return error?.code === "23505" || String(error?.message || "").toLowerCase().includes("duplicate");
}

function buildCandidate(base, index, limit) {
  const normalized = String(base || "partner").replace(/^-+|-+$/g, "") || "partner";
  return (index === 0 ? normalized : `${normalized}-${index + 1}`).slice(0, limit);
}

export async function getPartnerApplicationState() {
  const [profile, partnerProfile] = await Promise.all([
    getCurrentProfile(),
    getCurrentPartnerProfile(),
  ]);

  return { profile, partnerProfile };
}

export async function applyForPartner(input = {}) {
  const client = requireSupabase();
  const profile = await getCurrentProfile();

  if (!profile?.id) {
    throw new Error("Please sign in before applying for partner access.");
  }

  const existing = await getCurrentPartnerProfile();
  if (existing?.id) {
    return existing;
  }

  const publicName = String(input.public_name || input.publicName || "").trim();
  if (!publicName) {
    throw new Error("Public name is required.");
  }

  const slugSeed = slugify(publicName) || "partner";
  const codeSeed = slugSeed.toUpperCase().slice(0, 24) || "PARTNER";
  let lastError = null;

  for (let index = 0; index < 12; index += 1) {
    const slug = buildCandidate(slugSeed, index, 40);
    const referralCode = buildCandidate(codeSeed, index, 24).toUpperCase();
    const payload = {
      id: crypto.randomUUID(),
      profile_id: profile.id,
      name: publicName,
      public_name: publicName,
      contact_name: profile.full_name || publicName,
      contact_email: profile.email || input.email || null,
      contact_phone: profile.phone || input.phone || null,
      slug,
      referral_code: referralCode,
      referral_link: `/r/${referralCode}`,
      commission_type: "percentage",
      commission_rate: 20,
      status: "paused",
      portal_status: "pending",
      application_reason: input.reason || null,
      bio: input.bio || null,
      website_url: input.website_url || null,
      instagram_url: input.instagram_url || null,
      tiktok_url: input.tiktok_url || null,
      youtube_url: input.youtube_url || null,
      notes: input.reason || null,
    };

    const { error } = await client.from("referral_partners").insert(payload);
    if (!error) {
      return getCurrentPartnerProfile();
    }

    if (!isUniqueViolation(error)) {
      throw error;
    }

    lastError = error;
  }

  throw lastError || new Error("Could not generate a unique referral code.");
}
