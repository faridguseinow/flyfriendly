import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildEstimateExplanation,
  calculateDistanceCompensationEstimate,
} from "../_shared/compensation-distance.ts";
import { buildPublicAuthUrl, getPublicSiteUrl } from "../_shared/site-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ClaimPayload = Record<string, unknown> & {
  fullName?: string;
  email?: string;
  phone?: string;
  departure?: string;
  destination?: string;
  airline?: string;
  date?: string;
  delayDuration?: string;
  city?: string;
  reason?: string;
  language?: string;
  preferredLanguage?: string;
  signatureDataUrl?: string;
  termsAccepted?: boolean;
  departureAirportSource?: string | null;
  destinationAirportSource?: string | null;
  airlineSource?: string | null;
  departureAirportId?: number | null;
  destinationAirportId?: number | null;
  airlineId?: number | null;
  direct?: string | boolean | null;
  whatsapp?: boolean;
};

type ReferralPayload = {
  referralCode?: string;
  sourceUrl?: string;
  sourcePath?: string;
  storedAt?: string;
} | null;

type RequestBody = {
  leadId?: string;
  data?: ClaimPayload;
  referral?: ReferralPayload;
};

type PortalAccountResult = {
  userId: string;
  email: string;
  isNewUser: boolean;
  accessLink: string | null;
};

type AirportRow = {
  id: number;
  ident: string | null;
  name: string | null;
  municipality: string | null;
  iso_country: string | null;
  country_name?: string | null;
  iata_code: string | null;
  icao_code: string | null;
  latitude_deg: number | null;
  longitude_deg: number | null;
};

const DUPLICATE_LOOKBACK_DAYS = 180;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const RESERVED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getEmailDomain(email: string) {
  return email.split("@").pop() || "";
}

function isReservedEmailDomain(domain: string) {
  return RESERVED_EMAIL_DOMAINS.has(domain)
    || domain.endsWith(".example")
    || domain.endsWith(".invalid")
    || domain.endsWith(".localhost")
    || domain.endsWith(".test")
    || domain.endsWith(".local");
}

function isValidEmailDomainSyntax(domain: string) {
  if (!domain || domain.length > 253 || !domain.includes(".")) return false;

  return domain.split(".").every((label) => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
}

async function dnsHasRecords(domain: string, type: "MX" | "A" | "AAAA") {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );

  if (!response.ok) {
    throw new Error(`DNS lookup failed for ${domain}.`);
  }

  const payload = await response.json() as { Status?: number; Answer?: unknown[] };
  if (payload.Status === 3) return false;
  return payload.Status === 0 && Array.isArray(payload.Answer) && payload.Answer.length > 0;
}

