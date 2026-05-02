export const DEFAULT_PUBLIC_SITE_URL = "https://flyfriendly.vercel.app";

function normalizeSiteUrl(value: string | undefined | null) {
  return String(value || "").trim().replace(/\/$/, "");
}

function isUnsafeLocalUrl(value: string) {
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

  if (envUrl && !isUnsafeLocalUrl(envUrl)) {
    return envUrl;
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function buildPublicAuthUrl(language: string, path: string) {
  const locale = String(language || "en").trim().toLowerCase() || "en";
  const suffix = String(path || "").startsWith("/") ? path : `/${path || ""}`;
  return `${getPublicSiteUrl()}/${locale}${suffix}`;
}
