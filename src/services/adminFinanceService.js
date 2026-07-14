import { requireSupabase } from "../lib/supabase.js";
import {
  DEFAULT_CURRENCY,
  DEFAULT_PARTNER_RATE,
  buildFinanceSnapshot,
  calculateClientPayout,
  calculateCompanyRevenue,
  normalizeMoneyAmount,
  resolvePartnerRate,
} from "../lib/financeCalculations.js";
import { assertCurrentAdminPageAccess } from "./adminAccessService.js";
import { getCurrentUser } from "./authService.js";

const DEFAULT_FETCH_LIMIT = 1000;
const NEGATIVE_CASE_STATUSES = new Set([
  "rejected",
  "cancelled",
  "fraud",
  "duplicate",
  "closed_rejected",
  "denied",
  "lost",
  "archived",
]);
const EXISTING_PARTNER_PAYOUT_STATUSES = new Set([
  "pending",
  "processing",
  "approved",
  "paid",
  "failed",
  "cancelled",
  "unpaid",
]);
const financeDatasetCache = new Map();
const financeDatasetPending = new Map();
const FINANCE_READ_PAGE_KEYS = [
  "dashboard.revenue",
  "finance.overview",
  "finance.payments",
  "finance.partnerPayouts",
  "finance.partnerCommissions",
  "finance.caseFinance",
];
const FINANCE_EDIT_PAGE_KEYS = [
  "dashboard.revenue",
  "finance.overview",
  "finance.payments",
  "finance.partnerPayouts",
  "finance.partnerCommissions",
  "finance.caseFinance",
];
const FINANCE_READ_FALLBACK_PERMISSIONS = [
  "finance.edit",
  "payments.view",
  "partner_commissions.view",
  "partner_commissions.manage",
  "partner_payouts.view",
  "partner_payouts.manage",
  "reports.view",
  "reports.export",
];
const PARTNER_FINANCE_READ_PERMISSIONS = [
  "partners.view",
  "partners.edit",
  "referrals.view",
  "partner_commissions.view",
  "partner_commissions.manage",
  "partner_payouts.view",
  "partner_payouts.manage",
  "finance.view",
  "finance.edit",
  "reports.view",
  "reports.export",
];
const PARTNER_FINANCE_EDIT_PERMISSIONS = [
  "finance.edit",
  "partner_commissions.manage",
  "partner_payouts.manage",
  "partners.edit",
];
const PARTNER_FINANCE_PAGE_KEYS = [
  "dashboard.revenue",
  "finance.partnerPayouts",
  "finance.partnerCommissions",
  "partners.referral",
  "partners.applications",
  "partners.referralPartners",
  "partners.referrals",
];

function stableSerializeCacheValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeCacheValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerializeCacheValue(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildFinanceCacheKey(scope, params = null) {
  return params === null ? scope : `${scope}:${stableSerializeCacheValue(params)}`;
}

async function withFinanceCache(cacheKey, loader, { force = false } = {}) {
  if (!force && financeDatasetCache.has(cacheKey)) {
    return financeDatasetCache.get(cacheKey);
  }

  if (!force && financeDatasetPending.has(cacheKey)) {
    return financeDatasetPending.get(cacheKey);
  }

  const pending = Promise.resolve()
    .then(loader)
    .then((result) => {
      financeDatasetCache.set(cacheKey, result);
      return result;
    })
    .finally(() => {
      financeDatasetPending.delete(cacheKey);
    });

  financeDatasetPending.set(cacheKey, pending);
  return pending;
}

async function assertFinanceReadAccess(message = "You do not have access to finance data.") {
  return assertCurrentAdminPageAccess("finance.overview", {
    anyPageKeys: FINANCE_READ_PAGE_KEYS,
    fallbackPermission: "finance.view",
    anyPermissions: FINANCE_READ_FALLBACK_PERMISSIONS,
    message,
  });
}

async function assertFinanceEditAccess(message = "You do not have access to update finance data.") {
  return assertCurrentAdminPageAccess("finance.overview", {
    action: "edit",
    anyPageKeys: FINANCE_EDIT_PAGE_KEYS,
    fallbackPermission: "finance.edit",
    message,
  });
}

async function assertPartnerFinanceReadAccess(message = "You do not have access to partner finance data.") {
  return assertCurrentAdminPageAccess("finance.partnerCommissions", {
    anyPageKeys: PARTNER_FINANCE_PAGE_KEYS,
    fallbackPermission: "finance.view",
    anyPermissions: PARTNER_FINANCE_READ_PERMISSIONS,
    message,
  });
}

async function assertPartnerFinanceEditAccess(message = "You do not have access to update partner finance data.") {
  return assertCurrentAdminPageAccess("finance.partnerCommissions", {
    action: "edit",
    anyPageKeys: PARTNER_FINANCE_PAGE_KEYS,
    fallbackPermission: "finance.edit",
    anyPermissions: PARTNER_FINANCE_EDIT_PERMISSIONS,
    message,
  });
}

function isMissingOptionalTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function isMissingColumnError(error) {
  return error?.code === "42703" || error?.code === "PGRST204" || error?.message?.includes("column");
}

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function roundMoney(value) {
  return Number(normalizeMoneyAmount(value).toFixed(2));
}

function normalizeDecimalRate(value, fallback = DEFAULT_PARTNER_RATE) {
  const rate = normalizeMoneyAmount(value);
  if (rate > 1 && rate <= 100) {
    return roundMoney(rate / 100);
  }
  if (rate > 0 && rate < 1) {
    return roundMoney(rate);
  }
  return roundMoney(fallback);
}

function toLegacyPercentageRate(value, fallback = DEFAULT_PARTNER_RATE) {
  return roundMoney(normalizeDecimalRate(value, fallback) * 100);
}

function normalizeClientPaymentStatus(value) {
  return String(value || "").trim().toLowerCase() === "paid" ? "paid" : "unpaid";
}

function normalizePartnerPaymentStatus(value) {
  return String(value || "").trim().toLowerCase() === "paid" ? "paid" : "unpaid";
}

function normalizePartnerPayoutStatusForWrite(nextStatus, currentStatus = "") {
  const normalizedNextStatus = String(nextStatus || "").trim().toLowerCase();
  const normalizedCurrentStatus = String(currentStatus || "").trim().toLowerCase();

  if (normalizedNextStatus === "paid") {
    return "paid";
  }

  if (normalizedNextStatus === "unpaid") {
    return ["approved", "processing", "pending"].includes(normalizedCurrentStatus)
      ? normalizedCurrentStatus
      : "pending";
  }

  if (EXISTING_PARTNER_PAYOUT_STATUSES.has(normalizedNextStatus)) {
    return normalizedNextStatus;
  }

  return normalizedCurrentStatus || "pending";
}

function buildRouteLabel(caseRow = {}) {
  return [caseRow?.route_from, caseRow?.route_to].filter(Boolean).join(" -> ");
}

function buildClientLabel(caseRow = {}, customer = null) {
  return customer?.full_name
    || caseRow?.client_name
    || caseRow?.case_code
    || "Unknown client";
}

function toIsoDateOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toSearchableText(parts = []) {
  return parts
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .join(" ");
}

function matchesTextSearch(parts, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return toSearchableText(parts).includes(normalizedQuery);
}

function withinDateRange(value, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) {
    return true;
  }

  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  if (dateFrom) {
    const fromTimestamp = new Date(dateFrom).getTime();
    if (!Number.isNaN(fromTimestamp) && timestamp < fromTimestamp) {
      return false;
    }
  }

  if (dateTo) {
    const toTimestamp = new Date(dateTo).getTime();
    if (!Number.isNaN(toTimestamp) && timestamp > toTimestamp) {
      return false;
    }
  }

  return true;
}

function isDefinedFilterValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function shouldExcludeCaseFromConfirmedCount(caseRow = {}) {
  return NEGATIVE_CASE_STATUSES.has(String(caseRow?.status || "").trim().toLowerCase());
}

function getManualClientPayoutAmount(financeRow = {}, calculatedClientPayoutAmount = 0) {
  const storedValue = normalizeMoneyAmount(financeRow?.customer_payout);
  if (storedValue <= 0) {
    return null;
  }

  return Math.abs(storedValue - normalizeMoneyAmount(calculatedClientPayoutAmount)) > 0.009
    ? roundMoney(storedValue)
    : null;
}

