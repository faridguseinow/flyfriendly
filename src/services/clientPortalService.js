import { requireSupabase } from "../lib/supabase.js";
import { getCurrentProfile, updateCurrentProfile } from "./authService.js";

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || error?.message?.includes("column");
}

export async function fetchClientDashboardData() {
  const client = requireSupabase();

  const [profile, leads, cases, finance] = await Promise.all([
    getCurrentProfile(),
    client
      .from("leads")
      .select("id, lead_code, status, stage, eligibility_status, departure_airport, arrival_airport, airline, flight_number, created_at, submitted_at")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("cases")
      .select("id, case_code, status, payout_status, airline, flight_number, route_from, route_to, estimated_compensation, created_at, approved_at, paid_at")
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

  return {
    profile,
    leads: leads.data || [],
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
        flight: [item.airline, item.flight_number].filter(Boolean).join(" "),
        route: [item.departure_airport, item.arrival_airport].filter(Boolean).join(" -> "),
        kind: "lead",
        created_at: item.created_at,
      })),
      ...(data.cases || []).map((item) => ({
        id: item.id,
        code: item.case_code,
        status: item.status,
        substatus: item.payout_status,
        flight: [item.airline, item.flight_number].filter(Boolean).join(" "),
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
    .select("id, case_code, status, payout_status, airline, flight_number, route_from, route_to, flight_date, issue_type, legal_basis, estimated_compensation, created_at, approved_at, paid_at, notes")
    .eq("id", claimId)
    .maybeSingle();

  if (caseResponse.error) {
    throw caseResponse.error;
  }

  if (caseResponse.data) {
    const [documents, history, finance] = await Promise.all([
      client.from("case_documents").select("id, document_type, file_name, status, created_at").eq("case_id", claimId).is("deleted_at", null).order("created_at", { ascending: false }),
      client.from("case_status_history").select("id, previous_status, next_status, note, created_at").eq("case_id", claimId).order("created_at", { ascending: false }),
      client.from("case_finance").select("id, compensation_amount, customer_payout, payment_status, currency, customer_paid_at").eq("case_id", claimId).maybeSingle(),
    ]);

    if (documents.error) throw documents.error;
    if (history.error) throw history.error;
    if (finance.error && !isMissingColumnError(finance.error)) throw finance.error;

    return {
      type: "case",
      case: caseResponse.data,
      documents: documents.data || [],
      history: history.data || [],
      finance: finance.data || null,
    };
  }

  const leadResponse = await client
    .from("leads")
    .select("id, lead_code, status, stage, eligibility_status, airline, flight_number, departure_airport, arrival_airport, scheduled_departure_date, disruption_type, created_at, submitted_at")
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
    lead: leadResponse.data,
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
