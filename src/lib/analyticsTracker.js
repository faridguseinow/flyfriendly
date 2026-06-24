import { isSupabaseConfigured, supabase } from "./supabase.js";
import { getReferralAttribution } from "../services/referralService.js";

const ANONYMOUS_ID_STORAGE_KEY = "fly-friendly-analytics-anonymous-id";
const UTM_STORAGE_KEY = "fly-friendly-analytics-utm";
const AB_STORAGE_KEY = "fly-friendly-analytics-ab";
const ALLOWED_EVENTS = new Set([
  "page_view",
  "claim_submitted",
  "partner_referral_opened",
]);

function isBrowser() {
  return typeof window !== "undefined";
}

function readStorage(key) {
  if (!isBrowser()) {
    return "";
  }

  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore restrictive storage modes.
  }
}

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function sanitizeText(value, maxLength = 200) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.slice(0, maxLength);
}

function readStoredUtmParams() {
  try {
    const raw = readStorage(UTM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      utm_source: sanitizeText(parsed?.utm_source, 160),
      utm_medium: sanitizeText(parsed?.utm_medium, 160),
      utm_campaign: sanitizeText(parsed?.utm_campaign, 200),
    };
  } catch {
    return {
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
    };
  }
}

function readStoredAbParams() {
  try {
    const raw = readStorage(AB_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ab_test: sanitizeText(parsed?.ab_test, 160),
      ab_variant: sanitizeText(parsed?.ab_variant, 160),
    };
  } catch {
    return {
      ab_test: "",
      ab_variant: "",
    };
  }
}

export function getAnonymousId() {
  const stored = sanitizeText(readStorage(ANONYMOUS_ID_STORAGE_KEY), 120);
  if (stored) {
    return stored;
  }

  const nextAnonymousId = generateUuid();
  writeStorage(ANONYMOUS_ID_STORAGE_KEY, nextAnonymousId);
  return nextAnonymousId;
}

export function getDeviceType() {
  if (!isBrowser()) {
    return "desktop";
  }

  const width = Math.max(window.innerWidth || 0, window.screen?.width || 0);
  if (width && width < 768) {
    return "mobile";
  }

  if (width && width < 1024) {
    return "tablet";
  }

  return "desktop";
}

export function getUtmParams() {
  const stored = readStoredUtmParams();
  if (!isBrowser()) {
    return stored;
  }

  const params = new URLSearchParams(window.location.search || "");
  const next = {
    utm_source: sanitizeText(params.get("utm_source"), 160) || stored.utm_source,
    utm_medium: sanitizeText(params.get("utm_medium"), 160) || stored.utm_medium,
    utm_campaign: sanitizeText(params.get("utm_campaign"), 200) || stored.utm_campaign,
  };

  if (next.utm_source || next.utm_medium || next.utm_campaign) {
    writeStorage(UTM_STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function getAbTestParams() {
  const stored = readStoredAbParams();
  if (!isBrowser()) {
    return stored;
  }

  const params = new URLSearchParams(window.location.search || "");
  const next = {
    ab_test: sanitizeText(params.get("ab_test") || params.get("ff_ab_test"), 160) || stored.ab_test,
    ab_variant: sanitizeText(params.get("ab_variant") || params.get("ff_ab_variant"), 160) || stored.ab_variant,
  };

  if (next.ab_test && next.ab_variant) {
    writeStorage(AB_STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export async function trackAnalyticsEvent(eventName, extra = {}) {
  if (!isBrowser() || !isSupabaseConfigured || !supabase || !ALLOWED_EVENTS.has(eventName)) {
    return null;
  }

  const utm = getUtmParams();
  const ab = getAbTestParams();
  const referralCode = sanitizeText(
    extra.referral_code || getReferralAttribution()?.referralCode || "",
    120,
  );
  const pagePath = sanitizeText(
    extra.page_path || `${window.location.pathname || ""}${window.location.search || ""}`,
    400,
  );

  try {
    const { error } = await supabase.functions.invoke("track-analytics-event", {
      body: {
        anonymous_id: getAnonymousId(),
        event_name: eventName,
        page_path: pagePath || null,
        referrer: sanitizeText(document.referrer, 1000) || null,
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        utm_campaign: utm.utm_campaign || null,
        ab_test: sanitizeText(extra.ab_test, 160) || ab.ab_test || null,
        ab_variant: sanitizeText(extra.ab_variant, 160) || ab.ab_variant || null,
        device_type: getDeviceType(),
        referral_code: referralCode || null,
      },
    });

    if (error) {
      return null;
    }
  } catch {
    return null;
  }

  return true;
}
