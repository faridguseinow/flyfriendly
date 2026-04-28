import { DEFAULT_LANGUAGE, getStoredLanguage, isSupportedLanguage } from "./languages.js";

export function getCurrentLanguageFromPath(pathname = "/") {
  const [firstSegment] = String(pathname || "/").split("/").filter(Boolean);
  return isSupportedLanguage(firstSegment) ? firstSegment : null;
}

export function getPathWithoutLanguage(pathname = "/") {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length && isSupportedLanguage(segments[0])) {
    segments.shift();
  }

  return segments.length ? `/${segments.join("/")}` : "/";
}

export function isLocalizedPath(pathname = "/") {
  return Boolean(getCurrentLanguageFromPath(pathname));
}

export function localizePath(pathname = "/", language = DEFAULT_LANGUAGE) {
  const normalizedLanguage = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;

  if (!pathname || pathname === "/") {
    return `/${normalizedLanguage}`;
  }

  if (/^(https?:|mailto:|tel:|#)/.test(pathname)) {
    return pathname;
  }

  const [pathOnly, hashPart = ""] = String(pathname).split("#");
  const [rawPath = "/", searchPart = ""] = pathOnly.split("?");
  const cleanPath = getPathWithoutLanguage(rawPath);
  const withPrefix = cleanPath === "/" ? `/${normalizedLanguage}` : `/${normalizedLanguage}${cleanPath}`;
  const search = searchPart ? `?${searchPart}` : "";
  const hash = hashPart ? `#${hashPart}` : "";

  return `${withPrefix}${search}${hash}`;
}

export function replaceLanguageInPath(pathname = "/", language = DEFAULT_LANGUAGE) {
  return localizePath(pathname, language);
}

export function getPreferredLanguage() {
  return getStoredLanguage() || DEFAULT_LANGUAGE;
}
