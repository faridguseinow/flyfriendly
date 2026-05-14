import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import Home from "../pages/Home/index.jsx";
import About from "../pages/About/index.jsx";
import Contact from "../pages/Contact/index.jsx";
import Blog from "../pages/Blog/index.jsx";
import BlogArticle from "../pages/Blog/Article.jsx";
import Referral from "../pages/Referral/index.jsx";
import Claim from "../pages/Claim/index.jsx";
import PrivacyPolicy from "../pages/PrivacyPolicy/index.jsx";
import TermsOfUse from "../pages/TermsOfUse/index.jsx";
import Cookies from "../pages/Cookies/index.jsx";
import AdminLayout, { AdminForbiddenPage, AdminLoginPage } from "../admin/AdminLayout.jsx";
import AdminPlaceholderPage from "../admin/AdminPlaceholderPage.jsx";
import { AdminRouteGuard } from "../admin/AdminGuards.jsx";
import { GuestRoute, PartnerRoute, ProtectedRoute, RoleRoute } from "../auth/AuthGuards.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import i18n from "../i18n/index.js";
import { DEFAULT_LANGUAGE, isSupportedLanguage, setStoredLanguage } from "../i18n/languages.js";
import { getPreferredLanguage, localizePath } from "../i18n/path.js";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "../pages/Auth/index.jsx";
import {
  ClientClaimDetailsPage,
  ClientClaimsPage,
  ClientDashboardPage,
  ClientDocumentsPage,
  ClientPaymentsPage,
  ClientPortalLayout,
  ClientProfilePage,
} from "../pages/ClientPortal/index.jsx";
import PartnerApplyPage from "../pages/PartnerApply/index.jsx";
import ReferralCapturePage from "../pages/ReferralCapture/index.jsx";
import AdminLeads from "../pages/AdminLeads/index.jsx";
import AdminCases from "../pages/AdminCases/index.jsx";
import AdminTasks from "../pages/AdminTasks/index.jsx";
import AdminDocuments from "../pages/AdminDocuments/index.jsx";
import AdminCustomers from "../pages/AdminCustomers/index.jsx";
import AdminActivity from "../pages/AdminActivity/index.jsx";
import AdminCommunication from "../pages/AdminCommunication/index.jsx";
import AdminFinance from "../pages/AdminFinance/index.jsx";
import AdminReports from "../pages/AdminReports/index.jsx";
import AdminCms from "../pages/AdminCms/index.jsx";
import AdminSettings from "../pages/AdminSettings/index.jsx";
import AdminTeam from "../pages/AdminTeam/index.jsx";
import AdminTeamActivity from "../pages/AdminTeamActivity/index.jsx";
import AdminRoles from "../pages/AdminRoles/index.jsx";
import AdminAccess from "../pages/AdminAccess/index.jsx";
import AdminPartnerApplications from "../pages/AdminPartnerApplications/index.jsx";
import AdminReferralPartners from "../pages/AdminReferralPartners/index.jsx";
import AdminReferrals from "../pages/AdminReferrals/index.jsx";
import AdminPartnerCommissions from "../pages/AdminPartnerCommissions/index.jsx";
import AdminPartnerPayouts from "../pages/AdminPartnerPayouts/index.jsx";
import AdminReferral from "../pages/AdminReferral/index.jsx";
import {
  PartnerAssetsPage,
  PartnerDashboardPage,
  PartnerEarningsPage,
  PartnerLinkPage,
  PartnerPendingPage,
  PartnerPortalLayout,
  PartnerProfilePage,
  PartnerPayoutsPage,
  PartnerRejectedPage,
  PartnerReferralsPage,
  PartnerSuspendedPage,
} from "../pages/PartnerPortal/index.jsx";

const GOOGLE_OAUTH_PENDING_KEY = "flyfriendly.googleOAuth.pending";

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
  const { loading, isAuthenticated, dashboardPath } = useAuth();

  if (hasPendingGoogleOAuthRedirect()) {
    if (loading) {
      return <div className="placeholder-page"><p>Loading account...</p></div>;
    }

    clearPendingGoogleOAuthRedirect();

    if (isAuthenticated) {
      return <Navigate to={dashboardPath} replace />;
    }
  }

  const targetLanguage = getPreferredLanguage();
  return <Navigate to={localizePath(`${location.pathname}${location.search}${location.hash}`, targetLanguage)} replace />;
}

