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
  MonitorPlay,
  NotebookText,
  ReceiptText,
  Settings,
  SquareCheckBig,
  Users,
  UserSquare2,
  Wallet,
} from "lucide-react";

const adminNavigationSectionsConfig = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    route: "/admin",
    pages: [
      { key: "dashboard-main", label: "Main", path: "/admin", icon: LayoutDashboard, permission: "dashboard.view" },
      { key: "dashboard-marketing", label: "Marketing", path: "/admin/dashboard/marketing", icon: Megaphone, permission: "dashboard.view" },
      { key: "dashboard-revenue", label: "Revenue", path: "/admin/dashboard/revenue", icon: BarChart3, anyPermissions: ["reports.view", "finance.view"] },
      { key: "dashboard-activity", label: "Activity Log", path: "/admin/dashboard/activity", icon: Activity, permission: "activity.view" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Briefcase,
    route: "/admin/operations/leads",
    pages: [
      { key: "operations-leads", label: "Leads", path: "/admin/operations/leads", icon: UserSquare2, permission: "leads.view" },
      { key: "operations-cases", label: "Cases", path: "/admin/operations/cases", icon: Briefcase, permission: "cases.view" },
      { key: "operations-tasks", label: "Tasks", path: "/admin/operations/tasks", icon: SquareCheckBig, permission: "tasks.view" },
      { key: "operations-documents", label: "Documents", path: "/admin/operations/documents", icon: FolderOpen, permission: "documents.view" },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: Users,
    route: "/admin/people/customers",
    pages: [
      { key: "people-customers", label: "Customers", path: "/admin/people/customers", icon: Users, permission: "customers.view" },
      { key: "people-users-roles", label: "Employees", path: "/admin/people/users-roles", icon: KeyRound, anyPermissions: ["team.view", "users.view", "roles.manage"] },
      { key: "people-referral", label: "Referral", path: "/admin/people/referral", icon: UserSquare2, anyPermissions: ["partners.view", "partner_applications.view"] },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    route: "/admin/finances",
    pages: [
      { key: "finance-main", label: "Finance", path: "/admin/finances/finance", icon: Wallet, permission: "finance.view" },
      { key: "finance-payments", label: "Payments", path: "/admin/finances/payments", icon: ReceiptText, permission: "finance.view" },
      { key: "finance-partner-payouts", label: "Partner payouts", path: "/admin/finances/partner-payouts", icon: ReceiptText, anyPermissions: ["finance.view", "partners.view"] },
      { key: "finance-partner-commissions", label: "Partner commissions", path: "/admin/finances/partner-commissions", icon: Wallet, anyPermissions: ["finance.view", "partners.view"] },
    ],
  },
  {
    key: "content",
    label: "Content",
    icon: FileText,
    route: "/admin/content/pages",
    pages: [
      { key: "content-pages", label: "Pages", path: "/admin/content/pages", icon: NotebookText, anyPermissions: ["blog.view", "faq.view", "cms.view"] },
      { key: "content-media", label: "Media", path: "/admin/content/media", icon: FileText, anyPermissions: ["blog.view", "faq.view", "cms.view"] },
      { key: "content-website", label: "Website", path: "/admin/content/website", icon: MonitorPlay, anyPermissions: ["blog.view", "faq.view", "cms.view"] },
      { key: "content-cms", label: "CMS", path: "/admin/content/cms", icon: LayoutPanelTop, permission: "cms.view" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    route: "/admin/settings",
    pages: [
      { key: "settings-main", label: "Settings", path: "/admin/settings", icon: Cog, permission: "settings.view" },
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

export const adminNavigationSections = adminNavigationSectionsConfig.map((section) => ({
  ...section,
  pages: section.pages.map((page) => ({
    ...page,
    sectionKey: section.key,
    sectionLabel: section.label,
    sectionIcon: section.icon,
  })),
}));

export const adminNavigation = adminNavigationSections.flatMap((section) => section.pages);

const navigationByPath = new Map(adminNavigation.map((item) => [item.path, item]));

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
export const adminNavigationByPath = navigationByPath;
