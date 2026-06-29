import fs from "node:fs/promises";
import path from "node:path";

export const SITE_URL = "https://fly-friendly.com";
export const SEO_LANGUAGES = ["az", "ru", "en"];

export const SITEMAP_STATIC_PUBLIC_PATHS = [
  "/",
  "/blog",
  "/about",
  "/contact",
  "/referral",
  "/partner/apply",
  "/privacyPolicy",
  "/terms",
  "/cookies",
  "/claim",
];

export const PRERENDER_STATIC_PUBLIC_PATHS = [
  "/",
  "/blog",
  "/about",
  "/contact",
  "/referral",
  "/partner/apply",
  "/privacyPolicy",
  "/terms",
  "/cookies",
];

export const DUPLICATE_NOINDEX_PATHS = new Set([
  "/aboutUs",
  "/referralProgram",
  "/partner-program",
  "/termsOfUse",
]);

export function localizePath(pathname, language) {
  const normalizedPath = normalizePathname(pathname);
  return normalizedPath === "/"
    ? `/${language}`
    : `/${language}${normalizedPath}`;
}

export function normalizePathname(value = "/") {
  const stringValue = String(value || "/").trim();

  if (!stringValue) {
    return "/";
  }

  try {
    const parsed = stringValue.startsWith("http://") || stringValue.startsWith("https://")
      ? new URL(stringValue)
      : new URL(stringValue, SITE_URL);
    const pathname = parsed.pathname || "/";
    return pathname !== "/" && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  } catch {
    const barePath = stringValue.split(/[?#]/, 1)[0] || "/";
    const pathname = barePath.startsWith("/") ? barePath : `/${barePath}`;
    return pathname !== "/" && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  }
}

export function getRouteLanguage(pathname = "/") {
  const normalizedPath = normalizePathname(pathname);
  const match = normalizedPath.match(/^\/([a-z]{2})(?=\/|$)/i);
  return match ? match[1].toLowerCase() : null;
}

export function getPathWithoutLanguage(pathname = "/") {
  const normalizedPath = normalizePathname(pathname);
  const language = getRouteLanguage(normalizedPath);

  if (!language) {
    return normalizedPath;
  }

  const trimmed = normalizedPath.slice(language.length + 1);
  return trimmed ? (trimmed.startsWith("/") ? trimmed : `/${trimmed}`) : "/";
}

export function isBlogArticlePath(pathname = "/") {
  return /^\/(az|ru|en)\/blog\/[^/]+$/i.test(normalizePathname(pathname));
}

export function buildMatchingEnglishPath(pathname = "/") {
  const normalizedPath = normalizePathname(pathname);
  const language = getRouteLanguage(normalizedPath);
  const withoutLanguage = language ? getPathWithoutLanguage(normalizedPath) : normalizedPath;
  return localizePath(withoutLanguage, "en");
}

export function buildAbsoluteUrl(pathname = "/") {
  return `${SITE_URL}${normalizePathname(pathname)}`;
}

export function buildMatchingEnglishUrl(pathname = "/") {
  return buildAbsoluteUrl(buildMatchingEnglishPath(pathname));
}

export function buildPrerenderStaticRoutes() {
  return PRERENDER_STATIC_PUBLIC_PATHS.flatMap((pathname) => (
    SEO_LANGUAGES.map((language) => localizePath(pathname, language))
  ));
}

export function getPrerenderDenyReason(pathname = "/") {
  const normalizedPath = normalizePathname(pathname);
  const language = getRouteLanguage(normalizedPath);

  if (!language) {
    return "Route is not localized under /az, /ru or /en.";
  }

  if (!SEO_LANGUAGES.includes(language)) {
    return `Unsupported language prefix "${language}".`;
  }

  const publicPath = getPathWithoutLanguage(normalizedPath);

  if (DUPLICATE_NOINDEX_PATHS.has(publicPath)) {
    return `Duplicate noindex route "${publicPath}" is excluded.`;
  }

  if (publicPath === "/claim" || publicPath.startsWith("/claim/")) {
    return "Claim routes are excluded from Phase B prerender.";
  }

  if (publicPath === "/auth" || publicPath.startsWith("/auth/")) {
    return "Auth routes are excluded from prerender.";
  }

  if (publicPath === "/client" || publicPath.startsWith("/client/")) {
    return "Client routes are excluded from prerender.";
  }

  if (publicPath === "/r" || publicPath.startsWith("/r/")) {
    return "Referral capture routes are excluded from prerender.";
  }

  if (publicPath === "/partner" || (publicPath.startsWith("/partner/") && publicPath !== "/partner/apply")) {
    return "Partner portal routes are excluded from prerender.";
  }

  if (publicPath === "/admin" || publicPath.startsWith("/admin/")) {
    return "Admin routes are excluded from prerender.";
  }

  if (publicPath === "/control-dashboard" || publicPath.startsWith("/control-dashboard/")) {
    return "Control dashboard routes are excluded from prerender.";
  }

  return null;
}

export async function collectSitemapBlogRoutes(sitemapPath) {
  const xml = await fs.readFile(sitemapPath, "utf8");
  const matches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g));
  const pathnames = matches.map(([, url]) => normalizePathname(url));

  return Array.from(new Set(pathnames.filter(isBlogArticlePath))).sort();
}

export async function resolvePrerenderRoutes({
  sitemapPath = path.join(process.cwd(), "public", "sitemap.xml"),
} = {}) {
  const staticRoutes = buildPrerenderStaticRoutes();
  const blogRoutes = await collectSitemapBlogRoutes(sitemapPath);
  const allowedRoutes = [...staticRoutes, ...blogRoutes];
  const failures = allowedRoutes
    .map((route) => ({ route, reason: getPrerenderDenyReason(route) }))
    .filter((entry) => entry.reason);

  if (failures.length) {
    const details = failures.map(({ route, reason }) => `${route}: ${reason}`).join("\n");
    throw new Error(`Unsafe prerender routes detected.\n${details}`);
  }

  return {
    staticRoutes,
    blogRoutes,
    routes: allowedRoutes,
  };
}
