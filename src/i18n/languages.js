export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "fly-friendly-language";

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