function LanguageBoundary() {
  const location = useLocation();
  const { lang } = useParams();

  if (!isSupportedLanguage(lang)) {
    const segments = location.pathname.split("/").filter(Boolean);
    const [, ...rest] = segments;
    const nextPath = rest.length ? `/${rest.join("/")}` : "/";
    return <Navigate to={localizePath(`${nextPath}${location.search}${location.hash}`, DEFAULT_LANGUAGE)} replace />;
  }

  useEffect(() => {
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }

    setStoredLanguage(lang);
  }, [lang]);

  return <Outlet />;
}

function RedirectLocalizedFallback() {
  const { lang } = useParams();
  return <Navigate to={localizePath("/", isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE)} replace />;
}

function withAdminPermission(element, permission) {
  return <AdminRouteGuard permission={permission}>{element}</AdminRouteGuard>;
}

function adminPlaceholder(title, options = {}) {
  return <AdminPlaceholderPage title={title} {...options} />;
}

function AnimatedRoutes({ location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<RedirectToPreferredLanguage />} />
      <Route path="/r/:referralCode" element={<ReferralCapturePage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/forbidden" element={<AdminForbiddenPage />} />
      <Route element={<AdminRouteGuard />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={withAdminPermission(adminPlaceholder("Main"), "dashboard.view")} />

          <Route path="dashboard/marketing" element={withAdminPermission(adminPlaceholder("Marketing"), "dashboard.view")} />
          <Route path="dashboard/activity" element={withAdminPermission(<AdminActivity />, "activity.view")} />

          <Route path="operations/leads" element={withAdminPermission(<AdminLeads />, "leads.view")} />
          <Route path="operations/cases" element={withAdminPermission(<AdminCases />, "cases.view")} />
          <Route path="operations/tasks" element={withAdminPermission(<AdminTasks />, "tasks.view")} />
          <Route path="operations/documents" element={withAdminPermission(<AdminDocuments />, "documents.view")} />

          <Route path="people/customers" element={withAdminPermission(<AdminCustomers />, "customers.view")} />
          <Route
            path="people/users-roles"
            element={<AdminRouteGuard anyPermissions={["team.view", "users.view", "roles.manage"]}><AdminTeam /></AdminRouteGuard>}
          />
          <Route
            path="people/referral"
            element={<AdminRouteGuard anyPermissions={["partners.view", "partner_applications.view"]}><AdminReferral /></AdminRouteGuard>}
          />

          <Route path="finances" element={<Navigate to="/admin/finances/finance" replace />} />
          <Route path="finances/finance" element={withAdminPermission(<AdminFinance />, "finance.view")} />
          <Route path="finances/payments" element={withAdminPermission(adminPlaceholder("Payments"), "finance.view")} />
          <Route path="finances/revenue" element={withAdminPermission(<AdminReports />, "reports.view")} />

          <Route
            path="content/pages"
            element={<AdminRouteGuard anyPermissions={["blog.view", "faq.view", "cms.view"]}>{adminPlaceholder("Pages")}</AdminRouteGuard>}
          />
          <Route path="content/media" element={withAdminPermission(adminPlaceholder("Media"), "cms.view")} />
          <Route path="content/website" element={withAdminPermission(adminPlaceholder("Website"), "cms.view")} />
          <Route path="content/cms" element={withAdminPermission(<AdminCms />, "cms.view")} />

          <Route path="settings" element={withAdminPermission(<AdminSettings />, "settings.view")} />

          <Route path="activity" element={<Navigate to="/admin/dashboard/activity" replace />} />
          <Route path="marketing" element={<Navigate to="/admin/dashboard/marketing" replace />} />
          <Route path="leads" element={<Navigate to="/admin/operations/leads" replace />} />
          <Route path="cases" element={<Navigate to="/admin/operations/cases" replace />} />
          <Route path="tasks" element={<Navigate to="/admin/operations/tasks" replace />} />
          <Route path="documents" element={<Navigate to="/admin/operations/documents" replace />} />
          <Route path="customers" element={<Navigate to="/admin/people/customers" replace />} />
          <Route path="team" element={<Navigate to="/admin/people/users-roles" replace />} />
          <Route path="referral" element={<Navigate to="/admin/people/referral" replace />} />
          <Route path="finance" element={<Navigate to="/admin/finances/finance" replace />} />
          <Route path="finance/payments" element={<Navigate to="/admin/finances/payments" replace />} />
          <Route path="finance/revenue" element={<Navigate to="/admin/finances/revenue" replace />} />
          <Route path="payments" element={<Navigate to="/admin/finances/payments" replace />} />
          <Route path="revenue" element={<Navigate to="/admin/finances/revenue" replace />} />
          <Route path="reports" element={<Navigate to="/admin/finances/revenue" replace />} />
          <Route path="blog" element={<Navigate to="/admin/content/pages" replace />} />
          <Route path="faq" element={<Navigate to="/admin/content/pages" replace />} />
          <Route path="pages" element={<Navigate to="/admin/content/pages" replace />} />
          <Route path="cms" element={<Navigate to="/admin/content/cms" replace />} />
          <Route path="media" element={<Navigate to="/admin/content/media" replace />} />
          <Route path="website" element={<Navigate to="/admin/content/website" replace />} />

          <Route path="communication" element={withAdminPermission(<AdminCommunication />, "communications.view")} />
          <Route
            path="partner-applications"
            element={<AdminRouteGuard anyPermissions={["partner_applications.view", "partners.view"]}><AdminPartnerApplications /></AdminRouteGuard>}
          />
          <Route path="referral-partners" element={withAdminPermission(<AdminReferralPartners />, "partners.view")} />
          <Route path="referrals" element={withAdminPermission(<AdminReferrals />, "partners.view")} />
          <Route path="partner-commissions" element={withAdminPermission(<AdminPartnerCommissions />, "partners.view")} />
          <Route path="partner-payouts" element={withAdminPermission(<AdminPartnerPayouts />, "partners.view")} />
          <Route path="case-finance" element={withAdminPermission(adminPlaceholder("Case Finance"), "finance.view")} />
          <Route
            path="team/:id/activity"
            element={<AdminRouteGuard anyPermissions={["team.view", "users.view"]}><AdminTeamActivity /></AdminRouteGuard>}
          />
          <Route path="access" element={withAdminPermission(<AdminAccess />, "users.view")} />
          <Route path="roles" element={withAdminPermission(<AdminRoles />, "roles.manage")} />
          <Route path="menu-builder" element={withAdminPermission(adminPlaceholder("Menu Builder"), "menu.view")} />
          <Route
            path="trash"
            element={<AdminRouteGuard anyPermissions={["trash.manage", "users.manage"]}>{adminPlaceholder("Trash")}</AdminRouteGuard>}
          />
        </Route>
      </Route>
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
          <Route element={<RoleRoute allowedRoles={["client", "partner"]} ignorePartnerStatus />}>
            <Route path="client" element={<ClientPortalLayout />}>
              <Route path="dashboard" element={<ClientDashboardPage />} />
              <Route path="claims" element={<ClientClaimsPage />} />
              <Route path="claims/:id" element={<ClientClaimDetailsPage />} />
              <Route path="documents" element={<ClientDocumentsPage />} />
              <Route path="profile" element={<ClientProfilePage />} />
              <Route path="payments" element={<ClientPaymentsPage />} />
            </Route>
          </Route>
          <Route path="partner/pending" element={<PartnerPendingPage />} />
          <Route path="partner/rejected" element={<PartnerRejectedPage />} />
          <Route path="partner/suspended" element={<PartnerSuspendedPage />} />
          <Route element={<PartnerRoute />}>
            <Route path="partner" element={<PartnerPortalLayout />}>
              <Route path="dashboard" element={<PartnerDashboardPage />} />
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
  );
}

export default AnimatedRoutes;
