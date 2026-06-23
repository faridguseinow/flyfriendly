import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "./layout/Navbar/index.jsx";
import Footer from "./layout/Footer/index.jsx";
import AnimatedRoutes from "./routes/index.jsx";
import i18n from "./i18n/index.js";
import { DEFAULT_LANGUAGE, isSupportedLanguage, setStoredLanguage } from "./i18n/languages.js";
import { trackAnalyticsEvent } from "./lib/analyticsTracker.js";
import { getCurrentLanguageFromPath, getPathWithoutLanguage, replaceLanguageInPath } from "./i18n/path.js";
import { captureReferralFromQueryString } from "./services/referralService.js";
import { useAuth } from "./auth/AuthContext.jsx";

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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

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
    void trackAnalyticsEvent("page_view");
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

    if (i18n.language !== preferredLanguage) {
      void i18n.changeLanguage(preferredLanguage).catch(() => null);
    }

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

  if (isAdminPage) {
    return <AnimatedRoutes location={location} />;
  }

  return (
    <>
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <AnimatedRoutes location={location} />
        </motion.main>
      </AnimatePresence>
      {!normalizedPath.startsWith("/claim") && !isPortalPage && <Footer />}
      <AnimatePresence>
        {showScrollTop ? (
          <motion.button
            key="scroll-top"
            type="button"
            className="scroll-top-btn"
            onClick={scrollToTop}
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.92 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            aria-label={t("common.scrollToTop")}
          >
            <ChevronUp size={22} strokeWidth={2.4} />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export default App;
