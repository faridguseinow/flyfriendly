import { PARTNER_REVENUE_SHARE_RATE, calculatePartnerCommission, getPartnerCommissionTier } from "../lib/partnerCommission.js";
import { getPublicSiteUrl } from "../lib/siteUrl.js";
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

  return [from, to].filter(Boolean).join(" → ");
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

function normalizePortalStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["active", "approved"].includes(status)) return "approved";
  if (["rejected", "archived"].includes(status)) return "rejected";
  if (["suspended", "paused"].includes(status)) return "suspended";
  return "pending";
}

function normalizeClaimStatus(value, commissionStatus = "") {
  const status = String(value || "").trim().toLowerCase();
  const commission = String(commissionStatus || "").trim().toLowerCase();

  if (commission === "paid") return "paid";
  if (status === "paid") return "paid";
  if (status === "approved" || commission === "approved" || status === "closed") return "approved";
  if (status === "documents_needed") return "documents_needed";
  if (status === "under_review") return "under_review";
  if (["rejected", "cancelled"].includes(status)) return status;
  if (["lead_created", "case_created", "submitted", "pending"].includes(status)) return "submitted";
  if (status === "converted") return commission === "paid" ? "paid" : "approved";

  return status || "submitted";
}

function normalizeCommissionStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["paid", "approved", "cancelled", "pending"].includes(status)) {
    return status;
  }

  return "pending";
}

function getFilterBucket(record) {
  if (record.commissionStatusKey === "paid" || record.claimStatusKey === "paid") return "paid";
  if (record.commissionStatusKey === "cancelled" || ["rejected", "cancelled"].includes(record.claimStatusKey)) return "cancelled";
  if (record.commissionStatusKey === "approved" || record.claimStatusKey === "approved") return "approved";
  return "active";
}

function deriveCompensationAmount(meta = {}, sourceAmount = 0) {
  const explicitCompensation = Number(meta.compensation_amount || 0);
  if (explicitCompensation > 0) {
    return roundMoney(explicitCompensation);
  }

  return sourceAmount > 0
    ? roundMoney(sourceAmount / PARTNER_REVENUE_SHARE_RATE)
    : 0;
}

function deriveRevenueAmount(meta = {}, sourceAmount = 0, compensationAmount = 0) {
  const explicitRevenue = Number(meta.company_fee || sourceAmount || 0);
  if (explicitRevenue > 0) {
    return roundMoney(explicitRevenue);
  }

  return compensationAmount > 0
    ? roundMoney(compensationAmount * PARTNER_REVENUE_SHARE_RATE)
    : 0;
}

function buildReferralRecord(item, commission = null, payout = null, tierRate = 15) {
  const meta = item.attribution_meta || {};
  const sourceAmount = Number(commission?.source_amount ?? meta.company_fee ?? 0) || 0;
  const compensationAmount = deriveCompensationAmount(meta, sourceAmount);
  const companyRevenue = deriveRevenueAmount(meta, sourceAmount, compensationAmount);
  const commissionRate = Number(commission?.commission_rate ?? meta.referral_commission_rate ?? tierRate) || tierRate;
  const estimatedCommission = commission?.amount
    ? roundMoney(commission.amount)
    : meta.referral_commission_amount
      ? roundMoney(meta.referral_commission_amount)
      : calculatePartnerCommission(compensationAmount, commissionRate).partnerCommission;
  const commissionStatusKey = normalizeCommissionStatus(commission?.status || meta.referral_commission_status || "");
  const claimStatusKey = normalizeClaimStatus(meta.case_status || item.status, commissionStatusKey);
  const payoutAmount = payout?.status === "paid"
    ? roundMoney(payout.amount)
    : 0;
  const actualPaidAmount = commissionStatusKey === "paid"
    ? roundMoney(commission?.amount || estimatedCommission)
    : payoutAmount;
  const approvedAmount = ["approved", "paid"].includes(commissionStatusKey)
    ? roundMoney(commission?.amount || estimatedCommission)
    : 0;

  return {
    id: item.id,
    key: item.case_id || item.lead_id || item.id,
    clientLabel: buildPartnerSafeLabel(meta, item),
    referenceLabel: meta.case_code || meta.lead_code || item.case_id || item.lead_id || "—",
    routeLabel: buildRouteLabel(meta),
    routeFrom: meta.route_from || "",
    routeTo: meta.route_to || "",
    flightDate: meta.flight_date || null,
    createdAt: item.created_at || null,
    updatedAt: item.updated_at || item.created_at || null,
    approvedAt: commission?.approved_at || null,
    paidAt: payout?.paid_at || commission?.paid_at || null,
    claimStatusKey,
    claimStatusRaw: meta.case_status || item.status || "",
    commissionStatusKey,
    commissionStatusRaw: commission?.status || meta.referral_commission_status || "",
    commissionRate,
    compensationAmount,
    companyRevenue,
    estimatedCommissionAmount: roundMoney(estimatedCommission),
    approvedCommissionAmount: roundMoney(approvedAmount),
    paidCommissionAmount: roundMoney(actualPaidAmount),
    payoutStatus: payout?.status || meta.payout_status || meta.finance_payment_status || "",
    currency: commission?.currency || payout?.currency || meta.compensation_currency || "EUR",
    sourcePath: item.source_path || "",
    caseId: item.case_id || null,
    leadId: item.lead_id || null,
    filterBucket: "active",
  };
}

