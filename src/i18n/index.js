import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE } from "./languages.js";
import en from "./locales/en.json";
import az from "./locales/az.json";
import ru from "./locales/ru.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import tr from "./locales/tr.json";
import ka from "./locales/ka.json";
import uk from "./locales/uk.json";
import pl from "./locales/pl.json";

const resources = {
  en: { translation: en },
  az: { translation: az },
  ru: { translation: ru },
  es: { translation: es },
  fr: { translation: fr },
  pt: { translation: pt },
  de: { translation: de },
  it: { translation: it },
  tr: { translation: tr },
  ka: { translation: ka },
  uk: { translation: uk },
  pl: { translation: pl },
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

export default i18n;
