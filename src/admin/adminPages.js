import {
  Activity,
  BarChart3,
  Briefcase,
  Cog,
  FileText,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  LayoutPanelTop,
  Megaphone,
  MessageSquareText,
  MonitorPlay,
  NotebookText,
  ReceiptText,
  Settings,
  SquareCheckBig,
  UserSquare2,
  Users,
  Wallet,
} from "lucide-react";

export const ADMIN_PAGE_SECTIONS = [
  {
    key: "dashboard",
    labelKey: "admin.nav.sections.dashboard",
    defaultLabel: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "operations",
    labelKey: "admin.nav.sections.operations",
    defaultLabel: "Operations",
    icon: Briefcase,
  },
  {
    key: "people",
    labelKey: "admin.nav.sections.people",
    defaultLabel: "People",
    icon: Users,
  },
  {
    key: "partners",
    labelKey: "admin.nav.sections.partners",
    defaultLabel: "Partners",
    icon: UserSquare2,
  },
  {
    key: "finance",
    labelKey: "admin.nav.sections.finance",
    defaultLabel: "Finance",
    icon: Wallet,
  },
  {
    key: "content",
    labelKey: "admin.nav.sections.content",
    defaultLabel: "Content",
    icon: FileText,
  },
  {
    key: "settings",
    labelKey: "admin.nav.sections.settings",
    defaultLabel: "Settings",
    icon: Settings,
  },
];

export const ADMIN_ROUTE_ALIASES = new Map([
  ["/admin/dashboard/main", "/admin"],
  ["/admin/dashboard/activity-log", "/admin/dashboard/activity"],
  ["/admin/people/employees", "/admin/people/users-roles"],
  ["/admin/finances", "/admin/finances/finance"],
  ["/admin/activity", "/admin/dashboard/activity"],
  ["/admin/marketing", "/admin/dashboard/marketing"],
  ["/admin/leads", "/admin/operations/leads"],
  ["/admin/cases", "/admin/operations/cases"],
  ["/admin/tasks", "/admin/operations/tasks"],
  ["/admin/documents", "/admin/operations/documents"],
  ["/admin/customers", "/admin/people/customers"],
  ["/admin/team", "/admin/people/users-roles"],
  ["/admin/referral", "/admin/people/referral"],
  ["/admin/finance", "/admin/finances/finance"],
  ["/admin/finance/payments", "/admin/finances/payments"],
  ["/admin/finance/revenue", "/admin/dashboard/revenue"],
  ["/admin/payments", "/admin/finances/payments"],
  ["/admin/revenue", "/admin/dashboard/revenue"],
  ["/admin/reports", "/admin/dashboard/revenue"],
  ["/admin/blog", "/admin/content/cms"],
  ["/admin/faq", "/admin/content/pages"],
  ["/admin/pages", "/admin/content/pages"],
  ["/admin/cms", "/admin/content/cms"],
  ["/admin/media", "/admin/content/media"],
  ["/admin/website", "/admin/content/website"],
  ["/admin/partner-commissions", "/admin/finances/partner-commissions"],
  ["/admin/partner-payouts", "/admin/finances/partner-payouts"],
]);

