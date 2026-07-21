import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { GuestRoute, PartnerRoute, ProtectedRoute, RoleRoute } from "../auth/AuthGuards.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import i18n, { loadLanguageResources } from "../i18n/index.js";
import { DEFAULT_LANGUAGE, isSupportedLanguage, setStoredLanguage } from "../i18n/languages.js";
import { getPreferredLanguage, localizePath } from "../i18n/path.js";
import { useLocalizedPath } from "../i18n/useLocalizedPath.js";

const GOOGLE_OAUTH_PENDING_KEY = "flyfriendly.googleOAuth.pending";

const lazyNamed = (loader, exportName) => lazy(() => loader().then((module) => ({ default: module[exportName] })));

const Home = lazy(() => import("../pages/Home/index.jsx"));
const About = lazy(() => import("../pages/About/index.jsx"));
const Contact = lazy(() => import("../pages/Contact/index.jsx"));
const Blog = lazy(() => import("../pages/Blog/index.jsx"));
const BlogArticle = lazy(() => import("../pages/Blog/Article.jsx"));
const Referral = lazy(() => import("../pages/Referral/index.jsx"));
const Claim = lazy(() => import("../pages/Claim/index.jsx"));
const PrivacyPolicy = lazy(() => import("../pages/PrivacyPolicy/index.jsx"));
const TermsOfUse = lazy(() => import("../pages/TermsOfUse/index.jsx"));
const Cookies = lazy(() => import("../pages/Cookies/index.jsx"));
const AdminRoutes = lazy(() => import("../admin/AdminRoutes.jsx"));
const LoginPage = lazyNamed(() => import("../pages/Auth/index.jsx"), "LoginPage");
const RegisterPage = lazyNamed(() => import("../pages/Auth/index.jsx"), "RegisterPage");
const ForgotPasswordPage = lazyNamed(() => import("../pages/Auth/index.jsx"), "ForgotPasswordPage");
const ResetPasswordPage = lazyNamed(() => import("../pages/Auth/index.jsx"), "ResetPasswordPage");
const ClientPortalLayout = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientPortalLayout");
const ClientAccountPage = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientAccountPage");
const ClientClaimDetailsPage = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientClaimDetailsPage");
const ClientClaimsPage = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientClaimsPage");
const ClientDashboardPage = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientDashboardPage");
const ClientDocumentsPage = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientDocumentsPage");
const ClientPaymentsPage = lazyNamed(() => import("../pages/ClientPortal/index.jsx"), "ClientPaymentsPage");
const PartnerApplyPage = lazy(() => import("../pages/PartnerApply/index.jsx"));
const ReferralCapturePage = lazy(() => import("../pages/ReferralCapture/index.jsx"));
const PartnerPortalLayout = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerPortalLayout");
const PartnerAssetsPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerAssetsPage");
const PartnerDashboardPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerDashboardPage");
const PartnerEarningsPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerEarningsPage");
const PartnerFinancePage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerFinancePage");
const PartnerLinkPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerLinkPage");
const PartnerPendingPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerPendingPage");
const PartnerProfilePage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerProfilePage");
const PartnerPayoutsPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerPayoutsPage");
const PartnerRejectedPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerRejectedPage");
const PartnerReferralsPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerReferralsPage");
const PartnerSuspendedPage = lazyNamed(() => import("../pages/PartnerPortal/index.jsx"), "PartnerSuspendedPage");

function hasPendingGoogleOAuthRedirect() {
  try {
    return window.localStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) === "true";
  } catch {
    return false;
  }
}

function clearPendingGoogleOAuthRedirect() {
  try {
    window.localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
  } catch {
    // Local storage can be unavailable in private browsing modes.
  }
}

function RedirectToPreferredLanguage() {
  const location = useLocation();
  const toLocalizedPath = useLocalizedPath();
  const { t } = useTranslation();
  const { loading, isAuthenticated, dashboardPath } = useAuth();

  if (hasPendingGoogleOAuthRedirect()) {
    if (loading) {
      return <div className="placeholder-page"><p>{t("common.loadingAccount", { defaultValue: "Loading account..." })}</p></div>;
    }

    clearPendingGoogleOAuthRedirect();

    if (isAuthenticated) {
      return <Navigate to={toLocalizedPath(dashboardPath || "/client/dashboard")} replace />;
    }
  }

  const targetLanguage = getPreferredLanguage();
  return <Navigate to={localizePath(`${location.pathname}${location.search}${location.hash}`, targetLanguage)} replace />;
}

function LanguageBoundary() {
  const location = useLocation();
  const { lang } = useParams();
  const [isLanguageReady, setIsLanguageReady] = useState(() => i18n.hasResourceBundle(lang, "translation"));

  if (!isSupportedLanguage(lang)) {
    const segments = location.pathname.split("/").filter(Boolean);
    const [, ...rest] = segments;
    const nextPath = rest.length ? `/${rest.join("/")}` : "/";
    return <Navigate to={localizePath(`${nextPath}${location.search}${location.hash}`, DEFAULT_LANGUAGE)} replace />;
  }

  useEffect(() => {
    let isActive = true;

    setIsLanguageReady(i18n.hasResourceBundle(lang, "translation"));

    loadLanguageResources(lang)
      .then(() => {
        if (!isActive) return;

        if (i18n.language !== lang) {
          return i18n.changeLanguage(lang);
        }

        return null;
      })
      .then(() => {
        if (isActive) {
          setIsLanguageReady(true);
        }
      })
      .catch(() => {
        if (isActive) {
          setIsLanguageReady(true);
        }
      });

    setStoredLanguage(lang);

    return () => {
      isActive = false;
    };
  }, [lang]);

  if (!isLanguageReady) {
    return <div className="route-loading" />;
  }

  return <Outlet />;
}