async function assertEmailCanReceiveMail(emailValue: unknown) {
  const email = normalizeEmail(emailValue);
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const domain = getEmailDomain(email);
  if (!isValidEmailDomainSyntax(domain) || isReservedEmailDomain(domain)) {
    throw new Error("Please enter a real email address that can receive mail.");
  }

  try {
    const hasMx = await dnsHasRecords(domain, "MX");
    if (hasMx) return;

    const [hasA, hasAaaa] = await Promise.all([
      dnsHasRecords(domain, "A"),
      dnsHasRecords(domain, "AAAA"),
    ]);

    if (!hasA && !hasAaaa) {
      throw new Error("Please enter an email address with a valid receiving domain.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Please enter")) {
      throw error;
    }

    console.warn("submit-claim email_dns_lookup_inconclusive", {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeRecoveryActionLink(actionLink: string | null | undefined, language: string) {
  const canonicalUrl = buildPublicAuthUrl("/auth/reset-password");
  const rawLink = String(actionLink || "").trim();

  if (!rawLink) {
    return canonicalUrl;
  }

  try {
    const parsed = new URL(rawLink);
    return `${canonicalUrl}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return canonicalUrl;
  }
}

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    const source = error as Error & { code?: string; details?: string; hint?: string };
    return {
      message: source.message,
      code: source.code || null,
      details: source.details || null,
      hint: source.hint || null,
    };
  }

  if (error && typeof error === "object") {
    const source = error as { message?: string; code?: string; details?: string; hint?: string };
    return {
      message: source.message || "Claim submission failed.",
      code: source.code || null,
      details: source.details || null,
      hint: source.hint || null,
    };
  }

  return {
    message: String(error || "Claim submission failed."),
    code: null,
    details: null,
    hint: null,
  };
}

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function cleanObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function normalizeComparableText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sanitizeClaimPayloadForLead(data: ClaimPayload) {
  const payload = { ...data } as Record<string, unknown>;

  [
    "signatureDataUrl",
    "termsAccepted",
    "files",
    "documents",
    "uploadedFiles",
    "passport",
    "passportDocument",
    "boardingPass",
    "boarding_pass",
    "documentBlobs",
    "rawDocuments",
  ].forEach((key) => {
    delete payload[key];
  });

  return payload;
}

function parseFlightDate(value: unknown) {
  if (!value) return null;
  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) return stringValue;

  const match = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return stringValue;

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeLeadPayload(data: ClaimPayload) {
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
    is_direct: typeof data.direct === "boolean" ? data.direct : data.direct ? data.direct === "yes" : null,
    full_name: data.fullName || null,
    email: data.email || null,
    phone: data.phone || null,
    city: data.city || null,
    preferred_language: data.preferredLanguage || data.language || null,
    has_whatsapp: Boolean(data.whatsapp),
    reason: data.reason || null,
    payload: sanitizeClaimPayloadForLead(data),
  };
}

function buildPendingReviewEstimate(
  fromAirport: AirportRow | null,
  toAirport: AirportRow | null,
  reasonCodes: string[],
) {
  return {
    distanceKm: null,
    distanceBand: "unknown",
    estimatedCompensationEur: null,
    currency: "EUR",
    estimateStatus: "pending_review",
    reasonCodes,
    estimateExplanation: buildEstimateExplanation({
      fromAirport,
      toAirport,
      distanceKm: null,
      band: "unknown",
      amount: null,
      reasonCodes,
    }),
  };
}

async function calculateLeadEstimate(
  supabase: ReturnType<typeof createClient>,
  data: ClaimPayload,
) {
  const departureAirportId = data.departureAirportId || null;
  const arrivalAirportId = data.destinationAirportId || null;

  if (!departureAirportId || !arrivalAirportId) {
    return buildPendingReviewEstimate(null, null, [
      !departureAirportId ? "missing_departure_airport_id" : null,
      !arrivalAirportId ? "missing_arrival_airport_id" : null,
    ].filter(Boolean) as string[]);
  }

  const airportLookup = await supabase
    .from("airports")
    .select("id, ident, name, municipality, iso_country, country_name, iata_code, icao_code, latitude_deg, longitude_deg")
    .in("id", [departureAirportId, arrivalAirportId]);

  if (airportLookup.error) {
    console.warn("submit-claim estimate_airport_lookup_failed", {
      departureAirportId,
      arrivalAirportId,
      error: airportLookup.error.message,
    });

    return buildPendingReviewEstimate(null, null, ["airport_lookup_failed"]);
  }

  const airports = Array.isArray(airportLookup.data) ? airportLookup.data as AirportRow[] : [];
  const fromAirport = airports.find((airport) => airport.id === departureAirportId) || null;
  const toAirport = airports.find((airport) => airport.id === arrivalAirportId) || null;

  if (!fromAirport || !toAirport) {
    return buildPendingReviewEstimate(fromAirport, toAirport, [
      !fromAirport ? "departure_airport_not_found" : null,
      !toAirport ? "arrival_airport_not_found" : null,
    ].filter(Boolean) as string[]);
  }

  return calculateDistanceCompensationEstimate({
    fromAirport,
    toAirport,
  });
}

function validateClaimInput(data: ClaimPayload) {
  if (!String(data.fullName || "").trim()) {
    throw new Error("Full name is required.");
  }

  const email = normalizeEmail(data.email);
  if (!email) {
    throw new Error("Email is required.");
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("Please enter a valid email address.");
  }

  if (!String(data.phone || "").trim()) {
    throw new Error("Phone is required.");
  }

  if (!String(data.date || "").trim()) {
    throw new Error("Flight date is required.");
  }

  if (!String(data.airline || "").trim()) {
    throw new Error("Airline is required.");
  }

  if (!String(data.departure || "").trim() || !String(data.destination || "").trim()) {
    throw new Error("Departure and destination are required.");
  }

  if (!String(data.delayDuration || "").trim()) {
    throw new Error("Disruption type is required.");
  }

  if (!data.signatureDataUrl || !data.termsAccepted) {
    throw new Error("Signature and accepted terms are required.");
  }
}

function getDuplicateClaimMessage(language: string) {
  if (language === "ru") {
    return "Похоже, вы уже отправили эту заявку. Проверьте email или клиентский кабинет.";
  }

  if (language === "az") {
    return "Görünür, bu müraciəti artıq göndərmisiniz. Emailinizi və ya şəxsi kabinetinizi yoxlayın.";
  }

  return "It looks like you already submitted this claim. Please check your email or client portal.";
}

function isDuplicateLeadMatch(lead: Record<string, unknown>, data: ClaimPayload) {
  const emailMatches = normalizeComparableText(lead.email) === normalizeComparableText(data.email);
  const fullNameMatches = normalizeComparableText(lead.full_name) === normalizeComparableText(data.fullName);
  const airlineMatches = normalizeComparableText(lead.airline) === normalizeComparableText(data.airline);
  const departureMatches = normalizeComparableText(lead.departure_airport) === normalizeComparableText(data.departure);
  const arrivalMatches = normalizeComparableText(lead.arrival_airport) === normalizeComparableText(data.destination);
  const dateMatches = String(lead.scheduled_departure_date || "") === String(parseFlightDate(data.date) || "");
  const disruptionMatches = normalizeComparableText(lead.delay_duration) === normalizeComparableText(data.delayDuration);

  return emailMatches
    && fullNameMatches
    && airlineMatches
    && departureMatches
    && arrivalMatches
    && dateMatches
    && disruptionMatches;
}

async function findDuplicateLead(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  data: ClaimPayload,
) {
  const flightDate = parseFlightDate(data.date);
  const normalizedEmail = String(data.email || "").trim().toLowerCase();
  if (!normalizedEmail || !flightDate) {
    return null;
  }

  const lookbackDate = new Date();
  lookbackDate.setUTCDate(lookbackDate.getUTCDate() - DUPLICATE_LOOKBACK_DAYS);

  const duplicateQuery = await supabase
    .from("leads")
    .select("id, lead_code, status, full_name, email, airline, departure_airport, arrival_airport, scheduled_departure_date, delay_duration, submitted_at, created_at")
    .neq("id", leadId)
    .gte("created_at", lookbackDate.toISOString())
    .in("status", ["submitted", "converted"])
    .ilike("email", normalizedEmail)
    .eq("scheduled_departure_date", flightDate)
    .order("created_at", { ascending: false })
    .limit(25);

  if (duplicateQuery.error) {
    throw duplicateQuery.error;
  }

  const duplicateLead = (duplicateQuery.data || []).find((lead) => isDuplicateLeadMatch(lead as Record<string, unknown>, data)) || null;
  if (!duplicateLead?.id) {
    return null;
  }

  const { error: duplicateFlagError } = await supabase
    .from("leads")
    .update({
      duplicate_of_lead_id: duplicateLead.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (duplicateFlagError && duplicateFlagError.code !== "PGRST204" && duplicateFlagError.code !== "42703") {
    throw duplicateFlagError;
  }

  return duplicateLead;
}

function randomPassword() {
  return `FlyFriendly!${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function isUserMissingError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("user not found")
    || message.includes("user with this email not found")
    || message.includes("not_found")
    || message.includes("no user")
    || message.includes("user does not exist");
}

async function createOrRecoverPortalAccount(
  supabase: ReturnType<typeof createClient>,
  siteUrl: string,
  language: string,
  data: ClaimPayload,
): Promise<PortalAccountResult> {
  const email = String(data.email || "").trim().toLowerCase();
  const redirectTo = buildPublicAuthUrl("/auth/reset-password");

  const recoveryAttempt = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  });

  if (!recoveryAttempt.error && recoveryAttempt.data.user) {
    return {
      userId: recoveryAttempt.data.user.id,
      email,
      isNewUser: false,
      accessLink: normalizeRecoveryActionLink(recoveryAttempt.data.properties?.action_link || null, language),
    };
  }

  if (!isUserMissingError(recoveryAttempt.error)) {
    throw recoveryAttempt.error;
  }

  const createdUser = await supabase.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: cleanObject({
      full_name: String(data.fullName || "").trim() || null,
      phone: String(data.phone || "").trim() || null,
    }),
  });

  if (createdUser.error || !createdUser.data.user) {
    throw createdUser.error || new Error("Could not create client account.");
  }

  const newRecoveryAttempt = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  });

  if (newRecoveryAttempt.error || !newRecoveryAttempt.data.user) {
    throw newRecoveryAttempt.error || new Error("Could not generate account access link.");
  }

  return {
    userId: newRecoveryAttempt.data.user.id,
    email,
    isNewUser: true,
    accessLink: normalizeRecoveryActionLink(newRecoveryAttempt.data.properties?.action_link || null, language),
  };
}

