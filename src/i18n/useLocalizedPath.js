import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { DEFAULT_LANGUAGE } from "./languages.js";
import { getCurrentLanguageFromPath, localizePath } from "./path.js";

export function useLocalizedPath() {
  const { lang } = useParams();
  const location = useLocation();
  const currentLanguage = lang || getCurrentLanguageFromPath(location.pathname) || DEFAULT_LANGUAGE;

  return useMemo(
    () => (pathname) => localizePath(pathname, currentLanguage),
    [currentLanguage],
  );
}
