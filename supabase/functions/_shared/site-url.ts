export const DEFAULT_PUBLIC_SITE_URL = "https://fly-friendly.com";
export const DEFAULT_LOCAL_SITE_URL = "http://localhost:3000";

function normalizeSiteUrl(value: string | undefined | null) {
  return String(value || "").trim().replace(/\/$/, "");
}

function isLocalUrl(value: string) {
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

export function getPublicSiteUrl() {
  const envUrl = normalizeSiteUrl(
    Deno.env.get("PUBLIC_SITE_URL")
    || Deno.env.get("SITE_URL")
    || Deno.env.get("APP_URL"),
  );

  if (envUrl) {
    return isLocalUrl(envUrl) ? envUrl : envUrl;
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function buildPublicAuthUrl(languageOrPath: string, maybePath?: string) {
  const path = maybePath ?? languageOrPath;
  const suffix = String(path || "").startsWith("/") ? path : `/${path || ""}`;
  return `${getPublicSiteUrl()}${suffix}`;
}
