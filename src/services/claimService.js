import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser } from "./authService.js";

const STORAGE_BUCKET = "claim-documents";

function parseFlightDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return value;

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function eventPayload(type, message) {
  return {
    event_type: type,
    payload: {
      message,
      source: "frontend",
    },
  };
}

function isMissingColumnError(error) {
  return error?.message?.includes("schema cache") || error?.code === "PGRST204";
}

export async function createDraftClaim() {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Please sign in before starting a claim.");
  }

  const { data, error } = await client
    .from("claims")
    .insert({
      user_id: user.id,
      claim_code: `FF-${Date.now().toString(36).toUpperCase()}`,
      status: "draft",
      eligibility_status: "pending",
      currency: "EUR",
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await addClaimEvent(data.id, "claim_created", "Claim draft created.");

  return data.id;
}

export async function updateClaimStep(claimId, step, status = "draft") {
  const client = requireSupabase();
  const { error } = await client
    .from("claims")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (error) {
    throw error;
  }
}

export async function saveEligibilityCheck(claimId, data) {
  const client = requireSupabase();
  const payload = {
    claim_id: claimId,
    departure_airport: data.departure || null,
    arrival_airport: data.destination || null,
    airline_code: data.airline || null,
    flight_number: data.flightNumber || null,
    scheduled_departure_date: parseFlightDate(data.date),
    is_direct: data.direct ? data.direct === "yes" : null,
    raw_user_input: {
      ...data,
      disruption_type: data.delayDuration === "cancelled" ? "cancellation" : "delay",
      delay_duration: data.delayDuration || null,
    },
  };

  const { data: existing, error: lookupError } = await client
    .from("flight_checks")
    .select("id")
    .eq("claim_id", claimId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  let { error } = existing
    ? await client.from("flight_checks").update(payload).eq("id", existing.id)
    : await client.from("flight_checks").insert(payload);

  if (isMissingColumnError(error)) {
    const fallbackPayload = {
      claim_id: claimId,
      raw_user_input: data,
    };
    const fallback = existing
      ? await client.from("flight_checks").update(fallbackPayload).eq("id", existing.id)
      : await client.from("flight_checks").insert(fallbackPayload);
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  await updateClaimStep(claimId, "contact");
  await addClaimEvent(claimId, "eligibility_saved", "Eligibility form saved.");
}

export async function saveContactInformation(claimId, data) {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Please sign in before saving contact information.");
  }

  const { error: profileError } = await client
    .from("profiles")
    .update({
      full_name: data.fullName || null,
      email: data.email || user.email,
      phone: data.phone || null,
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  const { data: existing, error: lookupError } = await client
    .from("flight_checks")
    .select("id, raw_user_input")
    .eq("claim_id", claimId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    let { error } = await client
      .from("flight_checks")
      .update({
        raw_user_input: { ...(existing.raw_user_input || {}), contact: data },
      })
      .eq("id", existing.id);

    if (isMissingColumnError(error)) {
      const fallback = await client
        .from("flight_checks")
        .update({
          raw_user_input: { ...(existing.raw_user_input || {}), contact: data },
        })
        .eq("id", existing.id);
      error = fallback.error;
    }

    if (error) {
      throw error;
    }
  }

  await updateClaimStep(claimId, "documents");
  await addClaimEvent(claimId, "contact_saved", "Contact information saved.");
}

export async function uploadClaimDocument(claimId, documentType, file) {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Please sign in before uploading documents.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${user.id}/${claimId}/${documentType}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { error: metadataError } = await client.from("documents").insert({
    claim_id: claimId,
    user_id: user.id,
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

  await addClaimEvent(claimId, "document_uploaded", `${documentType} uploaded.`);

  return path;
}

export async function saveDocumentStep(claimId, data, files) {
  const client = requireSupabase();

  for (const [documentType, file] of Object.entries(files)) {
    if (file) {
      await uploadClaimDocument(claimId, documentType, file);
    }
  }

  const { data: existing, error: lookupError } = await client
    .from("flight_checks")
    .select("id, raw_user_input")
    .eq("claim_id", claimId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    let { error } = await client
      .from("flight_checks")
      .update({
        raw_user_input: { ...(existing.raw_user_input || {}), reason: data.reason || null },
      })
      .eq("id", existing.id);

    if (isMissingColumnError(error)) {
      const fallback = await client
        .from("flight_checks")
        .update({
          raw_user_input: { ...(existing.raw_user_input || {}), reason: data.reason || null },
        })
        .eq("id", existing.id);
      error = fallback.error;
    }

    if (error) {
      throw error;
    }
  }

  await updateClaimStep(claimId, "finish");
  await addClaimEvent(claimId, "documents_saved", "Document step saved.");
}

export async function submitClaim(claimId, isEligible) {
  const client = requireSupabase();
  const status = isEligible ? "submitted" : "not_eligible";

  await updateClaimStep(claimId, isEligible ? "approved" : "denied", status);

  let { error: resultError } = await client.from("eligibility_results").insert({
    claim_id: claimId,
    stage: "frontend_precheck",
    eligible: isEligible,
    confidence: isEligible ? 0.7 : 0.9,
    compensation_amount: isEligible ? 600 : 0,
    currency: "EUR",
    legal_basis: isEligible
      ? "Frontend preliminary check marked the claim as eligible."
      : "Frontend preliminary check marked the claim as not eligible.",
    reason: isEligible ? "Delay over 3 hours or cancellation." : "Delay less than 3 hours.",
  });

  if (isMissingColumnError(resultError)) {
    const fallback = await client.from("eligibility_results").insert({
      claim_id: claimId,
      stage: "frontend_precheck",
      eligible: isEligible,
    });
    resultError = fallback.error;
  }

  if (resultError) {
    throw resultError;
  }

  await addClaimEvent(claimId, isEligible ? "claim_submitted" : "claim_not_eligible", status);
}

export async function addClaimEvent(claimId, type, message) {
  const client = requireSupabase();
  const { error } = await client.from("claim_events").insert({
    claim_id: claimId,
    ...eventPayload(type, message),
  });

  if (error) {
    throw error;
  }
}
