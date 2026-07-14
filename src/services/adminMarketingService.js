import { requireSupabase } from "../lib/supabase.js";
import { assertCurrentAdminPageAccess } from "./adminAccessService.js";

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
    funnel: [],
    campaignPerformance: [],
    abTests: [],
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

function safeRate(numerator, denominator) {
  return denominator ? toPercent(numerator / denominator) : 0;
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

function buildMarketingFunnel(events = []) {
  const pageViewEvents = events.filter((event) => event.event_name === "page_view");
  const referralEvents = events.filter((event) => event.event_name === "partner_referral_opened");
  const claimEvents = events.filter((event) => event.event_name === "claim_submitted");
  const uniqueVisitors = new Set(
    pageViewEvents
      .map((event) => String(event.anonymous_id || "").trim())
      .filter(Boolean),
  ).size;
  const claimSubmitters = new Set(
    claimEvents
      .map((event) => String(event.anonymous_id || "").trim())
      .filter(Boolean),
  ).size;

  return [
    {
      key: "visitors",
      label: "Unique visitors",
      count: uniqueVisitors,
      rateFromPrevious: 100,
      rateFromStart: 100,
    },
    {
      key: "page_views",
      label: "Page views",
      count: pageViewEvents.length,
      rateFromPrevious: safeRate(pageViewEvents.length, uniqueVisitors),
      rateFromStart: safeRate(pageViewEvents.length, uniqueVisitors),
    },
    {
      key: "referral_opens",
      label: "Referral opens",
      count: referralEvents.length,
      rateFromPrevious: safeRate(referralEvents.length, pageViewEvents.length),
      rateFromStart: safeRate(referralEvents.length, uniqueVisitors),
    },
    {
      key: "claim_submissions",
      label: "Claim submissions",
      count: claimEvents.length,
      rateFromPrevious: safeRate(claimEvents.length, pageViewEvents.length),
      rateFromStart: safeRate(claimSubmitters, uniqueVisitors),
    },
  ];
}

function getCampaignKey(event) {
  const campaign = String(event?.utm_campaign || "").trim();
  if (campaign) {
    return campaign;
  }

  const source = deriveSourceLabel(event);
  const medium = String(event?.utm_medium || "").trim();
  return medium ? `${source} / ${medium}` : source;
}

function buildCampaignPerformance(events = []) {
  const buckets = new Map();

  events.forEach((event) => {
    const key = getCampaignKey(event);
    const current = buckets.get(key) || {
      label: key,
      visitors: new Set(),
      pageViews: 0,
      claims: 0,
      referralVisits: 0,
      source: deriveSourceLabel(event),
      medium: String(event?.utm_medium || "").trim(),
      campaign: String(event?.utm_campaign || "").trim(),
    };

    const anonymousId = String(event.anonymous_id || "").trim();
    if (anonymousId) {
      current.visitors.add(anonymousId);
    }

    if (event.event_name === "page_view") {
      current.pageViews += 1;
    }

    if (event.event_name === "claim_submitted") {
      current.claims += 1;
    }

    if (event.event_name === "partner_referral_opened") {
      current.referralVisits += 1;
    }

    buckets.set(key, current);
  });

  return [...buckets.values()]
    .map((item) => {
      const visitors = item.visitors.size;
      return {
        label: item.label,
        source: item.source,
        medium: item.medium,
        campaign: item.campaign,
        visitors,
        pageViews: item.pageViews,
        referralVisits: item.referralVisits,
        claims: item.claims,
        conversionRate: safeRate(item.claims, visitors),
      };
    })
    .filter((item) => item.visitors || item.pageViews || item.claims)
    .sort((left, right) => right.claims - left.claims || right.conversionRate - left.conversionRate || right.visitors - left.visitors)
    .slice(0, 8);
}

function buildAbTestSummary(events = []) {
  const buckets = new Map();

  events.forEach((event) => {
    const testName = String(event?.ab_test || "").trim();
    const variantName = String(event?.ab_variant || "").trim();
    if (!testName || !variantName) {
      return;
    }

    const key = `${testName}::${variantName}`;
    const current = buckets.get(key) || {
      testName,
      variantName,
      visitors: new Set(),
      pageViews: 0,
      claims: 0,
      referralVisits: 0,
    };

    const anonymousId = String(event.anonymous_id || "").trim();
    if (anonymousId) {
      current.visitors.add(anonymousId);
    }

    if (event.event_name === "page_view") {
      current.pageViews += 1;
    }

    if (event.event_name === "claim_submitted") {
      current.claims += 1;
    }

    if (event.event_name === "partner_referral_opened") {
      current.referralVisits += 1;
    }

    buckets.set(key, current);
  });

  const byTest = new Map();
  [...buckets.values()].forEach((item) => {
    const variants = byTest.get(item.testName) || [];
    const visitors = item.visitors.size;
    variants.push({
      variantName: item.variantName,
      visitors,
      pageViews: item.pageViews,
      referralVisits: item.referralVisits,
      claims: item.claims,
      conversionRate: safeRate(item.claims, visitors),
    });
    byTest.set(item.testName, variants);
  });

  return [...byTest.entries()]
    .map(([testName, variants]) => ({
      testName,
      variants: variants.sort((left, right) => right.conversionRate - left.conversionRate || right.visitors - left.visitors),
    }))
    .sort((left, right) => left.testName.localeCompare(right.testName));
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
  await assertCurrentAdminPageAccess("dashboard.marketing", {
    anyPageKeys: ["dashboard.revenue"],
    fallbackPermission: "reports.view",
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

  const baseSelect = "anonymous_id, event_name, referrer, utm_source, utm_medium, utm_campaign, device_type, referral_code, created_at";
  const enhancedSelect = `${baseSelect}, page_path, ab_test, ab_variant`;
  let supportsAbTesting = true;
  let response = await client
    .from("analytics_events")
    .select(enhancedSelect)
    .in("event_name", MARKETING_EVENT_NAMES)
    .gte("created_at", queryRange.from.toISOString())
    .lte("created_at", queryRange.to.toISOString())
    .order("created_at", { ascending: false })
    .range(0, ANALYTICS_ROW_LIMIT - 1);

  if (response.error && (response.error.code === "42703" || response.error.code === "PGRST204" || response.error.message?.includes("ab_test") || response.error.message?.includes("ab_variant"))) {
    supportsAbTesting = false;
    response = await client
      .from("analytics_events")
      .select(baseSelect)
      .in("event_name", MARKETING_EVENT_NAMES)
      .gte("created_at", queryRange.from.toISOString())
      .lte("created_at", queryRange.to.toISOString())
      .order("created_at", { ascending: false })
      .range(0, ANALYTICS_ROW_LIMIT - 1);
  }

  const { data, error } = response;

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
    funnel: buildMarketingFunnel(rangeEvents),
    campaignPerformance: buildCampaignPerformance(rangeEvents),
    abTests: supportsAbTesting ? buildAbTestSummary(rangeEvents) : [],
    supportsAbTesting,
    sources: groupPageViewsBySource(rangeEvents),
    devices: groupPageViewsByDevice(rangeEvents),
    topPartners: buildPartnerSummary(rangeEvents, partnerMap),
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  };
}
