import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser } from "./authService.js";

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

export async function fetchAdminOverview() {
  const client = requireSupabase();

  const [leads, claims, profiles, documents, leadDocuments, events, eligibility] = await Promise.all([
    client
      .from("leads")
      .select("id, lead_code, status, stage, eligibility_status, departure_airport, arrival_airport, airline, full_name, email, phone, created_at, updated_at")
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
      .select("id, claim_id, user_id, document_type, file_name, mime_type, file_size, status, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_name, mime_type, file_size, status, created_at")
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

  return {
    leads: leads.data || [],
    claims: claims.data || [],
    profiles: profiles.data || [],
    documents: [...(leadDocuments.data || []), ...(documents.data || [])],
    events: events.data || [],
    eligibility: eligibility.data || [],
  };
}

export async function updateLeadStatus(leadId, status) {
  const client = requireSupabase();
  const { error } = await client
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    throw error;
  }
}

export async function updateClaimStatus(claimId, status) {
  const client = requireSupabase();
  const { error } = await client
    .from("claims")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) {
    throw error;
  }
}

export async function updateProfileRole(profileId, role) {
  const client = requireSupabase();
  const { error } = await client
    .from("profiles")
    .update({ role })
    .eq("id", profileId);

  if (error) {
    throw error;
  }
}
