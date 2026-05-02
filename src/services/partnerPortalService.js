import { requireSupabase } from "../lib/supabase.js";
import { getCurrentPartnerProfile } from "./authService.js";

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function buildRouteLabel(meta = {}) {
  const from = meta.route_from || "";
  const to = meta.route_to || "";
  if (!from && !to) {
    return "";
  }

  return [from, to].filter(Boolean).join(" -> ");
}

function maskReference(reference = "") {
  const value = String(reference || "").trim();
  if (!value) {
    return "";
  }

  if (value.length <= 6) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-2)}`;
}

function buildPartnerSafeLabel(meta = {}, item = {}) {
  if (meta.case_code) {
    return `Case ${meta.case_code}`;
  }

  if (meta.lead_code) {
    return `Lead ${meta.lead_code}`;
  }

  if (item.case_id) {
    return `Case ${maskReference(item.case_id)}`;
  }

  if (item.lead_id) {
    return `Lead ${maskReference(item.lead_id)}`;
  }

  return "Referred claim";
}

function normalizePortalError(error) {
  const message = String(error?.message || "").trim();
  if (!message) {
    return "Could not load partner portal.";
  }

  if (/permission|forbidden|not authorized|row-level security/i.test(message)) {
    return "You do not have access to this partner data.";
  }

  return message;
}

export async function fetchPartnerPortalData() {
  const client = requireSupabase();
  const partnerProfile = await getCurrentPartnerProfile();

  if (!partnerProfile?.id) {
    return {
      partnerProfile: null,
      summary: null,
      referralRecords: [],
      commissionRecords: [],
      payoutRecords: [],
      referrals: [],
      commissions: [],
      payouts: [],
    };
  }

  const [referrals, commissions, payouts] = await Promise.all([
    client
      .from("referrals")
      .select("id, client_profile_id, customer_id, lead_id, case_id, referral_code, source_url, source_path, status, attribution_meta, created_at, updated_at")
      .eq("partner_id", partnerProfile.id)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("partner_commissions")
      .select("id, lead_id, case_id, claim_id, amount, currency, commission_rate, source_amount, status, notes, created_at, approved_at, paid_at")
      .eq("partner_id", partnerProfile.id)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("referral_partner_payouts")
      .select("id, case_id, amount, currency, status, payout_method, payment_reference, note, paid_at, created_at, updated_at")
      .eq("partner_id", partnerProfile.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (referrals.error) {
    throw referrals.error;
  }

  if (commissions.error) {
    throw commissions.error;
  }

  if (payouts.error) {
    throw payouts.error;
  }

  const referralsList = referrals.data || [];
  const commissionsList = commissions.data || [];
  const payoutsList = payouts.data || [];
  const referralByCaseId = new Map(referralsList.filter((item) => item.case_id).map((item) => [item.case_id, item]));
  const referralByLeadId = new Map(referralsList.filter((item) => item.lead_id).map((item) => [item.lead_id, item]));

  const referralRecords = referralsList.map((item) => {
    const meta = item.attribution_meta || {};
    const linkedCommission = (item.case_id && commissionsList.find((entry) => entry.case_id === item.case_id))
      || (item.lead_id && commissionsList.find((entry) => entry.lead_id === item.lead_id))
      || null;

    return {
      ...item,
      clientLabel: buildPartnerSafeLabel(meta, item),
      routeLabel: buildRouteLabel(meta),
      caseCode: meta.case_code || item.case_id || "",
      leadCode: meta.lead_code || item.lead_id || "",
      caseStatus: meta.case_status || item.status,
      payoutStatus: meta.payout_status || meta.finance_payment_status || "",
      commissionStatus: linkedCommission?.status || meta.referral_commission_status || "",
      commissionAmount: Number(linkedCommission?.amount ?? meta.referral_commission_amount ?? 0),
      currency: linkedCommission?.currency || "EUR",
    };
  });

  const commissionRecords = commissionsList.map((item) => {
    const referral = (item.case_id && referralByCaseId.get(item.case_id))
      || (item.lead_id && referralByLeadId.get(item.lead_id))
      || null;
    const meta = referral?.attribution_meta || {};

    return {
      ...item,
      clientLabel: buildPartnerSafeLabel(meta, item),
      routeLabel: buildRouteLabel(meta),
      caseCode: meta.case_code || item.case_id || "",
      caseStatus: meta.case_status || "",
    };
  });

  const payoutRecords = payoutsList.map((item) => {
    const referral = item.case_id ? referralByCaseId.get(item.case_id) : null;
    const meta = referral?.attribution_meta || {};

    return {
      ...item,
      clientLabel: buildPartnerSafeLabel(meta, item),
      routeLabel: buildRouteLabel(meta),
      caseCode: meta.case_code || item.case_id || "",
    };
  });

  const totalEarned = roundMoney(commissionsList
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const totalPaid = roundMoney(payoutsList
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const pendingEarnings = roundMoney(commissionsList
    .filter((item) => !["paid", "cancelled"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const activeClaims = referralRecords.filter((item) => item.caseCode && !["converted", "cancelled"].includes(item.status)).length;
  const successfulClaims = commissionRecords.filter((item) => ["approved", "paid"].includes(item.status)).length;
  const convertedClaims = referralRecords.filter((item) => item.status === "converted").length;
  const conversionRate = referralRecords.length
    ? Math.round((convertedClaims / referralRecords.length) * 100)
    : 0;

  return {
    partnerProfile,
    summary: {
      referralCount: referralRecords.length,
      activeClaims,
      successfulClaims,
      convertedClaims,
      conversionRate,
      totalEarned,
      totalPaid,
      pendingEarnings,
    },
    referralRecords,
    commissionRecords,
    payoutRecords,
    referrals: referralsList,
    commissions: commissionsList,
    payouts: payoutsList,
  };
}

export { normalizePortalError };

export async function updateCurrentPartnerPublicProfile(input = {}) {
  const client = requireSupabase();
  const partnerProfile = await getCurrentPartnerProfile();

  if (!partnerProfile?.id) {
    throw new Error("Partner profile was not found.");
  }

  const payload = {
    public_name: input.public_name,
    name: input.public_name || partnerProfile.name,
    bio: input.bio,
    avatar_url: input.avatar_url,
    website_url: input.website_url,
    instagram_url: input.instagram_url,
    tiktok_url: input.tiktok_url,
    youtube_url: input.youtube_url,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("referral_partners")
    .update(payload)
    .eq("id", partnerProfile.id);

  if (error) {
    throw error;
  }

  return getCurrentPartnerProfile();
}
