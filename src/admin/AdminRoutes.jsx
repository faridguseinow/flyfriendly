import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminAuthProvider } from "./AdminAuthContext.jsx";
import { AdminRouteGuard } from "./AdminGuards.jsx";
import AdminLayout, { AdminForbiddenPage, AdminLoginPage } from "./AdminLayout.jsx";
import AdminPlaceholderPage from "./AdminPlaceholderPage.jsx";

const AdminLeads = lazy(() => import("../pages/AdminLeads/index.jsx"));
const AdminCases = lazy(() => import("../pages/AdminCases/index.jsx"));
const AdminTasks = lazy(() => import("../pages/AdminTasks/index.jsx"));
const AdminDocuments = lazy(() => import("../pages/AdminDocuments/index.jsx"));
const AdminCustomers = lazy(() => import("../pages/AdminCustomers/index.jsx"));
const AdminActivity = lazy(() => import("../pages/AdminActivity/index.jsx"));
const AdminCommunication = lazy(() => import("../pages/AdminCommunication/index.jsx"));
const AdminFinance = lazy(() => import("../pages/AdminFinance/index.jsx"));
const AdminMarketing = lazy(() => import("../pages/AdminMarketing/index.jsx"));
const AdminPayments = lazy(() => import("../pages/AdminPayments/index.jsx"));
const AdminReports = lazy(() => import("../pages/AdminReports/index.jsx"));
const AdminCms = lazy(() => import("../pages/AdminCms/index.jsx"));
const AdminSettings = lazy(() => import("../pages/AdminSettings/index.jsx"));
const AdminSystemSettings = lazy(() => import("../pages/AdminSystemSettings/index.jsx"));
const AdminTeam = lazy(() => import("../pages/AdminTeam/index.jsx"));
const AdminTeamActivity = lazy(() => import("../pages/AdminTeamActivity/index.jsx"));
const AdminRoles = lazy(() => import("../pages/AdminRoles/index.jsx"));
const AdminAccess = lazy(() => import("../pages/AdminAccess/index.jsx"));
const AdminPartnerApplications = lazy(() => import("../pages/AdminPartnerApplications/index.jsx"));
const AdminReferralPartners = lazy(() => import("../pages/AdminReferralPartners/index.jsx"));
const AdminReferrals = lazy(() => import("../pages/AdminReferrals/index.jsx"));
const AdminPartnerCommissions = lazy(() => import("../pages/AdminPartnerCommissions/index.jsx"));
const AdminPartnerPayouts = lazy(() => import("../pages/AdminPartnerPayouts/index.jsx"));
const AdminReferral = lazy(() => import("../pages/AdminReferral/index.jsx"));
const AdminDashboardMain = lazy(() => import("../pages/AdminDashboardMain/index.jsx"));

function withAdminPermission(element, permission) {
  return <AdminRouteGuard permission={permission}>{element}</AdminRouteGuard>;
}

function adminPlaceholder(title, options = {}) {
  return <AdminPlaceholderPage title={title} {...options} />;
}

export default function AdminRoutes() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLoginPage />} />
        <Route path="forbidden" element={<AdminForbiddenPage />} />
        <Route element={<AdminRouteGuard />}>
          <Route element={<AdminLayout />}>
            <Route index element={withAdminPermission(<AdminDashboardMain />, "dashboard.view")} />

            <Route path="dashboard/marketing" element={withAdminPermission(<AdminMarketing />, "reports.view")} />
            <Route
              path="dashboard/revenue"
              element={<AdminRouteGuard anyPermissions={["reports.view", "finance.view"]}><AdminReports /></AdminRouteGuard>}
            />
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
            <Route path="finances/payments" element={withAdminPermission(<AdminPayments />, "finance.view")} />
            <Route path="finances/partner-payouts" element={<AdminRouteGuard anyPermissions={["partners.view", "finance.view"]}><AdminPartnerPayouts /></AdminRouteGuard>} />
            <Route path="finances/partner-commissions" element={<AdminRouteGuard anyPermissions={["partners.view", "finance.view"]}><AdminPartnerCommissions /></AdminRouteGuard>} />
            <Route path="finances/revenue" element={<Navigate to="/admin/dashboard/revenue" replace />} />

            <Route
              path="content/pages"
              element={<AdminRouteGuard anyPermissions={["blog.view", "faq.view", "cms.view"]}>{adminPlaceholder("Pages")}</AdminRouteGuard>}
            />
            <Route path="content/media" element={withAdminPermission(adminPlaceholder("Media"), "cms.view")} />
            <Route path="content/website" element={withAdminPermission(adminPlaceholder("Website"), "cms.view")} />
            <Route
              path="content/cms"
              element={<AdminRouteGuard anyPermissions={["blog.view", "blog.edit", "cms.view"]}><AdminCms /></AdminRouteGuard>}
            />

            <Route path="settings" element={withAdminPermission(<AdminSettings />, "settings.view")} />
            <Route path="settings/system" element={withAdminPermission(<AdminSystemSettings />, "settings.view")} />

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
            <Route path="finance/revenue" element={<Navigate to="/admin/dashboard/revenue" replace />} />
            <Route path="payments" element={<Navigate to="/admin/finances/payments" replace />} />
            <Route path="revenue" element={<Navigate to="/admin/dashboard/revenue" replace />} />
            <Route path="reports" element={<Navigate to="/admin/dashboard/revenue" replace />} />
            <Route path="blog" element={<Navigate to="/admin/content/cms" replace />} />
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
            <Route path="partner-commissions" element={<Navigate to="/admin/finances/partner-commissions" replace />} />
            <Route path="partner-payouts" element={<Navigate to="/admin/finances/partner-payouts" replace />} />
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
      </Routes>
    </AdminAuthProvider>
  );
}
