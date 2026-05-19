const DEFAULT_PUBLIC_SITE_URL = "https://fly-friendly.com";
const DEFAULT_LOCAL_SITE_URL = "http://localhost:3000";

function normalizeSiteUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }

  return url.replace(/\/$/, "");
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    const host = String(url.hostname || "").toLowerCase();
    return host === "localhost"
      || host === "127.0.0.1"
      || host === "0.0.0.0"
      || host.endsWith(".local");
  } catch {
    return true;
  }
}

function getBrowserLocalOrigin() {
  if (typeof window === "undefined") {
    return "";
  }

  const origin = normalizeSiteUrl(window.location.origin);
  return origin && isLocalUrl(origin) ? origin : "";
}

export function getPublicSiteUrl() {
  const envUrl = normalizeSiteUrl(
    import.meta.env.VITE_PUBLIC_SITE_URL
      || import.meta.env.VITE_SITE_URL
      || import.meta.env.VITE_APP_URL,
  );

  if (envUrl) {
    return isLocalUrl(envUrl) ? (getBrowserLocalOrigin() || DEFAULT_LOCAL_SITE_URL) : envUrl;
  }

  return getBrowserLocalOrigin() || DEFAULT_PUBLIC_SITE_URL;
}

export function buildPublicAuthUrl(languageOrPath, maybePath) {
  const path = maybePath ?? languageOrPath;
  const suffix = String(path || "").startsWith("/") ? path : `/${path || ""}`;
  return `${getPublicSiteUrl()}${suffix}`;
}