async function upsertClientProfile(
  supabase: ReturnType<typeof createClient>,
  account: PortalAccountResult,
  data: ClaimPayload,
) {
  const profilePayload = {
    id: account.userId,
    email: account.email,
    full_name: String(data.fullName || "").trim() || null,
    phone: String(data.phone || "").trim() || null,
    status: "active",
  };

  const insertResult = await supabase
    .from("profiles")
    .insert({
      ...profilePayload,
      role: null,
    });

  if (!insertResult.error) {
    return;
  }

  if (insertResult.error.code !== "23505") {
    throw insertResult.error;
  }

  const { error } = await supabase
    .from("profiles")
    .update(profilePayload)
    .eq("id", account.userId);

  if (error) {
    throw error;
  }
}

async function attachReferralIfPresent(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  leadCode: string | null,
  profileId: string,
  referral: ReferralPayload,
  data: ClaimPayload,
) {
  const code = String(referral?.referralCode || "").trim();
  if (!code) {
    return null;
  }

  const partnerLookup = await supabase
    .rpc("get_partner_by_referral_code", { input_code: code });

  if (partnerLookup.error) {
    throw partnerLookup.error;
  }

  const partner = Array.isArray(partnerLookup.data) ? partnerLookup.data[0] : partnerLookup.data;
  if (!partner?.id) {
    return null;
  }

  const disruptionType = data.delayDuration === "cancelled" ? "cancellation" : data.delayDuration ? "delay" : null;
  const attributionMeta = {
    stored_at: referral?.storedAt || new Date().toISOString(),
    partner_referral_code: partner.referral_code || code,
    lead_code: leadCode || null,
    client_name: String(data.fullName || "").trim() || null,
    client_email: String(data.email || "").trim() || null,
    client_phone: String(data.phone || "").trim() || null,
    route_from: String(data.departure || "").trim() || null,
    route_to: String(data.destination || "").trim() || null,
    airline: String(data.airline || "").trim() || null,
    issue_type: disruptionType,
  };

  const existingReferral = await supabase
    .from("referrals")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existingReferral.error) {
    throw existingReferral.error;
  }

  const referralWrite = existingReferral.data?.id
    ? await supabase
      .from("referrals")
      .update({
        partner_id: partner.id,
        client_profile_id: profileId,
        lead_id: leadId,
        referral_code: partner.referral_code || code,
        source_url: referral?.sourceUrl || null,
        source_path: referral?.sourcePath || null,
        status: "lead_created",
        attribution_meta: attributionMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingReferral.data.id)
    : await supabase
    .from("referrals")
    .insert({
        partner_id: partner.id,
        client_profile_id: profileId,
        lead_id: leadId,
        referral_code: partner.referral_code || code,
        source_url: referral?.sourceUrl || null,
        source_path: referral?.sourcePath || null,
        status: "lead_created",
        attribution_meta: attributionMeta,
      });

  if (referralWrite.error) {
    throw referralWrite.error;
  }

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      referral_partner_id: partner.id,
      source_details: {
        referral_code: partner.referral_code || code,
        referral_source_url: referral?.sourceUrl || null,
        referral_source_path: referral?.sourcePath || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (leadError) {
    throw leadError;
  }

  return partner.id as string;
}

async function upsertLeadSignature(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  data: ClaimPayload,
) {
  const existing = await supabase
    .from("lead_signatures")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const payload = {
    lead_id: leadId,
    signer_name: String(data.fullName || "").trim() || null,
    signer_email: String(data.email || "").trim() || null,
    signature_data_url: String(data.signatureDataUrl || ""),
    terms_accepted: true,
    signed_at: new Date().toISOString(),
    payload: {
      route: {
        departure: data.departure || null,
        destination: data.destination || null,
        airline: data.airline || null,
        date: data.date || null,
      },
    },
  };

  if (existing.data?.id) {
    const { error } = await supabase
      .from("lead_signatures")
      .update(payload)
      .eq("id", existing.data.id);

    if (error) {
      throw error;
    }

    return existing.data.id as string;
  }

  const { data: inserted, error } = await supabase
    .from("lead_signatures")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return inserted?.id || null;
}

async function linkCustomerRecords(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  data: ClaimPayload,
) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) {
    return;
  }

  await supabase
    .from("customers")
    .update({
      profile_id: profileId,
      full_name: String(data.fullName || "").trim() || null,
      email,
      phone: String(data.phone || "").trim() || null,
      preferred_language: String(data.preferredLanguage || data.language || "").trim() || undefined,
      updated_at: new Date().toISOString(),
    })
    .ilike("email", email);
}

