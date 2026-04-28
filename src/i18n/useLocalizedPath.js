import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { DEFAULT_LANGUAGE } from "./languages.js";
import { localizePath } from "./path.js";

export function useLocalizedPath() {
  const { lang } = useParams();
  const currentLanguage = lang || DEFAULT_LANGUAGE;

  return useMemo(
    () => (pathname) => localizePath(pathname, currentLanguage),
    [currentLanguage],
  );
}