function buildCommissionOrphanRecord(item) {
  const sourceAmount = Number(item.source_amount || 0) || 0;
  const compensationAmount = sourceAmount > 0
    ? roundMoney(sourceAmount / PARTNER_REVENUE_SHARE_RATE)
    : 0;
  const statusKey = normalizeCommissionStatus(item.status);

  return {
    id: item.id,
    key: item.case_id || item.lead_id || item.id,
    clientLabel: item.case_id ? `Case ${maskReference(item.case_id)}` : item.lead_id ? `Lead ${maskReference(item.lead_id)}` : "Referred claim",
    referenceLabel: item.case_id || item.lead_id || "—",
    routeLabel: "",
    routeFrom: "",
    routeTo: "",
    flightDate: null,
    createdAt: item.created_at || null,
    updatedAt: item.created_at || null,
    approvedAt: item.approved_at || null,
    paidAt: item.paid_at || null,
    claimStatusKey: statusKey === "paid" ? "paid" : statusKey === "approved" ? "approved" : "submitted",
    claimStatusRaw: "",
    commissionStatusKey: statusKey,
    commissionStatusRaw: item.status || "",
    commissionRate: Number(item.commission_rate || 0) || 0,
    compensationAmount,
    companyRevenue: roundMoney(sourceAmount),
    estimatedCommissionAmount: roundMoney(item.amount || 0),
    approvedCommissionAmount: ["approved", "paid"].includes(statusKey) ? roundMoney(item.amount || 0) : 0,
    paidCommissionAmount: statusKey === "paid" ? roundMoney(item.amount || 0) : 0,
    payoutStatus: "",
    currency: item.currency || "EUR",
    sourcePath: "",
    caseId: item.case_id || null,
    leadId: item.lead_id || null,
    filterBucket: statusKey === "paid" ? "paid" : statusKey === "approved" ? "approved" : statusKey === "cancelled" ? "cancelled" : "active",
  };
}

