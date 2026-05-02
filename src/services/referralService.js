import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser, getPartnerByReferralCode } from "./authService.js";

export const REFERRAL_STORAGE_KEY = "fly-friendly-referral";

function isBrowser() {
  return typeof window !== "undefined";
}

function cleanReferralRecord(record) {
  if (!record?.partnerId || !record?.referralCode) {
    return null;
  }

  return {
    partnerId: record.partnerId,
    referralCode: record.referralCode,
    publicName: record.publicName || "",
    sourceUrl: record.sourceUrl || "",
    sourcePath: record.sourcePath || "",
    storedAt: record.storedAt || new Date().toISOString(),
  };
}

function readStoredReferral() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    return cleanReferralRecord(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}

function writeStoredReferral(record) {
  if (!isBrowser()) {
    return;
  }

  if (!record) {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(record));
}

export function getStoredReferralCode() {
  return readStoredReferral()?.referralCode || "";
}

export function getStoredReferralData() {
  return readStoredReferral();
}

export function clearReferralCode() {
  writeStoredReferral(null);
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
        }
      : input,
  );

  if (record) {
    writeStoredReferral(record);
  }
}

export async function validateReferralCode(referralCode, context = {}) {
  const code = String(referralCode || "").trim();

  if (!code) {
    clearReferralCode();
    return null;
  }

  const partner = await getPartnerByReferralCode(code);
  if (!partner?.id || !isApprovedPartnerRecord(partner)) {
    clearReferralCode();
    return null;
  }

  const record = {
    partnerId: partner.id,
    referralCode: partner.referral_code || code,
    publicName: partner.public_name || partner.name || "",
    sourceUrl: context.sourceUrl || (isBrowser() ? window.location.href : ""),
    sourcePath: context.sourcePath || (isBrowser() ? `${window.location.pathname}${window.location.search}${window.location.hash}` : ""),
    storedAt: new Date().toISOString(),
  };

  writeStoredReferral(record);
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

export async function attachReferralToLead(leadId) {
  const referral = getStoredReferralData();
  if (!referral?.referralCode || !leadId) {
    return null;
  }

  const validatedReferral = await validateReferralCode(referral.referralCode, {
    sourceUrl: referral.sourceUrl || null,
    sourcePath: referral.sourcePath || null,
  }).catch(() => null);

  if (!validatedReferral?.partnerId) {
    clearReferralCode();
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
      stored_at: validatedReferral.storedAt,
    },
  };

  const referralWrite = await client
    .from("referrals")
    .upsert(payload, { onConflict: "lead_id" })
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