function getFinalClientPayoutAmount(financeRow = {}, calculatedClientPayoutAmount = 0) {
  const storedValue = normalizeMoneyAmount(financeRow?.customer_payout);
  if (storedValue > 0) {
    return roundMoney(storedValue);
  }

  return roundMoney(calculatedClientPayoutAmount);
}

function pickRepresentativePayout(rows = []) {
  if (!rows.length) {
    return null;
  }

  const paid = rows
    .filter((item) => String(item?.status || "").trim().toLowerCase() === "paid")
    .sort((left, right) => new Date(right?.paid_at || right?.updated_at || right?.created_at || 0).getTime()
      - new Date(left?.paid_at || left?.updated_at || left?.created_at || 0).getTime());

  if (paid[0]) {
    return paid[0];
  }

  return [...rows].sort((left, right) => new Date(right?.updated_at || right?.created_at || 0).getTime()
    - new Date(left?.updated_at || left?.created_at || 0).getTime())[0] || null;
}

function mapRowsByKey(rows = [], key) {
  return new Map((rows || []).filter((item) => item?.[key]).map((item) => [item[key], item]));
}

function groupRowsByKey(rows = [], key) {
  return (rows || []).reduce((acc, item) => {
    const groupKey = item?.[key];
    if (!groupKey) {
      return acc;
    }

    const bucket = acc.get(groupKey) || [];
    bucket.push(item);
    acc.set(groupKey, bucket);
    return acc;
  }, new Map());
}

function buildPartnerLabelMaps(partners = []) {
  const byId = new Map();
  const byLabel = new Map();

  (partners || []).forEach((partner) => {
    if (partner?.id) {
      byId.set(partner.id, partner);
    }

    [partner?.name, partner?.public_name, partner?.referral_code].forEach((value) => {
      const normalized = String(value || "").trim().toLowerCase();
      if (normalized) {
        byLabel.set(normalized, partner);
      }
    });
  });

  return { byId, byLabel };
}

function resolvePartnerForCase(caseRow, referralRow, partnerMaps) {
  if (referralRow?.partner_id && partnerMaps.byId.has(referralRow.partner_id)) {
    return partnerMaps.byId.get(referralRow.partner_id);
  }

  if (caseRow?.referral_partner_id && partnerMaps.byId.has(caseRow.referral_partner_id)) {
    return partnerMaps.byId.get(caseRow.referral_partner_id);
  }

  const normalizedLabel = String(caseRow?.referral_partner_label || "").trim().toLowerCase();
  if (normalizedLabel && partnerMaps.byLabel.has(normalizedLabel)) {
    return partnerMaps.byLabel.get(normalizedLabel);
  }

  return null;
}

function buildFinanceRow({ financeRow, caseRow, customer, referralRow, partner, commissionRow, payoutRow }) {
  const compensationAmount = normalizeMoneyAmount(
    financeRow?.compensation_amount ?? caseRow?.estimated_compensation,
  );
  const calculatedClientPayoutAmount = calculateClientPayout(compensationAmount);
  const manualClientPayoutAmount = getManualClientPayoutAmount(financeRow, calculatedClientPayoutAmount);
  const partnerRate = partner
    ? normalizeDecimalRate(commissionRow?.partner_rate ?? commissionRow?.commission_rate ?? null)
    : null;
  const snapshot = buildFinanceSnapshot({
    compensationAmount,
    manualClientPayoutAmount: manualClientPayoutAmount ?? financeRow?.customer_payout,
    partnerRate: partnerRate ?? DEFAULT_PARTNER_RATE,
  });
  const partnerCommissionAmount = partner
    ? roundMoney(commissionRow?.amount ?? financeRow?.referral_commission ?? snapshot.partnerCommissionAmount)
    : 0;
  const companyRevenueAmount = roundMoney(financeRow?.company_fee || snapshot.companyRevenueAmount);
  const finalClientPayoutAmount = getFinalClientPayoutAmount(financeRow, snapshot.calculatedClientPayoutAmount);
  const partnerPaymentStatus = partner
    ? normalizePartnerPaymentStatus(payoutRow?.status || commissionRow?.status)
    : null;

  return {
    caseId: caseRow?.id || financeRow?.case_id || null,
    caseCode: caseRow?.case_code || null,
    leadId: caseRow?.lead_id || null,
    route: buildRouteLabel(caseRow),
    clientLabel: buildClientLabel(caseRow, customer),
    compensationAmount: roundMoney(compensationAmount),
    companyRevenueAmount,
    clientPayoutAmount: roundMoney(finalClientPayoutAmount),
    partnerName: partner?.public_name || partner?.name || null,
    referralCode: referralRow?.referral_code || partner?.referral_code || null,
    partnerRate,
    partnerCommissionAmount,
    netProfit: roundMoney(companyRevenueAmount - partnerCommissionAmount),
    internalCompensationConfirmed: Boolean(financeRow?.internal_compensation_confirmed),
    clientVisibleApproval: Boolean(financeRow?.client_visible_approval),
    clientPaymentStatus: normalizeClientPaymentStatus(financeRow?.client_payment_status),
    partnerPaymentStatus,
    updatedAt: financeRow?.updated_at || caseRow?.updated_at || financeRow?.created_at || null,
  };
}

function applyFinanceRowFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (isDefinedFilterValue(filters.caseId) && row.caseId !== filters.caseId) {
      return false;
    }

    if (isDefinedFilterValue(filters.leadId) && row.leadId !== filters.leadId) {
      return false;
    }

    if (isDefinedFilterValue(filters.partnerName) && row.partnerName !== filters.partnerName) {
      return false;
    }

    if (isDefinedFilterValue(filters.internalCompensationConfirmed)
      && Boolean(row.internalCompensationConfirmed) !== Boolean(filters.internalCompensationConfirmed)) {
      return false;
    }

    if (isDefinedFilterValue(filters.clientVisibleApproval)
      && Boolean(row.clientVisibleApproval) !== Boolean(filters.clientVisibleApproval)) {
      return false;
    }

    if (isDefinedFilterValue(filters.clientPaymentStatus)
      && row.clientPaymentStatus !== normalizeClientPaymentStatus(filters.clientPaymentStatus)) {
      return false;
    }

    if (isDefinedFilterValue(filters.partnerPaymentStatus)
      && row.partnerPaymentStatus !== normalizePartnerPaymentStatus(filters.partnerPaymentStatus)) {
      return false;
    }

    if (!withinDateRange(row.updatedAt, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    return matchesTextSearch(
      [
        row.caseCode,
        row.clientLabel,
        row.route,
        row.partnerName,
        row.referralCode,
      ],
      filters.search,
    );
  });
}

function applyClientPaymentFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (isDefinedFilterValue(filters.caseId) && row.caseId !== filters.caseId) {
      return false;
    }

    if (isDefinedFilterValue(filters.status)
      && row.status !== normalizeClientPaymentStatus(filters.status)) {
      return false;
    }

    if (isDefinedFilterValue(filters.paymentFlowType)
      && row.paymentFlowType !== filters.paymentFlowType) {
      return false;
    }

    if (!withinDateRange(row.updatedAt, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    return matchesTextSearch(
      [row.caseCode, row.clientLabel, row.route, row.paymentReference],
      filters.search,
    );
  });
}

function applyPartnerPaymentFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (isDefinedFilterValue(filters.caseId) && row.caseId !== filters.caseId) {
      return false;
    }

    if (isDefinedFilterValue(filters.partnerId) && row.partnerId !== filters.partnerId) {
      return false;
    }

    if (isDefinedFilterValue(filters.status)
      && row.status !== normalizePartnerPaymentStatus(filters.status)) {
      return false;
    }

    if (!withinDateRange(row.updatedAt, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    return matchesTextSearch(
      [row.partnerName, row.referralCode, row.caseCode, row.route, row.paymentReference],
      filters.search,
    );
  });
}

function applyPartnerCommissionFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (isDefinedFilterValue(filters.caseId) && row.caseId !== filters.caseId) {
      return false;
    }

    if (isDefinedFilterValue(filters.partnerId) && row.partnerId !== filters.partnerId) {
      return false;
    }

    if (isDefinedFilterValue(filters.status)) {
      const normalizedFilter = String(filters.status || "").trim().toLowerCase();
      if (normalizedFilter !== String(row.rawStatus || row.status || "").trim().toLowerCase()) {
        return false;
      }
    }

    if (!withinDateRange(row.updatedAt, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    return matchesTextSearch(
      [row.partnerName, row.referralCode, row.caseCode, row.route],
      filters.search,
    );
  });
}