async function sendConfirmationEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  leadId: string,
  accessLink: string | null,
  language: string,
  isNewUser: boolean,
) {
  const payload = {
    leadId,
    portalActionUrl: accessLink,
    portalActionLabel: isNewUser ? "Create password" : "Access your portal",
    portalLoginUrl: buildPublicAuthUrl("/auth/login"),
  };

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-claim-confirmation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(String((result as { error?: string })?.error || "Claim confirmation email could not be sent."));
  }

  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const siteUrl = getPublicSiteUrl();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server environment is not configured." }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const leadId = String(body.leadId || "").trim();
  const data = body.data || {};
  const referral = body.referral || null;

  if (!leadId) {
    return json({ error: "leadId is required." }, { status: 400 });
  }

  try {
    validateClaimInput(data);
    await assertEmailCanReceiveMail(data.email);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid claim payload." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const leadLookup = await supabase
    .from("leads")
    .select("id, lead_code, status, eligibility_status")
    .eq("id", leadId)
    .maybeSingle();

  if (leadLookup.error) {
    return json({ error: leadLookup.error.message }, { status: 500 });
  }

  if (!leadLookup.data) {
    return json({ error: "Lead not found." }, { status: 404 });
  }

  const normalizedLead = normalizeLeadPayload(data);
  const language = String(data.preferredLanguage || data.language || "en").trim().toLowerCase() || "en";

  try {
    const duplicateLead = await findDuplicateLead(supabase, leadId, data);
    if (duplicateLead?.id) {
      return json({
        error: getDuplicateClaimMessage(language),
        code: "DUPLICATE_CLAIM",
        duplicateLeadId: duplicateLead.id,
        duplicateLeadCode: duplicateLead.lead_code || null,
      }, { status: 409 });
    }

    const account = await createOrRecoverPortalAccount(supabase, siteUrl, language, data);
    await upsertClientProfile(supabase, account, data);
    const estimate = await calculateLeadEstimate(supabase, data);

    const leadUpdate = await supabase
      .from("leads")
      .update({
        ...normalizedLead,
        distance_km: estimate.distanceKm,
        distance_band: estimate.distanceBand,
        estimated_compensation_eur: estimate.estimatedCompensationEur,
        compensation_currency: estimate.currency,
        estimate_status: estimate.estimateStatus,
        estimate_explanation: estimate.estimateExplanation,
        profile_id: account.userId,
        status: "submitted",
        stage: "approved",
        eligibility_status: "eligible",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (leadUpdate.error) {
      throw leadUpdate.error;
    }

    await upsertLeadSignature(supabase, leadId, data);
    await linkCustomerRecords(supabase, account.userId, data);

    const partnerId = await attachReferralIfPresent(
      supabase,
      leadId,
      leadLookup.data.lead_code || null,
      account.userId,
      referral,
      data,
    );
    const emailResult = await sendConfirmationEmail(
      supabaseUrl,
      serviceRoleKey,
      leadId,
      account.accessLink,
      language,
      account.isNewUser,
    );

    return json({
      success: true,
      leadId,
      leadCode: leadLookup.data.lead_code,
      clientProfileId: account.userId,
      referralPartnerId: partnerId,
      account: {
        isNewUser: account.isNewUser,
        accessLinkSent: Boolean(account.accessLink),
      },
      estimate: {
        distanceKm: estimate.distanceKm,
        distanceBand: estimate.distanceBand,
        estimatedCompensationEur: estimate.estimatedCompensationEur,
        currency: estimate.currency,
        estimateStatus: estimate.estimateStatus,
      },
      email: emailResult,
    });
  } catch (error) {
    const payload = errorPayload(error);
    console.error("submit-claim failed", {
      leadId,
      payload,
    });
    return json({
      error: payload.message,
      code: payload.code,
      details: payload.details,
      hint: payload.hint,
    }, { status: 500 });
  }
});
