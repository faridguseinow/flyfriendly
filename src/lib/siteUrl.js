const DEFAULT_PUBLIC_SITE_URL = "https://flyfriendly.vercel.app";

function normalizeSiteUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }

  return url.replace(/\/$/, "");
}

function isUnsafeLocalUrl(value) {
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
    import.meta.env.VITE_PUBLIC_SITE_URL
      || import.meta.env.VITE_SITE_URL
      || import.meta.env.VITE_APP_URL,
  );

  if (envUrl && !isUnsafeLocalUrl(envUrl)) {
    return envUrl;
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function buildPublicAuthUrl(language, path) {
  const locale = String(language || "en").trim().toLowerCase() || "en";
  const suffix = String(path || "").startsWith("/") ? path : `/${path || ""}`;
  return `${getPublicSiteUrl()}/${locale}${suffix}`;
}
