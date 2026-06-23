import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser, getPartnerByReferralCode } from "./authService.js";

export const REFERRAL_STORAGE_KEY = "fly-friendly-referral";
const REFERRAL_ATTRIBUTION_TTL_MS = 60 * 60 * 1000;

function isBrowser() {
  return typeof window !== "undefined";
}

function getReferralStorage() {
  if (!isBrowser()) {
    return null;
  }

  return window.sessionStorage;
}

function sanitizeReferralLocation(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw, isBrowser() ? window.location.origin : "https://fly-friendly.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return raw.startsWith("/") || raw.startsWith("?") || raw.startsWith("#") ? raw : "";
  }
}

function cleanReferralRecord(record) {
  if (!record?.partnerId || !record?.referralCode) {
    return null;
  }

  return {
    partnerId: record.partnerId,
    referralCode: record.referralCode,
    publicName: record.publicName || "",
    sourceUrl: sanitizeReferralLocation(record.sourceUrl),
    sourcePath: sanitizeReferralLocation(record.sourcePath),
    storedAt: record.storedAt || record.capturedAt || new Date().toISOString(),
    capturedAt: record.capturedAt || record.storedAt || new Date().toISOString(),
  };
}

function clearLegacyReferralStorage() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // Ignore restrictive storage modes.
  }
}

function readStoredReferral() {
  const storage = getReferralStorage();
  if (!storage) {
    clearLegacyReferralStorage();
    return null;
  }

  try {
    clearLegacyReferralStorage();
    const raw = storage.getItem(REFERRAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredReferral(record) {
  const storage = getReferralStorage();
  if (!storage) {
    return;
  }

  clearLegacyReferralStorage();

  if (!record) {
    storage.removeItem(REFERRAL_STORAGE_KEY);
    return;
  }

  storage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(record));
}

export function isReferralAttributionValid(record) {
  const cleaned = cleanReferralRecord(record);
  if (!cleaned) {
    return false;
  }

  const capturedAt = Date.parse(cleaned.capturedAt || "");
  if (!capturedAt) {
    return false;
  }

  return Date.now() - capturedAt <= REFERRAL_ATTRIBUTION_TTL_MS;
}

export function getReferralAttribution() {
  const record = readStoredReferral();
  if (!isReferralAttributionValid(record)) {
    writeStoredReferral(null);
    return null;
  }

  return cleanReferralRecord(record);
}

export function saveReferralAttribution(input) {
  const record = cleanReferralRecord(input);
  if (!record) {
    clearReferralAttribution();
    return;
  }

  writeStoredReferral({
    ...record,
    capturedAt: record.capturedAt || record.storedAt || new Date().toISOString(),
    storedAt: record.storedAt || record.capturedAt || new Date().toISOString(),
  });
}

export function clearReferralAttribution() {
  writeStoredReferral(null);
}

export function getStoredReferralCode() {
  return getReferralAttribution()?.referralCode || "";
}

export function getStoredReferralData() {
  return getReferralAttribution();
}

export function clearReferralCode() {
  clearReferralAttribution();
}

function isApprovedPartnerRecord(partner) {
  const status = String(partner?.portal_status || partner?.status || "").trim().toLowerCase();
  return status === "approved";
}

export function storeReferralCode(input) {
  const record = cleanReferralRecord(
    typeof input === "string"
      ? {
          partnerId: "",
          referralCode: input,
          storedAt: new Date().toISOString(),
          capturedAt: new Date().toISOString(),
        }
      : input,
  );

  if (record) {
    saveReferralAttribution(record);
  }
}

export async function validateReferralCode(referralCode, context = {}) {
  const code = String(referralCode || "").trim();

  if (!code) {
    clearReferralAttribution();
    return null;
  }

  const partner = await getPartnerByReferralCode(code);
  if (!partner?.id || !isApprovedPartnerRecord(partner)) {
    clearReferralAttribution();
    return null;
  }

  const capturedAt = new Date().toISOString();
  const record = {
    partnerId: partner.id,
    referralCode: partner.referral_code || code,
    publicName: partner.public_name || partner.name || "",
    // Keep only path-level attribution metadata in sessionStorage.
    sourceUrl: sanitizeReferralLocation(context.sourceUrl || (isBrowser() ? window.location.href : "")),
    sourcePath: sanitizeReferralLocation(context.sourcePath || (isBrowser() ? `${window.location.pathname}${window.location.search}${window.location.hash}` : "")),
    storedAt: capturedAt,
    capturedAt,
  };

  saveReferralAttribution(record);
  return record;
}

export async function captureReferralFromQueryString(search = "", pathname = "") {
  const params = new URLSearchParams(search || "");
  const code = params.get("ref");

  if (!code) {
    return null;
  }

  return validateReferralCode(code, {
    sourceUrl: isBrowser() ? window.location.href : "",
    sourcePath: `${pathname || ""}${search || ""}`,
  }).catch(() => null);
}

function buildReferralAttributionMeta(referralCode, leadData = {}) {
  const disruptionType = leadData.disruptionType
    || (leadData.delayDuration === "cancelled" ? "cancellation" : leadData.delayDuration ? "delay" : null);

  return {
    stored_at: new Date().toISOString(),
    partner_referral_code: referralCode || null,
    client_name: leadData.fullName || leadData.full_name || null,
    client_email: leadData.email || null,
    client_phone: leadData.phone || null,
    route_from: leadData.departure || null,
    route_to: leadData.destination || null,
    airline: leadData.airline || null,
    issue_type: disruptionType || null,
  };
}

export async function attachReferralToLead(leadId, leadData = null) {
  const referral = getReferralAttribution();
  if (!referral?.referralCode || !leadId) {
    return null;
  }

  const validatedReferral = await validateReferralCode(referral.referralCode, {
    sourceUrl: referral.sourceUrl || null,
    sourcePath: referral.sourcePath || null,
  }).catch(() => null);

  if (!validatedReferral?.partnerId) {
    clearReferralAttribution();
    return null;
  }

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    partner_id: validatedReferral.partnerId,
    client_profile_id: user?.id || null,
    lead_id: leadId,
    referral_code: validatedReferral.referralCode,
    source_url: validatedReferral.sourceUrl || null,
    source_path: validatedReferral.sourcePath || null,
    status: "lead_created",
    attribution_meta: {
      ...buildReferralAttributionMeta(validatedReferral.referralCode, leadData || {}),
      stored_at: validatedReferral.storedAt || new Date().toISOString(),
    },
  };

  const existingReferral = await client
    .from("referrals")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existingReferral.error) {
    throw existingReferral.error;
  }

  const referralWrite = existingReferral.data?.id
    ? await client
      .from("referrals")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingReferral.data.id)
      .select("id")
      .maybeSingle()
    : await client
      .from("referrals")
      .insert(payload)
      .select("id")
      .maybeSingle();

  if (referralWrite.error) {
    throw referralWrite.error;
  }

  await client
    .from("leads")
    .update({
      referral_partner_id: validatedReferral.partnerId,
      source_details: {
        referral_code: validatedReferral.referralCode,
        referral_source_url: validatedReferral.sourceUrl || null,
        referral_source_path: validatedReferral.sourcePath || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  return referralWrite.data || null;
}
