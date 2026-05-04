import { requireSupabase } from "../lib/supabase.js";
import { calculateDistanceCompensationEstimate } from "../lib/compensationDistance.js";
import { searchAirports } from "./catalogService.js";
import { getCurrentProfile, syncCurrentUserClaimData, updateCurrentProfile } from "./authService.js";

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || error?.message?.includes("column");
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

  const matches = await searchAirports(code, 5).catch(() => []);
  return Array.isArray(matches)
    ? matches.find((airport) => String(airport.iata_code || airport.icao_code || airport.ident || "").toUpperCase() === code)
      || matches[0]
      || null
    : null;
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

export async function fetchClientDashboardData() {
  const client = requireSupabase();

  await syncCurrentUserClaimData().catch(() => null);

  const [profile, leads, cases, finance] = await Promise.all([
    getCurrentProfile(),
    client
      .from("leads")
      .select("id, lead_code, status, stage, eligibility_status, departure_airport, arrival_airport, airline, created_at, submitted_at, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("cases")
      .select("id, case_code, lead_id, status, payout_status, airline, route_from, route_to, estimated_compensation, created_at, approved_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, customer_payout, payment_status, currency, customer_paid_at")
      .order("updated_at", { ascending: false })
      .limit(20),
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

  const enrichedLeads = await Promise.all((leads.data || []).map((item) => withEstimateFallback(item)));

  return {
    profile,
    leads: enrichedLeads,
    cases: cases.data || [],
    finance: finance.data || [],
  };
}

export async function fetchClientClaims() {
  const data = await fetchClientDashboardData();
  return {
    ...data,
    claimRows: [
      ...(data.leads || []).map((item) => ({
        id: item.id,
        code: item.lead_code,
        status: item.status,
        substatus: item.stage,
        flight: item.airline || "",
        route: [item.departure_airport, item.arrival_airport].filter(Boolean).join(" -> "),
        kind: "lead",
        created_at: item.created_at,
        distance_km: item.distance_km,
        distance_band: item.distance_band,
        estimated_compensation_eur: item.estimated_compensation_eur,
        compensation_currency: item.compensation_currency,
        estimate_status: item.estimate_status,
      })),
      ...(data.cases || []).map((item) => ({
        id: item.id,
        code: item.case_code,
        status: item.status,
        substatus: item.payout_status,
        flight: item.airline || "",
        route: [item.route_from, item.route_to].filter(Boolean).join(" -> "),
        kind: "case",
        created_at: item.created_at,
      })),
    ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
  };
}

export async function fetchClientClaimDetails(claimId) {
  const client = requireSupabase();

  const caseResponse = await client
    .from("cases")
    .select("id, case_code, lead_id, status, payout_status, airline, route_from, route_to, flight_date, issue_type, legal_basis, estimated_compensation, created_at, approved_at, paid_at, notes")
    .eq("id", claimId)
    .maybeSingle();

  if (caseResponse.error) {
    throw caseResponse.error;
  }

  if (caseResponse.data) {
    const [documents, history, finance, leadEstimate] = await Promise.all([
      client.from("case_documents").select("id, document_type, file_name, status, created_at").eq("case_id", claimId).is("deleted_at", null).order("created_at", { ascending: false }),
      client.from("case_status_history").select("id, previous_status, next_status, note, created_at").eq("case_id", claimId).order("created_at", { ascending: false }),
      client.from("case_finance").select("id, compensation_amount, customer_payout, payment_status, currency, customer_paid_at").eq("case_id", claimId).maybeSingle(),
      caseResponse.data.lead_id
        ? client
          .from("leads")
          .select("id, lead_code, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
          .eq("id", caseResponse.data.lead_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (documents.error) throw documents.error;
    if (history.error) throw history.error;
    if (finance.error && !isMissingColumnError(finance.error)) throw finance.error;
    if (leadEstimate.error && !isMissingColumnError(leadEstimate.error)) throw leadEstimate.error;

    return {
      type: "case",
      case: caseResponse.data,
      leadEstimate: await withEstimateFallback(leadEstimate.data || null),
      documents: documents.data || [],
      history: history.data || [],
      finance: finance.data || null,
    };
  }

  const leadResponse = await client
    .from("leads")
    .select("id, lead_code, status, stage, eligibility_status, airline, departure_airport, arrival_airport, scheduled_departure_date, disruption_type, created_at, submitted_at, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
    .eq("id", claimId)
    .maybeSingle();

  if (leadResponse.error) {
    throw leadResponse.error;
  }

  const documents = await client
    .from("lead_documents")
    .select("id, document_type, file_name, status, created_at")
    .eq("lead_id", claimId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (documents.error) {
    throw documents.error;
  }

  return {
    type: "lead",
    lead: await withEstimateFallback(leadResponse.data),
    documents: documents.data || [],
    history: [],
    finance: null,
  };
}

export async function fetchClientDocuments() {
  const client = requireSupabase();
  const [leadDocuments, caseDocuments] = await Promise.all([
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_name, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("case_documents")
      .select("id, case_id, document_type, file_name, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (leadDocuments.error) {
    throw leadDocuments.error;
  }

  if (caseDocuments.error) {
    throw caseDocuments.error;
  }

  return {
    documents: [
      ...(leadDocuments.data || []).map((item) => ({ ...item, ownerType: "lead" })),
      ...(caseDocuments.data || []).map((item) => ({ ...item, ownerType: "case" })),
    ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
  };
}

export async function saveClientProfile(input) {
  return updateCurrentProfile(input);
}
