import { requireSupabase } from "../lib/supabase.js";
import { calculateDistanceCompensationEstimate } from "../lib/compensationDistance.js";
import { findAirportByCode } from "./catalogService.js";
import { getCurrentUser, getCurrentProfile, syncCurrentUserClaimData, updateCurrentProfile } from "./authService.js";
import { uploadLeadDocument } from "./leadService.js";

const REQUIRED_CLIENT_DOCUMENTS = [
  { key: "passport", label: "Passport / ID" },
  { key: "boarding_pass", label: "Boarding Pass" },
  { key: "signature", label: "Signature / Consent" },
];

const DOCUMENT_STATUS_META = {
  missing: { key: "missing", label: "Missing", tone: "warning" },
  uploaded: { key: "uploaded", label: "Uploaded", tone: "neutral" },
  pending_review: { key: "pending_review", label: "Pending review", tone: "info" },
  approved: { key: "approved", label: "Approved", tone: "success" },
  rejected: { key: "rejected", label: "Rejected", tone: "danger" },
};

const CLIENT_DOCUMENT_ACCEPTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "application/pdf",
]);

const CLIENT_DOCUMENT_MAX_FILE_SIZE = 25 * 1024 * 1024;

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || error?.message?.includes("column");
}

function isMissingOptionalTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function extractAirportCode(value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  const match = input.match(/^([A-Z0-9]{3,4})\b/);
  return match ? match[1] : "";
}

async function resolveAirportFromRouteLabel(value) {
  const code = extractAirportCode(value);
  if (!code) {
    return null;
  }

  return findAirportByCode(code).catch(() => null);
}

