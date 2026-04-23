import { Navigate, Route, Routes } from "react-router-dom";
import Home from "../pages/Home/index.jsx";
import About from "../pages/About/index.jsx";
import Contact from "../pages/Contact/index.jsx";
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

function AnimatedRoutes({ location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<Home />} />
      <Route path="/referral" element={<Referral />} />
      <Route path="/referralProgram" element={<Referral />} />
      <Route path="/claim" element={<Claim />} />
      <Route path="/claim/:stage" element={<Claim />} />
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
      <Route path="/contact" element={<Contact />} />
      <Route path="/about" element={<About />} />
      <Route path="/aboutUs" element={<About />} />
      <Route path="/privacyPolicy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/termsOfUse" element={<TermsOfUse />} />
      <Route path="/cookies" element={<Cookies />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AnimatedRoutes;
