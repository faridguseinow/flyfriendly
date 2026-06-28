import {
  Activity,
  BarChart3,
  Briefcase,
  Cog,
  FileText,
  FolderOpen,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LayoutPanelTop,
  Megaphone,
  MessageSquareText,
  MonitorPlay,
  NotebookText,
  ReceiptText,
  Settings,
  SquareCheckBig,
  Users,
  UserSquare2,
  Wallet,
} from "lucide-react";

function translateLabel(t, key, fallback) {
  return typeof t === "function" && key ? t(key, { defaultValue: fallback }) : fallback;
}

const adminNavigationSectionsConfig = [
  {
    key: "dashboard",
    labelKey: "admin.nav.sections.dashboard",
    defaultLabel: "Dashboard",
    icon: LayoutDashboard,
    route: "/admin",
    pages: [
      { key: "dashboard-main", labelKey: "admin.nav.pages.dashboardMain", defaultLabel: "Main", path: "/admin", icon: LayoutDashboard, permission: "dashboard.view" },
      { key: "dashboard-marketing", labelKey: "admin.nav.pages.dashboardMarketing", defaultLabel: "Marketing", path: "/admin/dashboard/marketing", icon: Megaphone, permission: "reports.view" },
      { key: "dashboard-revenue", labelKey: "admin.nav.pages.dashboardRevenue", defaultLabel: "Revenue", path: "/admin/dashboard/revenue", icon: BarChart3, anyPermissions: ["reports.view", "finance.view"] },
      { key: "dashboard-activity", labelKey: "admin.nav.pages.dashboardActivity", defaultLabel: "Activity Log", path: "/admin/dashboard/activity", icon: Activity, permission: "activity.view" },
    ],
  },
  {
    key: "operations",
    labelKey: "admin.nav.sections.operations",
    defaultLabel: "Operations",
    icon: Briefcase,
    route: "/admin/operations/leads",
    pages: [
      { key: "operations-leads", labelKey: "admin.nav.pages.operationsLeads", defaultLabel: "Leads", path: "/admin/operations/leads", icon: UserSquare2, permission: "leads.view" },
      { key: "operations-cases", labelKey: "admin.nav.pages.operationsCases", defaultLabel: "Cases", path: "/admin/operations/cases", icon: Briefcase, permission: "cases.view" },
      { key: "operations-tasks", labelKey: "admin.nav.pages.operationsTasks", defaultLabel: "Tasks", path: "/admin/operations/tasks", icon: SquareCheckBig, permission: "tasks.view" },
      { key: "operations-documents", labelKey: "admin.nav.pages.operationsDocuments", defaultLabel: "Documents", path: "/admin/operations/documents", icon: FolderOpen, permission: "documents.view" },
      { key: "operations-inbox", labelKey: "admin.nav.pages.operationsInbox", defaultLabel: "Inbox", path: "/admin/communication", icon: MessageSquareText, permission: "communications.view" },
    ],
  },
  {
    key: "people",
    labelKey: "admin.nav.sections.people",
    defaultLabel: "People",
    icon: Users,
    route: "/admin/people/customers",
    pages: [
      { key: "people-customers", labelKey: "admin.nav.pages.peopleCustomers", defaultLabel: "Customers", path: "/admin/people/customers", icon: Users, permission: "customers.view" },
      { key: "people-users-roles", labelKey: "admin.nav.pages.peopleEmployees", defaultLabel: "Employees", path: "/admin/people/users-roles", icon: KeyRound, anyPermissions: ["team.view", "users.view", "roles.manage"] },
      { key: "people-referral", labelKey: "admin.nav.pages.peopleReferral", defaultLabel: "Referral", path: "/admin/people/referral", icon: UserSquare2, anyPermissions: ["partners.view", "partner_applications.view"] },
    ],
  },
  {
    key: "finance",
    labelKey: "admin.nav.sections.finance",
    defaultLabel: "Finance",
    icon: Wallet,
    route: "/admin/finances",
    pages: [
      { key: "finance-main", labelKey: "admin.nav.pages.financeMain", defaultLabel: "Finance", path: "/admin/finances/finance", icon: Wallet, permission: "finance.view" },
      { key: "finance-payments", labelKey: "admin.nav.pages.financePayments", defaultLabel: "Payments", path: "/admin/finances/payments", icon: ReceiptText, permission: "finance.view" },
      { key: "finance-partner-payouts", labelKey: "admin.nav.pages.financePartnerPayouts", defaultLabel: "Partner payouts", path: "/admin/finances/partner-payouts", icon: ReceiptText, anyPermissions: ["finance.view", "partners.view"] },
      { key: "finance-partner-commissions", labelKey: "admin.nav.pages.financePartnerCommissions", defaultLabel: "Partner commissions", path: "/admin/finances/partner-commissions", icon: Wallet, anyPermissions: ["finance.view", "partners.view"] },
    ],
  },
  {
    key: "content",
    labelKey: "admin.nav.sections.content",
    defaultLabel: "Content",
    icon: FileText,
    route: "/admin/content/pages",
    pages: [
      { key: "content-pages", labelKey: "admin.nav.pages.contentPages", defaultLabel: "Pages", path: "/admin/content/pages", icon: NotebookText, anyPermissions: ["blog.view", "faq.view", "cms.view"] },
      { key: "content-media", labelKey: "admin.nav.pages.contentMedia", defaultLabel: "Media", path: "/admin/content/media", icon: FileText, anyPermissions: ["blog.view", "faq.view", "cms.view"] },
      { key: "content-website", labelKey: "admin.nav.pages.contentWebsite", defaultLabel: "Website", path: "/admin/content/website", icon: MonitorPlay, anyPermissions: ["blog.view", "faq.view", "cms.view"] },
      { key: "content-cms", labelKey: "admin.nav.pages.contentCms", defaultLabel: "CMS", path: "/admin/content/cms", icon: LayoutPanelTop, permission: "cms.view" },
    ],
  },
  {
    key: "settings",
    labelKey: "admin.nav.sections.settings",
    defaultLabel: "Settings",
    icon: Settings,
    route: "/admin/settings",
    pages: [
      { key: "settings-main", labelKey: "admin.nav.pages.settingsPreferences", defaultLabel: "Preferences", path: "/admin/settings", icon: Cog, permission: "settings.view" },
      { key: "settings-system", labelKey: "admin.nav.pages.settingsSystem", defaultLabel: "System settings", path: "/admin/settings/system", icon: Settings, permission: "settings.view" },
    ],
  },
];

