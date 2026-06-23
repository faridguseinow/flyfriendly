import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_EVENTS = new Set([
  "page_view",
  "claim_submitted",
  "partner_referral_opened",
]);

const ALLOWED_DEVICES = new Set([
  "mobile",
  "tablet",
  "desktop",
]);

type RequestBody = {
  anonymous_id?: string;
  event_name?: string;
  page_path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  device_type?: string | null;
  referral_code?: string | null;
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function sanitizeText(value: unknown, maxLength: number) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase function environment is not configured." }, { status: 500 });
  }

  let body: RequestBody | null = null;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const anonymousId = sanitizeText(body?.anonymous_id, 120);
  const eventName = sanitizeText(body?.event_name, 64);
  const deviceType = sanitizeText(body?.device_type, 32);

  if (!anonymousId) {
    return json({ error: "anonymous_id is required." }, { status: 400 });
  }

  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    return json({ error: "event_name is invalid." }, { status: 400 });
  }

  if (deviceType && !ALLOWED_DEVICES.has(deviceType)) {
    return json({ error: "device_type is invalid." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const payload = {
    anonymous_id: anonymousId,
    event_name: eventName,
    page_path: sanitizeText(body?.page_path, 400),
    referrer: sanitizeText(body?.referrer, 1000),
    utm_source: sanitizeText(body?.utm_source, 160),
    utm_medium: sanitizeText(body?.utm_medium, 160),
    utm_campaign: sanitizeText(body?.utm_campaign, 200),
    device_type: deviceType,
    referral_code: sanitizeText(body?.referral_code, 120),
  };

  const { error } = await supabase
    .from("analytics_events")
    .insert(payload);

  if (error) {
    console.error("track-analytics-event insert failed", error);
    return json({ error: "Could not save analytics event." }, { status: 500 });
  }

  return json({ ok: true });
});
