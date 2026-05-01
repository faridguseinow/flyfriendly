import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser } from "./authService.js";
import { attachReferralToLead, getStoredReferralData } from "./referralService.js";

const LEAD_DOCUMENT_BUCKET = "claim-lead-documents";

function isMissingTableError(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function mapEdgeFunctionError(error, functionName) {
  const message = String(error?.message || "");

  if (message.includes("Failed to send a request to the Edge Function")) {
    return new Error(
      `The ${functionName} Edge Function is not reachable. Deploy the function in Supabase and verify its secrets.`,
    );
  }

  if (message.includes("non-2xx status code")) {
    return new Error(
      `The ${functionName} Edge Function returned an error. Check Supabase Function logs and secrets.`,
    );
  }

  return error instanceof Error ? error : new Error(message || `${functionName} failed.`);
}

function leadCode() {
  return `FL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function parseFlightDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return value;

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function baseLeadPayload(data = {}) {
  return {
    departure_airport_id: data.departureAirportSource === "supabase" ? data.departureAirportId || null : null,
    arrival_airport_id: data.destinationAirportSource === "supabase" ? data.destinationAirportId || null : null,
    departure_airport: data.departure || null,
    arrival_airport: data.destination || null,
    airline_id: data.airlineSource === "supabase" ? data.airlineId || null : null,
    airline: data.airline || null,
    flight_number: data.flightNumber || null,
    scheduled_departure_date: parseFlightDate(data.date),
    delay_duration: data.delayDuration || null,
    disruption_type: data.delayDuration === "cancelled" ? "cancellation" : "delay",
    is_direct: data.direct ? data.direct === "yes" : null,
    full_name: data.fullName || null,
    email: data.email || null,
    phone: data.phone || null,
    city: data.city || null,
    preferred_language: data.preferredLanguage || data.language || null,
    has_whatsapp: Boolean(data.whatsapp),
    reason: data.reason || null,
    payload: data,
  };
}

export async function createLead(data = {}, source = "claim_flow") {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const referral = getStoredReferralData();
  const id = crypto.randomUUID();
  const lead_code = leadCode();
  const payload = {
    id,
    lead_code,
    source,
    status: "new",
    stage: "eligibility",
    profile_id: user?.id || null,
    referral_partner_id: referral?.partnerId || null,
    source_details: referral ? {
      referral_code: referral.referralCode,
      referral_source_url: referral.sourceUrl || null,
      referral_source_path: referral.sourcePath || null,
    } : undefined,
    ...baseLeadPayload(data),
  };

  const { error } = await client
    .from("leads")
    .insert(payload);

  if (error) {
    throw error;
  }

  if (referral?.partnerId) {
    attachReferralToLead(id).catch((attachError) => {
      console.warn("Referral attribution could not be attached to lead.", attachError);
    });
  }

  return { id, lead_code };
}

export async function linkLeadToCurrentProfile(leadId, data = {}) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  if (!user) {
    return false;
  }

  const { error } = await client
    .from("leads")
    .update({
      profile_id: user.id,
      full_name: data.fullName || undefined,
      email: data.email || user.email || null,
      phone: data.phone || undefined,
      preferred_language: data.preferredLanguage || data.language || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    throw error;
  }

  await client
    .from("referrals")
    .update({
      client_profile_id: user.id,
      status: "lead_created",
      updated_at: new Date().toISOString(),
    })
    .eq("lead_id", leadId);

  return true;
}

export async function saveLeadStep(leadId, stage, data = {}) {
  const client = requireSupabase();
  const { error } = await client
    .from("leads")
    .update({
      stage,
      updated_at: new Date().toISOString(),
      ...baseLeadPayload(data),
    })
    .eq("id", leadId);

  if (error) {
    throw error;
  }
}

export async function submitLead(leadId, data = {}, eligibilityStatus = "eligible") {
  const client = requireSupabase();
  const { error } = await client
    .from("leads")
    .update({
      status: eligibilityStatus === "not_eligible" ? "not_eligible" : "submitted",
      stage: eligibilityStatus === "not_eligible" ? "denied" : "approved",
      eligibility_status: eligibilityStatus,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...baseLeadPayload(data),
    })
    .eq("id", leadId);

  if (error) {
    if (isMissingTableError(error)) {
      return;
    }

    throw error;
  }
}

export async function sendLeadConfirmationEmail(leadId) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("send-claim-confirmation", {
    body: { leadId },
  });

  if (error) {
    throw mapEdgeFunctionError(error, "send-claim-confirmation");
  }

  return data;
}

export async function submitClaimServerSide(leadId, data = {}) {
  const client = requireSupabase();
  const referral = getStoredReferralData();
  const { data: response, error } = await client.functions.invoke("submit-claim", {
    body: {
      leadId,
      data,
      referral: referral
        ? {
            referralCode: referral.referralCode,
            sourceUrl: referral.sourceUrl || null,
            sourcePath: referral.sourcePath || null,
            storedAt: referral.storedAt || null,
          }
        : null,
    },
  });

  if (error) {
    throw mapEdgeFunctionError(error, "submit-claim");
  }

  if (response?.error) {
    throw new Error(response.error);
  }

  return response;
}

export async function saveLeadSignature(leadId, data = {}) {
  const client = requireSupabase();
  const { error } = await client
    .from("lead_signatures")
    .insert({
      lead_id: leadId,
      signer_name: data.fullName || null,
      signer_email: data.email || null,
      signature_data_url: data.signatureDataUrl,
      terms_accepted: Boolean(data.termsAccepted),
      signed_at: new Date().toISOString(),
      payload: {
        route: {
          departure: data.departure || null,
          destination: data.destination || null,
          airline: data.airline || null,
          date: data.date || null,
        },
      },
    });

  if (error) {
    throw error;
  }
}

export async function uploadLeadDocument(leadId, documentType, file) {
  const client = requireSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `leads/${leadId}/${documentType}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from(LEAD_DOCUMENT_BUCKET)
    .upload(path, file, { upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { error: metadataError } = await client.from("lead_documents").insert({
    lead_id: leadId,
    document_type: documentType,
    file_path: path,
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
    status: "uploaded",
  });

  if (metadataError) {
    throw metadataError;
  }

  return path;
}

export async function saveLeadDocuments(leadId, data, files) {
  for (const [documentType, file] of Object.entries(files)) {
    if (file) {
      await uploadLeadDocument(leadId, documentType, file);
    }
  }

  await saveLeadStep(leadId, "finish", data);
}