function dedupeByPath(items = []) {
  const seenPaths = new Set();

  return items.filter((item) => {
    if (!item?.path || seenPaths.has(item.path)) {
      return false;
    }

    seenPaths.add(item.path);
    return true;
  });
}

export const adminNavigationSectionOrder = adminNavigationSectionsConfig.map((section) => section.key);
export const adminNavigationGroupOrder = adminNavigationSectionOrder;

export function getAdminNavigationSections(t) {
  return adminNavigationSectionsConfig.map((section) => {
    const sectionLabel = translateLabel(t, section.labelKey, section.defaultLabel);
    return {
      ...section,
      label: sectionLabel,
      pages: section.pages.map((page) => ({
        ...page,
        label: translateLabel(t, page.labelKey, page.defaultLabel),
        sectionKey: section.key,
        sectionLabel,
        sectionIcon: section.icon,
      })),
    };
  });
}

export function getAdminNavigation(t) {
  return getAdminNavigationSections(t).flatMap((section) => section.pages);
}

export const adminNavigationSections = getAdminNavigationSections();
export const adminNavigation = getAdminNavigation();
export const adminNavigationByPath = new Map(adminNavigation.map((item) => [item.path, item]));
export function buildAdminNavigationSections(items = [], sectionsConfig = adminNavigationSections) {
  const normalizedItems = dedupeByPath(items);
  const itemsByPath = new Map(normalizedItems.map((item) => [item.path, item]));
  const assignedPaths = new Set();

  const sections = sectionsConfig
    .map((section) => ({
      ...section,
      pages: section.pages
        .map((page) => {
          const item = itemsByPath.get(page.path);
          if (!item) {
            return null;
          }

          assignedPaths.add(page.path);

          return {
            ...page,
            ...item,
            sectionKey: section.key,
            sectionLabel: section.label,
            sectionIcon: section.icon,
          };
        })
        .filter(Boolean),
    }))
    .filter((section) => section.pages.length);

  const unassignedItems = normalizedItems.filter((item) => !assignedPaths.has(item.path));
  if (unassignedItems.length) {
    sections.push({
      key: "other",
      label: "Other",
      icon: Landmark,
      pages: unassignedItems.map((item) => ({
        ...item,
        sectionKey: "other",
        sectionLabel: "Other",
        sectionIcon: Landmark,
      })),
    });
  }

  return sections;
}

export function buildAdminNavigationGroups(items = [], sectionsConfig = adminNavigationSections) {
  return buildAdminNavigationSections(items, sectionsConfig).map((section) => ({
    key: section.key,
    label: section.label,
    icon: section.icon,
    items: section.pages,
  }));
}

export const adminNavigationGroups = buildAdminNavigationGroups(adminNavigation);
