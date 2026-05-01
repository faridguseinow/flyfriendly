import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser } from "./authService.js";
import { toLegacyRoleCode } from "../admin/rbac.js";

function isMissingOptionalTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.message?.includes("column") || error?.message?.includes("schema cache");
}

function getTrashPurgeAfterDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function getDocumentEntityType(document) {
  if (document.kind === "signature") {
    return "lead_signature";
  }

  if (document.owner_type === "case") {
    return "case_document";
  }

  if (document.owner_type === "claim") {
    return "claim_document";
  }

  return "lead_document";
}

function getTrashSourceConfig(entityType) {
  if (entityType === "lead_document") {
    return { table: "lead_documents", statusField: "status" };
  }

  if (entityType === "case_document") {
    return { table: "case_documents", statusField: "status" };
  }

  if (entityType === "claim_document") {
    return { table: "documents", statusField: "status" };
  }

  if (entityType === "lead_signature") {
    return { table: "lead_signatures", statusField: null };
  }

  if (entityType === "profile") {
    return { table: "profiles", statusField: "status" };
  }

  return null;
}

const AIRPORTS_REFRESH_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const AIRLINES_REFRESH_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat";
const regionNames = typeof Intl !== "undefined"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
const countryAliases = {
  RU: ["Russian Federation"],
  KR: ["Republic of Korea", "South Korea"],
  KP: ["Democratic People's Republic of Korea", "North Korea"],
  IR: ["Islamic Republic of Iran"],
  MD: ["Republic of Moldova"],
  TZ: ["United Republic of Tanzania"],
  VN: ["Viet Nam"],
  LA: ["Lao People's Democratic Republic"],
  BO: ["Plurinational State of Bolivia"],
  VE: ["Bolivarian Republic of Venezuela"],
  SY: ["Syrian Arab Republic"],
};

function splitCsvLine(line) {
  const parts = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function searchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAirportName(value) {
  return (value || "").replace(/^\(Duplicate\)\s*/i, "").trim();
}

function getCountryName(code) {
  return code ? regionNames?.of(code) || code : "";
}

function getCountryTerms(code) {
  const primary = getCountryName(code);
  return [primary, ...(countryAliases[code] || [])].filter(Boolean);
}

function buildAirportCatalogRows(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  const seen = new Set();

  return lines
    .slice(1)
    .map((line) => {
      const values = splitCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));
      const countryTerms = getCountryTerms(row.iso_country);
      const cleanName = normalizeAirportName(row.name);
      const preferredCode = row.iata_code || row.icao_code || row.ident;
      const dedupeKey = [cleanName.toLowerCase(), (row.municipality || "").toLowerCase(), row.iso_country, preferredCode].join("|");

      if (!cleanName || row.name.startsWith("(Duplicate)") || seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);

      return {
        id: Number(row.id),
        ident: row.ident || null,
        type: row.type || null,
        name: cleanName,
        latitude_deg: row.latitude_deg ? Number(row.latitude_deg) : null,
        longitude_deg: row.longitude_deg ? Number(row.longitude_deg) : null,
        elevation_ft: row.elevation_ft ? Number(row.elevation_ft) : null,
        continent: row.continent || null,
        iso_country: row.iso_country || null,
        iso_region: row.iso_region || null,
        municipality: row.municipality || null,
        scheduled_service: row.scheduled_service === "yes",
        icao_code: row.icao_code || null,
        iata_code: row.iata_code || null,
        gps_code: row.gps_code || null,
        local_code: row.local_code || null,
        home_link: row.home_link || null,
        wikipedia_link: row.wikipedia_link || null,
        keywords: [...countryTerms, row.keywords].filter(Boolean).join(" | ") || null,
      };
    })
    .filter((row) => row && row.name && (row.iata_code || row.scheduled_service || row.type === "large_airport" || row.type === "medium_airport"));
}

function buildAirlineCatalogRows(raw) {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, name, alias, iataCode, icaoCode, callsign, country, active] = splitCsvLine(line);

      return {
        id: Number(id),
        name: name || null,
        iata_code: iataCode && iataCode !== "\\N" && iataCode !== "-" ? iataCode : null,
        icao_code: icaoCode && icaoCode !== "\\N" && icaoCode !== "-" ? icaoCode : null,
        country: country && country !== "\\N" ? country : null,
        active: active === "Y",
      };
    })
    .filter((row) => row.name);
}

async function upsertInChunks(client, table, rows, chunkSize = 500) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const { error } = await client.from(table).upsert(chunk, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }
}

export async function getAdminContext() {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, profile: null, isAdmin: false };
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return { user, profile, isAdmin: profile?.role === "admin" };
}

async function recordActivity(client, payload) {
  const { error } = await client
    .from("activity_logs")
    .insert({
      user_id: payload.userId || null,
      action: payload.action,
      module: payload.module,
      target_entity_type: payload.targetEntityType,
      target_entity_id: payload.targetEntityId || null,
      previous_value: payload.previousValue || null,
      new_value: payload.newValue || null,
      meta: payload.meta || {},
    });

  if (error && !isMissingOptionalTable(error) && !isMissingColumnError(error)) {
    throw error;
  }
}