export async function fetchPartnerPortalData() {
  const client = requireSupabase();
  const partnerProfile = await getCurrentPartnerProfile();

  if (!partnerProfile?.id) {
    return {
      partnerProfile: null,
      partnerName: "",
      partnerStatusKey: "pending",
      referralCode: "",
      referralLink: "",
      summary: null,
      financeSummary: null,
      tier: null,
      referralRecords: [],
      financeRecords: [],
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
  const paidReferralClientsCount = commissionsList.filter((item) => normalizeCommissionStatus(item.status) === "paid").length;
  const tier = getPartnerCommissionTier(paidReferralClientsCount);
  const commissionByCaseId = new Map(commissionsList.filter((item) => item.case_id).map((item) => [item.case_id, item]));
  const commissionByLeadId = new Map(commissionsList.filter((item) => item.lead_id).map((item) => [item.lead_id, item]));
  const payoutByCaseId = new Map(payoutsList.filter((item) => item.case_id).map((item) => [item.case_id, item]));

  const referralRecords = referralsList.map((item) => {
    const commission = (item.case_id && commissionByCaseId.get(item.case_id))
      || (item.lead_id && commissionByLeadId.get(item.lead_id))
      || null;
    const payout = (item.case_id && payoutByCaseId.get(item.case_id)) || null;
    const record = buildReferralRecord(item, commission, payout, tier.rate);
    record.filterBucket = getFilterBucket(record);
    return record;
  });

  const existingRecordKeys = new Set(referralRecords.map((item) => item.key));
  const orphanFinanceRecords = commissionsList
    .filter((item) => !existingRecordKeys.has(item.case_id || item.lead_id || item.id))
    .map((item) => buildCommissionOrphanRecord(item));
  const financeRecords = [...referralRecords, ...orphanFinanceRecords];

  const totalEarned = roundMoney(commissionsList
    .filter((item) => normalizeCommissionStatus(item.status) !== "cancelled")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const totalPaid = roundMoney((payoutsList.length ? payoutsList : commissionsList.filter((item) => normalizeCommissionStatus(item.status) === "paid"))
    .filter((item) => normalizeCommissionStatus(item.status) === "paid")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const pendingEarnings = roundMoney(financeRecords
    .filter((item) => ["pending", "approved"].includes(item.commissionStatusKey))
    .reduce((sum, item) => sum + Number(item.estimatedCommissionAmount || item.approvedCommissionAmount || 0), 0));
  const activeClaims = referralRecords.filter((item) => !["paid", "rejected", "cancelled"].includes(item.claimStatusKey)).length;
  const successfulClaims = referralRecords.filter((item) => ["approved", "paid"].includes(item.claimStatusKey)).length;
  const potentialEarnings = roundMoney(financeRecords
    .filter((item) => item.commissionStatusKey !== "cancelled")
    .reduce((sum, item) => sum + Number(item.estimatedCommissionAmount || 0), 0));
  const pendingApprovalAmount = roundMoney(financeRecords
    .filter((item) => item.commissionStatusKey === "pending")
    .reduce((sum, item) => sum + Number(item.estimatedCommissionAmount || 0), 0));
  const approvedAmount = roundMoney(financeRecords
    .filter((item) => item.commissionStatusKey === "approved")
    .reduce((sum, item) => sum + Number(item.approvedCommissionAmount || 0), 0));
  const paidAmount = roundMoney(financeRecords
    .filter((item) => item.commissionStatusKey === "paid")
    .reduce((sum, item) => sum + Number(item.paidCommissionAmount || 0), 0));
  const cancelledAmount = roundMoney(financeRecords
    .filter((item) => item.commissionStatusKey === "cancelled")
    .reduce((sum, item) => sum + Number(item.estimatedCommissionAmount || item.approvedCommissionAmount || 0), 0));

  return {
    partnerProfile,
    partnerName: partnerProfile.public_name || partnerProfile.name || "Partner",
    partnerStatusKey: normalizePortalStatus(partnerProfile.portal_status || partnerProfile.status),
    referralCode: partnerProfile.referral_code || "",
    referralLink: partnerProfile.referral_link || (partnerProfile.referral_code ? `${getPublicSiteUrl()}/r/${partnerProfile.referral_code}` : ""),
    tier,
    summary: {
      referralCount: referralRecords.length,
      activeClaims,
      successfulClaims,
      pendingEarnings,
      totalPaid,
      totalEarned,
      currency: commissionsList[0]?.currency || payoutsList[0]?.currency || "EUR",
    },
    financeSummary: {
      potentialEarnings,
      pendingApprovalAmount,
      approvedAmount,
      paidAmount,
      cancelledAmount,
      paidReferralClientsCount,
      currency: commissionsList[0]?.currency || payoutsList[0]?.currency || "EUR",
    },
    referralRecords,
    financeRecords,
    commissionRecords: commissionsList,
    payoutRecords: payoutsList.map((item) => ({
      ...item,
      clientLabel: item.case_id ? `Case ${maskReference(item.case_id)}` : "Referred claim",
    })),
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