function normalizeLabel(value, fallback = "Unknown") {
  const input = String(value || "").trim();
  if (!input) {
    return fallback;
  }

  return input
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function toTimestamp(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function sortByNewest(items = []) {
  return [...items].sort((left, right) => toTimestamp(right.created_at || right.signed_at) - toTimestamp(left.created_at || left.signed_at));
}

async function withEstimateFallback(record) {
  if (!record) {
    return record;
  }

  const existingAmount = record.estimated_compensation_eur ?? record.estimatedCompensationEur;
  const existingStatus = String(record.estimate_status ?? record.estimateStatus ?? "").toLowerCase();

  if (Number.isFinite(Number(existingAmount)) || existingStatus === "calculated") {
    return record;
  }

  const [fromAirport, toAirport] = await Promise.all([
    resolveAirportFromRouteLabel(record.departure_airport || record.route_from),
    resolveAirportFromRouteLabel(record.arrival_airport || record.route_to),
  ]);

  if (!fromAirport || !toAirport) {
    return record;
  }

  const estimate = calculateDistanceCompensationEstimate({ fromAirport, toAirport });
  return {
    ...record,
    distance_km: record.distance_km ?? estimate.distanceKm,
    distance_band: record.distance_band ?? estimate.distanceBand,
    estimated_compensation_eur: record.estimated_compensation_eur ?? estimate.estimatedCompensationEur,
    compensation_currency: record.compensation_currency ?? estimate.currency,
    estimate_status: estimate.estimateStatus,
    estimate_explanation: record.estimate_explanation ?? estimate.estimateExplanation ?? null,
  };
}

function getDocumentTypeKey(type, kind = "document") {
  const value = String(type || "").toLowerCase();

  if (kind === "signature" || value.includes("signature") || value.includes("consent")) return "signature";
  if (value.includes("passport") || value.includes("id")) return "passport";
  if (value.includes("boarding")) return "boarding_pass";
  if (value.includes("booking") || value.includes("ticket")) return "booking";
  return "other";
}

function getClaimLeadId(claim) {
  if (!claim) return null;
  if (claim.kind === "lead") return claim.id;
  return claim.raw?.lead_id || null;
}

function isClaimFinalized(claim) {
  return ["approved", "rejected", "paid"].includes(String(claim?.publicStatus?.key || "").toLowerCase());
}

function canClaimAcceptClientDocumentUpdates(claim) {
  return Boolean(getClaimLeadId(claim)) && !isClaimFinalized(claim);
}

export function getClientDocumentStatus(status, kind = "document") {
  const value = String(status || "").toLowerCase();

  if (!value) {
    return DOCUMENT_STATUS_META.missing;
  }

  if (kind === "signature" && value === "signed") {
    return DOCUMENT_STATUS_META.approved;
  }

  if (["approved", "accepted"].includes(value)) {
    return DOCUMENT_STATUS_META.approved;
  }

  if (["rejected", "declined", "invalid"].includes(value)) {
    return DOCUMENT_STATUS_META.rejected;
  }

  if (["pending_review", "pending", "review"].includes(value)) {
    return DOCUMENT_STATUS_META.pending_review;
  }

  if (["missing", "requested", "replacement_requested"].includes(value)) {
    return DOCUMENT_STATUS_META.missing;
  }

  if (["uploaded", "signed"].includes(value)) {
    return DOCUMENT_STATUS_META.uploaded;
  }

  return DOCUMENT_STATUS_META.uploaded;
}

export function getClientPaymentStatus(paymentStatus, paidAt = null) {
  const value = String(paymentStatus || "").toLowerCase();

  if (paidAt || ["paid", "completed", "payout_completed", "customer_paid"].includes(value)) {
    return { key: "paid", label: "Paid", tone: "success" };
  }

  if (["approved", "ready", "ready_for_payout"].includes(value)) {
    return { key: "approved", label: "Approved", tone: "success" };
  }

  if (["pending", "processing", "scheduled", "awaiting_payment"].includes(value)) {
    return { key: "pending", label: "Pending", tone: "info" };
  }

  return { key: "not_started", label: "Not started", tone: "neutral" };
}

function hasDocumentAttention(documentStatus) {
  if (Array.isArray(documentStatus)) {
    return documentStatus.some((item) => ["missing", "rejected"].includes(item?.statusKey));
  }

  return Boolean(documentStatus?.needsAttention);
}

function hasAllRequiredDocuments(documentStatus) {
  if (!Array.isArray(documentStatus) || !documentStatus.length) {
    return false;
  }

  return documentStatus.every((item) => !["missing", "rejected"].includes(item?.statusKey));
}

export function getClientClaimStatus(internalStatus, stage, documentStatus, paymentStatus) {
  const normalizedStatus = String(internalStatus || "").toLowerCase();
  const payment = getClientPaymentStatus(paymentStatus);
  const documentsNeedAttention = hasDocumentAttention(documentStatus);
  const documentsReady = hasAllRequiredDocuments(documentStatus);
  const explicitlyNeedsDocuments = ["documents_pending", "missing_documents", "needs_documents"].includes(normalizedStatus);

  if (payment.key === "paid") {
    return {
      key: "paid",
      label: "Paid",
      tone: "success",
      step: 5,
      explanation: "Compensation has been paid.",
    };
  }

  if (["rejected", "ineligible", "closed_rejected", "denied", "lost"].includes(normalizedStatus)) {
    return {
      key: "rejected",
      label: "Rejected",
      tone: "danger",
      step: 4,
      explanation: "This claim could not be approved.",
    };
  }

  if (["approved", "won", "eligible"].includes(normalizedStatus) || payment.key === "approved") {
    return {
      key: "approved",
      label: "Approved",
      tone: "success",
      step: 4,
      explanation: "Your claim has been approved.",
    };
  }

  if (
    documentsNeedAttention
    || (explicitlyNeedsDocuments && !documentsReady)
  ) {
    return {
      key: "documents_needed",
      label: "Documents needed",
      tone: "warning",
      step: 2,
      explanation: "Some documents still need your attention.",
    };
  }

  if (["submitted", "new", "draft"].includes(normalizedStatus)) {
    return {
      key: "submitted",
      label: "Submitted",
      tone: "info",
      step: 1,
      explanation: "Your claim was received.",
    };
  }

  if (
    ["review", "pending_review", "processing", "active", "under_review", "ready_to_submit", "submitted_to_airline", "awaiting_response", "escalated", "payment_processing"].includes(normalizedStatus)
  ) {
    return {
      key: "under_review",
      label: "Under review",
      tone: "info",
      step: 2,
      explanation: "Your claim is being reviewed.",
    };
  }

  return {
    key: "under_review",
    label: "Under review",
    tone: "info",
    step: 2,
    explanation: "Your claim is being reviewed.",
  };
}

function normalizeLeadDocument(item) {
  return {
    ...item,
    kind: "document",
    ownerType: "lead",
    ownerId: item.lead_id,
    bucket: "claim-lead-documents",
    mime_type: item.mime_type || "",
  };
}

function normalizeCaseDocument(item) {
  return {
    ...item,
    kind: "document",
    ownerType: "case",
    ownerId: item.case_id,
    bucket: String(item.file_path || "").startsWith("leads/") ? "claim-lead-documents" : "case-documents",
    mime_type: item.mime_type || "",
  };
}

function normalizeLeadSignature(item) {
  return {
    ...item,
    kind: "signature",
    ownerType: "lead",
    ownerId: item.lead_id,
    document_type: "signature",
    file_name: item.signer_name ? `${item.signer_name} signature` : "Signature / Consent",
    status: item.terms_accepted ? "signed" : "pending",
    created_at: item.signed_at || item.created_at,
    mime_type: "image/png",
    signature_data_url: item.signature_data_url || "",
  };
}

function buildRequiredDocumentSummary(records = []) {
  const sorted = sortByNewest(records);

  return REQUIRED_CLIENT_DOCUMENTS.map((definition) => {
    const matches = sorted.filter((item) => getDocumentTypeKey(item.document_type, item.kind) === definition.key);
    const latest = matches[0] || null;
    const statusMeta = latest ? getClientDocumentStatus(latest.status, latest.kind) : DOCUMENT_STATUS_META.missing;

    return {
      ...definition,
      latestDocument: latest,
      statusKey: statusMeta.key,
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      uploadedAt: latest?.created_at || latest?.signed_at || "",
    };
  });
}

function buildDocumentsSummary(requiredDocuments = []) {
  const availableCount = requiredDocuments.filter((item) => item.statusKey !== "missing").length;
  const needsAttention = requiredDocuments.some((item) => ["missing", "rejected"].includes(item.statusKey));

  if (!availableCount) {
    return {
      label: "No documents uploaded",
      detail: "Passport / ID, boarding pass, and signature will appear here.",
      availableCount,
      needsAttention,
    };
  }

  if (needsAttention) {
    return {
      label: "Documents needed",
      detail: `${availableCount}/3 required documents are on file.`,
      availableCount,
      needsAttention,
    };
  }

  if (availableCount === REQUIRED_CLIENT_DOCUMENTS.length) {
    return {
      label: "All required documents received",
      detail: "Passport / ID, boarding pass, and signature are attached.",
      availableCount,
      needsAttention,
    };
  }

  return {
    label: "Documents uploaded",
    detail: `${availableCount}/3 required documents are on file.`,
    availableCount,
    needsAttention,
  };
}

function createFinanceMap(financeRows = []) {
  return new Map(financeRows.map((item) => [item.case_id, item]));
}

function buildClaimRowFromLead(lead, context) {
  const relatedDocuments = [
    ...(context.leadDocumentsByLeadId.get(lead.id) || []),
    ...(context.signaturesByLeadId.get(lead.id) || []),
  ];
  const requiredDocuments = buildRequiredDocumentSummary(relatedDocuments);
  const documentsSummary = buildDocumentsSummary(requiredDocuments);
  const publicStatus = getClientClaimStatus(lead.status, lead.stage, requiredDocuments, null);

  return {
    id: lead.id,
    kind: "lead",
    reference: lead.lead_code || lead.id,
    airline: lead.airline || "",
    route: [lead.departure_airport, lead.arrival_airport].filter(Boolean).join(" → "),
    disruptionType: normalizeLabel(lead.disruption_type, "Flight disruption"),
    submittedAt: lead.submitted_at || lead.created_at,
    created_at: lead.created_at,
    publicStatus,
    requiredDocuments,
    documentsSummary,
    paymentStatus: getClientPaymentStatus(null),
    estimate: {
      amount: lead.estimated_compensation_eur,
      currency: lead.compensation_currency || "EUR",
      distanceKm: lead.distance_km,
      distanceBand: lead.distance_band,
      status: lead.estimate_status,
    },
    raw: lead,
  };
}

function buildClaimRowFromCase(caseRow, context) {
  const relatedLead = caseRow.lead_id ? context.leadsById.get(caseRow.lead_id) || null : null;
  const finance = context.financeByCaseId.get(caseRow.id) || null;
  const relatedDocuments = [
    ...(caseRow.lead_id ? (context.leadDocumentsByLeadId.get(caseRow.lead_id) || []) : []),
    ...(context.caseDocumentsByCaseId.get(caseRow.id) || []),
    ...(caseRow.lead_id ? (context.signaturesByLeadId.get(caseRow.lead_id) || []) : []),
  ];
  const requiredDocuments = buildRequiredDocumentSummary(relatedDocuments);
  const documentsSummary = buildDocumentsSummary(requiredDocuments);
  const paymentStatus = getClientPaymentStatus(
    finance?.payment_status || caseRow.payout_status || null,
    finance?.customer_paid_at || caseRow.paid_at || null,
  );
  const publicStatus = getClientClaimStatus(caseRow.status, relatedLead?.stage || "", requiredDocuments, paymentStatus.key);

  return {
    id: caseRow.id,
    kind: "case",
    reference: caseRow.case_code || caseRow.id,
    airline: caseRow.airline || relatedLead?.airline || "",
    route: [caseRow.route_from || relatedLead?.departure_airport, caseRow.route_to || relatedLead?.arrival_airport].filter(Boolean).join(" → "),
    disruptionType: normalizeLabel(relatedLead?.disruption_type || caseRow.issue_type, "Flight disruption"),
    submittedAt: relatedLead?.submitted_at || caseRow.created_at,
    created_at: caseRow.created_at,
    publicStatus,
    requiredDocuments,
    documentsSummary,
    paymentStatus,
    estimate: {
      amount: relatedLead?.estimated_compensation_eur ?? caseRow.estimated_compensation ?? finance?.compensation_amount ?? null,
      currency: relatedLead?.compensation_currency || finance?.currency || "EUR",
      distanceKm: relatedLead?.distance_km ?? null,
      distanceBand: relatedLead?.distance_band ?? null,
      status: relatedLead?.estimate_status || "",
    },
    raw: caseRow,
    finance,
  };
}

function createContext({ leads, cases, finance, leadDocuments, caseDocuments, leadSignatures }) {
  const leadsById = new Map((leads || []).map((item) => [item.id, item]));
  const leadDocumentsByLeadId = new Map();
  const caseDocumentsByCaseId = new Map();
  const signaturesByLeadId = new Map();

  (leadDocuments || []).forEach((item) => {
    const bucket = leadDocumentsByLeadId.get(item.lead_id) || [];
    bucket.push(normalizeLeadDocument(item));
    leadDocumentsByLeadId.set(item.lead_id, bucket);
  });

  (caseDocuments || []).forEach((item) => {
    const bucket = caseDocumentsByCaseId.get(item.case_id) || [];
    bucket.push(normalizeCaseDocument(item));
    caseDocumentsByCaseId.set(item.case_id, bucket);
  });

  (leadSignatures || []).forEach((item) => {
    const bucket = signaturesByLeadId.get(item.lead_id) || [];
    bucket.push(normalizeLeadSignature(item));
    signaturesByLeadId.set(item.lead_id, bucket);
  });

  return {
    leadsById,
    financeByCaseId: createFinanceMap(finance),
    leadDocumentsByLeadId,
    caseDocumentsByCaseId,
    signaturesByLeadId,
  };
}

function buildClaimRows({ leads, cases, finance, leadDocuments, caseDocuments, leadSignatures }) {
  const context = createContext({ leads, cases, finance, leadDocuments, caseDocuments, leadSignatures });
  const caseLeadIds = new Set((cases || []).map((item) => item.lead_id).filter(Boolean));
  const caseRows = (cases || []).map((item) => buildClaimRowFromCase(item, context));
  const leadRows = (leads || [])
    .filter((item) => !caseLeadIds.has(item.id))
    .map((item) => buildClaimRowFromLead(item, context));

  return caseRows
    .concat(leadRows)
    .sort((left, right) => toTimestamp(right.submittedAt || right.created_at) - toTimestamp(left.submittedAt || left.created_at));
}

function pickDocumentUploadTarget(claimRows = []) {
  return claimRows.find((item) => item.publicStatus?.key === "documents_needed" && canClaimAcceptClientDocumentUpdates(item))
    || claimRows.find((item) => canClaimAcceptClientDocumentUpdates(item))
    || null;
}

function createClaimMaps(claimRows = []) {
  const claimsByLeadId = new Map();
  const claimsByCaseId = new Map();

  claimRows.forEach((claim) => {
    const leadId = getClaimLeadId(claim);
    if (leadId) {
      claimsByLeadId.set(leadId, claim);
    }

    if (claim.kind === "case") {
      claimsByCaseId.set(claim.id, claim);
    }
  });

  return {
    claimsByLeadId,
    claimsByCaseId,
  };
}

function getDocumentClaim(document, claimMaps) {
  if (!document) return null;

  if (document.ownerType === "case") {
    return claimMaps.claimsByCaseId.get(document.ownerId) || null;
  }

  return claimMaps.claimsByLeadId.get(document.ownerId) || null;
}

function canClientReplaceOrDeleteDocument(document, claimMaps) {
  if (!document || document.kind === "signature") {
    return false;
  }

  if (document.ownerType !== "lead") {
    return false;
  }

  const claim = getDocumentClaim(document, claimMaps);
  if (!canClaimAcceptClientDocumentUpdates(claim)) {
    return false;
  }

  const status = getClientDocumentStatus(document.status, document.kind);
  return !["pending_review", "approved"].includes(status.key);
}

function attachDocumentManagement(documents = [], claimRows = []) {
  const claimMaps = createClaimMaps(claimRows);

  return documents.map((document) => {
    const claim = getDocumentClaim(document, claimMaps);

    return {
      ...document,
      claimReference: claim?.reference || "",
      claimStatusKey: claim?.publicStatus?.key || "",
      canReplace: canClientReplaceOrDeleteDocument(document, claimMaps),
      canDelete: canClientReplaceOrDeleteDocument(document, claimMaps),
      canPreview: Boolean(document.signature_data_url || (document.bucket && document.file_path)),
    };
  });
}

async function fetchPortalBaseData() {
  const client = requireSupabase();

  await syncCurrentUserClaimData().catch(() => null);

  const [profile, leads, cases, finance, leadDocuments, caseDocuments, leadSignatures] = await Promise.all([
    getCurrentProfile(),
    client
      .from("leads")
      .select("id, lead_code, status, stage, eligibility_status, disruption_type, departure_airport, arrival_airport, airline, created_at, submitted_at, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("cases")
      .select("id, case_code, lead_id, status, payout_status, airline, route_from, route_to, issue_type, estimated_compensation, created_at, approved_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, customer_payout, payment_status, currency, customer_paid_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30),
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("case_documents")
      .select("id, case_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("lead_signatures")
      .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (leads.error) {
    throw leads.error;
  }

  if (cases.error) {
    throw cases.error;
  }

  if (finance.error && !isMissingColumnError(finance.error)) {
    throw finance.error;
  }

  if (leadDocuments.error) {
    throw leadDocuments.error;
  }

  if (caseDocuments.error) {
    throw caseDocuments.error;
  }

  if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error) && !isMissingColumnError(leadSignatures.error)) {
    throw leadSignatures.error;
  }

  const enrichedLeads = await Promise.all((leads.data || []).map((item) => withEstimateFallback(item)));

  return {
    profile,
    leads: enrichedLeads,
    cases: cases.data || [],
    finance: finance.error ? [] : (finance.data || []),
    leadDocuments: leadDocuments.data || [],
    caseDocuments: caseDocuments.data || [],
    leadSignatures: leadSignatures.error ? [] : (leadSignatures.data || []),
  };
}

export async function fetchClientDashboardData() {
  const data = await fetchPortalBaseData();
  const claimRows = buildClaimRows(data);

  return {
    ...data,
    claimRows,
  };
}

export async function fetchClientClaims() {
  const data = await fetchClientDashboardData();
  return {
    ...data,
    claimRows: data.claimRows || [],
  };
}

export async function fetchClientClaimDetails(claimId) {
  const client = requireSupabase();

  const caseResponse = await client
    .from("cases")
    .select("id, case_code, lead_id, status, payout_status, airline, route_from, route_to, flight_date, issue_type, estimated_compensation, created_at, approved_at, paid_at")
    .eq("id", claimId)
    .maybeSingle();

  if (caseResponse.error) {
    throw caseResponse.error;
  }

  if (caseResponse.data) {
    const [caseDocuments, finance, relatedLead, leadDocuments, leadSignatures] = await Promise.all([
      client.from("case_documents").select("id, case_id, document_type, file_path, file_name, mime_type, file_size, status, created_at").eq("case_id", claimId).is("deleted_at", null).order("created_at", { ascending: false }),
      client.from("case_finance").select("id, case_id, compensation_amount, customer_payout, payment_status, currency, customer_paid_at, created_at, updated_at").eq("case_id", claimId).maybeSingle(),
      caseResponse.data.lead_id
        ? client
          .from("leads")
          .select("id, lead_code, status, stage, eligibility_status, disruption_type, departure_airport, arrival_airport, airline, created_at, submitted_at, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
          .eq("id", caseResponse.data.lead_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      caseResponse.data.lead_id
        ? client
          .from("lead_documents")
          .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
          .eq("lead_id", caseResponse.data.lead_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      caseResponse.data.lead_id
        ? client
          .from("lead_signatures")
          .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, created_at")
          .eq("lead_id", caseResponse.data.lead_id)
          .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (caseDocuments.error) throw caseDocuments.error;
    if (finance.error && !isMissingColumnError(finance.error)) throw finance.error;
    if (relatedLead.error && !isMissingColumnError(relatedLead.error)) throw relatedLead.error;
    if (leadDocuments.error) throw leadDocuments.error;
    if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error) && !isMissingColumnError(leadSignatures.error)) throw leadSignatures.error;

    const lead = await withEstimateFallback(relatedLead.data || null);
    const data = {
      leads: lead ? [lead] : [],
      cases: [caseResponse.data],
      finance: finance.error ? [] : [finance.data].filter(Boolean),
      leadDocuments: leadDocuments.data || [],
      caseDocuments: caseDocuments.data || [],
      leadSignatures: leadSignatures.error ? [] : (leadSignatures.data || []),
    };
    const claim = buildClaimRows(data)[0] || null;

    return {
      type: "case",
      claim,
      documents: sortByNewest([
        ...(leadDocuments.data || []).map(normalizeLeadDocument),
        ...(caseDocuments.data || []).map(normalizeCaseDocument),
        ...((leadSignatures.error ? [] : (leadSignatures.data || [])).map(normalizeLeadSignature)),
      ]),
      finance: finance.error ? null : (finance.data || null),
    };
  }

  const leadResponse = await client
    .from("leads")
    .select("id, lead_code, status, stage, eligibility_status, disruption_type, airline, departure_airport, arrival_airport, scheduled_departure_date, created_at, submitted_at, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
    .eq("id", claimId)
    .maybeSingle();

  if (leadResponse.error) {
    throw leadResponse.error;
  }

  const [leadDocuments, leadSignatures] = await Promise.all([
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
      .eq("lead_id", claimId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("lead_signatures")
      .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, created_at")
      .eq("lead_id", claimId)
      .order("created_at", { ascending: false }),
  ]);

  if (leadDocuments.error) {
    throw leadDocuments.error;
  }

  if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error) && !isMissingColumnError(leadSignatures.error)) {
    throw leadSignatures.error;
  }

  const lead = await withEstimateFallback(leadResponse.data);
  const claim = buildClaimRows({
    leads: lead ? [lead] : [],
    cases: [],
    finance: [],
    leadDocuments: leadDocuments.data || [],
    caseDocuments: [],
    leadSignatures: leadSignatures.error ? [] : (leadSignatures.data || []),
  })[0] || null;

  return {
    type: "lead",
    claim,
    documents: sortByNewest([
      ...(leadDocuments.data || []).map(normalizeLeadDocument),
      ...((leadSignatures.error ? [] : (leadSignatures.data || [])).map(normalizeLeadSignature)),
    ]),
    finance: null,
  };
}

export async function fetchClientDocuments() {
  const data = await fetchPortalBaseData();
  const claimRows = buildClaimRows(data);
  const uploadTarget = pickDocumentUploadTarget(claimRows);
  const normalizedDocuments = sortByNewest([
    ...(data.leadDocuments || []).map(normalizeLeadDocument),
    ...(data.caseDocuments || []).map(normalizeCaseDocument),
    ...(data.leadSignatures || []).map(normalizeLeadSignature),
  ]);

  const documents = attachDocumentManagement(
    normalizedDocuments.filter((item) => ["passport", "boarding_pass", "signature"].includes(getDocumentTypeKey(item.document_type, item.kind))),
    claimRows,
  );
  const requiredDocuments = buildRequiredDocumentSummary(documents);

  return {
    documents,
    requiredDocuments,
    uploadTarget: uploadTarget ? {
      claimId: uploadTarget.id,
      claimKind: uploadTarget.kind,
      claimReference: uploadTarget.reference,
      leadId: getClaimLeadId(uploadTarget),
      publicStatusKey: uploadTarget.publicStatus?.key || "",
    } : null,
  };
}

export async function getClientDocumentDownloadUrl(document) {
  if (!document) {
    throw new Error("Document is missing.");
  }

  if (document.kind === "signature" && document.signature_data_url) {
    return document.signature_data_url;
  }

  if (!document.bucket || !document.file_path) {
    throw new Error("Document file is not available.");
  }

  const client = requireSupabase();
  const buckets = [document.bucket];

  if (document.bucket === "case-documents" && String(document.file_path || "").startsWith("leads/")) {
    buckets.push("claim-lead-documents");
  }

  let lastError = null;

  for (const bucket of buckets) {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(document.file_path, 300);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    lastError = error || lastError;
  }

  throw lastError || new Error("Could not open the document.");
}

function getDocumentPurgeAfterDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function getUploadDocumentType(type) {
  const normalized = getDocumentTypeKey(type);
  if (normalized === "passport") return "passport";
  if (normalized === "boarding_pass") return "boarding_pass";
  return normalized;
}

function validateClientDocumentFile(file) {
  if (!file) {
    throw new Error("Please choose a file.");
  }

  const mimeType = String(file.type || "").toLowerCase();
  const fileName = String(file.name || "").toLowerCase();
  const hasSupportedExtension = [".png", ".jpg", ".jpeg", ".pdf"].some((suffix) => fileName.endsWith(suffix));

  if (!CLIENT_DOCUMENT_ACCEPTED_MIME_TYPES.has(mimeType) && !hasSupportedExtension) {
    throw new Error("Only PNG, JPG, JPEG, and PDF files are supported.");
  }

  if (Number(file.size || 0) > CLIENT_DOCUMENT_MAX_FILE_SIZE) {
    throw new Error("The file is too large. Maximum size is 25 MB.");
  }
}

async function softDeleteLeadDocument(document) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  const { error } = await client
    .from("lead_documents")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id || null,
      purge_after: getDocumentPurgeAfterDate(),
    })
    .eq("id", document.id);

  if (error) {
    throw error;
  }
}

export async function uploadClientDocument({ leadId, documentType, file }) {
  if (!leadId) {
    throw new Error("This claim is not accepting document uploads right now.");
  }

  const normalizedType = getUploadDocumentType(documentType);
  if (!["passport", "boarding_pass"].includes(normalizedType)) {
    throw new Error("This document type cannot be uploaded here.");
  }

  validateClientDocumentFile(file);
  await uploadLeadDocument(leadId, normalizedType, file);
}

export async function replaceClientDocument(document, file) {
  if (!document?.canReplace || document.ownerType !== "lead") {
    throw new Error("This document cannot be replaced right now.");
  }

  validateClientDocumentFile(file);
  await uploadLeadDocument(document.ownerId, getUploadDocumentType(document.document_type), file);
  await softDeleteLeadDocument(document);
}

export async function deleteClientDocument(document) {
  if (!document?.canDelete || document.ownerType !== "lead") {
    throw new Error("This document cannot be removed right now.");
  }

  await softDeleteLeadDocument(document);
}

export async function saveClientProfile(input) {
  return updateCurrentProfile({
    full_name: input.full_name,
    phone: input.phone,
  });
}
