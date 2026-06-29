import brandLogoUrl from "../assets/icons/logo-image.svg";
import { DEFAULT_LANGUAGE } from "../i18n/languages.js";
import { getCurrentLanguageFromPath, getPathWithoutLanguage, localizePath } from "../i18n/path.js";
import { getPublicSiteUrl } from "./siteUrl.js";

export const SEO_LANGUAGES = ["az", "ru", "en"];
export const DEFAULT_SEO_LANGUAGE = "en";
export const BRAND_NAME = "Fly Friendly";

export function isSeoLanguage(language) {
  return SEO_LANGUAGES.includes(String(language || "").toLowerCase());
}

export function getRouteLanguage(pathname = "/", fallback = DEFAULT_LANGUAGE) {
  return getCurrentLanguageFromPath(pathname) || fallback || DEFAULT_LANGUAGE;
}

export function buildAbsoluteUrl(pathname = "/") {
  const siteUrl = getPublicSiteUrl();
  const normalizedPath = String(pathname || "/").startsWith("/") ? String(pathname || "/") : `/${pathname || ""}`;
  return `${siteUrl}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export function getDefaultOgImageUrl() {
  return `${getPublicSiteUrl()}${brandLogoUrl}`;
}

export function buildAlternatesForPath(pathname, languages = SEO_LANGUAGES, xDefaultPath = null) {
  const resolvedXDefaultPath = xDefaultPath || localizePath(pathname, DEFAULT_SEO_LANGUAGE);

  return [
    ...languages.map((language) => ({
      hrefLang: language,
      href: buildAbsoluteUrl(localizePath(pathname, language)),
    })),
    {
      hrefLang: "x-default",
      href: buildAbsoluteUrl(resolvedXDefaultPath),
    },
  ];
}

export function buildLocalizedAlternatesForSlug(pathTemplate, languages) {
  return [
    ...languages.map((language) => ({
      hrefLang: language,
      href: buildAbsoluteUrl(localizePath(pathTemplate, language)),
    })),
    ...(languages.includes(DEFAULT_SEO_LANGUAGE)
      ? [{ hrefLang: "x-default", href: buildAbsoluteUrl(localizePath(pathTemplate, DEFAULT_SEO_LANGUAGE)) }]
      : []),
  ];
}

export function buildSeoPayload({
  lang,
  title,
  description,
  pathname,
  canonicalPath = pathname,
  canonicalOverride = "",
  indexable = true,
  alternatesPath = canonicalPath,
  alternates = null,
  ogType = "website",
  image,
  robotsOverride = "",
  extraMeta = [],
  structuredData = [],
}) {
  const currentLanguage = String(lang || DEFAULT_LANGUAGE).toLowerCase();
  const isIndexableLanguage = isSeoLanguage(currentLanguage);
  const shouldIndex = Boolean(indexable && isIndexableLanguage);
  const canonical = canonicalOverride || (canonicalPath ? buildAbsoluteUrl(canonicalPath) : null);
  const resolvedAlternates = shouldIndex
    ? (alternates || buildAlternatesForPath(alternatesPath || canonicalPath))
    : [];
  const ogImage = image || getDefaultOgImageUrl();

  return {
    title,
    description,
    lang: currentLanguage,
    canonical,
    robots: robotsOverride || (shouldIndex ? "index, follow" : "noindex, nofollow"),
    alternates: resolvedAlternates,
    openGraph: {
      type: ogType,
      url: canonical || buildAbsoluteUrl(pathname),
      title,
      description,
      image: ogImage,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      url: canonical || buildAbsoluteUrl(pathname),
      title,
      description,
      image: ogImage,
    },
    extraMeta,
    structuredData,
  };
}

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: getPublicSiteUrl(),
    logo: getDefaultOgImageUrl(),
  };
}

export function buildWebsiteSchema(language = DEFAULT_SEO_LANGUAGE) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND_NAME,
    url: buildAbsoluteUrl(localizePath("/", language)),
    inLanguage: language,
  };
}

export function buildArticleSchema({
  title,
  description,
  url,
  image,
  publishedTime,
  modifiedTime,
  authorName,
  language,
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    mainEntityOfPage: url,
    image: image ? [image] : undefined,
    datePublished: publishedTime || undefined,
    dateModified: modifiedTime || publishedTime || undefined,
    author: authorName ? { "@type": "Person", name: authorName } : undefined,
    publisher: {
      "@type": "Organization",
      name: BRAND_NAME,
      logo: {
        "@type": "ImageObject",
        url: getDefaultOgImageUrl(),
      },
    },
    inLanguage: language || DEFAULT_SEO_LANGUAGE,
  };
}

export function resolveNoindexRouteMeta(pathname = "/", fallbackLanguage = DEFAULT_LANGUAGE) {
  const normalizedPath = getPathWithoutLanguage(pathname);
  const lang = getRouteLanguage(pathname, fallbackLanguage);

  if (pathname.startsWith("/admin") || pathname.startsWith("/control-dashboard")) {
    return {
      title: `${BRAND_NAME} Admin`,
      description: `${BRAND_NAME} admin area.`,
      canonicalPath: pathname,
      lang,
    };
  }

  if (normalizedPath.startsWith("/auth")) {
    return {
      title: `${BRAND_NAME} Account`,
      description: `${BRAND_NAME} authentication page.`,
      canonicalPath: pathname,
      lang,
    };
  }

  if (normalizedPath.startsWith("/client") || (normalizedPath.startsWith("/partner") && normalizedPath !== "/partner/apply")) {
    return {
      title: `${BRAND_NAME} Account`,
      description: `${BRAND_NAME} account area.`,
      canonicalPath: pathname,
      lang,
    };
  }

  if (normalizedPath.startsWith("/r/")) {
    return {
      title: `${BRAND_NAME} Referral`,
      description: `${BRAND_NAME} referral redirect.`,
      canonicalPath: pathname,
      lang,
    };
  }

  if (/^\/claim\/[^/]+/.test(normalizedPath)) {
    return {
      title: `${BRAND_NAME} Claim`,
      description: `${BRAND_NAME} claim flow step.`,
      canonicalPath: pathname,
      lang,
    };
  }

  return null;
}
