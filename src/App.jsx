import { ChevronUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import SeoHead from "./components/SeoHead.jsx";
import Navbar from "./layout/Navbar/index.jsx";
import Footer from "./layout/Footer/index.jsx";
import AnimatedRoutes from "./routes/index.jsx";
import i18n, { loadLanguageResources } from "./i18n/index.js";
import { DEFAULT_LANGUAGE, isSupportedLanguage, setStoredLanguage } from "./i18n/languages.js";
import { trackAnalyticsEvent } from "./lib/analyticsTracker.js";
import { getCurrentLanguageFromPath, getPathWithoutLanguage, replaceLanguageInPath } from "./i18n/path.js";
import { captureReferralFromQueryString } from "./services/referralService.js";
import { useAuth } from "./auth/AuthContext.jsx";
import { buildSeoPayload, resolveNoindexRouteMeta } from "./lib/seo.js";
import { scheduleThirdPartyScripts } from "./lib/thirdPartyScripts.js";
import { scheduleNonCriticalWork } from "./lib/nonCriticalWork.js";

const PUBLIC_LANGUAGE_REDIRECT_PATHS = new Set([
  "/",
  "/referral",
  "/referralProgram",
  "/partner-program",
  "/claim",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { loading: authLoading, isAuthenticated, role, profile } = useAuth();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const syncedPreferredLanguageRef = useRef("");
  const trackedPageRef = useRef("");
  const normalizedPath = getPathWithoutLanguage(location.pathname);
  const isAdminPage = location.pathname.startsWith("/admin") || location.pathname.startsWith("/control-dashboard");
  const isPortalPage = normalizedPath.startsWith("/client") || normalizedPath.startsWith("/partner") || normalizedPath.startsWith("/auth");
  const currentLanguage = getCurrentLanguageFromPath(location.pathname) || i18n.language || DEFAULT_LANGUAGE;
  const hasLanguagePrefix = Boolean(getCurrentLanguageFromPath(location.pathname));
  const isPublicLanguageRedirectRoute = !hasLanguagePrefix && (
    PUBLIC_LANGUAGE_REDIRECT_PATHS.has(normalizedPath) || normalizedPath.startsWith("/claim/")
  );
  const noindexMeta = resolveNoindexRouteMeta(location.pathname, currentLanguage);
  const routeSeo = noindexMeta
    ? buildSeoPayload({
        lang: noindexMeta.lang,
        title: noindexMeta.title,
        description: noindexMeta.description,
        pathname: location.pathname,
        canonicalPath: noindexMeta.canonicalPath,
        indexable: false,
      })
    : null;

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) {
      return undefined;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => {
    scheduleThirdPartyScripts();
  }, []);

  useEffect(() => {
    captureReferralFromQueryString(location.search, location.pathname).catch(() => null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (isAdminPage || isPortalPage || normalizedPath.startsWith("/r/")) {
      trackedPageRef.current = "";
      return;
    }

    const pageKey = `${location.pathname}${location.search}`;
    if (trackedPageRef.current === pageKey) {
      return;
    }

    trackedPageRef.current = pageKey;
    return scheduleNonCriticalWork(() => {
      void trackAnalyticsEvent("page_view");
    });
  }, [isAdminPage, isPortalPage, location.pathname, location.search, normalizedPath]);

  useEffect(() => {
    if (!isAuthenticated) {
      syncedPreferredLanguageRef.current = "";
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }

    if (!["client", "partner"].includes(role) || isAdminPage || normalizedPath === "/auth/reset-password") {
      return;
    }

    const preferredLanguage = String(profile?.preferred_language || "").trim().toLowerCase();
    if (!isSupportedLanguage(preferredLanguage)) {
      return;
    }

    const syncSignature = `${profile?.id || "anonymous"}:${preferredLanguage}`;
    if (syncedPreferredLanguageRef.current === syncSignature) {
      return;
    }

    syncedPreferredLanguageRef.current = syncSignature;
    setStoredLanguage(preferredLanguage);

    void loadLanguageResources(preferredLanguage)
      .then(() => {
        if (i18n.language !== preferredLanguage) {
          return i18n.changeLanguage(preferredLanguage);
        }

        return null;
      })
      .catch(() => null);

    const currentLanguage = getCurrentLanguageFromPath(location.pathname) || DEFAULT_LANGUAGE;
    if (currentLanguage !== preferredLanguage) {
      navigate(replaceLanguageInPath(`${location.pathname}${location.search}${location.hash}`, preferredLanguage), { replace: true });
    }
  }, [
    authLoading,
    isAuthenticated,
    role,
    profile?.id,
    profile?.preferred_language,
    isAdminPage,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    normalizedPath,
  ]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 360);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isAdminPage || isPublicLanguageRedirectRoute) {
    return (
      <>
        {routeSeo ? <SeoHead {...routeSeo} /> : null}
        <AnimatedRoutes location={location} />
      </>
    );
  }

  return (
    <>
      {routeSeo ? <SeoHead {...routeSeo} /> : null}
      <Navbar />
      <main>
        <AnimatedRoutes location={location} />
      </main>
      {!normalizedPath.startsWith("/claim") && !isPortalPage && <Footer />}
      {showScrollTop ? (
        <button
          type="button"
          className="scroll-top-btn"
          onClick={scrollToTop}
          aria-label={t("common.scrollToTop")}
        >
          <ChevronUp size={22} strokeWidth={2.4} />
        </button>
      ) : null}
    </>
  );
}

export default App;