export const ADMIN_PAGE_DEFINITIONS = [
  {
    key: "dashboard.main",
    navKey: "dashboard-main",
    labelKey: "admin.nav.pages.dashboardMain",
    defaultLabel: "Main",
    sectionKey: "dashboard",
    route: "/admin",
    icon: LayoutDashboard,
    viewPermissions: ["dashboard.view"],
    editPermissions: [],
    supportsEdit: false,
    showInNavigation: true,
  },
  {
    key: "dashboard.marketing",
    navKey: "dashboard-marketing",
    labelKey: "admin.nav.pages.dashboardMarketing",
    defaultLabel: "Marketing",
    sectionKey: "dashboard",
    route: "/admin/dashboard/marketing",
    icon: Megaphone,
    viewPermissions: ["reports.view"],
    editPermissions: [],
    supportsEdit: false,
    showInNavigation: true,
  },
  {
    key: "dashboard.revenue",
    navKey: "dashboard-revenue",
    labelKey: "admin.nav.pages.dashboardRevenue",
    defaultLabel: "Revenue",
    sectionKey: "dashboard",
    route: "/admin/dashboard/revenue",
    icon: BarChart3,
    viewPermissions: ["reports.view", "finance.view"],
    editPermissions: ["reports.export", "finance.edit"],
    supportsEdit: true,
    showInNavigation: true,
    sensitive: true,
  },
  {
    key: "dashboard.activity",
    navKey: "dashboard-activity",
    labelKey: "admin.nav.pages.dashboardActivity",
    defaultLabel: "Activity Log",
    sectionKey: "dashboard",
    route: "/admin/dashboard/activity",
    icon: Activity,
    viewPermissions: ["activity.view"],
    editPermissions: [],
    supportsEdit: false,
    showInNavigation: true,
    sensitive: true,
  },
  {
    key: "operations.leads",
    navKey: "operations-leads",
    labelKey: "admin.nav.pages.operationsLeads",
    defaultLabel: "Leads",
    sectionKey: "operations",
    route: "/admin/operations/leads",
    icon: UserSquare2,
    viewPermissions: ["leads.view"],
    editPermissions: ["leads.edit", "leads.assign", "leads.export"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "operations.cases",
    navKey: "operations-cases",
    labelKey: "admin.nav.pages.operationsCases",
    defaultLabel: "Cases",
    sectionKey: "operations",
    route: "/admin/operations/cases",
    icon: Briefcase,
    viewPermissions: ["cases.view"],
    editPermissions: ["cases.edit", "cases.assign", "cases.export"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "operations.tasks",
    navKey: "operations-tasks",
    labelKey: "admin.nav.pages.operationsTasks",
    defaultLabel: "Tasks",
    sectionKey: "operations",
    route: "/admin/operations/tasks",
    icon: SquareCheckBig,
    viewPermissions: ["tasks.view"],
    editPermissions: ["tasks.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "operations.documents",
    navKey: "operations-documents",
    labelKey: "admin.nav.pages.operationsDocuments",
    defaultLabel: "Documents",
    sectionKey: "operations",
    route: "/admin/operations/documents",
    icon: FolderOpen,
    viewPermissions: ["documents.view"],
    editPermissions: ["documents.manage", "documents.download"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "operations.inbox",
    navKey: "operations-inbox",
    labelKey: "admin.nav.pages.operationsInbox",
    defaultLabel: "Inbox",
    sectionKey: "operations",
    route: "/admin/communication",
    icon: MessageSquareText,
    viewPermissions: ["communications.view"],
    editPermissions: ["communications.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "people.customers",
    navKey: "people-customers",
    labelKey: "admin.nav.pages.peopleCustomers",
    defaultLabel: "Customers",
    sectionKey: "people",
    route: "/admin/people/customers",
    icon: Users,
    viewPermissions: ["customers.view"],
    editPermissions: ["customers.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "people.employees",
    navKey: "people-users-roles",
    labelKey: "admin.nav.pages.peopleEmployees",
    defaultLabel: "Employees",
    sectionKey: "people",
    route: "/admin/people/users-roles",
    icon: KeyRound,
    viewPermissions: ["team.view", "users.view", "roles.manage"],
    editPermissions: ["team.manage", "users.manage", "roles.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: true,
  },
  {
    key: "partners.referral",
    navKey: "people-referral",
    labelKey: "admin.nav.pages.peopleReferral",
    defaultLabel: "Referral",
    sectionKey: "partners",
    route: "/admin/people/referral",
    icon: UserSquare2,
    viewPermissions: ["partners.view", "partner_applications.view", "referrals.view"],
    editPermissions: ["partners.edit", "partner_applications.manage"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "partners.applications",
    navKey: "partners-applications",
    labelKey: "admin.nav.pages.partnersApplications",
    defaultLabel: "Applications",
    sectionKey: "partners",
    route: "/admin/partner-applications",
    icon: UserSquare2,
    viewPermissions: ["partner_applications.view", "partners.view"],
    editPermissions: ["partner_applications.manage", "partners.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "partners.referralPartners",
    navKey: "partners-referral-partners",
    labelKey: "admin.nav.pages.partnersReferralPartners",
    defaultLabel: "Referral Partners",
    sectionKey: "partners",
    route: "/admin/referral-partners",
    icon: UserSquare2,
    viewPermissions: ["partners.view"],
    editPermissions: ["partners.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "partners.referrals",
    navKey: "partners-referrals",
    labelKey: "admin.nav.pages.partnersReferrals",
    defaultLabel: "Referrals",
    sectionKey: "partners",
    route: "/admin/referrals",
    icon: UserSquare2,
    viewPermissions: ["partners.view", "referrals.view"],
    editPermissions: ["partners.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "finance.overview",
    navKey: "finance-main",
    labelKey: "admin.nav.pages.financeMain",
    defaultLabel: "Finance",
    sectionKey: "finance",
    route: "/admin/finances/finance",
    icon: Wallet,
    viewPermissions: ["finance.view"],
    editPermissions: ["finance.edit"],
    supportsEdit: true,
    showInNavigation: true,
    sensitive: true,
  },
  {
    key: "finance.payments",
    navKey: "finance-payments",
    labelKey: "admin.nav.pages.financePayments",
    defaultLabel: "Payments",
    sectionKey: "finance",
    route: "/admin/finances/payments",
    icon: ReceiptText,
    viewPermissions: ["finance.view"],
    editPermissions: ["finance.edit"],
    supportsEdit: true,
    showInNavigation: true,
    sensitive: true,
  },
  {
    key: "finance.partnerPayouts",
    navKey: "finance-partner-payouts",
    labelKey: "admin.nav.pages.financePartnerPayouts",
    defaultLabel: "Partner payouts",
    sectionKey: "finance",
    route: "/admin/finances/partner-payouts",
    icon: ReceiptText,
    viewPermissions: ["finance.view", "partners.view"],
    editPermissions: ["finance.edit", "partners.edit"],
    supportsEdit: true,
    showInNavigation: true,
    sensitive: true,
  },
  {
    key: "finance.partnerCommissions",
    navKey: "finance-partner-commissions",
    labelKey: "admin.nav.pages.financePartnerCommissions",
    defaultLabel: "Partner commissions",
    sectionKey: "finance",
    route: "/admin/finances/partner-commissions",
    icon: Wallet,
    viewPermissions: ["finance.view", "partners.view", "referrals.view"],
    editPermissions: ["finance.edit", "partners.edit"],
    supportsEdit: true,
    showInNavigation: true,
    sensitive: true,
  },
  {
    key: "finance.caseFinance",
    navKey: "finance-case-finance",
    labelKey: "admin.nav.pages.financeCaseFinance",
    defaultLabel: "Case Finance",
    sectionKey: "finance",
    route: "/admin/case-finance",
    icon: Wallet,
    viewPermissions: ["finance.view"],
    editPermissions: ["finance.edit"],
    supportsEdit: true,
    showInNavigation: false,
    sensitive: true,
  },
  {
    key: "content.pages",
    navKey: "content-pages",
    labelKey: "admin.nav.pages.contentPages",
    defaultLabel: "Pages",
    sectionKey: "content",
    route: "/admin/content/pages",
    icon: NotebookText,
    viewPermissions: ["blog.view", "faq.view", "cms.view"],
    editPermissions: ["blog.edit", "faq.edit", "cms.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "content.media",
    navKey: "content-media",
    labelKey: "admin.nav.pages.contentMedia",
    defaultLabel: "Media",
    sectionKey: "content",
    route: "/admin/content/media",
    icon: FileText,
    viewPermissions: ["cms.view", "blog.view", "faq.view"],
    editPermissions: ["cms.edit", "blog.edit", "faq.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "content.website",
    navKey: "content-website",
    labelKey: "admin.nav.pages.contentWebsite",
    defaultLabel: "Website",
    sectionKey: "content",
    route: "/admin/content/website",
    icon: MonitorPlay,
    viewPermissions: ["cms.view", "blog.view", "faq.view"],
    editPermissions: ["cms.edit", "blog.edit", "faq.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "content.blog",
    navKey: "content-cms",
    labelKey: "admin.nav.pages.contentCms",
    defaultLabel: "Blog CMS",
    sectionKey: "content",
    route: "/admin/content/cms",
    icon: LayoutPanelTop,
    viewPermissions: ["blog.view", "cms.view"],
    editPermissions: ["blog.edit", "cms.edit"],
    supportsEdit: true,
    showInNavigation: true,
  },
  {
    key: "settings.general",
    navKey: "settings-main",
    labelKey: "admin.nav.pages.settingsPreferences",
    defaultLabel: "Preferences",
    sectionKey: "settings",
    route: "/admin/settings",
    icon: Cog,
    viewPermissions: ["settings.view"],
    editPermissions: ["settings.edit", "settings.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: true,
  },
  {
    key: "settings.system",
    navKey: "settings-system",
    labelKey: "admin.nav.pages.settingsSystem",
    defaultLabel: "System settings",
    sectionKey: "settings",
    route: "/admin/settings/system",
    icon: Settings,
    viewPermissions: ["settings.view"],
    editPermissions: ["settings.edit", "settings.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: true,
  },
  {
    key: "settings.access",
    navKey: "settings-access",
    labelKey: "admin.nav.pages.settingsAccess",
    defaultLabel: "Access",
    sectionKey: "settings",
    route: "/admin/access",
    icon: KeyRound,
    viewPermissions: ["users.view", "team.view"],
    editPermissions: ["users.manage", "team.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: false,
  },
  {
    key: "settings.roles",
    navKey: "settings-roles",
    labelKey: "admin.nav.pages.settingsRoles",
    defaultLabel: "Roles",
    sectionKey: "settings",
    route: "/admin/roles",
    icon: KeyRound,
    viewPermissions: ["roles.view", "roles.manage"],
    editPermissions: ["roles.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: false,
  },
  {
    key: "settings.menuBuilder",
    navKey: "settings-menu-builder",
    labelKey: "admin.nav.pages.settingsMenuBuilder",
    defaultLabel: "Menu Builder",
    sectionKey: "settings",
    route: "/admin/menu-builder",
    icon: KeyRound,
    viewPermissions: ["menu.view"],
    editPermissions: ["menu.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: false,
  },
  {
    key: "settings.trash",
    navKey: "settings-trash",
    labelKey: "admin.nav.pages.settingsTrash",
    defaultLabel: "Trash",
    sectionKey: "settings",
    route: "/admin/trash",
    icon: Settings,
    viewPermissions: ["trash.manage", "users.manage"],
    editPermissions: ["trash.manage", "users.manage"],
    supportsEdit: true,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: false,
  },
  {
    key: "team.activity",
    navKey: "team-activity",
    labelKey: "admin.nav.pages.teamActivity",
    defaultLabel: "Team Activity",
    sectionKey: "people",
    routeMatcher: /^\/admin\/team\/[^/]+\/activity$/,
    route: "/admin/team/:id/activity",
    icon: Activity,
    viewPermissions: ["team.view", "users.view", "activity.view"],
    editPermissions: [],
    supportsEdit: false,
    ownerOnly: true,
    sensitive: true,
    showInNavigation: false,
  },
];

export const ADMIN_NAVIGATION_PAGE_DEFINITIONS = ADMIN_PAGE_DEFINITIONS.filter((page) => page.showInNavigation);
export const ADMIN_PAGES_BY_KEY = new Map(ADMIN_PAGE_DEFINITIONS.map((page) => [page.key, page]));

export function normalizeAdminPathname(pathname = "") {
  const [pathWithoutHash] = String(pathname || "").split("#");
  const [pathWithoutSearch] = pathWithoutHash.split("?");
  const normalized = pathWithoutSearch || "/";

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

export function resolveAdminRouteAlias(pathname = "") {
  let current = normalizeAdminPathname(pathname);
  let previous = "";

  while (current && current !== previous && ADMIN_ROUTE_ALIASES.has(current)) {
    previous = current;
    current = ADMIN_ROUTE_ALIASES.get(current) || current;
  }

  return current;
}

export function getAdminPageByPath(pathname = "") {
  const resolvedPath = resolveAdminRouteAlias(pathname);

  return ADMIN_PAGE_DEFINITIONS.find((page) => {
    if (page.routeMatcher instanceof RegExp) {
      return page.routeMatcher.test(resolvedPath);
    }

    return page.route === resolvedPath;
  }) || null;
}

export function buildAdminPermissionsFromPageAccess(pageAccessRows = []) {
  const permissions = new Set();

  pageAccessRows.forEach((row) => {
    if (!row?.canView) {
      return;
    }

    const page = ADMIN_PAGES_BY_KEY.get(row.pageKey);
    if (!page) {
      return;
    }

    page.viewPermissions.forEach((permission) => permissions.add(permission));

    if (row.canEdit) {
      page.editPermissions.forEach((permission) => permissions.add(permission));
    }
  });

  return Array.from(permissions);
}

export function createPageAccessRow(pageKey, canEdit = false) {
  return {
    pageKey,
    canView: true,
    canEdit: Boolean(canEdit),
  };
}

export const ADMIN_ACCESS_TEMPLATES = [
  {
    key: "content_manager",
    label: "Content Manager",
    roleCode: "content_manager",
    access: [
      createPageAccessRow("dashboard.main", false),
      createPageAccessRow("content.blog", true),
      createPageAccessRow("content.pages", true),
      createPageAccessRow("content.media", true),
      createPageAccessRow("content.website", true),
    ],
  },
  {
    key: "customer_claims_manager",
    label: "Customer Claims Manager",
    roleCode: "case_manager",
    access: [
      createPageAccessRow("dashboard.main", false),
      createPageAccessRow("operations.leads", true),
      createPageAccessRow("operations.cases", true),
      createPageAccessRow("operations.tasks", true),
      createPageAccessRow("operations.documents", true),
      createPageAccessRow("operations.inbox", true),
      createPageAccessRow("people.customers", false),
    ],
  },
  {
    key: "finance_manager",
    label: "Finance Manager",
    roleCode: "finance_manager",
    access: [
      createPageAccessRow("dashboard.main", false),
      createPageAccessRow("dashboard.revenue", true),
      createPageAccessRow("finance.overview", true),
      createPageAccessRow("finance.payments", true),
      createPageAccessRow("finance.partnerPayouts", true),
      createPageAccessRow("finance.partnerCommissions", true),
    ],
  },
  {
    key: "partner_manager",
    label: "Partner Manager",
    roleCode: "partner_manager",
    access: [
      createPageAccessRow("dashboard.main", false),
      createPageAccessRow("partners.referral", true),
      createPageAccessRow("partners.applications", true),
      createPageAccessRow("partners.referralPartners", true),
      createPageAccessRow("partners.referrals", true),
    ],
  },
  {
    key: "read_only",
    label: "Read Only",
    roleCode: "read_only",
    access: [
      createPageAccessRow("dashboard.main", false),
      createPageAccessRow("operations.leads", false),
      createPageAccessRow("operations.cases", false),
      createPageAccessRow("people.customers", false),
    ],
  },
  {
    key: "custom",
    label: "Custom",
    roleCode: "read_only",
    access: [],
  },
];

export const ADMIN_ACCESS_TEMPLATES_BY_KEY = new Map(ADMIN_ACCESS_TEMPLATES.map((template) => [template.key, template]));

export function serializePageAccess(pageAccessRows = []) {
  return pageAccessRows
    .filter((row) => row?.pageKey && row.canView)
    .map((row) => `${row.pageKey}:${row.canEdit ? "edit" : "view"}`)
    .sort()
    .join("|");
}

export function detectAccessTemplate(pageAccessRows = []) {
  const serialized = serializePageAccess(pageAccessRows);

  return ADMIN_ACCESS_TEMPLATES.find((template) => (
    template.key !== "custom" && serializePageAccess(template.access) === serialized
  )) || ADMIN_ACCESS_TEMPLATES_BY_KEY.get("custom");
}
