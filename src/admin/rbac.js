export const ADMIN_ROLES = {
  super_admin: {
    label: "Super Admin",
    rank: 100,
    permissions: ["*"],
  },
  admin: {
    label: "Admin",
    rank: 90,
    permissions: [
      "dashboard.view",
      "users.view",
      "users.manage",
      "roles.view",
      "roles.manage",
      "leads.view",
      "leads.edit",
      "leads.assign",
      "leads.export",
      "cases.view",
      "cases.edit",
      "cases.assign",
      "cases.export",
      "customers.view",
      "customers.edit",
      "tasks.view",
      "tasks.edit",
      "communications.view",
      "communications.edit",
      "documents.view",
      "documents.manage",
      "documents.download",
      "partners.view",
      "partners.edit",
      "finance.view",
      "finance.edit",
      "reports.view",
      "reports.export",
      "cms.view",
      "cms.edit",
      "blog.view",
      "blog.edit",
      "faq.view",
      "faq.edit",
      "settings.view",
      "settings.edit",
      "activity.view",
    ],
  },
  operations_manager: {
    label: "Operations Manager",
    rank: 70,
    permissions: [
      "dashboard.view",
      "leads.view",
      "leads.edit",
      "leads.assign",
      "cases.view",
      "cases.edit",
      "cases.assign",
      "customers.view",
      "customers.edit",
      "tasks.view",
      "tasks.edit",
      "communications.view",
      "communications.edit",
      "documents.view",
      "documents.manage",
      "documents.download",
      "reports.view",
      "activity.view",
    ],
  },
  case_manager: {
    label: "Case Manager",
    rank: 60,
    permissions: [
      "dashboard.view",
      "leads.view",
      "leads.edit",
      "cases.view",
      "cases.edit",
      "customers.view",
      "tasks.view",
      "tasks.edit",
      "communications.view",
      "communications.edit",
      "documents.view",
      "documents.manage",
      "documents.download",
      "activity.view",
    ],
  },
  customer_support_agent: {
    label: "Customer Support Agent",
    rank: 50,
    permissions: [
      "dashboard.view",
      "leads.view",
      "leads.edit",
      "customers.view",
      "customers.edit",
      "tasks.view",
      "tasks.edit",
      "communications.view",
      "communications.edit",
      "documents.view",
      "documents.download",
    ],
  },
  content_manager: {
    label: "Content Manager",
    rank: 40,
    permissions: [
      "dashboard.view",
      "cms.view",
      "cms.edit",
      "blog.view",
      "blog.edit",
      "faq.view",
      "faq.edit",
      "reports.view",
    ],
  },
  finance_manager: {
    label: "Finance Manager",
    rank: 45,
    permissions: [
      "dashboard.view",
      "finance.view",
      "finance.edit",
      "reports.view",
      "reports.export",
      "cases.view",
      "documents.view",
      "documents.download",
      "partners.view",
      "partners.edit",
    ],
  },
  read_only: {
    label: "Read Only",
    rank: 10,
    permissions: [
      "dashboard.view",
      "leads.view",
      "cases.view",
      "customers.view",
      "tasks.view",
      "communications.view",
      "documents.view",
      "finance.view",
      "reports.view",
      "cms.view",
      "blog.view",
      "faq.view",
      "activity.view",
    ],
  },
};

export const LEGACY_ROLE_MAP = {
  admin: "admin",
  manager: "operations_manager",
  support: "customer_support_agent",
  customer: "read_only",
};

export const NORMALIZED_TO_LEGACY_ROLE = {
  super_admin: "admin",
  admin: "admin",
  operations_manager: "manager",
  case_manager: "manager",
  customer_support_agent: "support",
  content_manager: "admin",
  finance_manager: "admin",
  read_only: "customer",
};

export const ALL_PERMISSIONS = Array.from(
  new Set(
    Object.values(ADMIN_ROLES).flatMap((role) => role.permissions.filter((permission) => permission !== "*")),
  ),
).sort();

export function normalizeRoleCode(role) {
  if (!role) {
    return null;
  }

  return LEGACY_ROLE_MAP[role] || role;
}

export function getRoleDefinition(role) {
  return ADMIN_ROLES[normalizeRoleCode(role)] || ADMIN_ROLES.read_only;
}

export function hasPermission(roleCodes = [], permission) {
  return roleCodes.some((roleCode) => {
    const permissions = getRoleDefinition(roleCode).permissions;
    return permissions.includes("*") || permissions.includes(permission);
  });
}

export function getAvailablePermissions(roleCodes = []) {
  return ALL_PERMISSIONS.filter((permission) => hasPermission(roleCodes, permission));
}

export function toLegacyRoleCode(role) {
  if (!role) {
    return "customer";
  }

  return NORMALIZED_TO_LEGACY_ROLE[normalizeRoleCode(role)] || "customer";
}
