import { createContext, useContext, useEffect, useMemo, useState } from "react";
import i18n from "../i18n/index.js";
import { DEFAULT_LANGUAGE, isSupportedLanguage } from "../i18n/languages.js";

const STORAGE_PREFIX = "ff-admin-preferences";
const THEME_VALUES = new Set(["light", "dark", "system"]);
const TEXT_SCALE_VALUES = new Set(["compact", "default", "large"]);
const ADMIN_LANGUAGE_VALUES = new Set(["en", "ru", "az"]);
const AdminPreferencesContext = createContext(null);

function normalizeTheme(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_VALUES.has(normalized) ? normalized : "system";
}

function normalizeTextScale(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return TEXT_SCALE_VALUES.has(normalized) ? normalized : "default";
}

function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
  const normalized = String(value || "").trim().toLowerCase();
  if (isSupportedLanguage(normalized) && ADMIN_LANGUAGE_VALUES.has(normalized)) {
    return normalized;
  }

  return isSupportedLanguage(fallback) && ADMIN_LANGUAGE_VALUES.has(String(fallback || "").trim().toLowerCase())
    ? String(fallback).trim().toLowerCase()
    : DEFAULT_LANGUAGE;
}

function buildDefaultPreferences(defaultLanguage = DEFAULT_LANGUAGE) {
  return {
    theme: "system",
    language: normalizeLanguage(defaultLanguage),
    textScale: "default",
  };
}

function buildStorageKey(email) {
  const normalizedEmail = String(email || "default").trim().toLowerCase();
  return `${STORAGE_PREFIX}:${normalizedEmail || "default"}`;
}

function readStoredPreferences(email, defaultLanguage) {
  if (typeof window === "undefined") {
    return buildDefaultPreferences(defaultLanguage);
  }

  try {
    const raw = window.localStorage.getItem(buildStorageKey(email));
    const parsed = JSON.parse(raw || "{}");

    return {
      theme: normalizeTheme(parsed.theme),
      language: normalizeLanguage(parsed.language, defaultLanguage),
      textScale: normalizeTextScale(parsed.textScale),
    };
  } catch {
    return buildDefaultPreferences(defaultLanguage);
  }
}

function getSystemDarkMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useAdminPreferencesState(email, defaultLanguage = DEFAULT_LANGUAGE) {
  const normalizedDefaultLanguage = normalizeLanguage(defaultLanguage);
  const [preferences, setPreferences] = useState(() => readStoredPreferences(email, normalizedDefaultLanguage));
  const [systemDarkMode, setSystemDarkMode] = useState(getSystemDarkMode);

  useEffect(() => {
    setPreferences(readStoredPreferences(email, normalizedDefaultLanguage));
  }, [email, normalizedDefaultLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(buildStorageKey(email), JSON.stringify(preferences));
    } catch {
      // Ignore storage quota / private mode issues.
    }
  }, [email, preferences]);

  useEffect(() => {
    if (preferences.theme !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => setSystemDarkMode(Boolean(event.matches));

    setSystemDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preferences.theme]);

  useEffect(() => {
    const nextLanguage = normalizeLanguage(preferences.language, normalizedDefaultLanguage);
    if (i18n.language !== nextLanguage) {
      void i18n.changeLanguage(nextLanguage).catch(() => null);
    }
  }, [normalizedDefaultLanguage, preferences.language]);

  const resolvedTheme = preferences.theme === "system"
    ? (systemDarkMode ? "dark" : "light")
    : preferences.theme;

  return useMemo(() => ({
    preferences,
    resolvedTheme,
    setPreference: (key, value) => {
      setPreferences((current) => {
        if (key === "theme") {
          return { ...current, theme: normalizeTheme(value) };
        }
        if (key === "textScale") {
          return { ...current, textScale: normalizeTextScale(value) };
        }
        if (key === "language") {
          return { ...current, language: normalizeLanguage(value, normalizedDefaultLanguage) };
        }
        return current;
      });
    },
    resetPreferences: () => {
      setPreferences(buildDefaultPreferences(normalizedDefaultLanguage));
    },
  }), [normalizedDefaultLanguage, preferences, resolvedTheme]);
}

export function AdminPreferencesProvider({ value, children }) {
  return <AdminPreferencesContext.Provider value={value}>{children}</AdminPreferencesContext.Provider>;
}

export function useAdminPreferences() {
  const context = useContext(AdminPreferencesContext);

  if (!context) {
    throw new Error("useAdminPreferences must be used inside AdminPreferencesProvider.");
  }

  return context;
}
