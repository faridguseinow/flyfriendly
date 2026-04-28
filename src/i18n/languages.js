export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "fly-friendly-language";

export const languages = [
  { code: "az", label: "Azerbaijani", nativeLabel: "Azərbaycan", flag: "🇦🇿", group: "main" },
  { code: "ru", label: "Russian", nativeLabel: "Русский", flag: "🇷🇺", group: "main" },
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧", group: "main" },
  { code: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸", group: "additional" },
  { code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷", group: "additional" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", flag: "🇵🇹", group: "additional" },
  { code: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪", group: "additional" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", flag: "🇮🇹", group: "additional" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", flag: "🇹🇷", group: "additional" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська", flag: "🇺🇦", group: "additional" },
  { code: "pl", label: "Polish", nativeLabel: "Polski", flag: "🇵🇱", group: "additional" },
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