export async function fetchAdminOverview() {
  const client = requireSupabase();

  const [leads, claims, profiles, documents, leadDocuments, leadSignatures, events, eligibility] = await Promise.all([
    client
      .from("leads")
      .select("id, lead_code, status, stage, eligibility_status, departure_airport, arrival_airport, airline, full_name, email, phone, reason, payload, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("claims")
      .select("id, claim_code, user_id, status, eligibility_status, compensation_amount, currency, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("profiles")
      .select("id, full_name, email, phone, role, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("documents")
      .select("id, claim_id, user_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("lead_signatures")
      .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("claim_events")
      .select("id, claim_id, event_type, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("eligibility_results")
      .select("id, claim_id, stage, eligible, confidence, compensation_amount, currency, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const errors = [leads, claims, profiles, documents, leadDocuments, events, eligibility].map((result) => result.error).filter(Boolean);

  if (errors.length) {
    throw errors[0];
  }

  if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error)) {
    throw leadSignatures.error;
  }

  return {
    leads: leads.data || [],
    claims: claims.data || [],
    profiles: profiles.data || [],
    documents: [
      ...(leadDocuments.data || []).map((document) => ({ ...document, owner_type: "lead", bucket: "claim-lead-documents" })),
      ...(documents.data || []).map((document) => ({ ...document, owner_type: "claim", bucket: "claim-documents" })),
    ],
    leadSignatures: leadSignatures.data || [],
    events: events.data || [],
    eligibility: eligibility.data || [],
  };
}

async function fetchLeadsWithFallback(client) {
  const extended = await client
    .from("leads")
    .select("id, lead_code, source, source_details, status, stage, eligibility_status, profile_id, referral_partner_id, departure_airport, arrival_airport, airline, flight_number, scheduled_departure_date, delay_duration, disruption_type, is_direct, full_name, email, phone, city, country, preferred_language, has_whatsapp, issue_type, assigned_user_id, customer_id, duplicate_of_lead_id, reason, payload, created_at, updated_at, submitted_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!extended.error) {
    return { data: extended.data || [], supportsCoreSchemaV1: true };
  }

  if (!isMissingColumnError(extended.error)) {
    throw extended.error;
  }

  const fallback = await client
    .from("leads")
    .select("id, lead_code, source, source_details, status, stage, eligibility_status, profile_id, referral_partner_id, departure_airport, arrival_airport, airline, flight_number, scheduled_departure_date, delay_duration, disruption_type, is_direct, full_name, email, phone, city, reason, payload, created_at, updated_at, submitted_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (fallback.error) {
    throw fallback.error;
  }

  return { data: fallback.data || [], supportsCoreSchemaV1: false };
}

export async function fetchLeadsModuleData() {
  const client = requireSupabase();

  const [leadsResponse, profiles, leadNotes, leadStatusHistory, leadDocuments, leadSignatures] = await Promise.all([
    fetchLeadsWithFallback(client),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
    client
      .from("lead_notes")
      .select("id, lead_id, body, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("lead_status_history")
      .select("id, lead_id, previous_status, next_status, changed_by, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_name, mime_type, file_size, status, created_at")
      .order("created_at", { ascending: false })
      .limit(800),
    client
      .from("lead_signatures")
      .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const baseErrors = [profiles].map((result) => result.error).filter(Boolean);
  if (baseErrors.length) {
    throw baseErrors[0];
  }

  if (leadNotes.error && !isMissingOptionalTable(leadNotes.error)) {
    throw leadNotes.error;
  }

  if (leadStatusHistory.error && !isMissingOptionalTable(leadStatusHistory.error)) {
    throw leadStatusHistory.error;
  }

  if (leadDocuments.error && !isMissingOptionalTable(leadDocuments.error) && !isMissingColumnError(leadDocuments.error)) {
    throw leadDocuments.error;
  }

  if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error)) {
    throw leadSignatures.error;
  }

  return {
    leads: leadsResponse.data,
    assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
    notes: leadNotes.data || [],
    statusHistory: leadStatusHistory.data || [],
    documents: leadDocuments.data || [],
    signatures: leadSignatures.data || [],
    supportsCoreSchemaV1: leadsResponse.supportsCoreSchemaV1,
    supportsNotes: !leadNotes.error,
    supportsHistory: !leadStatusHistory.error,
    supportsLeadDocuments: !leadDocuments.error,
    supportsLeadSignatures: !leadSignatures.error,
  };
}

async function fetchCasesWithFallback(client, page, pageSize, filters = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const baseQuery = client
    .from("cases")
    .select("id, case_code, lead_id, customer_id, airline, flight_number, route_from, route_to, flight_date, issue_type, legal_basis, estimated_compensation, company_fee, status, payout_status, priority, assigned_manager_id, submission_date, response_date, deadline_at, referral_partner_label, created_at, updated_at, approved_at, rejected_at, paid_at, closed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const query = applyCaseFilters(baseQuery, filters);
  const response = await query;

  if (!response.error) {
    return { data: response.data || [], count: response.count || 0, supportsCaseModuleV1: true };
  }

  if (!isMissingColumnError(response.error) && !isMissingOptionalTable(response.error)) {
    throw response.error;
  }

  return { data: [], count: 0, supportsCaseModuleV1: false, missingTable: true };
}

function applyCaseFilters(query, filters) {
  let nextQuery = query;

  if (filters.status && filters.status !== "all") {
    nextQuery = nextQuery.eq("status", filters.status);
  }

  if (filters.payoutStatus && filters.payoutStatus !== "all") {
    nextQuery = nextQuery.eq("payout_status", filters.payoutStatus);
  }

  if (filters.managerId && filters.managerId !== "all") {
    nextQuery = nextQuery.eq("assigned_manager_id", filters.managerId);
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    nextQuery = nextQuery.or(`case_code.ilike.%${q}%,airline.ilike.%${q}%,route_from.ilike.%${q}%,route_to.ilike.%${q}%,flight_number.ilike.%${q}%`);
  }

  return nextQuery;
}

export async function fetchCasesModuleData({ page = 1, pageSize = 12, filters = {} } = {}) {
  const client = requireSupabase();

  const [casesResponse, managers, leads, customers, finance, statusHistory, documents, tasks, caseTasks, communications, caseCommunications] = await Promise.all([
    fetchCasesWithFallback(client, page, pageSize, filters),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
    client
      .from("leads")
      .select("id, lead_code, full_name, email, phone, departure_airport, arrival_airport")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("customers")
      .select("id, full_name, email, phone, country, preferred_language, total_cases, total_compensation")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, agent_bonus, payment_status, payment_method, currency, notes, payment_received_at, customer_paid_at, referral_paid_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("case_status_history")
      .select("id, case_id, previous_status, next_status, changed_by, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_documents")
      .select("id, case_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_user_id, related_entity_type, related_entity_id")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_tasks")
      .select("id, case_id, task_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("communications")
      .select("id, entity_type, entity_id, channel, direction, subject, body, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_communications")
      .select("id, case_id, communication_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const requiredErrors = [managers, leads].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  const optional = { customers, finance, statusHistory, documents, tasks, caseTasks, communications, caseCommunications };
  for (const result of Object.values(optional)) {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }

  const metricsQuery = await client
    .from("cases")
    .select("id, status, estimated_compensation, created_at, approved_at, rejected_at, paid_at, closed_at");

  const metricsRows = metricsQuery.error ? [] : metricsQuery.data || [];

  return {
    cases: casesResponse.data,
    totalCount: casesResponse.count,
    page,
    pageSize,
    managers: (managers.data || []).filter((profile) => profile.role !== "customer"),
    leads: leads.data || [],
    customers: customers.data || [],
    finance: finance.data || [],
    statusHistory: statusHistory.data || [],
    documents: documents.data || [],
    tasks: tasks.data || [],
    caseTasks: caseTasks.data || [],
    communications: communications.data || [],
    caseCommunications: caseCommunications.data || [],
    metricsRows,
    supportsCaseModuleV1: casesResponse.supportsCaseModuleV1,
  };
}

async function syncCustomerStats(client, customerId) {
  if (!customerId) return;

  const [leadsCount, casesRows, approvedRows] = await Promise.all([
    client.from("leads").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    client.from("cases").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    client
      .from("cases")
      .select("estimated_compensation, status")
      .eq("customer_id", customerId)
      .in("status", ["approved", "paid", "closed"]),
  ]);

  const approvedCases = (approvedRows.data || []).length;
  const totalCompensation = (approvedRows.data || []).reduce(
    (sum, row) => sum + Number(row.estimated_compensation || 0),
    0,
  );

  const { error } = await client
    .from("customers")
    .update({
      total_leads: leadsCount.count || 0,
      total_cases: casesRows.count || 0,
      total_approved_cases: approvedCases,
      total_compensation: totalCompensation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    throw error;
  }
}

function buildCaseCode() {
  return `CASE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function deriveIssueType(lead) {
  if (lead.issue_type) return lead.issue_type;
  if (lead.disruption_type === "cancellation") return "Cancellation";
  if (lead.delay_duration === "cancelled") return "Cancellation";
  if (lead.delay_duration === "more_than_3") return "Delay";
  if (lead.delay_duration === "less_than_3") return "Delay";
  return "Other";
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function deriveReferralLifecycleStatus(caseRow, financeRow) {
  const caseStatus = String(caseRow?.status || "").toLowerCase();
  const payoutStatus = String(caseRow?.payout_status || "").toLowerCase();
  const paymentStatus = String(financeRow?.payment_status || "").toLowerCase();

  if (caseStatus === "rejected") {
    return "cancelled";
  }

  if (
    ["approved", "paid", "closed"].includes(caseStatus)
    || ["customer_paid", "referral_paid", "completed"].includes(payoutStatus)
    || ["customer_paid", "referral_paid", "completed"].includes(paymentStatus)
  ) {
    return "converted";
  }

  return caseRow?.id ? "case_created" : "lead_created";
}

function deriveCommissionStatus(caseRow, financeRow) {
  const caseStatus = String(caseRow?.status || "").toLowerCase();
  const payoutStatus = String(caseRow?.payout_status || "").toLowerCase();
  const paymentStatus = String(financeRow?.payment_status || "").toLowerCase();

  if (caseStatus === "rejected") {
    return "cancelled";
  }

  if (financeRow?.referral_paid_at || ["referral_paid", "completed"].includes(payoutStatus) || ["referral_paid", "completed"].includes(paymentStatus)) {
    return "paid";
  }

  if (["approved", "paid", "closed"].includes(caseStatus)) {
    return "approved";
  }

  return "pending";
}

function isCommissionTriggerState(caseRow, financeRow) {
  return deriveCommissionStatus(caseRow, financeRow) !== "pending"
    || Number(financeRow?.referral_commission || 0) > 0;
}

function calculateCommissionAmount(partner, caseRow, financeRow) {
  const explicitAmount = Number(financeRow?.referral_commission || 0);
  if (explicitAmount > 0) {
    return roundMoney(explicitAmount);
  }

  const rate = Number(partner?.commission_rate || 0);
  if (!rate) {
    return 0;
  }

  if (partner?.commission_type === "fixed") {
    return roundMoney(rate);
  }

  const sourceAmount = Number(financeRow?.company_fee || caseRow?.company_fee || 0);
  if (!sourceAmount) {
    return 0;
  }

  return roundMoney(sourceAmount * (rate / 100));
}

async function findReferralPartnerByField(client, field, value) {
  if (!value) {
    return null;
  }

  const result = await client
    .from("referral_partners")
    .select("id, name, public_name, referral_code, commission_type, commission_rate")
    .eq(field, value)
    .limit(1)
    .maybeSingle();

  if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
    throw result.error;
  }

  return result.data || null;
}

async function findReferralPartnerForContext(client, lead, caseRow) {
  const directPartnerId = lead?.referral_partner_id || caseRow?.referral_partner_id || null;
  const referralCode = lead?.source_details?.referral_code || null;
  const label = lead?.source_details?.referral_partner || lead?.payload?.referralPartner || caseRow?.referral_partner_label || null;

  if (directPartnerId) {
    const result = await findReferralPartnerByField(client, "id", directPartnerId);
    if (result?.id) {
      return result;
    }
  }

  if (referralCode) {
    const result = await findReferralPartnerByField(client, "referral_code", referralCode);
    if (result?.id) {
      return result;
    }
  }

  if (label) {
    const byCode = await findReferralPartnerByField(client, "referral_code", label);
    if (byCode?.id) {
      return byCode;
    }

    const byName = await findReferralPartnerByField(client, "name", label);
    if (byName?.id) {
      return byName;
    }
  }

  return null;
}

async function syncPartnerTotals(client, partnerId) {
  if (!partnerId) return;

  const [commissions, payouts] = await Promise.all([
    client
      .from("partner_commissions")
      .select("amount, status")
      .eq("partner_id", partnerId),
    client
      .from("referral_partner_payouts")
      .select("amount, status")
      .eq("partner_id", partnerId),
  ]);

  if (commissions.error && !isMissingOptionalTable(commissions.error) && !isMissingColumnError(commissions.error)) {
    throw commissions.error;
  }

  if (payouts.error && !isMissingOptionalTable(payouts.error) && !isMissingColumnError(payouts.error)) {
    throw payouts.error;
  }

  const totalEarned = roundMoney((commissions.data || [])
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const totalPaid = roundMoney((payouts.data || [])
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));

  await client
    .from("referral_partners")
    .update({
      total_earned: totalEarned,
      total_paid: totalPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);
}

async function syncCaseReferralAttribution(client, { lead, caseRow, financeRow }) {
  const partner = await findReferralPartnerForContext(client, lead, caseRow);
  if (!partner?.id) {
    return null;
  }

  const referralStatus = deriveReferralLifecycleStatus(caseRow, financeRow);
  const commissionStatus = deriveCommissionStatus(caseRow, financeRow);
  const commissionAmount = calculateCommissionAmount(partner, caseRow, financeRow);
  const existingReferral = lead?.id
    ? await client.from("referrals").select("id, attribution_meta").eq("lead_id", lead.id).maybeSingle()
    : caseRow?.id
      ? await client.from("referrals").select("id, attribution_meta").eq("case_id", caseRow.id).maybeSingle()
      : { data: null, error: null };

  if (existingReferral.error && !isMissingOptionalTable(existingReferral.error) && !isMissingColumnError(existingReferral.error)) {
    throw existingReferral.error;
  }

  const previousMeta = existingReferral.data?.attribution_meta || {};
  const attributionMeta = {
    ...previousMeta,
    partner_name: partner.public_name || partner.name || null,
    partner_referral_code: partner.referral_code || null,
    lead_code: lead?.lead_code || null,
    case_code: caseRow?.case_code || null,
    client_name: lead?.full_name || null,
    client_email: lead?.email || null,
    client_phone: lead?.phone || null,
    airline: caseRow?.airline || lead?.airline || null,
    flight_number: caseRow?.flight_number || lead?.flight_number || null,
    route_from: caseRow?.route_from || lead?.departure_airport || null,
    route_to: caseRow?.route_to || lead?.arrival_airport || null,
    issue_type: caseRow?.issue_type || lead?.issue_type || lead?.disruption_type || null,
    case_status: caseRow?.status || null,
    payout_status: caseRow?.payout_status || null,
    finance_payment_status: financeRow?.payment_status || null,
    company_fee: Number(financeRow?.company_fee || caseRow?.company_fee || 0) || 0,
    referral_commission_amount: commissionAmount,
    referral_commission_status: commissionStatus,
  };

  if (lead?.id || caseRow?.id) {
    const conflictTarget = lead?.id ? "lead_id" : "case_id";
    const { error } = await client
      .from("referrals")
      .upsert({
        id: existingReferral.data?.id || undefined,
        partner_id: partner.id,
        client_profile_id: lead?.profile_id || null,
        customer_id: caseRow?.customer_id || lead?.customer_id || null,
        lead_id: lead?.id || null,
        case_id: caseRow?.id || null,
        referral_code: lead?.source_details?.referral_code || partner.referral_code || null,
        source_url: lead?.source_details?.referral_source_url || null,
        source_path: lead?.source_details?.referral_source_path || null,
        status: referralStatus,
        attribution_meta: attributionMeta,
        updated_at: new Date().toISOString(),
      }, { onConflict: conflictTarget });

    if (error && !isMissingOptionalTable(error) && !isMissingColumnError(error)) {
      throw error;
    }
  }

  const updatePayload = {
    referral_partner_id: partner.id,
    referral_partner_label: partner.referral_code || partner.public_name || partner.name || null,
    updated_at: new Date().toISOString(),
  };

  if (caseRow?.id) {
    await client
      .from("cases")
      .update(updatePayload)
      .eq("id", caseRow.id);
  }

  if (lead?.id) {
    await client
      .from("leads")
      .update({
        referral_partner_id: partner.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  }

  return partner;
}

async function syncPartnerCommissionForCase(client, { lead, caseRow, financeRow }) {
  const partner = await syncCaseReferralAttribution(client, { lead, caseRow, financeRow });
  if (!partner?.id || !caseRow?.id) {
    return null;
  }

  const nextStatus = deriveCommissionStatus(caseRow, financeRow);
  const amount = calculateCommissionAmount(partner, caseRow, financeRow);
  const existing = await client
    .from("partner_commissions")
    .select("*")
    .eq("partner_id", partner.id)
    .eq("case_id", caseRow.id)
    .maybeSingle();

  if (existing.error && !isMissingOptionalTable(existing.error) && !isMissingColumnError(existing.error)) {
    throw existing.error;
  }

  if (!existing.data && !isCommissionTriggerState(caseRow, financeRow) && amount <= 0) {
    return null;
  }

  const previous = existing.data || null;
  const approvedAt = nextStatus === "approved" || nextStatus === "paid"
    ? previous?.approved_at || new Date().toISOString()
    : null;
  const paidAt = nextStatus === "paid"
    ? previous?.paid_at || financeRow?.referral_paid_at || new Date().toISOString()
    : null;

  const payload = {
    partner_id: partner.id,
    lead_id: lead?.id || null,
    case_id: caseRow.id,
    amount,
    currency: financeRow?.currency || "EUR",
    commission_rate: Number(partner.commission_rate || 0),
    source_amount: Number(financeRow?.company_fee || caseRow?.company_fee || 0) || null,
    status: nextStatus,
    approved_at: approvedAt,
    paid_at: paidAt,
    notes: existing.data?.notes || null,
  };

  const result = existing.data
    ? await client.from("partner_commissions").update(payload).eq("id", existing.data.id)
    : await client.from("partner_commissions").insert({ id: crypto.randomUUID(), ...payload });

  if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
    throw result.error;
  }

  await syncPartnerTotals(client, partner.id);
  return partner.id;
}

export async function convertLeadToCase(leadId) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, lead_code, status, customer_id, profile_id, referral_partner_id, source, source_details, departure_airport, arrival_airport, airline, flight_number, scheduled_departure_date, issue_type, disruption_type, full_name, email, phone, country, preferred_language, city, reason, payload")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    throw leadError;
  }

  if (!lead) {
    throw new Error("Lead not found.");
  }

  const existingCase = await client
    .from("cases")
    .select("id, case_code")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existingCase.error && !isMissingOptionalTable(existingCase.error) && !isMissingColumnError(existingCase.error)) {
    throw existingCase.error;
  }

  if (existingCase.data?.id) {
    return { caseId: existingCase.data.id, caseCode: existingCase.data.case_code, alreadyExists: true };
  }

  let customerId = lead.customer_id || null;

  if (!customerId) {
    let existingCustomer = null;

    if (lead.email) {
      const byEmail = await client
        .from("customers")
        .select("id")
        .eq("email", lead.email)
        .limit(1)
        .maybeSingle();

      if (byEmail.error && !isMissingOptionalTable(byEmail.error) && !isMissingColumnError(byEmail.error)) {
        throw byEmail.error;
      }

      existingCustomer = byEmail.data;
    }

    if (!existingCustomer && lead.phone) {
      const byPhone = await client
        .from("customers")
        .select("id")
        .eq("phone", lead.phone)
        .limit(1)
        .maybeSingle();

      if (byPhone.error && !isMissingOptionalTable(byPhone.error) && !isMissingColumnError(byPhone.error)) {
        throw byPhone.error;
      }

      existingCustomer = byPhone.data;
    }

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
      const { error: customerUpdateError } = await client
        .from("customers")
        .update({
          full_name: lead.full_name || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          country: lead.country || undefined,
          preferred_language: lead.preferred_language || undefined,
          profile_id: lead.profile_id || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (customerUpdateError) {
        throw customerUpdateError;
      }
    } else {
      customerId = crypto.randomUUID();
      const { error: customerCreateError } = await client
        .from("customers")
        .insert({
          id: customerId,
          full_name: lead.full_name || lead.email || lead.phone || "Unknown customer",
          email: lead.email || null,
          phone: lead.phone || null,
          country: lead.country || null,
          preferred_language: lead.preferred_language || null,
          profile_id: lead.profile_id || null,
          notes: lead.reason || null,
        });

      if (customerCreateError) {
        if (isMissingOptionalTable(customerCreateError) || isMissingColumnError(customerCreateError)) {
          throw new Error("Apply Core Operations schema V1 in Supabase to enable customer and case conversion.");
        }

        throw customerCreateError;
      }
    }
  }

  const caseId = crypto.randomUUID();
  const caseCode = buildCaseCode();
  const now = new Date().toISOString();
  const partner = await findReferralPartnerForContext(client, lead, null).catch(() => null);

  const { error: caseError } = await client
    .from("cases")
    .insert({
      id: caseId,
      case_code: caseCode,
      lead_id: lead.id,
      customer_id: customerId,
      profile_id: lead.profile_id || null,
      airline: lead.airline || null,
      flight_number: lead.flight_number || null,
      route_from: lead.departure_airport || null,
      route_to: lead.arrival_airport || null,
      flight_date: lead.scheduled_departure_date || null,
      issue_type: deriveIssueType(lead),
      status: "documents_pending",
      payout_status: "not_started",
      priority: "normal",
      notes: lead.reason || lead.payload?.reason || null,
      referral_partner_id: partner?.id || lead.referral_partner_id || null,
      referral_partner_label: partner?.referral_code || lead.source_details?.referral_partner || lead.payload?.referralPartner || lead.source || null,
      created_by: user?.id || null,
    });

  if (caseError) {
    if (isMissingOptionalTable(caseError) || isMissingColumnError(caseError)) {
      throw new Error("Apply Core Operations schema V1 and Cases Module V1 in Supabase to enable case conversion.");
    }

    throw caseError;
  }

  const { error: leadUpdateError } = await client
    .from("leads")
    .update({
      status: "converted",
      customer_id: customerId,
      referral_partner_id: partner?.id || lead.referral_partner_id || null,
      updated_at: now,
    })
    .eq("id", lead.id);

  if (leadUpdateError) {
    throw leadUpdateError;
  }

  const [historyResult, financeResult, leadDocumentsResult] = await Promise.all([
    client.from("case_status_history").insert({
      case_id: caseId,
      previous_status: null,
      next_status: "documents_pending",
      changed_by: user?.id || null,
      note: "Case created from lead conversion.",
    }),
    client.from("case_finance").insert({
      case_id: caseId,
      compensation_amount: 0,
      company_fee: 0,
      customer_payout: 0,
      referral_commission: 0,
      agent_bonus: 0,
      payment_status: "not_started",
      currency: "EUR",
    }),
    client
      .from("lead_documents")
      .select("id, document_type, file_path, file_name, mime_type, file_size, status")
      .eq("lead_id", lead.id),
  ]);

  if (historyResult.error && !isMissingOptionalTable(historyResult.error)) {
    throw historyResult.error;
  }

  if (financeResult.error && !isMissingOptionalTable(financeResult.error)) {
    throw financeResult.error;
  }

  if (leadDocumentsResult.error && !isMissingOptionalTable(leadDocumentsResult.error)) {
    throw leadDocumentsResult.error;
  }

  const leadDocuments = leadDocumentsResult.data || [];
  if (leadDocuments.length) {
    const { error: caseDocsError } = await client
      .from("case_documents")
      .insert(
        leadDocuments.map((document) => ({
          case_id: caseId,
          document_type: document.document_type,
          file_path: document.file_path,
          file_name: document.file_name,
          mime_type: document.mime_type,
          file_size: document.file_size,
          status: document.status || "uploaded",
          source_document_id: document.id,
          created_by: user?.id || null,
        })),
      );

    if (caseDocsError && !isMissingOptionalTable(caseDocsError)) {
      throw caseDocsError;
    }
  }

  const historyLead = await client
    .from("lead_status_history")
    .insert({
      lead_id: lead.id,
      previous_status: lead.status || null,
      next_status: "converted",
      changed_by: user?.id || null,
      note: `Converted to case ${caseCode}.`,
    });

  if (historyLead.error && !isMissingOptionalTable(historyLead.error)) {
    throw historyLead.error;
  }

  await syncPartnerCommissionForCase(client, {
    lead,
    caseRow: {
      id: caseId,
      case_code: caseCode,
      customer_id: customerId,
      company_fee: 0,
      status: "documents_pending",
      payout_status: "not_started",
      referral_partner_id: partner?.id || lead.referral_partner_id || null,
      referral_partner_label: partner?.referral_code || null,
    },
    financeRow: {
      case_id: caseId,
      company_fee: 0,
      referral_commission: 0,
      currency: "EUR",
      payment_status: "not_started",
    },
  }).catch(() => null);

  await syncCustomerStats(client, customerId);
  await recordActivity(client, {
    userId: user?.id,
    action: "convert",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: lead.id,
    previousValue: { status: lead.status, customer_id: lead.customer_id || null },
    newValue: { status: "converted", customer_id: customerId, case_id: caseId, case_code: caseCode },
    meta: { case_code: caseCode, lead_code: lead.lead_code },
  });
  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "cases",
    targetEntityType: "case",
    targetEntityId: caseId,
    newValue: { case_code: caseCode, lead_id: lead.id, customer_id: customerId, status: "documents_pending" },
    meta: { source: "lead_conversion", lead_code: lead.lead_code },
  });

  return { caseId, caseCode, customerId, alreadyExists: false };
}

export async function fetchCustomersModuleData() {
  const client = requireSupabase();

  const [customers, leads, cases, communications] = await Promise.all([
    client
      .from("customers")
      .select("id, full_name, email, phone, country, preferred_language, notes, total_leads, total_cases, total_approved_cases, total_compensation, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("leads")
      .select("id, lead_code, customer_id, status, stage, full_name, email, phone, departure_airport, arrival_airport, airline, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("cases")
      .select("id, case_code, customer_id, status, payout_status, airline, route_from, route_to, estimated_compensation, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("communications")
      .select("id, customer_id, entity_type, entity_id, channel, direction, subject, body, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const requiredErrors = [customers, leads, cases].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    if (requiredErrors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        customers: [],
        leads: leads.data || [],
        cases: cases.data || [],
        communications: communications.data || [],
        supportsCustomersModuleV1: false,
      };
    }
    throw requiredErrors[0];
  }

  if (communications.error && !isMissingOptionalTable(communications.error)) {
    throw communications.error;
  }

  return {
    customers: customers.data || [],
    leads: leads.data || [],
    cases: cases.data || [],
    communications: communications.data || [],
    supportsCustomersModuleV1: true,
  };
}

export async function updateCustomerProfile(customerId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("customers").select("*").eq("id", customerId).maybeSingle();
  const { error } = await client
    .from("customers")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "customers",
    targetEntityType: "customer",
    targetEntityId: customerId,
    previousValue: current.data || null,
    newValue: updates,
  });
}

export async function fetchTasksModuleData() {
  const client = requireSupabase();

  const [tasks, profiles, leads, cases, customers] = await Promise.all([
    client
      .from("tasks")
      .select("id, title, description, related_entity_type, related_entity_id, assigned_user_id, priority, status, task_type, due_date, reminder_at, created_by, completed_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
    client
      .from("leads")
      .select("id, lead_code, full_name, email, departure_airport, arrival_airport, airline")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("cases")
      .select("id, case_code, customer_id, airline, route_from, route_to, status")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const errors = [profiles, leads, cases, customers].map((result) => result.error).filter(Boolean);
  if (errors.length) {
    if (errors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        tasks: [],
        assignableUsers: [],
        leads: [],
        cases: [],
        customers: [],
        supportsTasksModuleV1: false,
      };
    }
    throw errors[0];
  }

  if (tasks.error) {
    if (isMissingOptionalTable(tasks.error) || isMissingColumnError(tasks.error)) {
      return {
        tasks: [],
        assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
        leads: leads.data || [],
        cases: cases.data || [],
        customers: customers.data || [],
        supportsTasksModuleV1: false,
      };
    }
    throw tasks.error;
  }

  return {
    tasks: tasks.data || [],
    assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
    leads: leads.data || [],
    cases: cases.data || [],
    customers: customers.data || [],
    supportsTasksModuleV1: true,
  };
}

export async function createTask(taskInput) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    title: taskInput.title,
    description: taskInput.description || null,
    related_entity_type: taskInput.related_entity_type,
    related_entity_id: taskInput.related_entity_id,
    assigned_user_id: taskInput.assigned_user_id || null,
    priority: taskInput.priority || "medium",
    status: taskInput.status || "todo",
    task_type: taskInput.task_type || null,
    due_date: taskInput.due_date || null,
    reminder_at: taskInput.reminder_at || null,
    created_by: user?.id || null,
    completed_at: taskInput.status === "done" ? new Date().toISOString() : null,
  };

  const { data, error } = await client
    .from("tasks")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (taskInput.related_entity_type === "case") {
    const rel = await client
      .from("case_tasks")
      .insert({ case_id: taskInput.related_entity_id, task_id: payload.id });

    if (rel.error && !isMissingOptionalTable(rel.error)) {
      throw rel.error;
    }
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "tasks",
    targetEntityType: "task",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { related_entity_type: taskInput.related_entity_type, related_entity_id: taskInput.related_entity_id },
  });

  return data;
}

export async function updateTask(taskId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("tasks").select("*").eq("id", taskId).maybeSingle();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.status === "done") {
    payload.completed_at = new Date().toISOString();
  } else if (updates.status && updates.status !== "done") {
    payload.completed_at = null;
  }

  const { error } = await client
    .from("tasks")
    .update(payload)
    .eq("id", taskId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "tasks",
    targetEntityType: "task",
    targetEntityId: taskId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function fetchCommunicationsModuleData() {
  const client = requireSupabase();

  const [communications, profiles, leads, cases, customers] = await Promise.all([
    client
      .from("communications")
      .select("id, entity_type, entity_id, customer_id, channel, direction, subject, body, meta, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
    client
      .from("leads")
      .select("id, lead_code, customer_id, full_name, email, airline, departure_airport, arrival_airport")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("cases")
      .select("id, case_code, customer_id, airline, route_from, route_to, status")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const requiredErrors = [profiles, leads, cases, customers].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    if (requiredErrors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        communications: [],
        assignableUsers: [],
        leads: [],
        cases: [],
        customers: [],
        supportsCommunicationsModuleV1: false,
      };
    }
    throw requiredErrors[0];
  }

  if (communications.error) {
    if (isMissingOptionalTable(communications.error) || isMissingColumnError(communications.error)) {
      return {
        communications: [],
        assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
        leads: leads.data || [],
        cases: cases.data || [],
        customers: customers.data || [],
        supportsCommunicationsModuleV1: false,
      };
    }
    throw communications.error;
  }

  return {
    communications: communications.data || [],
    assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
    leads: leads.data || [],
    cases: cases.data || [],
    customers: customers.data || [],
    supportsCommunicationsModuleV1: true,
  };
}

export async function createCommunication(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  let customerId = input.customer_id || null;

  if (!customerId && input.entity_type === "lead") {
    const response = await client.from("leads").select("customer_id").eq("id", input.entity_id).maybeSingle();
    if (!response.error) {
      customerId = response.data?.customer_id || null;
    }
  }

  if (!customerId && input.entity_type === "case") {
    const response = await client.from("cases").select("customer_id").eq("id", input.entity_id).maybeSingle();
    if (!response.error) {
      customerId = response.data?.customer_id || null;
    }
  }

  if (!customerId && input.entity_type === "customer") {
    customerId = input.entity_id;
  }

  const payload = {
    id: crypto.randomUUID(),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    customer_id: customerId,
    channel: input.channel,
    direction: input.direction || "internal",
    subject: input.subject || null,
    body: input.body || null,
    meta: input.meta || {},
    created_by: user?.id || null,
  };

  const { data, error } = await client
    .from("communications")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (input.entity_type === "case") {
    const relation = await client
      .from("case_communications")
      .insert({
        case_id: input.entity_id,
        communication_id: payload.id,
      });

    if (relation.error && !isMissingOptionalTable(relation.error)) {
      throw relation.error;
    }
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "communications",
    targetEntityType: "communication",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { linked_entity_type: input.entity_type, linked_entity_id: input.entity_id },
  });

  return data;
}

export async function fetchDocumentsCenterData() {
  const client = requireSupabase();

  const [leadDocuments, caseDocuments, claimDocuments, leadSignatures, leads, cases, claims, customers] = await Promise.all([
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_documents")
      .select("id, case_id, document_type, file_path, file_name, mime_type, file_size, status, source_document_id, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("documents")
      .select("id, claim_id, user_id, document_type, file_path, file_name, mime_type, file_size, status, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("lead_signatures")
      .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("leads")
      .select("id, lead_code, customer_id, full_name, email")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("cases")
      .select("id, case_code, customer_id")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("claims")
      .select("id, claim_code, user_id")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("customers")
      .select("id, full_name, email")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const requiredErrors = [leadDocuments, claimDocuments, leads, cases, claims, customers].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  if (caseDocuments.error && !isMissingOptionalTable(caseDocuments.error) && !isMissingColumnError(caseDocuments.error)) {
    throw caseDocuments.error;
  }

  if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error)) {
    throw leadSignatures.error;
  }

  const documents = [
    ...(leadDocuments.data || []).map((item) => ({ ...item, owner_type: "lead", owner_id: item.lead_id, bucket: "claim-lead-documents", kind: "document" })),
    ...(caseDocuments.data || []).map((item) => ({ ...item, owner_type: "case", owner_id: item.case_id, bucket: "case-documents", kind: "document" })),
    ...(claimDocuments.data || []).map((item) => ({ ...item, owner_type: "claim", owner_id: item.claim_id, bucket: "claim-documents", kind: "document" })),
    ...(leadSignatures.data || []).map((item) => ({ ...item, owner_type: "lead", owner_id: item.lead_id, kind: "signature", status: item.terms_accepted ? "signed" : "pending" })),
  ];

  return {
    documents,
    leads: leads.data || [],
    cases: cases.data || [],
    claims: claims.data || [],
    customers: customers.data || [],
    supportsDocumentsCenterV1: !caseDocuments.error,
    supportsSignatures: !leadSignatures.error,
  };
}

export async function fetchFinanceModuleData() {
  const client = requireSupabase();

  const [finance, cases, customers, profiles] = await Promise.all([
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, agent_bonus, payment_status, payment_method, currency, notes, payment_received_at, customer_paid_at, referral_paid_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("cases")
      .select("id, case_code, customer_id, airline, route_from, route_to, status, payout_status, referral_partner_label, assigned_manager_id")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
  ]);

  const errors = [cases, customers, profiles].map((result) => result.error).filter(Boolean);
  if (errors.length) {
    if (errors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        finance: [],
        cases: [],
        customers: [],
        profiles: [],
        supportsFinanceModuleV1: false,
      };
    }
    throw errors[0];
  }

  if (finance.error) {
    if (isMissingOptionalTable(finance.error) || isMissingColumnError(finance.error)) {
      return {
        finance: [],
        cases: cases.data || [],
        customers: customers.data || [],
        profiles: profiles.data || [],
        supportsFinanceModuleV1: false,
      };
    }
    throw finance.error;
  }

  return {
    finance: finance.data || [],
    cases: cases.data || [],
    customers: customers.data || [],
    profiles: profiles.data || [],
    supportsFinanceModuleV1: true,
  };
}

export async function updateCaseFinance(financeId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("case_finance").select("*").eq("id", financeId).maybeSingle();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("case_finance")
    .update(payload)
    .eq("id", financeId);

  if (error) {
    throw error;
  }

  if (current.data?.case_id) {
    const [caseResponse, updatedFinance] = await Promise.all([
      client.from("cases").select("*").eq("id", current.data.case_id).maybeSingle(),
      client.from("case_finance").select("*").eq("id", financeId).maybeSingle(),
    ]);

    const caseRow = caseResponse.data || null;
    const leadId = caseRow?.lead_id || null;
    const leadRow = leadId
      ? (await client.from("leads").select("*").eq("id", leadId).maybeSingle()).data || null
      : null;

    await syncPartnerCommissionForCase(client, {
      lead: leadRow,
      caseRow,
      financeRow: updatedFinance.data || { ...current.data, ...payload },
    }).catch(() => null);
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "finance",
    targetEntityType: "case_finance",
    targetEntityId: financeId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

function matchPartnerForRow(row, partners = []) {
  return partners.find((partner) => {
    const label = String(row.referral_partner_label || "").toLowerCase();
    return row.referral_partner_id === partner.id
      || (label && (label === String(partner.name || "").toLowerCase()
        || label === String(partner.referral_code || "").toLowerCase()));
  }) || null;
}

export async function fetchReferralPartnersModuleData() {
  const client = requireSupabase();

  const [partners, payouts, leads, cases, finance, commissions] = await Promise.all([
    client
      .from("referral_partners")
      .select("id, profile_id, name, public_name, contact_name, contact_email, contact_phone, referral_code, referral_link, commission_type, commission_rate, status, portal_status, application_reason, website_url, instagram_url, tiktok_url, youtube_url, total_earned, total_paid, notes, created_at, updated_at, approved_at, rejected_at, suspended_at")
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("referral_partner_payouts")
      .select("id, partner_id, case_id, amount, currency, status, payout_method, payment_reference, note, paid_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("leads")
      .select("id, lead_code, referral_partner_id, source, source_details, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(600),
    client
      .from("cases")
      .select("id, case_code, referral_partner_id, referral_partner_label, status, payout_status, estimated_compensation, created_at")
      .order("created_at", { ascending: false })
      .limit(600),
    client
      .from("case_finance")
      .select("id, case_id, referral_commission, payment_status, referral_paid_at, currency, updated_at")
      .order("updated_at", { ascending: false })
      .limit(600),
    client
      .from("partner_commissions")
      .select("id, partner_id, lead_id, case_id, amount, currency, commission_rate, source_amount, status, created_at, approved_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  const baseErrors = [leads, cases].map((result) => result.error).filter(Boolean);
  if (baseErrors.length) {
    throw baseErrors[0];
  }

  const optionalErrors = [partners, payouts, finance, commissions].map((result) => result.error).filter(Boolean);
  if (optionalErrors.some((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error))) {
    throw optionalErrors.find((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error));
  }

  return {
    partners: partners.data || [],
    payouts: payouts.data || [],
    leads: leads.data || [],
    cases: cases.data || [],
    finance: finance.data || [],
    commissions: commissions.data || [],
    supportsPartnersModuleV1: !partners.error,
  };
}

export async function createReferralPartner(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const referralCode = (input.referral_code || input.name || "PARTNER")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  const payload = {
    id: crypto.randomUUID(),
    name: input.name,
    public_name: input.public_name || input.name,
    contact_name: input.contact_name || null,
    contact_email: input.contact_email || null,
    contact_phone: input.contact_phone || null,
    referral_code: referralCode || `PARTNER-${Date.now().toString(36).toUpperCase()}`,
    referral_link: input.referral_link || null,
    commission_type: input.commission_type || "percentage",
    commission_rate: Number(input.commission_rate || 0),
    status: input.status || "active",
    portal_status: input.portal_status || "approved",
    profile_id: input.profile_id || null,
    application_reason: input.application_reason || null,
    notes: input.notes || null,
  };

  const { data, error } = await client
    .from("referral_partners")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "partners",
    targetEntityType: "referral_partner",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateReferralPartner(partnerId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("referral_partners").select("*").eq("id", partnerId).maybeSingle();
  const { error } = await client
    .from("referral_partners")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "partners",
    targetEntityType: "referral_partner",
    targetEntityId: partnerId,
    previousValue: current.data || null,
    newValue: updates,
  });
}

export async function createReferralPartnerPayout(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    partner_id: input.partner_id,
    case_id: input.case_id || null,
    amount: Number(input.amount || 0),
    currency: input.currency || "EUR",
    status: input.status || "pending",
    payout_method: input.payout_method || null,
    payment_reference: input.payment_reference || null,
    note: input.note || null,
    paid_at: input.status === "paid" ? new Date().toISOString() : null,
  };

  const { data, error } = await client
    .from("referral_partner_payouts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "partners",
    targetEntityType: "referral_partner_payout",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { partner_id: input.partner_id, case_id: input.case_id || null },
  });

  await syncPartnerTotals(client, input.partner_id).catch(() => null);

  return data;
}

export async function fetchActivityLogsData() {
  const client = requireSupabase();

  const [logs, profiles] = await Promise.all([
    client
      .from("activity_logs")
      .select("id, user_id, action, module, target_entity_type, target_entity_id, previous_value, new_value, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
  ]);

  if (profiles.error) {
    throw profiles.error;
  }

  if (logs.error) {
    if (isMissingOptionalTable(logs.error) || isMissingColumnError(logs.error)) {
      return {
        logs: [],
        users: profiles.data || [],
        supportsActivityLogsV1: false,
      };
    }
    throw logs.error;
  }

  return {
    logs: logs.data || [],
    users: profiles.data || [],
    supportsActivityLogsV1: true,
  };
}

export async function fetchReportsModuleData() {
  const client = requireSupabase();

  const [leads, cases, finance, tasks, communications, partners, documents, customers] = await Promise.all([
    client
      .from("leads")
      .select("id, lead_code, status, stage, source, airline, departure_airport, arrival_airport, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("cases")
      .select("id, case_code, status, payout_status, airline, route_from, route_to, estimated_compensation, referral_partner_id, referral_partner_label, assigned_manager_id, created_at, approved_at, rejected_at, paid_at, closed_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, payment_status, currency, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1000),
    client
      .from("tasks")
      .select("id, status, priority, related_entity_type, related_entity_id, assigned_user_id, due_date, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("communications")
      .select("id, entity_type, entity_id, channel, direction, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("referral_partners")
      .select("id, name, referral_code, status")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_documents")
      .select("id, case_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("customers")
      .select("id, total_leads, total_cases, total_approved_cases, total_compensation, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const requiredErrors = [leads, cases, finance, tasks, communications, customers].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  if (partners.error && !isMissingOptionalTable(partners.error) && !isMissingColumnError(partners.error)) {
    throw partners.error;
  }

  if (documents.error && !isMissingOptionalTable(documents.error) && !isMissingColumnError(documents.error)) {
    throw documents.error;
  }

  return {
    leads: leads.data || [],
    cases: cases.data || [],
    finance: finance.data || [],
    tasks: tasks.data || [],
    communications: communications.data || [],
    partners: partners.data || [],
    documents: documents.data || [],
    customers: customers.data || [],
    supportsReportsV1: true,
  };
}

function slugifyText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export async function fetchSettingsModuleData() {
  const client = requireSupabase();

  const response = await client
    .from("system_settings")
    .select("id, group_key, setting_key, label, value, value_type, description, is_public, created_at, updated_at, updated_by")
    .order("group_key", { ascending: true })
    .order("setting_key", { ascending: true })
    .limit(500);

  if (response.error) {
    if (isMissingOptionalTable(response.error) || isMissingColumnError(response.error)) {
      return { settings: [], supportsSettingsModuleV1: false };
    }
    throw response.error;
  }

  return { settings: response.data || [], supportsSettingsModuleV1: true };
}

export async function upsertSystemSetting(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const now = new Date().toISOString();
  const payload = {
    group_key: input.group_key,
    setting_key: input.setting_key,
    label: input.label,
    value: input.value,
    value_type: input.value_type || "string",
    description: input.description || null,
    is_public: Boolean(input.is_public),
    updated_at: now,
    updated_by: user?.id || null,
  };

  const current = input.id
    ? await client.from("system_settings").select("*").eq("id", input.id).maybeSingle()
    : { data: null };

  const query = input.id
    ? client.from("system_settings").update(payload).eq("id", input.id).select("id").single()
    : client.from("system_settings").insert({ id: crypto.randomUUID(), ...payload }).select("id").single();

  const { data, error } = await query;
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: input.id ? "update" : "create",
    module: "settings",
    targetEntityType: "system_setting",
    targetEntityId: data.id,
    previousValue: current.data || null,
    newValue: payload,
  });

  return data;
}

export async function fetchFaqModuleData() {
  const client = requireSupabase();
  const response = await client
    .from("faq_items")
    .select("id, question, answer, category, sort_order, status, locale, created_at, updated_at, created_by, updated_by")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (response.error) {
    if (isMissingOptionalTable(response.error) || isMissingColumnError(response.error)) {
      return { items: [], supportsFaqModuleV1: false };
    }
    throw response.error;
  }

  return { items: response.data || [], supportsFaqModuleV1: true };
}

export async function createFaqItem(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    question: input.question,
    answer: input.answer,
    category: input.category || "general",
    sort_order: Number(input.sort_order || 0),
    status: input.status || "draft",
    locale: input.locale || "en",
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("faq_items").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "faq",
    targetEntityType: "faq_item",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateFaqItem(faqId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("faq_items").select("*").eq("id", faqId).maybeSingle();
  const payload = {
    ...updates,
    sort_order: updates.sort_order === undefined ? undefined : Number(updates.sort_order || 0),
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("faq_items").update(payload).eq("id", faqId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "faq",
    targetEntityType: "faq_item",
    targetEntityId: faqId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function fetchBlogModuleData() {
  const client = requireSupabase();
  const response = await client
    .from("blog_posts")
    .select("id, title, slug, excerpt, content, content_sections, cover_image, categories, tags, author_name, status, published_at, locale, read_time, seo_title, seo_description, created_at, updated_at, created_by, updated_by")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (response.error) {
    if (isMissingOptionalTable(response.error) || isMissingColumnError(response.error)) {
      return { posts: [], supportsBlogModuleV1: false };
    }
    throw response.error;
  }

  return { posts: response.data || [], supportsBlogModuleV1: true };
}

export async function createBlogPost(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    title: input.title,
    slug: slugifyText(input.slug || input.title) || `post-${Date.now().toString(36)}`,
    excerpt: input.excerpt || null,
    content: input.content || "",
    cover_image: input.cover_image || null,
    content_sections: input.content_sections || [],
    categories: input.categories || [],
    tags: input.tags || [],
    author_name: input.author_name || null,
    status: input.status || "draft",
    published_at: input.published_at || null,
    locale: input.locale || "en",
    read_time: input.read_time || null,
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("blog_posts").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "blog",
    targetEntityType: "blog_post",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateBlogPost(postId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("blog_posts").select("*").eq("id", postId).maybeSingle();
  const payload = {
    ...updates,
    slug: updates.slug ? slugifyText(updates.slug) : undefined,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("blog_posts").update(payload).eq("id", postId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "blog",
    targetEntityType: "blog_post",
    targetEntityId: postId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function fetchCmsModuleData() {
  const client = requireSupabase();

  const [pages, blocks] = await Promise.all([
    client
      .from("cms_pages")
      .select("id, page_key, title, slug, status, seo_title, seo_description, locale, created_at, updated_at, created_by, updated_by")
      .order("page_key", { ascending: true })
      .limit(300),
    client
      .from("cms_blocks")
      .select("id, page_id, block_type, block_key, title, body, image_url, cta_label, cta_link, sort_order, status, payload, created_at, updated_at, created_by, updated_by")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(1000),
  ]);

  if (pages.error) {
    if (isMissingOptionalTable(pages.error) || isMissingColumnError(pages.error)) {
      return { pages: [], blocks: [], supportsCmsModuleV1: false };
    }
    throw pages.error;
  }

  if (blocks.error && !isMissingOptionalTable(blocks.error) && !isMissingColumnError(blocks.error)) {
    throw blocks.error;
  }

  return { pages: pages.data || [], blocks: blocks.data || [], supportsCmsModuleV1: true };
}

export async function refreshAviationCatalog() {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const [airportsRaw, airlinesRaw] = await Promise.all([
    fetch(AIRPORTS_REFRESH_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not fetch airports catalog (${response.status}).`);
      }

      return response.text();
    }),
    fetch(AIRLINES_REFRESH_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not fetch airlines catalog (${response.status}).`);
      }

      return response.text();
    }),
  ]);

  const airports = buildAirportCatalogRows(airportsRaw);
  const airlines = buildAirlineCatalogRows(airlinesRaw);

  await upsertInChunks(client, "airports", airports);
  await upsertInChunks(client, "airlines", airlines);

  await recordActivity(client, {
    userId: user?.id,
    action: "refresh_catalog",
    module: "cms",
    targetEntityType: "aviation_catalog",
    newValue: {
      airports: airports.length,
      airlines: airlines.length,
      airportsSource: AIRPORTS_REFRESH_URL,
      airlinesSource: AIRLINES_REFRESH_URL,
    },
  });

  return {
    airports: airports.length,
    airlines: airlines.length,
  };
}

export async function fetchAccessModuleData() {
  const client = requireSupabase();

  const [profiles, roles, permissions, userRoles, rolePermissions] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, email, phone, role, status, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("admin_roles")
      .select("code, label, rank, is_system, created_at")
      .order("rank", { ascending: false })
      .limit(100),
    client
      .from("admin_permissions")
      .select("code, module, action, label, created_at")
      .order("module", { ascending: true })
      .limit(500),
    client
      .from("user_admin_roles")
      .select("id, user_id, role_code, assigned_by, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("admin_role_permissions")
      .select("role_code, permission_code, created_at")
      .limit(2000),
  ]);

  if (profiles.error) {
    throw profiles.error;
  }

  const optional = [roles, permissions, userRoles, rolePermissions];
  for (const result of optional) {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }

  return {
    profiles: profiles.data || [],
    roles: roles.data || [],
    permissions: permissions.data || [],
    userRoles: userRoles.data || [],
    rolePermissions: rolePermissions.data || [],
    supportsAccessModuleV1: !roles.error && !permissions.error && !userRoles.error && !rolePermissions.error,
  };
}

export async function updateUserAdminRoles(userId, roleCodes = []) {
  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);

  const [currentRoles, currentProfile] = await Promise.all([
    client.from("user_admin_roles").select("*").eq("user_id", userId),
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);

  if (currentRoles.error && !isMissingOptionalTable(currentRoles.error)) {
    throw currentRoles.error;
  }

  const normalized = Array.from(new Set(roleCodes.filter(Boolean)));

  const removeQuery = client.from("user_admin_roles").delete().eq("user_id", userId);
  const { error: removeError } = await removeQuery;
  if (removeError && !isMissingOptionalTable(removeError)) {
    throw removeError;
  }

  if (normalized.length) {
    const { error: insertError } = await client.from("user_admin_roles").insert(
      normalized.map((roleCode) => ({
        user_id: userId,
        role_code: roleCode,
        assigned_by: actor?.id || null,
      })),
    );
    if (insertError) {
      throw insertError;
    }
  }

  const orderedRoles = [...normalized].sort((left, right) => {
    const rankMap = {
      super_admin: 100,
      admin: 90,
      operations_manager: 70,
      case_manager: 60,
      customer_support_agent: 50,
      finance_manager: 45,
      content_manager: 40,
      read_only: 10,
    };
    return (rankMap[right] || 0) - (rankMap[left] || 0);
  });
  const primaryRole = orderedRoles[0] || "read_only";
  const fallbackRole = toLegacyRoleCode(primaryRole);
  const { error: profileError } = await client
    .from("profiles")
    .update({ role: fallbackRole })
    .eq("id", userId);

  if (profileError) {
    throw profileError;
  }

  await recordActivity(client, {
    userId: actor?.id,
    action: "update_roles",
    module: "users",
    targetEntityType: "profile",
    targetEntityId: userId,
    previousValue: {
      profile_role: currentProfile.data?.role || null,
      admin_roles: (currentRoles.data || []).map((item) => item.role_code),
    },
    newValue: {
      profile_role: fallbackRole,
      primary_role: primaryRole,
      admin_roles: normalized,
    },
  });
}

export async function moveDocumentToTrash(document, note = "") {
  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const entityType = getDocumentEntityType(document);
  const source = getTrashSourceConfig(entityType);

  if (!source?.table || !document?.id) {
    throw new Error("Trash action is not available for this document.");
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = getTrashPurgeAfterDate();
  const updatePayload = {
    deleted_at: deletedAt,
    deleted_by: actor?.id || null,
    purge_after: purgeAfter,
  };

  if (source.statusField) {
    updatePayload[source.statusField] = "deleted";
  }

  const updateResult = await client
    .from(source.table)
    .update(updatePayload)
    .eq("id", document.id);

  if (updateResult.error) {
    throw updateResult.error;
  }

  const trashPayload = {
    entity_type: entityType,
    entity_id: document.id,
    label: document.file_name || document.signer_name || document.id,
    owner_type: document.owner_type || null,
    owner_id: document.owner_id || null,
    storage_bucket: document.kind === "document" ? document.bucket || null : null,
    storage_path: document.kind === "document" ? document.file_path || null : null,
    deleted_by: actor?.id || null,
    deleted_at: deletedAt,
    purge_after: purgeAfter,
    metadata: {
      kind: document.kind || "document",
      document_type: document.document_type || null,
      owner_label: document.ownerLabel || null,
      signer_name: document.signer_name || null,
      signer_email: document.signer_email || null,
      note: note || null,
      status: document.status || null,
    },
  };

  const trashResult = await client
    .from("trash_items")
    .upsert(trashPayload, { onConflict: "entity_type,entity_id" })
    .select("id")
    .single();

  if (trashResult.error) {
    throw trashResult.error;
  }

  await recordActivity(client, {
    userId: actor?.id,
    action: "trash",
    module: "documents",
    targetEntityType: entityType,
    targetEntityId: document.id,
    newValue: trashPayload,
  });

  return trashResult.data;
}

async function isCurrentUserSuperAdmin(client, userId) {
  if (!userId) {
    return false;
  }

  const response = await client
    .from("user_admin_roles")
    .select("role_code")
    .eq("user_id", userId)
    .eq("role_code", "super_admin")
    .limit(1)
    .maybeSingle();

  if (response.error && !isMissingOptionalTable(response.error)) {
    throw response.error;
  }

  return Boolean(response.data);
}

export async function moveUserToTrash(profileId, note = "") {
  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);

  if (!actor?.id) {
    throw new Error("You need to be signed in.");
  }

  const isSuperAdmin = await isCurrentUserSuperAdmin(client, actor.id);
  if (!isSuperAdmin) {
    throw new Error("Only super admins can delete users.");
  }

  if (profileId === actor.id) {
    throw new Error("You cannot delete your own account.");
  }

  const currentProfile = await client
    .from("profiles")
    .select("id, full_name, email, phone, role, status, deleted_at")
    .eq("id", profileId)
    .maybeSingle();

  if (currentProfile.error) {
    throw currentProfile.error;
  }

  if (!currentProfile.data?.id) {
    throw new Error("User profile was not found.");
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = getTrashPurgeAfterDate();

  const updateProfile = await client
    .from("profiles")
    .update({
      deleted_at: deletedAt,
      deleted_by: actor.id,
      purge_after: purgeAfter,
      deletion_note: note || null,
      status: "blocked",
    })
    .eq("id", profileId);

  if (updateProfile.error) {
    throw updateProfile.error;
  }

  await client
    .from("user_admin_roles")
    .delete()
    .eq("user_id", profileId);

  const trashPayload = {
    entity_type: "profile",
    entity_id: profileId,
    label: currentProfile.data.full_name || currentProfile.data.email || profileId,
    owner_type: "profile",
    owner_id: profileId,
    deleted_by: actor.id,
    deleted_at: deletedAt,
    purge_after: purgeAfter,
    metadata: {
      email: currentProfile.data.email || null,
      phone: currentProfile.data.phone || null,
      role: currentProfile.data.role || null,
      previous_status: currentProfile.data.status || null,
      note: note || null,
    },
  };

  const trashResult = await client
    .from("trash_items")
    .upsert(trashPayload, { onConflict: "entity_type,entity_id" })
    .select("id")
    .single();

  if (trashResult.error) {
    throw trashResult.error;
  }

  await recordActivity(client, {
    userId: actor.id,
    action: "trash_user",
    module: "users",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: currentProfile.data,
    newValue: trashPayload,
  });

  return trashResult.data;
}

export async function fetchTrashModuleData() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("trash_items")
    .select("id, entity_type, entity_id, label, owner_type, owner_id, storage_bucket, storage_path, deleted_by, deleted_at, purge_after, metadata")
    .order("deleted_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  return {
    items: data || [],
  };
}

export async function restoreTrashItem(item) {
  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const source = getTrashSourceConfig(item?.entity_type);

  if (!source?.table || !item?.entity_id) {
    throw new Error("Restore is not available for this trash item.");
  }

  const payload = {
    deleted_at: null,
    deleted_by: null,
    purge_after: null,
  };

  if (item.entity_type === "profile") {
    payload.deletion_note = null;
    payload.status = "active";
  } else if (source.statusField) {
    payload[source.statusField] = item?.metadata?.status || "uploaded";
  }

  const restoreResult = await client
    .from(source.table)
    .update(payload)
    .eq("id", item.entity_id);

  if (restoreResult.error) {
    throw restoreResult.error;
  }

  const deleteTrashResult = await client
    .from("trash_items")
    .delete()
    .eq("id", item.id);

  if (deleteTrashResult.error) {
    throw deleteTrashResult.error;
  }

  await recordActivity(client, {
    userId: actor?.id || null,
    action: "restore",
    module: "trash",
    targetEntityType: item.entity_type,
    targetEntityId: item.entity_id,
    previousValue: item,
    newValue: payload,
  });
}

async function removeStorageAsset(client, item) {
  if (!item?.storage_bucket || !item?.storage_path) {
    return;
  }

  const result = await client.storage
    .from(item.storage_bucket)
    .remove([item.storage_path]);

  if (result.error) {
    throw result.error;
  }
}

export async function permanentlyDeleteTrashItem(item) {
  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);

  if (item.entity_type === "profile") {
    const rpcResult = await client.rpc("admin_permanently_delete_user", {
      target_user_id: item.entity_id,
    });

    if (rpcResult.error) {
      throw rpcResult.error;
    }

    await recordActivity(client, {
      userId: actor?.id || null,
      action: "purge_user",
      module: "trash",
      targetEntityType: item.entity_type,
      targetEntityId: item.entity_id,
      previousValue: item,
      newValue: rpcResult.data || null,
    });

    return rpcResult.data;
  }

  const source = getTrashSourceConfig(item.entity_type);
  if (!source?.table) {
    throw new Error("Permanent deletion is not supported for this trash item.");
  }

  await removeStorageAsset(client, item);

  const deleteSourceResult = await client
    .from(source.table)
    .delete()
    .eq("id", item.entity_id);

  if (deleteSourceResult.error) {
    throw deleteSourceResult.error;
  }

  const deleteTrashResult = await client
    .from("trash_items")
    .delete()
    .eq("id", item.id);

  if (deleteTrashResult.error) {
    throw deleteTrashResult.error;
  }

  await recordActivity(client, {
    userId: actor?.id || null,
    action: "purge",
    module: "trash",
    targetEntityType: item.entity_type,
    targetEntityId: item.entity_id,
    previousValue: item,
  });

  return { deleted: true };
}

export async function purgeExpiredTrashItems() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("trash_items")
    .select("id, entity_type, entity_id, label, owner_type, owner_id, storage_bucket, storage_path, deleted_by, deleted_at, purge_after, metadata")
    .lte("purge_after", new Date().toISOString())
    .order("purge_after", { ascending: true })
    .limit(100);

  if (error) {
    throw error;
  }

  let purged = 0;
  for (const item of data || []) {
    await permanentlyDeleteTrashItem(item);
    purged += 1;
  }

  return { purged };
}

export async function fetchAdminSearchData() {
  const client = requireSupabase();

  const [leads, cases, customers, tasks, partners, blogPosts, faqItems, cmsPages, settings] = await Promise.all([
    client.from("leads").select("id, lead_code, full_name, email, airline, departure_airport, arrival_airport, status").order("created_at", { ascending: false }).limit(250),
    client.from("cases").select("id, case_code, airline, route_from, route_to, status").order("created_at", { ascending: false }).limit(100),
    client.from("customers").select("id, full_name, email, phone, country").order("created_at", { ascending: false }).limit(100),
    client.from("tasks").select("id, title, status, related_entity_type").order("created_at", { ascending: false }).limit(100),
    client.from("referral_partners").select("id, name, referral_code, status").order("created_at", { ascending: false }).limit(100),
    client.from("blog_posts").select("id, title, slug, status").order("updated_at", { ascending: false }).limit(100),
    client.from("faq_items").select("id, question, category, status").order("updated_at", { ascending: false }).limit(100),
    client.from("cms_pages").select("id, page_key, title, slug, status").order("updated_at", { ascending: false }).limit(100),
    client.from("system_settings").select("id, setting_key, label, group_key").order("updated_at", { ascending: false }).limit(100),
  ]);

  const tolerate = [partners, blogPosts, faqItems, cmsPages, settings];
  for (const result of [leads, cases, customers, tasks]) {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }
  for (const result of tolerate) {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }

  return {
    leads: leads.data || [],
    cases: cases.data || [],
    customers: customers.data || [],
    tasks: tasks.data || [],
    partners: partners.data || [],
    blogPosts: blogPosts.data || [],
    faqItems: faqItems.data || [],
    cmsPages: cmsPages.data || [],
    settings: settings.data || [],
  };
}

export async function createCmsPage(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    page_key: input.page_key,
    title: input.title,
    slug: input.slug || "/",
    status: input.status || "draft",
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    locale: input.locale || "en",
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("cms_pages").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "cms",
    targetEntityType: "cms_page",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateCmsPage(pageId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("cms_pages").select("*").eq("id", pageId).maybeSingle();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("cms_pages").update(payload).eq("id", pageId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "cms",
    targetEntityType: "cms_page",
    targetEntityId: pageId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function createCmsBlock(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    page_id: input.page_id,
    block_type: input.block_type,
    block_key: input.block_key,
    title: input.title || null,
    body: input.body || null,
    image_url: input.image_url || null,
    cta_label: input.cta_label || null,
    cta_link: input.cta_link || null,
    sort_order: Number(input.sort_order || 0),
    status: input.status || "draft",
    payload: input.payload || {},
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("cms_blocks").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "cms",
    targetEntityType: "cms_block",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { page_id: input.page_id },
  });

  return data;
}

export async function updateCmsBlock(blockId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("cms_blocks").select("*").eq("id", blockId).maybeSingle();
  const payload = {
    ...updates,
    sort_order: updates.sort_order === undefined ? undefined : Number(updates.sort_order || 0),
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("cms_blocks").update(payload).eq("id", blockId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "cms",
    targetEntityType: "cms_block",
    targetEntityId: blockId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function getDocumentDownloadUrl(document) {
  const client = requireSupabase();
  const { data, error } = await client.storage
    .from(document.bucket)
    .createSignedUrl(document.file_path, 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

export function downloadSignaturePng(signatureDataUrl, fileName = "signature.png") {
  if (!signatureDataUrl) {
    throw new Error("Signature file is missing.");
  }

  const link = document.createElement("a");
  link.href = signatureDataUrl;
  link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function updateLeadStatus(leadId, status) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const currentLead = await client
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();
  const { error } = await client
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    throw error;
  }

  const historyInsert = await client
    .from("lead_status_history")
    .insert({
      lead_id: leadId,
      previous_status: currentLead.data?.status || null,
      next_status: status,
      changed_by: user?.id || null,
    });

  if (historyInsert.error && !isMissingOptionalTable(historyInsert.error)) {
    throw historyInsert.error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update_status",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: leadId,
    previousValue: { status: currentLead.data?.status || null },
    newValue: { status },
  });
}

export async function updateCaseWorkflow(caseId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("cases").select("*").eq("id", caseId).maybeSingle();
  const now = new Date().toISOString();
  const payload = {
    ...updates,
    updated_at: now,
  };

  if (updates.status === "approved") payload.approved_at = now;
  if (updates.status === "rejected") payload.rejected_at = now;
  if (updates.status === "paid") payload.paid_at = now;
  if (updates.status === "closed") payload.closed_at = now;

  const { error } = await client
    .from("cases")
    .update(payload)
    .eq("id", caseId);

  if (error) {
    throw error;
  }

  if (updates.status && updates.status !== current.data?.status) {
    const history = await client
      .from("case_status_history")
      .insert({
        case_id: caseId,
        previous_status: current.data?.status || null,
        next_status: updates.status,
        changed_by: user?.id || null,
      });

    if (history.error && !isMissingOptionalTable(history.error)) {
      throw history.error;
    }
  }

  const [updatedCase, financeResponse] = await Promise.all([
    client.from("cases").select("*").eq("id", caseId).maybeSingle(),
    client.from("case_finance").select("*").eq("case_id", caseId).maybeSingle(),
  ]);
  const leadId = updatedCase.data?.lead_id || current.data?.lead_id || null;
  const leadRow = leadId
    ? (await client.from("leads").select("*").eq("id", leadId).maybeSingle()).data || null
    : null;

  await syncPartnerCommissionForCase(client, {
    lead: leadRow,
    caseRow: updatedCase.data || { ...current.data, ...payload },
    financeRow: financeResponse.data || null,
  }).catch(() => null);

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "cases",
    targetEntityType: "case",
    targetEntityId: caseId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function assignLeadOwner(leadId, assignedUserId) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("leads").select("assigned_user_id").eq("id", leadId).maybeSingle();
  const { error } = await client
    .from("leads")
    .update({
      assigned_user_id: assignedUserId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Apply Core Operations schema V1 in Supabase to enable lead assignment.");
    }

    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "assign",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: leadId,
    previousValue: current.data || null,
    newValue: { assigned_user_id: assignedUserId || null },
  });
}

export async function createLeadNote(leadId, body) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const { error } = await client
    .from("lead_notes")
    .insert({
      lead_id: leadId,
      body,
      created_by: user?.id || null,
    });

  if (error) {
    if (isMissingOptionalTable(error)) {
      throw new Error("Apply Core Operations schema V1 in Supabase to enable internal lead notes.");
    }

    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create_note",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: leadId,
    newValue: { body },
  });
}

export async function updateClaimStatus(claimId, status) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("claims").select("status").eq("id", claimId).maybeSingle();
  const { error } = await client
    .from("claims")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update_status",
    module: "claims",
    targetEntityType: "claim",
    targetEntityId: claimId,
    previousValue: current.data || null,
    newValue: { status },
  });
}

export async function updateProfileRole(profileId, role) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("profiles").select("role").eq("id", profileId).maybeSingle();
  const { error } = await client
    .from("profiles")
    .update({ role })
    .eq("id", profileId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update_role",
    module: "users",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: current.data || null,
    newValue: { role },
  });
}
