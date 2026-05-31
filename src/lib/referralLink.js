import { buildReferralPath } from "../../shared/referral-code.js";

const DEFAULT_PUBLIC_REFERRAL_SITE_URL = "https://fly-friendly.com";
const LEGACY_REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) {
    return DEFAULT_PUBLIC_REFERRAL_SITE_URL;
  }

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();

    if (host === "fly-friendly.com" || host === "www.fly-friendly.com") {
      return DEFAULT_PUBLIC_REFERRAL_SITE_URL;
    }

    return raw;
  } catch {
    return DEFAULT_PUBLIC_REFERRAL_SITE_URL;
  }
}

function normalizeReferralPath(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("/r/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    return parsed.pathname.startsWith("/r/") ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "";
  } catch {
    if (!LEGACY_REFERRAL_CODE_PATTERN.test(raw)) {
      return "";
    }

    return buildReferralPath(raw);
  }
}

export function buildPublicReferralLink(linkOrCode = "", siteUrl = "") {
  const path = normalizeReferralPath(linkOrCode);
  if (!path) {
    return "";
  }

  return `${normalizeBaseUrl(siteUrl)}${path}`;
}
