export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "fly-friendly-language";
const REGION_LANGUAGE_MAP = {
  AZ: "az",
  RU: "ru",
};

export const languages = [
  { code: "az", label: "Azerbaijani", nativeLabel: "Azərbaycan", countryCode: "AZ", flag: "🇦🇿", group: "main" },
  { code: "ru", label: "Russian", nativeLabel: "Русский", countryCode: "RU", flag: "🇷🇺", group: "main" },
  { code: "en", label: "English", nativeLabel: "English", countryCode: "GB", flag: "🇬🇧", group: "main" },
  { code: "es", label: "Spanish", nativeLabel: "Español", countryCode: "ES", flag: "🇪🇸", group: "additional" },
  { code: "fr", label: "French", nativeLabel: "Français", countryCode: "FR", flag: "🇫🇷", group: "additional" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", countryCode: "PT", flag: "🇵🇹", group: "additional" },
  { code: "de", label: "German", nativeLabel: "Deutsch", countryCode: "DE", flag: "🇩🇪", group: "additional" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", countryCode: "IT", flag: "🇮🇹", group: "additional" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", countryCode: "TR", flag: "🇹🇷", group: "additional" },
  { code: "ka", label: "Georgian", nativeLabel: "ქართული", countryCode: "GE", flag: "🇬🇪", group: "additional" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська", countryCode: "UA", flag: "🇺🇦", group: "additional" },
  { code: "pl", label: "Polish", nativeLabel: "Polski", countryCode: "PL", flag: "🇵🇱", group: "additional" },
];

export const supportedLanguageCodes = languages.map((language) => language.code);

export function isSupportedLanguage(code) {
  return supportedLanguageCodes.includes(String(code || "").toLowerCase());
}

export function getLanguageByCode(code) {
  return languages.find((language) => language.code === String(code || "").toLowerCase()) || languages.find((language) => language.code === DEFAULT_LANGUAGE);
}

export function getStoredLanguage() {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : null;
}

export function setStoredLanguage(code) {
  if (typeof window === "undefined" || !isSupportedLanguage(code)) return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

function parseLocale(value) {
  const normalized = String(value || "").trim().replaceAll("_", "-");

  if (!normalized) {
    return { language: "", region: "" };
  }

  if (typeof Intl !== "undefined" && typeof Intl.Locale === "function") {
    try {
      const locale = new Intl.Locale(normalized);
      return {
        language: String(locale.language || "").toLowerCase(),
        region: String(locale.region || "").toUpperCase(),
      };
    } catch {
      // Fall back to lightweight parsing below.
    }
  }

  const [language = "", region = ""] = normalized.split("-");
  return {
    language: language.toLowerCase(),
    region: region.toUpperCase(),
  };
}

function getBrowserLocaleCandidates() {
  if (typeof navigator === "undefined") {
    return [];
  }

  const candidates = Array.isArray(navigator.languages) ? navigator.languages : [];
  const fallback = navigator.language ? [navigator.language] : [];
  return [...candidates, ...fallback].filter(Boolean);
}

export function detectBrowserLanguage() {
  const locales = getBrowserLocaleCandidates();

  for (const locale of locales) {
    const { region } = parseLocale(locale);
    if (REGION_LANGUAGE_MAP[region]) {
      return REGION_LANGUAGE_MAP[region];
    }
  }

  for (const locale of locales) {
    const { language } = parseLocale(locale);

    if (language === "az" || language === "ru" || language === "en") {
      return language;
    }
  }

  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    const timeZone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    if (timeZone === "Asia/Baku") {
      return "az";
    }
  }

  return DEFAULT_LANGUAGE;
}