function escapeCsvCell(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

function buildCsvString(headers, rows) {
  const lines = [
    headers.map((header) => escapeCsvCell(header.label)).join(","),
    ...rows.map((row) => headers.map((header) => {
      const rawValue = row[header.key];
      const value = typeof header.formatter === "function" ? header.formatter(rawValue, row) : rawValue;
      return escapeCsvCell(value);
    }).join(",")),
  ];

  return lines.join("\n");
}

function formatCsvPartnerRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  return `${Math.round((numeric <= 1 ? numeric * 100 : numeric) * 100) / 100}%`;
}

function buildExportFileName(prefix) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${timestamp}.csv`;
}

async function getCurrentUserId() {
  const user = await getCurrentUser().catch(() => null);
  return user?.id || null;
}

async function fetchFinanceDataset(filters = {}, options = {}) {
  return withFinanceCache(buildFinanceCacheKey("finance-dataset", filters), async () => {
    const client = requireSupabase();
    const limit = Number(filters.limit || DEFAULT_FETCH_LIMIT);
    const caseId = filters.caseId || null;
    const partnerId = filters.partnerId || null;

  const financeQuery = client
    .from("case_finance")
    .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, payment_status, payment_method, currency, notes, payment_received_at, customer_paid_at, referral_paid_at, internal_compensation_confirmed, client_visible_approval, client_payment_status, client_payment_reference, internal_note, client_paid_at, client_payment_flow_type, updated_by, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  const casesQuery = client
    .from("cases")
    .select("id, case_code, lead_id, customer_id, referral_partner_id, referral_partner_label, airline, route_from, route_to, status, payout_status, estimated_compensation, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  const customersQuery = client
    .from("customers")
    .select("id, full_name, email, phone")
    .order("created_at", { ascending: false })
    .limit(limit);
  const referralsQuery = client
    .from("referrals")
    .select("id, partner_id, case_id, lead_id, referral_code, status, attribution_meta, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  const partnersQuery = client
    .from("referral_partners")
    .select("id, name, public_name, referral_code, commission_type, commission_rate, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  const commissionsQuery = client
    .from("partner_commissions")
    .select("id, partner_id, lead_id, case_id, amount, currency, commission_rate, partner_rate, source_amount, status, notes, created_at, approved_at, paid_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const payoutsQuery = client
    .from("referral_partner_payouts")
    .select("id, partner_id, case_id, amount, currency, status, payout_method, payment_reference, note, paid_at, updated_by, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (caseId) {
    financeQuery.eq("case_id", caseId);
    casesQuery.eq("id", caseId);
    referralsQuery.eq("case_id", caseId);
    commissionsQuery.eq("case_id", caseId);
    payoutsQuery.eq("case_id", caseId);
  }

  if (partnerId) {
    referralsQuery.eq("partner_id", partnerId);
    partnersQuery.eq("id", partnerId);
    commissionsQuery.eq("partner_id", partnerId);
    payoutsQuery.eq("partner_id", partnerId);
  }

  const [finance, cases, customers, referrals, partners, commissions, payouts] = await Promise.all([
    financeQuery,
    casesQuery,
    customersQuery,
    referralsQuery,
    partnersQuery,
    commissionsQuery,
    payoutsQuery,
  ]);

  const requiredErrors = [finance, cases].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  const optionalResults = { customers, referrals, partners, commissions, payouts };
  Object.values(optionalResults).forEach((result) => {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  });

    return {
      finance: finance.data || [],
      cases: cases.data || [],
      customers: customers.error ? [] : customers.data || [],
      referrals: referrals.error ? [] : referrals.data || [],
      partners: partners.error ? [] : partners.data || [],
      commissions: commissions.error ? [] : commissions.data || [],
      payouts: payouts.error ? [] : payouts.data || [],
    };
  }, options);
}

async function getCaseFinanceRecordByCaseId(client, caseId) {
  const response = await client
    .from("case_finance")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (response.error && !isMissingOptionalTable(response.error) && !isMissingColumnError(response.error)) {
    throw response.error;
  }

  return response.data || null;
}

async function ensureCaseFinanceRecord(client, caseRow, userId = null) {
  const existing = await getCaseFinanceRecordByCaseId(client, caseRow.id);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const insertPayload = {
    id: generateUuid(),
    case_id: caseRow.id,
    compensation_amount: roundMoney(caseRow?.estimated_compensation || 0),
    company_fee: 0,
    customer_payout: 0,
    referral_commission: 0,
    payment_status: "not_started",
    currency: DEFAULT_CURRENCY,
    internal_compensation_confirmed: false,
    client_visible_approval: false,
    client_payment_status: "unpaid",
    client_payment_flow_type: "through_company",
    updated_by: userId,
    created_at: now,
    updated_at: now,
  };

  const inserted = await client
    .from("case_finance")
    .insert(insertPayload)
    .select("*")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data;
}

async function getCaseAndFinance(client, caseId, userId = null) {
  const [caseResponse, financeRow] = await Promise.all([
    client
      .from("cases")
      .select("id, case_code, lead_id, customer_id, referral_partner_id, referral_partner_label, airline, route_from, route_to, status, payout_status, estimated_compensation, created_at, updated_at")
      .eq("id", caseId)
      .maybeSingle(),
    getCaseFinanceRecordByCaseId(client, caseId),
  ]);

  if (caseResponse.error) {
    throw caseResponse.error;
  }

  if (!caseResponse.data) {
    throw new Error("Case not found.");
  }

  const ensuredFinanceRow = financeRow || await ensureCaseFinanceRecord(client, caseResponse.data, userId);

  return {
    caseRow: caseResponse.data,
    financeRow: ensuredFinanceRow,
  };
}

async function getReferralRowForCase(client, caseRow) {
  const byCaseResponse = await client
    .from("referrals")
    .select("id, partner_id, case_id, lead_id, referral_code, status, attribution_meta, created_at, updated_at")
    .eq("case_id", caseRow.id)
    .maybeSingle();

  if (!byCaseResponse.error) {
    return byCaseResponse.data || null;
  }

  if (!isMissingOptionalTable(byCaseResponse.error) && !isMissingColumnError(byCaseResponse.error)) {
    throw byCaseResponse.error;
  }

  if (!caseRow?.lead_id) {
    return null;
  }

  const byLeadResponse = await client
    .from("referrals")
    .select("id, partner_id, case_id, lead_id, referral_code, status, attribution_meta, created_at, updated_at")
    .eq("lead_id", caseRow.lead_id)
    .maybeSingle();

  if (byLeadResponse.error && !isMissingOptionalTable(byLeadResponse.error) && !isMissingColumnError(byLeadResponse.error)) {
    throw byLeadResponse.error;
  }

  return byLeadResponse.data || null;
}

async function getPartnerForCase(client, caseRow) {
  if (caseRow?.referral_partner_id) {
    const response = await client
      .from("referral_partners")
      .select("id, name, public_name, referral_code, commission_type, commission_rate, status, updated_at")
      .eq("id", caseRow.referral_partner_id)
      .maybeSingle();

    if (response.error && !isMissingOptionalTable(response.error) && !isMissingColumnError(response.error)) {
      throw response.error;
    }

    if (response.data) {
      return response.data;
    }
  }

  const referralRow = await getReferralRowForCase(client, caseRow);
  if (referralRow?.partner_id) {
    const response = await client
      .from("referral_partners")
      .select("id, name, public_name, referral_code, commission_type, commission_rate, status, updated_at")
      .eq("id", referralRow.partner_id)
      .maybeSingle();

    if (response.error && !isMissingOptionalTable(response.error) && !isMissingColumnError(response.error)) {
      throw response.error;
    }

    if (response.data) {
      return response.data;
    }
  }

  const normalizedLabel = String(caseRow?.referral_partner_label || "").trim().toLowerCase();
  if (!normalizedLabel) {
    return null;
  }

  const partnersResponse = await client
    .from("referral_partners")
    .select("id, name, public_name, referral_code, commission_type, commission_rate, status, updated_at")
    .limit(300);

  if (partnersResponse.error && !isMissingOptionalTable(partnersResponse.error) && !isMissingColumnError(partnersResponse.error)) {
    throw partnersResponse.error;
  }

  return (partnersResponse.data || []).find((partner) => {
    return [partner?.name, partner?.public_name, partner?.referral_code]
      .some((value) => String(value || "").trim().toLowerCase() === normalizedLabel);
  }) || null;
}

export async function createFinanceAuditLog(payload = {}, options = {}) {
  const client = requireSupabase();
  const performedBy = payload.performedBy || await getCurrentUserId();
  const insertPayload = {
    id: generateUuid(),
    entity_type: payload.entityType,
    entity_id: payload.entityId || null,
    action: payload.action,
    old_value: payload.oldValue || null,
    new_value: payload.newValue || null,
    performed_by: performedBy || null,
    performed_at: new Date().toISOString(),
    comment: payload.comment || null,
    created_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("finance_audit_logs")
    .insert(insertPayload);

  if (error) {
    if (options.strict) {
      throw error;
    }

    console.warn("finance audit logging failed", {
      action: insertPayload.action,
      entityType: insertPayload.entity_type,
      entityId: insertPayload.entity_id,
      code: error.code,
      message: error.message,
    });
    return false;
  }

  return true;
}

async function getRepresentativePartnerPayoutByCase(client, partnerId, caseId) {
  const response = await client
    .from("referral_partner_payouts")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (response.error && !isMissingOptionalTable(response.error) && !isMissingColumnError(response.error)) {
    throw response.error;
  }

  return pickRepresentativePayout(response.data || []);
}

function buildClientPaymentRow(financeRow, caseRow, customer) {
  const compensationAmount = normalizeMoneyAmount(
    financeRow?.compensation_amount ?? caseRow?.estimated_compensation,
  );
  const calculatedClientPayoutAmount = calculateClientPayout(compensationAmount);
  const manualClientPayoutAmount = getManualClientPayoutAmount(financeRow, calculatedClientPayoutAmount);
  const finalClientPayoutAmount = getFinalClientPayoutAmount(financeRow, calculatedClientPayoutAmount);

  return {
    id: financeRow.id,
    caseId: financeRow.case_id || caseRow?.id || null,
    caseCode: caseRow?.case_code || null,
    clientLabel: buildClientLabel(caseRow, customer),
    route: buildRouteLabel(caseRow),
    compensationAmount: roundMoney(compensationAmount),
    companyRevenueAmount: roundMoney(financeRow?.company_fee || calculateCompanyRevenue(compensationAmount)),
    calculatedClientPayoutAmount: roundMoney(calculatedClientPayoutAmount),
    manualClientPayoutAmount,
    finalClientPayoutAmount: roundMoney(finalClientPayoutAmount),
    currency: financeRow?.currency || DEFAULT_CURRENCY,
    status: normalizeClientPaymentStatus(financeRow?.client_payment_status),
    paymentFlowType: financeRow?.client_payment_flow_type || "through_company",
    paymentReference: financeRow?.client_payment_reference || null,
    internalNote: financeRow?.internal_note || null,
    clientPaidAt: financeRow?.client_paid_at || null,
    updatedAt: financeRow?.updated_at || financeRow?.created_at || null,
  };
}

function buildPartnerPaymentRow(payoutRow, caseRow, partner, referralRow, commissionRow) {
  const compensationAmount = normalizeMoneyAmount(
    caseRow?.estimated_compensation
      || (commissionRow?.source_amount ? normalizeMoneyAmount(commissionRow.source_amount) / 0.30 : 0),
  );
  const partnerRate = normalizeDecimalRate(commissionRow?.partner_rate ?? commissionRow?.commission_rate ?? partner?.commission_rate ?? null);
  const partnerCommissionSnapshot = buildFinanceSnapshot({
    compensationAmount,
    partnerRate,
  });

  return {
    id: payoutRow.id,
    partnerId: payoutRow.partner_id || partner?.id || null,
    partnerName: partner?.public_name || partner?.name || null,
    referralCode: referralRow?.referral_code || partner?.referral_code || null,
    caseId: payoutRow.case_id || caseRow?.id || null,
    caseCode: caseRow?.case_code || null,
    route: buildRouteLabel(caseRow),
    compensationAmount: roundMoney(compensationAmount),
    companyRevenueAmount: roundMoney(commissionRow?.source_amount || calculateCompanyRevenue(compensationAmount)),
    partnerRate,
    partnerCommissionAmount: roundMoney(commissionRow?.amount || payoutRow?.amount || partnerCommissionSnapshot.partnerCommissionAmount),
    currency: payoutRow?.currency || commissionRow?.currency || DEFAULT_CURRENCY,
    status: normalizePartnerPaymentStatus(payoutRow?.status),
    rawStatus: String(payoutRow?.status || "").trim().toLowerCase() || "unpaid",
    paymentReference: payoutRow?.payment_reference || null,
    internalNote: payoutRow?.note || null,
    paidAt: payoutRow?.paid_at || null,
    createdAt: payoutRow?.created_at || null,
    updatedAt: payoutRow?.updated_at || payoutRow?.created_at || null,
  };
}

function buildPartnerCommissionRow(commissionRow, caseRow, partner, referralRow) {
  const companyRevenueAmount = normalizeMoneyAmount(
    commissionRow?.source_amount ?? calculateCompanyRevenue(caseRow?.estimated_compensation || 0),
  );
  const compensationAmount = companyRevenueAmount > 0
    ? roundMoney(caseRow?.estimated_compensation || (companyRevenueAmount / 0.30))
    : roundMoney(caseRow?.estimated_compensation || 0);
  const partnerRate = normalizeDecimalRate(commissionRow?.partner_rate ?? commissionRow?.commission_rate ?? partner?.commission_rate ?? DEFAULT_PARTNER_RATE);

  return {
    id: commissionRow?.id || null,
    partnerId: commissionRow?.partner_id || partner?.id || null,
    partnerName: partner?.public_name || partner?.name || null,
    referralCode: referralRow?.referral_code || partner?.referral_code || null,
    caseId: commissionRow?.case_id || caseRow?.id || null,
    caseCode: caseRow?.case_code || null,
    route: buildRouteLabel(caseRow),
    compensationAmount: roundMoney(compensationAmount),
    companyRevenueAmount: roundMoney(companyRevenueAmount),
    partnerRate,
    partnerCommissionAmount: roundMoney(commissionRow?.amount || 0),
    currency: commissionRow?.currency || DEFAULT_CURRENCY,
    status: normalizePartnerPaymentStatus(commissionRow?.status),
    rawStatus: String(commissionRow?.status || "").trim().toLowerCase() || "pending",
    createdAt: commissionRow?.created_at || null,
    approvedAt: commissionRow?.approved_at || null,
    paidAt: commissionRow?.paid_at || null,
    updatedAt: commissionRow?.paid_at || commissionRow?.approved_at || commissionRow?.created_at || null,
  };
}

export async function getFinanceRows(filters = {}, options = {}) {
  await assertFinanceReadAccess();
  const dataset = await fetchFinanceDataset(filters, options);
  const casesById = mapRowsByKey(dataset.cases, "id");
  const customersById = mapRowsByKey(dataset.customers, "id");
  const referralsByCaseId = mapRowsByKey(dataset.referrals.filter((item) => item.case_id), "case_id");
  const partnerMaps = buildPartnerLabelMaps(dataset.partners);
  const commissionsByCaseId = mapRowsByKey(dataset.commissions.filter((item) => item.case_id), "case_id");
  const payoutsByCaseId = groupRowsByKey(dataset.payouts.filter((item) => item.case_id), "case_id");

  const rows = (dataset.finance || []).map((financeRow) => {
    const caseRow = casesById.get(financeRow.case_id) || null;
    const customer = caseRow?.customer_id ? customersById.get(caseRow.customer_id) || null : null;
    const referralRow = referralsByCaseId.get(financeRow.case_id) || null;
    const partner = resolvePartnerForCase(caseRow, referralRow, partnerMaps);
    const commissionRow = commissionsByCaseId.get(financeRow.case_id) || null;
    const payoutRow = pickRepresentativePayout(payoutsByCaseId.get(financeRow.case_id) || []);

    return buildFinanceRow({
      financeRow,
      caseRow,
      customer,
      referralRow,
      partner,
      commissionRow,
      payoutRow,
    });
  });

  return applyFinanceRowFilters(rows, filters);
}

export async function getFinanceSummary(filters = {}, options = {}) {
  await assertFinanceReadAccess();
  const rows = await getFinanceRows({
    ...filters,
    internalCompensationConfirmed: filters.internalCompensationConfirmed ?? true,
  }, options);

  return rows.reduce((summary, row) => {
    const totalCompensation = summary.totalCompensation + normalizeMoneyAmount(row.compensationAmount);
    const totalRevenue = summary.totalRevenue + normalizeMoneyAmount(row.companyRevenueAmount);
    const totalClientPayouts = summary.totalClientPayouts + normalizeMoneyAmount(row.clientPayoutAmount);
    const totalPartnerPayouts = summary.totalPartnerPayouts + normalizeMoneyAmount(row.partnerCommissionAmount);
    const paidClientAmount = summary.paidClientAmount + (row.clientPaymentStatus === "paid"
      ? normalizeMoneyAmount(row.clientPayoutAmount)
      : 0);
    const paidPartnerAmount = summary.paidPartnerAmount + (row.partnerPaymentStatus === "paid"
      ? normalizeMoneyAmount(row.partnerCommissionAmount)
      : 0);
    const unpaidAmount = summary.unpaidAmount
      + (row.clientPaymentStatus !== "paid" ? normalizeMoneyAmount(row.clientPayoutAmount) : 0)
      + (row.partnerName && row.partnerPaymentStatus !== "paid" ? normalizeMoneyAmount(row.partnerCommissionAmount) : 0);

    return {
      totalCompensation: roundMoney(totalCompensation),
      totalRevenue: roundMoney(totalRevenue),
      totalClientPayouts: roundMoney(totalClientPayouts),
      totalPartnerPayouts: roundMoney(totalPartnerPayouts),
      netProfit: roundMoney(totalRevenue - totalPartnerPayouts),
      unpaidAmount: roundMoney(unpaidAmount),
      paidClientAmount: roundMoney(paidClientAmount),
      paidPartnerAmount: roundMoney(paidPartnerAmount),
    };
  }, {
    totalCompensation: 0,
    totalRevenue: 0,
    totalClientPayouts: 0,
    totalPartnerPayouts: 0,
    netProfit: 0,
    unpaidAmount: 0,
    paidClientAmount: 0,
    paidPartnerAmount: 0,
  });
}

export async function getClientPayments(filters = {}, options = {}) {
  await assertFinanceReadAccess();
  const dataset = await fetchFinanceDataset(filters, options);
  const casesById = mapRowsByKey(dataset.cases, "id");
  const customersById = mapRowsByKey(dataset.customers, "id");

  const rows = (dataset.finance || []).map((financeRow) => {
    const caseRow = casesById.get(financeRow.case_id) || null;
    const customer = caseRow?.customer_id ? customersById.get(caseRow.customer_id) || null : null;
    return buildClientPaymentRow(financeRow, caseRow, customer);
  });

  return applyClientPaymentFilters(rows, filters);
}

export async function getPartnerPayments(filters = {}, options = {}) {
  await assertPartnerFinanceReadAccess();
  const dataset = await fetchFinanceDataset(filters, options);
  const casesById = mapRowsByKey(dataset.cases, "id");
  const referralsByCaseId = mapRowsByKey(dataset.referrals.filter((item) => item.case_id), "case_id");
  const partnerMaps = buildPartnerLabelMaps(dataset.partners);
  const commissionsByCaseId = mapRowsByKey(dataset.commissions.filter((item) => item.case_id), "case_id");

  const rows = (dataset.payouts || []).map((payoutRow) => {
    const caseRow = payoutRow.case_id ? casesById.get(payoutRow.case_id) || null : null;
    const referralRow = payoutRow.case_id ? referralsByCaseId.get(payoutRow.case_id) || null : null;
    const partner = payoutRow.partner_id
      ? partnerMaps.byId.get(payoutRow.partner_id) || null
      : resolvePartnerForCase(caseRow, referralRow, partnerMaps);
    const commissionRow = payoutRow.case_id ? commissionsByCaseId.get(payoutRow.case_id) || null : null;

    return buildPartnerPaymentRow(payoutRow, caseRow, partner, referralRow, commissionRow);
  });

  return applyPartnerPaymentFilters(rows, filters);
}

export function preloadAdminFinanceWorkspaceData({ force = false } = {}) {
  return Promise.allSettled([
    getFinanceRows({}, { force }),
    getClientPayments({}, { force }),
    getPartnerPayments({}, { force }),
  ]).then(() => undefined);
}

export async function getPartnerCommissions(filters = {}) {
  await assertPartnerFinanceReadAccess();
  const dataset = await fetchFinanceDataset(filters);
  const casesById = mapRowsByKey(dataset.cases, "id");
  const referralsByCaseId = mapRowsByKey(dataset.referrals.filter((item) => item.case_id), "case_id");
  const partnerMaps = buildPartnerLabelMaps(dataset.partners);

  const rows = (dataset.commissions || []).map((commissionRow) => {
    const caseRow = commissionRow.case_id ? casesById.get(commissionRow.case_id) || null : null;
    const referralRow = commissionRow.case_id ? referralsByCaseId.get(commissionRow.case_id) || null : null;
    const partner = commissionRow.partner_id
      ? partnerMaps.byId.get(commissionRow.partner_id) || null
      : resolvePartnerForCase(caseRow, referralRow, partnerMaps);

    return buildPartnerCommissionRow(commissionRow, caseRow, partner, referralRow);
  });

  return applyPartnerCommissionFilters(rows, filters);
}

export async function getClientPaymentByCaseId(caseId) {
  await assertFinanceReadAccess();
  const rows = await getClientPayments({ caseId, limit: 1 });
  return rows[0] || null;
}

export async function getPartnerPaymentById(id) {
  await assertPartnerFinanceReadAccess();
  const client = requireSupabase();
  const payoutResponse = await client
    .from("referral_partner_payouts")
    .select("id, partner_id, case_id, amount, currency, status, payout_method, payment_reference, note, paid_at, updated_by, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (payoutResponse.error) {
    throw payoutResponse.error;
  }

  if (!payoutResponse.data) {
    return null;
  }

  const payoutRow = payoutResponse.data;
  const [caseResponse, partnerResponse, referralResponse, commissionResponse] = await Promise.all([
    payoutRow.case_id
      ? client.from("cases").select("id, case_code, lead_id, customer_id, referral_partner_id, referral_partner_label, route_from, route_to, estimated_compensation").eq("id", payoutRow.case_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    payoutRow.partner_id
      ? client.from("referral_partners").select("id, name, public_name, referral_code, commission_type, commission_rate, status").eq("id", payoutRow.partner_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    payoutRow.case_id
      ? client.from("referrals").select("id, partner_id, case_id, lead_id, referral_code").eq("case_id", payoutRow.case_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    payoutRow.case_id
      ? client.from("partner_commissions").select("id, partner_id, case_id, amount, currency, commission_rate, partner_rate, source_amount, status").eq("case_id", payoutRow.case_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  [caseResponse, partnerResponse, referralResponse, commissionResponse].forEach((result) => {
    if (result?.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  });

  return buildPartnerPaymentRow(
    payoutRow,
    caseResponse.data || null,
    partnerResponse.data || null,
    referralResponse.data || null,
    commissionResponse.data || null,
  );
}

export async function getConfirmedReferralClientsCount(partnerId) {
  await assertPartnerFinanceReadAccess();
  const client = requireSupabase();
  const [casesResponse, referralsResponse] = await Promise.all([
    client
      .from("cases")
      .select("id, status")
      .eq("referral_partner_id", partnerId)
      .limit(DEFAULT_FETCH_LIMIT),
    client
      .from("referrals")
      .select("case_id")
      .eq("partner_id", partnerId)
      .not("case_id", "is", null)
      .limit(DEFAULT_FETCH_LIMIT),
  ]);

  if (casesResponse.error) {
    throw casesResponse.error;
  }

  if (referralsResponse.error && !isMissingOptionalTable(referralsResponse.error) && !isMissingColumnError(referralsResponse.error)) {
    throw referralsResponse.error;
  }

  const caseMap = new Map((casesResponse.data || []).map((item) => [item.id, item]));
  (referralsResponse.data || []).forEach((item) => {
    if (item?.case_id && !caseMap.has(item.case_id)) {
      caseMap.set(item.case_id, { id: item.case_id, status: null });
    }
  });

  const caseIds = [...caseMap.keys()];
  if (!caseIds.length) {
    return 0;
  }

  const financeResponse = await client
    .from("case_finance")
    .select("case_id, internal_compensation_confirmed")
    .in("case_id", caseIds);

  if (financeResponse.error) {
    throw financeResponse.error;
  }

  return (financeResponse.data || []).reduce((count, financeRow) => {
    const caseRow = caseMap.get(financeRow.case_id) || null;
    if (!financeRow?.internal_compensation_confirmed || shouldExcludeCaseFromConfirmedCount(caseRow)) {
      return count;
    }
    return count + 1;
  }, 0);
}

export async function getPartnerCommissionRate(partnerId) {
  await assertPartnerFinanceReadAccess();
  const confirmedReferralClientsCount = await getConfirmedReferralClientsCount(partnerId);
  return resolvePartnerRate(confirmedReferralClientsCount);
}

export async function markInternalCompensationConfirmed(caseId, confirmed, options = {}) {
  await assertFinanceEditAccess();
  const client = requireSupabase();
  const userId = options.performedBy || await getCurrentUserId();
  const normalizedConfirmed = Boolean(confirmed);
  const { caseRow, financeRow } = await getCaseAndFinance(client, caseId, userId);
  const previousState = {
    internal_compensation_confirmed: Boolean(financeRow?.internal_compensation_confirmed),
    company_fee: financeRow?.company_fee || 0,
    customer_payout: financeRow?.customer_payout || 0,
    client_payment_status: financeRow?.client_payment_status || "unpaid",
  };

  const compensationAmount = roundMoney(
    financeRow?.compensation_amount ?? caseRow?.estimated_compensation ?? 0,
  );
  const nextFinanceBase = buildFinanceSnapshot({
    compensationAmount,
    manualClientPayoutAmount: financeRow?.customer_payout || null,
    partnerRate: DEFAULT_PARTNER_RATE,
  });
  const now = new Date().toISOString();
  const nextFinanceUpdate = {
    compensation_amount: nextFinanceBase.compensationAmount,
    company_fee: nextFinanceBase.companyRevenueAmount,
    customer_payout: financeRow?.customer_payout > 0
      ? roundMoney(financeRow.customer_payout)
      : nextFinanceBase.finalClientPayoutAmount,
    internal_compensation_confirmed: normalizedConfirmed,
    client_payment_status: normalizeClientPaymentStatus(
      financeRow?.client_payment_status === "paid" ? "paid" : "unpaid",
    ),
    updated_by: userId,
    updated_at: now,
  };

  const financeUpdateResponse = await client
    .from("case_finance")
    .update(nextFinanceUpdate)
    .eq("id", financeRow.id)
    .select("*")
    .single();

  if (financeUpdateResponse.error) {
    throw financeUpdateResponse.error;
  }

  const updatedFinanceRow = financeUpdateResponse.data;

  if (normalizedConfirmed) {
    const partner = await getPartnerForCase(client, caseRow);
    if (partner?.id) {
      const confirmedCount = await getConfirmedReferralClientsCount(partner.id);
      const partnerRate = resolvePartnerRate(confirmedCount);
      const snapshot = buildFinanceSnapshot({
        compensationAmount,
        manualClientPayoutAmount: updatedFinanceRow.customer_payout,
        partnerRate,
      });

      const existingCommissionResponse = await client
        .from("partner_commissions")
        .select("*")
        .eq("partner_id", partner.id)
        .eq("case_id", caseRow.id)
        .maybeSingle();

      if (existingCommissionResponse.error && !isMissingOptionalTable(existingCommissionResponse.error) && !isMissingColumnError(existingCommissionResponse.error)) {
        throw existingCommissionResponse.error;
      }

      const existingCommission = existingCommissionResponse.data || null;
      const existingCommissionStatus = String(existingCommission?.status || "").trim().toLowerCase();
      const keepPaidCommission = existingCommissionStatus === "paid";
      const commissionPayload = {
        partner_id: partner.id,
        lead_id: caseRow?.lead_id || null,
        case_id: caseRow.id,
        amount: keepPaidCommission ? existingCommission.amount : snapshot.partnerCommissionAmount,
        currency: DEFAULT_CURRENCY,
        commission_rate: keepPaidCommission
          ? existingCommission.commission_rate
          : toLegacyPercentageRate(partnerRate),
        partner_rate: keepPaidCommission
          ? normalizeDecimalRate(existingCommission.partner_rate ?? existingCommission.commission_rate ?? partnerRate)
          : partnerRate,
        source_amount: keepPaidCommission ? existingCommission.source_amount : snapshot.companyRevenueAmount,
        status: keepPaidCommission ? existingCommission.status : "approved",
        approved_at: keepPaidCommission
          ? existingCommission.approved_at || now
          : existingCommission?.approved_at || now,
        paid_at: keepPaidCommission ? existingCommission.paid_at || null : null,
        notes: existingCommission?.notes || null,
      };

      if (existingCommission?.id) {
        const { error } = await client
          .from("partner_commissions")
          .update(commissionPayload)
          .eq("id", existingCommission.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await client
          .from("partner_commissions")
          .insert({
            id: generateUuid(),
            ...commissionPayload,
          });

        if (error) {
          throw error;
        }
      }

      const existingPayout = await getRepresentativePartnerPayoutByCase(client, partner.id, caseRow.id);
      const existingPayoutStatus = String(existingPayout?.status || "").trim().toLowerCase();
      const keepPaidPayout = existingPayoutStatus === "paid";
      const payoutPayload = {
        partner_id: partner.id,
        case_id: caseRow.id,
        amount: keepPaidPayout ? existingPayout.amount : snapshot.partnerCommissionAmount,
        currency: DEFAULT_CURRENCY,
        status: keepPaidPayout
          ? existingPayout.status
          : normalizePartnerPayoutStatusForWrite("unpaid", existingPayout?.status),
        payout_method: existingPayout?.payout_method || null,
        payment_reference: existingPayout?.payment_reference || null,
        note: existingPayout?.note || null,
        paid_at: keepPaidPayout ? existingPayout?.paid_at || null : null,
        updated_by: userId,
        updated_at: now,
      };

      if (existingPayout?.id) {
        const { error } = await client
          .from("referral_partner_payouts")
          .update(payoutPayload)
          .eq("id", existingPayout.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await client
          .from("referral_partner_payouts")
          .insert({
            id: generateUuid(),
            ...payoutPayload,
            created_at: now,
          });

        if (error) {
          throw error;
        }
      }
    }
  }

  if (previousState.internal_compensation_confirmed !== normalizedConfirmed) {
    await createFinanceAuditLog({
      entityType: "case_finance",
      entityId: financeRow.id,
      action: "internal_compensation_confirmed_changed",
      oldValue: previousState,
      newValue: {
        internal_compensation_confirmed: normalizedConfirmed,
        company_fee: nextFinanceUpdate.company_fee,
        customer_payout: nextFinanceUpdate.customer_payout,
        client_payment_status: nextFinanceUpdate.client_payment_status,
      },
      performedBy: userId,
      comment: options.comment || null,
    }).catch(() => false);
  }

  return updatedFinanceRow;
}

export async function setClientVisibleApproval(caseId, visible, options = {}) {
  await assertFinanceEditAccess();
  const client = requireSupabase();
  const userId = options.performedBy || await getCurrentUserId();
  const financeRow = await getCaseFinanceRecordByCaseId(client, caseId);

  if (!financeRow) {
    throw new Error("Case finance record not found.");
  }

  const normalizedVisible = Boolean(visible);
  const previousValue = Boolean(financeRow.client_visible_approval);
  if (previousValue === normalizedVisible) {
    return financeRow;
  }

  const updatePayload = {
    client_visible_approval: normalizedVisible,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const response = await client
    .from("case_finance")
    .update(updatePayload)
    .eq("id", financeRow.id)
    .select("*")
    .single();

  if (response.error) {
    throw response.error;
  }

  await createFinanceAuditLog({
    entityType: "case_finance",
    entityId: financeRow.id,
    action: "client_visible_approval_changed",
    oldValue: { client_visible_approval: previousValue },
    newValue: { client_visible_approval: normalizedVisible },
    performedBy: userId,
    comment: options.comment || null,
  }).catch(() => false);

  return response.data;
}

async function resolveCaseFinanceRecord(client, caseFinanceIdOrCaseId) {
  const byIdResponse = await client
    .from("case_finance")
    .select("*")
    .eq("id", caseFinanceIdOrCaseId)
    .maybeSingle();

  if (byIdResponse.error && !isMissingOptionalTable(byIdResponse.error) && !isMissingColumnError(byIdResponse.error)) {
    throw byIdResponse.error;
  }

  if (byIdResponse.data) {
    return byIdResponse.data;
  }

  const byCaseResponse = await client
    .from("case_finance")
    .select("*")
    .eq("case_id", caseFinanceIdOrCaseId)
    .maybeSingle();

  if (byCaseResponse.error) {
    throw byCaseResponse.error;
  }

  return byCaseResponse.data || null;
}

export async function updateClientPayment(caseFinanceIdOrCaseId, payload = {}, options = {}) {
  await assertFinanceEditAccess();
  const client = requireSupabase();
  const userId = options.performedBy || await getCurrentUserId();
  const financeRow = await resolveCaseFinanceRecord(client, caseFinanceIdOrCaseId);

  if (!financeRow) {
    throw new Error("Case finance record not found.");
  }

  const updates = {};
  const calculatedClientPayoutAmount = calculateClientPayout(financeRow.compensation_amount || 0);
  const previousSnapshot = buildClientPaymentRow(financeRow, { id: financeRow.case_id }, null);

  if (payload.manual_client_payout_amount !== undefined) {
    updates.customer_payout = roundMoney(payload.manual_client_payout_amount);
  }

  if (payload.client_payment_reference !== undefined) {
    updates.client_payment_reference = payload.client_payment_reference || null;
  }

  if (payload.internal_note !== undefined) {
    updates.internal_note = payload.internal_note || null;
  }

  if (payload.client_payment_flow_type !== undefined) {
    updates.client_payment_flow_type = payload.client_payment_flow_type || "through_company";
  }

  if (payload.client_payment_status !== undefined) {
    updates.client_payment_status = normalizeClientPaymentStatus(payload.client_payment_status);
  }

  if (payload.client_paid_at !== undefined) {
    updates.client_paid_at = toIsoDateOrNull(payload.client_paid_at);
  }

  if (!Object.keys(updates).length) {
    return previousSnapshot;
  }

  updates.updated_by = userId;
  updates.updated_at = new Date().toISOString();

  const response = await client
    .from("case_finance")
    .update(updates)
    .eq("id", financeRow.id)
    .select("*")
    .single();

  if (response.error) {
    throw response.error;
  }

  const nextFinanceRow = response.data;
  const nextSnapshot = buildClientPaymentRow(nextFinanceRow, { id: nextFinanceRow.case_id }, null);
  const auditTasks = [];

  if (updates.customer_payout !== undefined && roundMoney(previousSnapshot.finalClientPayoutAmount) !== roundMoney(nextSnapshot.finalClientPayoutAmount)) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "case_finance",
      entityId: financeRow.id,
      action: "amount_changed",
      oldValue: { customer_payout: previousSnapshot.finalClientPayoutAmount, calculated_client_payout_amount: calculatedClientPayoutAmount },
      newValue: { customer_payout: nextSnapshot.finalClientPayoutAmount, calculated_client_payout_amount: calculatedClientPayoutAmount },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  if (updates.client_payment_reference !== undefined && previousSnapshot.paymentReference !== nextSnapshot.paymentReference) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "case_finance",
      entityId: financeRow.id,
      action: "payment_reference_changed",
      oldValue: { client_payment_reference: previousSnapshot.paymentReference },
      newValue: { client_payment_reference: nextSnapshot.paymentReference },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  if (updates.internal_note !== undefined && previousSnapshot.internalNote !== nextSnapshot.internalNote) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "case_finance",
      entityId: financeRow.id,
      action: "internal_note_changed",
      oldValue: { internal_note: previousSnapshot.internalNote },
      newValue: { internal_note: nextSnapshot.internalNote },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  if (updates.client_payment_flow_type !== undefined && previousSnapshot.paymentFlowType !== nextSnapshot.paymentFlowType) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "case_finance",
      entityId: financeRow.id,
      action: "payment_flow_changed",
      oldValue: { client_payment_flow_type: previousSnapshot.paymentFlowType },
      newValue: { client_payment_flow_type: nextSnapshot.paymentFlowType },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  if (updates.client_payment_status !== undefined && previousSnapshot.status !== nextSnapshot.status) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "case_finance",
      entityId: financeRow.id,
      action: nextSnapshot.status === "paid" ? "client_payment_marked_paid" : "client_payment_marked_unpaid",
      oldValue: { client_payment_status: previousSnapshot.status, client_paid_at: previousSnapshot.clientPaidAt },
      newValue: { client_payment_status: nextSnapshot.status, client_paid_at: nextSnapshot.clientPaidAt },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  await Promise.allSettled(auditTasks);

  return nextSnapshot;
}

export async function markClientPaymentPaid(caseId, options = {}) {
  await assertFinanceEditAccess();
  const client = requireSupabase();
  const userId = options.performedBy || await getCurrentUserId();
  const financeRow = await getCaseFinanceRecordByCaseId(client, caseId);

  if (!financeRow) {
    throw new Error("Case finance record not found.");
  }

  const previousValue = {
    client_payment_status: normalizeClientPaymentStatus(financeRow.client_payment_status),
    client_paid_at: financeRow.client_paid_at || null,
  };
  const paidAt = new Date().toISOString();

  const response = await client
    .from("case_finance")
    .update({
      client_payment_status: "paid",
      client_paid_at: paidAt,
      customer_paid_at: paidAt,
      updated_by: userId,
      updated_at: paidAt,
    })
    .eq("id", financeRow.id)
    .select("*")
    .single();

  if (response.error) {
    throw response.error;
  }

  await createFinanceAuditLog({
    entityType: "case_finance",
    entityId: financeRow.id,
    action: "client_payment_marked_paid",
    oldValue: previousValue,
    newValue: { client_payment_status: "paid", client_paid_at: paidAt },
    performedBy: userId,
    comment: options.comment || null,
  }).catch(() => false);

  return response.data;
}

export async function markClientPaymentUnpaid(caseId, options = {}) {
  await assertFinanceEditAccess();
  const client = requireSupabase();
  const userId = options.performedBy || await getCurrentUserId();
  const financeRow = await getCaseFinanceRecordByCaseId(client, caseId);

  if (!financeRow) {
    throw new Error("Case finance record not found.");
  }

  const previousValue = {
    client_payment_status: normalizeClientPaymentStatus(financeRow.client_payment_status),
    client_paid_at: financeRow.client_paid_at || null,
  };

  const response = await client
    .from("case_finance")
    .update({
      client_payment_status: "unpaid",
      client_paid_at: null,
      customer_paid_at: null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", financeRow.id)
    .select("*")
    .single();

  if (response.error) {
    throw response.error;
  }

  await createFinanceAuditLog({
    entityType: "case_finance",
    entityId: financeRow.id,
    action: "client_payment_marked_unpaid",
    oldValue: previousValue,
    newValue: { client_payment_status: "unpaid", client_paid_at: null },
    performedBy: userId,
    comment: options.comment || null,
  }).catch(() => false);

  return response.data;
}

export async function updatePartnerPayment(payoutId, payload = {}, options = {}) {
  await assertPartnerFinanceEditAccess();
  const client = requireSupabase();
  const userId = options.performedBy || await getCurrentUserId();
  const payoutResponse = await client
    .from("referral_partner_payouts")
    .select("*")
    .eq("id", payoutId)
    .maybeSingle();

  if (payoutResponse.error) {
    throw payoutResponse.error;
  }

  if (!payoutResponse.data) {
    throw new Error("Partner payout not found.");
  }

  const payoutRow = payoutResponse.data;
  const updates = {};

  if (payload.payment_reference !== undefined) {
    updates.payment_reference = payload.payment_reference || null;
  }

  if (payload.note !== undefined || payload.internal_note !== undefined) {
    updates.note = payload.note ?? payload.internal_note ?? null;
  }

  if (payload.status !== undefined) {
    updates.status = normalizePartnerPayoutStatusForWrite(payload.status, payoutRow.status);
  }

  if (payload.paid_at !== undefined) {
    updates.paid_at = toIsoDateOrNull(payload.paid_at);
  } else if (updates.status === "paid" && !payoutRow.paid_at) {
    updates.paid_at = new Date().toISOString();
  } else if (payload.status !== undefined && normalizePartnerPaymentStatus(payload.status) === "unpaid") {
    updates.paid_at = null;
  }

  if (!Object.keys(updates).length) {
    return await getPartnerPaymentById(payoutId);
  }

  updates.updated_by = userId;
  updates.updated_at = new Date().toISOString();

  const response = await client
    .from("referral_partner_payouts")
    .update(updates)
    .eq("id", payoutId)
    .select("*")
    .single();

  if (response.error) {
    throw response.error;
  }

  const auditTasks = [];

  if (updates.payment_reference !== undefined && updates.payment_reference !== payoutRow.payment_reference) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "referral_partner_payout",
      entityId: payoutId,
      action: "payment_reference_changed",
      oldValue: { payment_reference: payoutRow.payment_reference || null },
      newValue: { payment_reference: updates.payment_reference || null },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  if (updates.note !== undefined && updates.note !== payoutRow.note) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "referral_partner_payout",
      entityId: payoutId,
      action: "internal_note_changed",
      oldValue: { note: payoutRow.note || null },
      newValue: { note: updates.note || null },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  if (updates.status !== undefined && normalizePartnerPaymentStatus(updates.status) !== normalizePartnerPaymentStatus(payoutRow.status)) {
    auditTasks.push(createFinanceAuditLog({
      entityType: "referral_partner_payout",
      entityId: payoutId,
      action: normalizePartnerPaymentStatus(updates.status) === "paid"
        ? "partner_payment_marked_paid"
        : "partner_payment_marked_unpaid",
      oldValue: { status: payoutRow.status, paid_at: payoutRow.paid_at || null },
      newValue: { status: updates.status, paid_at: updates.paid_at || null },
      performedBy: userId,
      comment: options.comment || null,
    }));
  }

  await Promise.allSettled(auditTasks);

  return await getPartnerPaymentById(payoutId);
}

export async function markPartnerPaymentPaid(payoutId, options = {}) {
  return updatePartnerPayment(payoutId, {
    status: "paid",
    paid_at: new Date().toISOString(),
  }, options);
}

export async function markPartnerPaymentUnpaid(payoutId, options = {}) {
  return updatePartnerPayment(payoutId, {
    status: "unpaid",
    paid_at: null,
  }, options);
}

export async function exportFinanceCsv(filters = {}) {
  await assertFinanceReadAccess("You do not have access to export finance data.");
  const performedBy = filters.performedBy || await getCurrentUserId();
  const rows = await getFinanceRows(filters);
  const csv = buildCsvString([
    { key: "caseCode", label: "Case Code" },
    { key: "clientLabel", label: "Client" },
    { key: "route", label: "Route" },
    { key: "compensationAmount", label: "Compensation EUR" },
    { key: "companyRevenueAmount", label: "Revenue EUR" },
    { key: "clientPayoutAmount", label: "Client Payout EUR" },
    { key: "partnerName", label: "Partner" },
    { key: "referralCode", label: "Referral Code" },
    { key: "partnerRate", label: "Partner Rate", formatter: formatCsvPartnerRate },
    { key: "partnerCommissionAmount", label: "Partner Commission EUR" },
    { key: "netProfit", label: "Net Profit EUR" },
    { key: "internalCompensationConfirmed", label: "Confirmed" },
    { key: "clientVisibleApproval", label: "Client Visible Approval" },
    { key: "clientPaymentStatus", label: "Client Payment Status" },
    { key: "partnerPaymentStatus", label: "Partner Payment Status" },
    { key: "updatedAt", label: "Updated At" },
  ], rows);

  await createFinanceAuditLog({
    entityType: "finance_export",
    entityId: null,
    action: "export_created",
    oldValue: null,
    newValue: { type: "finance", filters, row_count: rows.length },
    performedBy,
    comment: "finance_csv_export",
  }).catch(() => false);

  return {
    filename: buildExportFileName("finance"),
    mimeType: "text/csv;charset=utf-8",
    csv,
  };
}

export async function exportClientPaymentsCsv(filters = {}) {
  await assertFinanceReadAccess("You do not have access to export finance data.");
  const performedBy = filters.performedBy || await getCurrentUserId();
  const rows = await getClientPayments(filters);
  const csv = buildCsvString([
    { key: "caseCode", label: "Case Code" },
    { key: "clientLabel", label: "Client" },
    { key: "route", label: "Route" },
    { key: "compensationAmount", label: "Compensation EUR" },
    { key: "companyRevenueAmount", label: "Revenue EUR" },
    { key: "calculatedClientPayoutAmount", label: "Calculated Client Payout EUR" },
    { key: "manualClientPayoutAmount", label: "Manual Client Payout EUR" },
    { key: "finalClientPayoutAmount", label: "Final Client Payout EUR" },
    { key: "status", label: "Status" },
    { key: "paymentFlowType", label: "Payment Flow" },
    { key: "paymentReference", label: "Payment Reference" },
    { key: "internalNote", label: "Internal Note" },
    { key: "clientPaidAt", label: "Client Paid At" },
    { key: "updatedAt", label: "Updated At" },
  ], rows);

  await createFinanceAuditLog({
    entityType: "finance_export",
    entityId: null,
    action: "export_created",
    oldValue: null,
    newValue: { type: "client_payments", filters, row_count: rows.length },
    performedBy,
    comment: "client_payments_csv_export",
  }).catch(() => false);

  return {
    filename: buildExportFileName("client-payments"),
    mimeType: "text/csv;charset=utf-8",
    csv,
  };
}

export async function exportPartnerPaymentsCsv(filters = {}) {
  await assertPartnerFinanceReadAccess("You do not have access to export partner finance data.");
  const performedBy = filters.performedBy || await getCurrentUserId();
  const rows = await getPartnerPayments(filters);
  const csv = buildCsvString([
    { key: "partnerName", label: "Partner" },
    { key: "referralCode", label: "Referral Code" },
    { key: "caseCode", label: "Case Code" },
    { key: "route", label: "Route" },
    { key: "compensationAmount", label: "Compensation EUR" },
    { key: "companyRevenueAmount", label: "Revenue EUR" },
    { key: "partnerRate", label: "Partner Rate", formatter: formatCsvPartnerRate },
    { key: "partnerCommissionAmount", label: "Partner Commission EUR" },
    { key: "status", label: "Status" },
    { key: "paymentReference", label: "Payment Reference" },
    { key: "internalNote", label: "Internal Note" },
    { key: "paidAt", label: "Paid At" },
    { key: "updatedAt", label: "Updated At" },
  ], rows);

  await createFinanceAuditLog({
    entityType: "finance_export",
    entityId: null,
    action: "export_created",
    oldValue: null,
    newValue: { type: "partner_payments", filters, row_count: rows.length },
    performedBy,
    comment: "partner_payments_csv_export",
  }).catch(() => false);

  return {
    filename: buildExportFileName("partner-payments"),
    mimeType: "text/csv;charset=utf-8",
    csv,
  };
}

export async function exportPartnerCommissionsCsv(filters = {}) {
  await assertPartnerFinanceReadAccess("You do not have access to export partner finance data.");
  const performedBy = filters.performedBy || await getCurrentUserId();
  const rows = await getPartnerCommissions(filters);
  const csv = buildCsvString([
    { key: "partnerName", label: "Partner" },
    { key: "referralCode", label: "Referral Code" },
    { key: "caseCode", label: "Case Code" },
    { key: "route", label: "Route" },
    { key: "compensationAmount", label: "Compensation EUR" },
    { key: "companyRevenueAmount", label: "Revenue EUR" },
    { key: "partnerRate", label: "Partner Rate", formatter: formatCsvPartnerRate },
    { key: "partnerCommissionAmount", label: "Partner Commission EUR" },
    { key: "rawStatus", label: "Status" },
    { key: "createdAt", label: "Created At" },
    { key: "approvedAt", label: "Approved At" },
    { key: "paidAt", label: "Paid At" },
    { key: "updatedAt", label: "Updated At" },
  ], rows);

  await createFinanceAuditLog({
    entityType: "finance_export",
    entityId: null,
    action: "export_created",
    oldValue: null,
    newValue: { type: "partner_commissions", filters, row_count: rows.length },
    performedBy,
    comment: "partner_commissions_csv_export",
  }).catch(() => false);

  return {
    filename: buildExportFileName("partner-commissions"),
    mimeType: "text/csv;charset=utf-8",
    csv,
  };
}
