import { requireSupabase } from "../lib/supabase.js";
import { buildLeadCode, buildCaseCode, generateRandomRecordSuffix } from "../lib/recordCodes.js";
import { getCurrentProfile, getCurrentUser } from "./authService.js";
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

function isUniqueViolation(error) {
  return error?.code === "23505" || String(error?.message || "").toLowerCase().includes("duplicate key");
}

function isPassportDocumentType(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("passport") || normalized.includes("id");
}

async function generateUniqueLeadCaseSuffix(client) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = generateRandomRecordSuffix();
    const nextLeadCode = buildLeadCode(suffix);
    const nextCaseCode = buildCaseCode(suffix);

    const [leadMatch, caseMatch] = await Promise.all([
      client.from("leads").select("id").eq("lead_code", nextLeadCode).maybeSingle(),
      client.from("cases").select("id").eq("case_code", nextCaseCode).maybeSingle(),
    ]);

    if (leadMatch.error && leadMatch.error.code !== "PGRST116") {
      throw leadMatch.error;
    }

    if (caseMatch.error && caseMatch.error.code !== "PGRST116") {
      throw caseMatch.error;
    }

    if (!leadMatch.data?.id && !caseMatch.data?.id) {
      return suffix;
    }
  }

  throw new Error("Could not generate a unique claim reference.");
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
  const connectionAirport = data.direct === "no" ? (data.connectionCity || null) : null;
  return {
    departure_airport_id: data.departureAirportId || null,
    arrival_airport_id: data.destinationAirportId || null,
    departure_airport: data.departure || null,
    arrival_airport: data.destination || null,
    airline_id: data.airlineSource === "supabase" ? data.airlineId || null : null,
    airline: data.airline || null,
    scheduled_departure_date: parseFlightDate(data.date),
    delay_duration: data.delayDuration || null,
    disruption_type: data.delayDuration === "cancelled" ? "cancellation" : "delay",
    is_direct: data.direct ? data.direct === "yes" : null,
    flight_number: connectionAirport,
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
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = await generateUniqueLeadCaseSuffix(client);
    const id = crypto.randomUUID();
    const lead_code = buildLeadCode(suffix);
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
      if (isUniqueViolation(error)) {
        continue;
      }

      throw error;
    }

    if (referral?.partnerId) {
      attachReferralToLead(id, data).catch((attachError) => {
        console.warn("Referral attribution could not be attached to lead.", attachError);
      });
    }

    return { id, lead_code };
  }

  throw new Error("Could not generate a unique claim reference.");
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

export async function fetchClaimReuseData() {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  if (!user) {
    return null;
  }

  const [profile, leadsResponse] = await Promise.all([
    getCurrentProfile().catch(() => null),
    client
      .from("leads")
      .select("id, full_name, email, phone, city, preferred_language, has_whatsapp, payload, created_at, updated_at, submitted_at")
      .eq("profile_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  if (leadsResponse.error) {
    throw leadsResponse.error;
  }

  const leads = leadsResponse.data || [];
  const leadIds = leads.map((item) => item.id).filter(Boolean);
  const latestLead = leads[0] || null;

  let passportDocument = null;
  let signature = null;

  if (leadIds.length) {
    const [leadDocumentsResponse, signaturesResponse] = await Promise.all([
      client
        .from("lead_documents")
        .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
        .in("lead_id", leadIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("lead_signatures")
        .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (leadDocumentsResponse.error) {
      throw leadDocumentsResponse.error;
    }

    if (signaturesResponse.error && !isMissingTableError(signaturesResponse.error)) {
      throw signaturesResponse.error;
    }

    passportDocument = (leadDocumentsResponse.data || []).find((item) => isPassportDocumentType(item.document_type)) || null;
    signature = (signaturesResponse.data || []).find((item) => item.signature_data_url && item.terms_accepted) || null;
  }

  return {
    fullName: profile?.full_name || latestLead?.full_name || latestLead?.payload?.fullName || user.user_metadata?.full_name || user.user_metadata?.name || "",
    email: profile?.email || latestLead?.email || latestLead?.payload?.email || user.email || "",
    phone: profile?.phone || latestLead?.phone || latestLead?.payload?.phone || "",
    city: latestLead?.city || latestLead?.payload?.city || "",
    preferredLanguage: profile?.preferred_language || latestLead?.preferred_language || latestLead?.payload?.preferredLanguage || latestLead?.payload?.language || null,
    whatsapp: typeof latestLead?.has_whatsapp === "boolean"
      ? latestLead.has_whatsapp
      : Boolean(latestLead?.payload?.whatsapp),
    passportDocument,
    signatureDataUrl: signature?.signature_data_url || "",
    termsAccepted: Boolean(signature?.terms_accepted),
  };
}

export async function submitClaimServerSide(leadId, data = {}) {
  const client = requireSupabase();
  const referral = getStoredReferralData();
  const supabaseUrl = client.supabaseUrl;
  const publishableKey = client.supabaseKey;
  const response = await fetch(`${supabaseUrl}/functions/v1/submit-claim`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = [payload?.error, payload?.code, payload?.details].filter(Boolean).join(" | ");
    throw new Error(details || "submit-claim failed.");
  }

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return payload;
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

async function reuseLeadDocument(leadId, document = null) {
  if (!leadId || !document?.file_path) {
    return null;
  }

  const client = requireSupabase();
  const { error } = await client.from("lead_documents").insert({
    lead_id: leadId,
    document_type: document.document_type || "passport",
    file_path: document.file_path,
    file_name: document.file_name || "passport",
    mime_type: document.mime_type || null,
    file_size: document.file_size || null,
    status: "uploaded",
  });

  if (error) {
    throw error;
  }

  return document.file_path;
}

export async function saveLeadDocuments(leadId, data, files, options = {}) {
  if (!files?.passport && options?.reusablePassportDocument) {
    await reuseLeadDocument(leadId, options.reusablePassportDocument);
  }

  for (const [documentType, file] of Object.entries(files)) {
    if (file) {
      await uploadLeadDocument(leadId, documentType, file);
    }
  }

  await saveLeadStep(leadId, "finish", data);
}
