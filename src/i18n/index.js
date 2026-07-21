import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE } from "./languages.js";
import en from "./locales/en.json";

const localeLoaders = {
  az: () => import("./locales/az.json"),
  ru: () => import("./locales/ru.json"),
  es: () => import("./locales/es.json"),
  fr: () => import("./locales/fr.json"),
  pt: () => import("./locales/pt.json"),
  de: () => import("./locales/de.json"),
  it: () => import("./locales/it.json"),
  tr: () => import("./locales/tr.json"),
  ka: () => import("./locales/ka.json"),
  uk: () => import("./locales/uk.json"),
  pl: () => import("./locales/pl.json"),
};

const resources = {
  en: { translation: en },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    returnObjects: true,
  });

export async function loadLanguageResources(language) {
  const normalizedLanguage = String(language || DEFAULT_LANGUAGE).trim().toLowerCase();

  if (i18n.hasResourceBundle(normalizedLanguage, "translation")) {
    return normalizedLanguage;
  }

  const loader = localeLoaders[normalizedLanguage];
  if (!loader) {
    return DEFAULT_LANGUAGE;
  }

  const module = await loader();
  i18n.addResourceBundle(normalizedLanguage, "translation", module.default || {}, true, true);
  return normalizedLanguage;
}

export default i18n;