function RedirectLocalizedFallback() {
  const { lang } = useParams();
  return <Navigate to={localizePath("/", isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE)} replace />;
}

function AnimatedRoutes({ location }) {
  return (
    <Suspense fallback={<div className="route-loading" />}>
      <Routes location={location}>
      <Route path="/" element={<RedirectToPreferredLanguage />} />
      <Route path="/r/:referralCode" element={<ReferralCapturePage />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="/control-dashboard/*" element={<Navigate to="/admin" replace />} />
      <Route path="/:lang/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="/:lang/control-dashboard/*" element={<Navigate to="/admin" replace />} />
      <Route path="/referral" element={<RedirectToPreferredLanguage />} />
      <Route path="/referralProgram" element={<RedirectToPreferredLanguage />} />
      <Route path="/partner-program" element={<RedirectToPreferredLanguage />} />
      <Route path="/claim" element={<RedirectToPreferredLanguage />} />
      <Route path="/claim/:stage" element={<RedirectToPreferredLanguage />} />
      <Route path="/auth/login" element={<RedirectToPreferredLanguage />} />
      <Route path="/auth/register" element={<RedirectToPreferredLanguage />} />
      <Route path="/auth/forgot-password" element={<RedirectToPreferredLanguage />} />
      <Route path="/auth/reset-password" element={<RedirectToPreferredLanguage />} />
      <Route path="/client/*" element={<RedirectToPreferredLanguage />} />
      <Route path="/partner/*" element={<RedirectToPreferredLanguage />} />
      <Route path="/contact" element={<RedirectToPreferredLanguage />} />
      <Route path="/blog" element={<RedirectToPreferredLanguage />} />
      <Route path="/blog/:slug" element={<RedirectToPreferredLanguage />} />
      <Route path="/about" element={<RedirectToPreferredLanguage />} />
      <Route path="/aboutUs" element={<RedirectToPreferredLanguage />} />
      <Route path="/privacyPolicy" element={<RedirectToPreferredLanguage />} />
      <Route path="/terms" element={<RedirectToPreferredLanguage />} />
      <Route path="/termsOfUse" element={<RedirectToPreferredLanguage />} />
      <Route path="/cookies" element={<RedirectToPreferredLanguage />} />
      <Route path="/:lang" element={<LanguageBoundary />}>
        <Route path="r/:referralCode" element={<ReferralCapturePage />} />
        <Route element={<GuestRoute />}>
          <Route path="auth/login" element={<LoginPage />} />
          <Route path="auth/register" element={<RegisterPage />} />
          <Route path="auth/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="partner/apply" element={<PartnerApplyPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleRoute allowedRoles={["client"]} ignorePartnerStatus />}>
            <Route path="client" element={<ClientPortalLayout />}>
              <Route path="dashboard" element={<ClientDashboardPage />} />
              <Route path="claims" element={<ClientClaimsPage />} />
              <Route path="claims/:id" element={<ClientClaimDetailsPage />} />
              <Route path="documents" element={<ClientDocumentsPage />} />
              <Route path="account" element={<ClientAccountPage />} />
              <Route path="profile" element={<Navigate to="../account" replace />} />
              <Route path="payments" element={<ClientPaymentsPage />} />
            </Route>
          </Route>
          <Route path="partner/pending" element={<PartnerPendingPage />} />
          <Route path="partner/rejected" element={<PartnerRejectedPage />} />
          <Route path="partner/suspended" element={<PartnerSuspendedPage />} />
          <Route element={<PartnerRoute />}>
            <Route path="partner" element={<PartnerPortalLayout />}>
              <Route path="dashboard" element={<PartnerDashboardPage />} />
              <Route path="finance" element={<PartnerFinancePage />} />
              <Route path="link" element={<PartnerLinkPage />} />
              <Route path="referrals" element={<PartnerReferralsPage />} />
              <Route path="earnings" element={<PartnerEarningsPage />} />
              <Route path="payouts" element={<PartnerPayoutsPage />} />
              <Route path="profile" element={<PartnerProfilePage />} />
              <Route path="assets" element={<PartnerAssetsPage />} />
            </Route>
          </Route>
        </Route>
        <Route index element={<Home />} />
        <Route path="referral" element={<Referral />} />
        <Route path="referralProgram" element={<Referral />} />
        <Route path="partner-program" element={<Referral />} />
        <Route path="claim" element={<Claim />} />
        <Route path="claim/:stage" element={<Claim />} />
        <Route path="contact" element={<Contact />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogArticle />} />
        <Route path="about" element={<About />} />
        <Route path="aboutUs" element={<About />} />
        <Route path="privacyPolicy" element={<PrivacyPolicy />} />
        <Route path="terms" element={<TermsOfUse />} />
        <Route path="termsOfUse" element={<TermsOfUse />} />
        <Route path="cookies" element={<Cookies />} />
        <Route path="*" element={<RedirectLocalizedFallback />} />
      </Route>
      <Route path="*" element={<RedirectToPreferredLanguage />} />
      </Routes>
    </Suspense>
  );
}

export default AnimatedRoutes;
