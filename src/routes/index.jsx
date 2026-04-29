import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import Home from "../pages/Home/index.jsx";
import About from "../pages/About/index.jsx";
import Contact from "../pages/Contact/index.jsx";
import Blog from "../pages/Blog/index.jsx";
import BlogArticle from "../pages/Blog/Article.jsx";
import Referral from "../pages/Referral/index.jsx";
import Claim from "../pages/Claim/index.jsx";
import Admin from "../pages/Admin/index.jsx";
import PrivacyPolicy from "../pages/PrivacyPolicy/index.jsx";
import TermsOfUse from "../pages/TermsOfUse/index.jsx";
import Cookies from "../pages/Cookies/index.jsx";
import AdminLeads from "../pages/AdminLeads/index.jsx";
import AdminCases from "../pages/AdminCases/index.jsx";
import AdminCustomers from "../pages/AdminCustomers/index.jsx";
import AdminTasks from "../pages/AdminTasks/index.jsx";
import AdminCommunication from "../pages/AdminCommunication/index.jsx";
import AdminDocuments from "../pages/AdminDocuments/index.jsx";
import AdminFinance from "../pages/AdminFinance/index.jsx";
import AdminReferralPartners from "../pages/AdminReferralPartners/index.jsx";
import AdminActivity from "../pages/AdminActivity/index.jsx";
import AdminReports from "../pages/AdminReports/index.jsx";
import AdminSettings from "../pages/AdminSettings/index.jsx";
import AdminFaq from "../pages/AdminFaq/index.jsx";
import AdminBlog from "../pages/AdminBlog/index.jsx";
import AdminCms from "../pages/AdminCms/index.jsx";
import AdminAccess from "../pages/AdminAccess/index.jsx";
import AdminLayout, { AdminForbiddenPage, AdminLoginPage } from "../admin/AdminLayout.jsx";
import { AdminRouteGuard } from "../admin/AdminGuards.jsx";
import i18n from "../i18n/index.js";
import { DEFAULT_LANGUAGE, isSupportedLanguage, setStoredLanguage } from "../i18n/languages.js";
import { getPreferredLanguage, localizePath } from "../i18n/path.js";

function RedirectToPreferredLanguage() {
  const location = useLocation();
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

function AnimatedRoutes({ location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<RedirectToPreferredLanguage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/forbidden" element={<AdminForbiddenPage />} />
      <Route element={<AdminRouteGuard permission="dashboard.view" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Admin />} />
          <Route path="leads" element={<AdminLeads />} />
          <Route path="cases" element={<AdminCases />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="communication" element={<AdminCommunication />} />
          <Route path="documents" element={<AdminDocuments />} />
          <Route path="referral-partners" element={<AdminReferralPartners />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="cms" element={<AdminCms />} />
          <Route path="blog" element={<AdminBlog />} />
          <Route path="faq" element={<AdminFaq />} />
          <Route path="access" element={<AdminAccess />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="activity" element={<AdminActivity />} />
        </Route>
      </Route>
      <Route path="/control-dashboard/*" element={<Navigate to="/admin" replace />} />
      <Route path="/:lang/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="/:lang/control-dashboard/*" element={<Navigate to="/admin" replace />} />
      <Route path="/referral" element={<RedirectToPreferredLanguage />} />
      <Route path="/referralProgram" element={<RedirectToPreferredLanguage />} />
      <Route path="/claim" element={<RedirectToPreferredLanguage />} />
      <Route path="/claim/:stage" element={<RedirectToPreferredLanguage />} />
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
        <Route index element={<Home />} />
        <Route path="referral" element={<Referral />} />
        <Route path="referralProgram" element={<Referral />} />
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
