import { requireSupabase } from "../lib/supabase.js";
import { assertCurrentAdminPermission } from "./adminAccessService.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const ANALYTICS_ROW_LIMIT = 10000;
const MARKETING_EVENT_NAMES = [
  "page_view",
  "claim_submitted",
  "partner_referral_opened",
];

function startOfDay(input = new Date()) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function endOfDay(input = new Date()) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 23, 59, 59, 999);
}

function parseDateInput(value, boundary = "start") {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return boundary === "end" ? endOfDay(parsed) : startOfDay(parsed);
}

function normalizeRange({ from, to } = {}) {
  const today = new Date();
  const resolvedTo = parseDateInput(to, "end") || endOfDay(today);
  const fallbackFrom = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DEFAULT_LOOKBACK_DAYS - 1)));
  const resolvedFrom = parseDateInput(from, "start") || fallbackFrom;

  if (resolvedFrom.getTime() <= resolvedTo.getTime()) {
    return { from: resolvedFrom, to: resolvedTo };
  }

  return { from: startOfDay(resolvedTo), to: endOfDay(resolvedFrom) };
}

function isMissingAnalyticsTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("analytics_events");
}

function buildEmptySummary(range) {
  return {
    visitorsToday: 0,
    claimsToday: 0,
    referralVisitsToday: 0,
    mobileShare: 0,
    sources: [],
    devices: [],
    topPartners: [],
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  };
}

function isWithinRange(eventDate, range) {
  return eventDate.getTime() >= range.from.getTime() && eventDate.getTime() <= range.to.getTime();
}

function deriveSourceLabel(event) {
  const utmSource = String(event?.utm_source || "").trim();
  if (utmSource) {
    return utmSource;
  }

  const rawReferrer = String(event?.referrer || "").trim();
  if (!rawReferrer) {
    return "direct";
  }

  try {
    const parsed = new URL(rawReferrer);
    return parsed.hostname.replace(/^www\./, "") || "direct";
  } catch {
    return rawReferrer;
  }
}

function toPercent(value) {
  return Number((value * 100).toFixed(1));
}

function sortGroupedItems(map, formatItem) {
  return [...map.entries()]
    .map(([key, count]) => formatItem(key, count))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function groupPageViewsBySource(events = []) {
  const counts = new Map();

  events.forEach((event) => {
    if (event.event_name !== "page_view") {
      return;
    }

    const source = deriveSourceLabel(event);
    counts.set(source, (counts.get(source) || 0) + 1);
  });

  return sortGroupedItems(counts, (label, count) => ({
    label,
    count,
  }));
}

function groupPageViewsByDevice(events = []) {
  const counts = new Map();

  events.forEach((event) => {
    if (event.event_name !== "page_view") {
      return;
    }

    const device = String(event.device_type || "unknown").trim() || "unknown";
    counts.set(device, (counts.get(device) || 0) + 1);
  });

  return sortGroupedItems(counts, (label, count) => ({
    label,
    count,
  }));
}

function buildPartnerSummary(events = [], partnerMap = new Map()) {
  const buckets = new Map();

  events.forEach((event) => {
    const referralCode = String(event.referral_code || "").trim();
    if (!referralCode) {
      return;
    }

    const current = buckets.get(referralCode) || {
      referralCode,
      partnerName: partnerMap.get(referralCode) || "",
      visits: 0,
      claims: 0,
      lastVisit: null,
    };

    if (event.event_name === "partner_referral_opened") {
      current.visits += 1;
      current.lastVisit = !current.lastVisit || event.created_at > current.lastVisit
        ? event.created_at
        : current.lastVisit;
    }

    if (event.event_name === "claim_submitted") {
      current.claims += 1;
    }

    buckets.set(referralCode, current);
  });

  return [...buckets.values()]
    .filter((item) => item.visits > 0 || item.claims > 0)
    .sort((left, right) => right.visits - left.visits || right.claims - left.claims || left.referralCode.localeCompare(right.referralCode))
    .slice(0, 10);
}

async function loadPartnerMap(client, referralCodes = []) {
  if (!referralCodes.length) {
    return new Map();
  }

  const { data, error } = await client
    .from("referral_partners")
    .select("referral_code, public_name, name")
    .in("referral_code", referralCodes);

  if (error) {
    return new Map();
  }

  return new Map((data || []).map((item) => [
    item.referral_code,
    item.public_name || item.name || "",
  ]));
}

export async function getMarketingAnalyticsSummary({ from, to } = {}) {
  await assertCurrentAdminPermission("reports.view", {
    message: "You do not have access to marketing analytics.",
  });

  const client = requireSupabase();
  const range = normalizeRange({ from, to });
  const todayRange = {
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  };
  const queryRange = {
    from: range.from.getTime() < todayRange.from.getTime() ? range.from : todayRange.from,
    to: range.to.getTime() > todayRange.to.getTime() ? range.to : todayRange.to,
  };

  const { data, error } = await client
    .from("analytics_events")
    .select("anonymous_id, event_name, referrer, utm_source, device_type, referral_code, created_at")
    .in("event_name", MARKETING_EVENT_NAMES)
    .gte("created_at", queryRange.from.toISOString())
    .lte("created_at", queryRange.to.toISOString())
    .order("created_at", { ascending: false })
    .range(0, ANALYTICS_ROW_LIMIT - 1);

  if (error) {
    if (isMissingAnalyticsTable(error)) {
      return buildEmptySummary(range);
    }

    throw error;
  }

  const allEvents = (data || []).filter((event) => event?.created_at);
  const rangeEvents = allEvents.filter((event) => isWithinRange(new Date(event.created_at), range));
  const todayEvents = allEvents.filter((event) => isWithinRange(new Date(event.created_at), todayRange));
  const rangePageViews = rangeEvents.filter((event) => event.event_name === "page_view");
  const mobilePageViews = rangePageViews.filter((event) => event.device_type === "mobile").length;
  const referralCodes = [...new Set(rangeEvents.map((event) => String(event.referral_code || "").trim()).filter(Boolean))];
  const partnerMap = await loadPartnerMap(client, referralCodes);

  return {
    visitorsToday: new Set(
      todayEvents
        .filter((event) => event.event_name === "page_view")
        .map((event) => String(event.anonymous_id || "").trim())
        .filter(Boolean),
    ).size,
    claimsToday: todayEvents.filter((event) => event.event_name === "claim_submitted").length,
    referralVisitsToday: todayEvents.filter((event) => event.event_name === "partner_referral_opened").length,
    mobileShare: rangePageViews.length ? toPercent(mobilePageViews / rangePageViews.length) : 0,
    sources: groupPageViewsBySource(rangeEvents),
    devices: groupPageViewsByDevice(rangeEvents),
    topPartners: buildPartnerSummary(rangeEvents, partnerMap),
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  };
}
