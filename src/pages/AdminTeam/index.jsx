import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  PauseCircle,
  Plus,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import {
  createAdminRole,
  createAdminTeamMember,
  deactivateAdminRole,
  deleteAdminRole,
  duplicateAdminRole,
  fetchAdminRolesModuleData,
  fetchAdminTeamModuleData,
  removeAdminTeamMember,
  sendAdminEmployeeSetupLink,
  updateAdminRoleDefinition,
  updateAdminTeamMemberProfile,
  updateAdminTeamMemberRole,
  updateAdminTeamMemberStatus,
} from "../../services/adminService.js";
import {
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { adminNavigationSections } from "../../admin/navigation.js";
import "./style.scss";

const TAB_OPTIONS = [
  { key: "employees", label: "Employees" },
  { key: "roles", label: "Roles" },
  { key: "access", label: "Permissions / Menu Access" },
  { key: "activity", label: "Activity" },
];

const EMPLOYEE_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Removed" },
];

const ROLE_STATUS_OPTIONS = [
  { value: "all", label: "All role states" },
  { value: "active", label: "Active roles" },
  { value: "inactive", label: "Inactive roles" },
];

const ROLE_TYPE_OPTIONS = [
  { value: "all", label: "All role types" },
  { value: "owner", label: "Owner roles" },
  { value: "system", label: "System roles" },
  { value: "custom", label: "Custom roles" },
];

const ACTIVITY_DATE_FILTERS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const CRITICAL_OWNER_PERMISSIONS = new Set([
  "dashboard.view",
  "team.manage",
  "roles.manage",
  "menu.manage",
  "settings.manage",
]);

const CRITICAL_OWNER_ROUTES = new Set([
  "/admin",
  "/admin/people/users-roles",
  "/admin/settings",
]);

function createEmployeeForm() {
  return {
    fullName: "",
    email: "",
    phone: "",
    roleId: "",
    status: "active",
    sendSetupLink: true,
  };
}

function createRoleForm() {
  return {
    name: "",
    slug: "",
    description: "",
    isActive: true,
    permissionCodes: [],
    menuVisibility: {},
  };
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "0m";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${Math.max(0, minutes)}m`;
  return `${Math.max(1, minutes)}m`;
}

function formatActionLabel(action) {
  return String(action || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPermissionLabel(permissionCode) {
  const [module, action] = String(permissionCode || "").split(".");
  if (!module) return "—";
  return `${formatActionLabel(module)} • ${formatActionLabel(action)}`;
}

function getInitials(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "EM";
  const parts = normalized.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || normalized.slice(0, 2).toUpperCase();
}

function getEmployeeStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "success";
  if (normalized === "invited") return "info";
  if (normalized === "suspended") return "warning";
  if (normalized === "archived" || normalized === "removed") return "danger";
  return "neutral";
}

function getRoleTypeTone(role) {
  if (role?.isOwnerRole) return "warning";
  if (role?.isSystemRole) return "info";
  return "neutral";
}

function getActivityTone(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized.includes("approve") || normalized.includes("reactivate") || normalized.includes("create")) return "success";
  if (normalized.includes("suspend") || normalized.includes("reject") || normalized.includes("deactivate")) return "warning";
  if (normalized.includes("remove") || normalized.includes("delete")) return "danger";
  return "neutral";
}

function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "—";
  const pairs = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${formatActionLabel(key)}: ${String(value)}`);
  return pairs.length ? pairs.join(" • ") : "—";
}

function getRoleType(role) {
  if (role?.isOwnerRole) return "owner";
  if (role?.isSystemRole) return "system";
  return "custom";
}

function createMenuCatalog(items = []) {
  const staticByRoute = new Map(
    adminNavigationSections.flatMap((section) =>
      section.pages.map((page, index) => [
        page.path,
        {
          id: page.key,
          key: page.key,
          label: page.label,
          route: page.path,
          groupKey: section.key,
          groupLabel: section.label,
          sortOrder: index,
          requiredPermissions: page.permission ? [page.permission] : (page.anyPermissions || []),
          isCritical: CRITICAL_OWNER_ROUTES.has(page.path),
        },
      ]),
    ),
  );

  const merged = new Map(staticByRoute);

  items.forEach((item) => {
    if (!item?.route || !staticByRoute.has(item.route)) return;
    const base = staticByRoute.get(item.route);
    merged.set(item.route, {
      ...base,
      ...item,
      route: item.route,
      label: item.label || base.label,
      groupKey: item.groupKey || base.groupKey,
      groupLabel: item.groupLabel || base.groupLabel,
      sortOrder: item.sortOrder ?? base.sortOrder ?? 0,
      requiredPermissions: Array.isArray(item.requiredPermissions) ? item.requiredPermissions : base.requiredPermissions,
      isCritical: item.isCritical ?? base.isCritical,
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    const sectionLeft = adminNavigationSections.findIndex((section) => section.key === left.groupKey);
    const sectionRight = adminNavigationSections.findIndex((section) => section.key === right.groupKey);
    if (sectionLeft !== sectionRight) return sectionLeft - sectionRight;
    return Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
  });
}

function buildRoleMenuVisibility(role, roleMenuVisibility = [], menuCatalog = []) {
  const visibilityByMenuId = new Map(
    (roleMenuVisibility || [])
      .filter((item) => item.role_id === role?.id)
      .map((item) => [item.menu_item_id, item.is_visible !== false]),
  );

  return Object.fromEntries(
    menuCatalog.map((item) => {
      const explicit = visibilityByMenuId.has(item.id) ? visibilityByMenuId.get(item.id) : null;
      const forcedVisible = role?.isOwnerRole && (item.isCritical || CRITICAL_OWNER_ROUTES.has(item.route));
      return [item.route, forcedVisible ? true : (explicit ?? true)];
    }),
  );
}

function groupPermissions(permissions = []) {
  return permissions.reduce((acc, permission) => {
    const key = permission.module || String(permission.code || permission.key || "general").split(".")[0] || "general";
    acc[key] ||= [];
    acc[key].push(permission);
    return acc;
  }, {});
}

function isWithinRange(value, range) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  if (range?.from) {
    const from = new Date(range.from).getTime();
    if (!Number.isNaN(from) && timestamp < from) return false;
  }
  if (range?.to) {
    const to = new Date(range.to).getTime() + (24 * 60 * 60 * 1000) - 1;
    if (!Number.isNaN(to) && timestamp > to) return false;
  }
  return true;
}

function getDateBucket(value) {
  if (!value) return "all";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "all";
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const week = now - (7 * 24 * 60 * 60 * 1000);
  const month = now - (30 * 24 * 60 * 60 * 1000);
  if (timestamp >= today) return "today";
  if (timestamp >= week) return "week";
  if (timestamp >= month) return "month";
  return "all";
}

export default function AdminTeam() {
  const { user, isAdminUser, hasAnyPermission } = useAdminAuth();
  const [teamModule, setTeamModule] = useState(null);
  const [rolesModule, setRolesModule] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("employees");
  const [panel, setPanel] = useState(null);
  const [employeeForm, setEmployeeForm] = useState(createEmployeeForm());
  const [roleForm, setRoleForm] = useState(createRoleForm());
  const [isSaving, setIsSaving] = useState(false);

  const [employeeFilters, setEmployeeFilters] = useState({
    search: "",
    status: "all",
    roleId: "all",
    dateRange: { from: "", to: "" },
  });
  const [roleFilters, setRoleFilters] = useState({
    search: "",
    status: "all",
    type: "all",
  });
  const [activityFilters, setActivityFilters] = useState({
    employeeId: "all",
    actionType: "all",
    module: "all",
    dateBucket: "all",
    dateRange: { from: "", to: "" },
  });
  const [accessRoleId, setAccessRoleId] = useState("");

  const canManageEmployees = isAdminUser || hasAnyPermission(["team.view", "users.view", "team.manage", "roles.manage", "menu.manage"]);

  const loadModule = async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextTeamModule, nextRolesModule] = await Promise.all([
        fetchAdminTeamModuleData(),
        fetchAdminRolesModuleData(),
      ]);
      setTeamModule(nextTeamModule);
      setRolesModule(nextRolesModule);
      setAccessRoleId((current) => current || nextRolesModule?.roles?.[0]?.id || "");
    } catch (nextError) {
      setError(nextError.message || "Could not load employees.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule();
  }, []);

  const menuCatalog = useMemo(
    () => createMenuCatalog(rolesModule?.menuItems || teamModule?.menuItems || []),
    [rolesModule?.menuItems, teamModule?.menuItems],
  );

  const permissionGroups = useMemo(
    () => groupPermissions(rolesModule?.permissions || teamModule?.permissions || []),
    [rolesModule?.permissions, teamModule?.permissions],
  );

  const employees = useMemo(() => {
    const activityTimeline = teamModule?.activityTimeline || [];
    return (teamModule?.members || []).map((member) => {
      const logs = activityTimeline.filter((item) => item.admin_profile_id === member.profileId);
      const thisWeekActions = logs.filter((item) => {
        const timestamp = new Date(item.created_at || 0).getTime();
        return timestamp >= Date.now() - (7 * 24 * 60 * 60 * 1000);
      }).length;
      return {
        ...member,
        lastActivityAt: logs[0]?.created_at || member.lastLoginAt || member.updatedAt || null,
        actionsThisWeek: thisWeekActions,
      };
    });
  }, [teamModule?.activityTimeline, teamModule?.members]);

  const roles = rolesModule?.roles || [];
  const ownerMemberCount = employees.filter((item) => item.isOwner && item.status === "active").length;
  const openWorkSessions = (teamModule?.workSessions || []).filter((item) => !item.ended_at).length;
  const employeesActiveToday = employees.filter((item) => Number(item.activeTimeTodaySeconds || 0) > 0).length;

  const kpis = useMemo(() => {
    const suspendedEmployees = employees.filter((item) => item.status === "suspended").length;
    const activeEmployees = employees.filter((item) => item.status === "active").length;
    return [
      { label: "Total employees", value: employees.length, icon: Users },
      { label: "Active employees", value: activeEmployees, icon: UserCog },
      { label: "Suspended employees", value: suspendedEmployees, icon: PauseCircle },
      { label: "Roles", value: roles.length, icon: ShieldCheck },
      { label: "Active today", value: employeesActiveToday, icon: Activity },
      { label: "Open work sessions", value: teamModule?.supportsWorkSessionsV1 ? openWorkSessions : "—", icon: Clock3 },
    ];
  }, [employees, roles.length, teamModule?.supportsWorkSessionsV1, openWorkSessions, employeesActiveToday]);

  const filteredEmployees = useMemo(() => {
    const query = employeeFilters.search.trim().toLowerCase();
    return employees.filter((member) => {
      const matchesSearch = !query || [
        member.fullName,
        member.email,
        member.phone,
        member.roleLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = employeeFilters.status === "all" || member.status === employeeFilters.status;
      const matchesRole = employeeFilters.roleId === "all" || member.roleId === employeeFilters.roleId;
      const matchesDate = !employeeFilters.dateRange.from && !employeeFilters.dateRange.to
        ? true
        : isWithinRange(member.createdAt || member.lastActivityAt, employeeFilters.dateRange);
      return matchesSearch && matchesStatus && matchesRole && matchesDate;
    });
  }, [employees, employeeFilters]);

  const filteredRoles = useMemo(() => {
    const query = roleFilters.search.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesSearch = !query || [role.name, role.slug, role.description, role.code]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = roleFilters.status === "all"
        || (roleFilters.status === "active" && role.isActive)
        || (roleFilters.status === "inactive" && !role.isActive);
      const matchesType = roleFilters.type === "all" || getRoleType(role) === roleFilters.type;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [roles, roleFilters]);

  const activityRows = useMemo(() => {
    const membersById = new Map(employees.map((item) => [item.profileId, item]));
    return (teamModule?.activityTimeline || []).filter((item) => {
      const matchesEmployee = activityFilters.employeeId === "all" || item.admin_profile_id === activityFilters.employeeId;
      const matchesAction = activityFilters.actionType === "all" || item.action === activityFilters.actionType;
      const matchesModule = activityFilters.module === "all" || item.module === activityFilters.module;
      const matchesBucket = activityFilters.dateBucket === "all" || getDateBucket(item.created_at) === activityFilters.dateBucket;
      const matchesRange = !activityFilters.dateRange.from && !activityFilters.dateRange.to
        ? true
        : isWithinRange(item.created_at, activityFilters.dateRange);
      return matchesEmployee && matchesAction && matchesModule && matchesBucket && matchesRange;
    }).map((item) => ({
      ...item,
      member: membersById.get(item.admin_profile_id) || null,
    }));
  }, [teamModule?.activityTimeline, employees, activityFilters]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => item.profileId === panel?.profileId) || null,
    [employees, panel?.profileId],
  );

  const selectedRole = useMemo(
    () => roles.find((item) => item.id === panel?.roleId) || roles.find((item) => item.id === accessRoleId) || null,
    [roles, panel?.roleId, accessRoleId],
  );

  const selectedRoleMenuPreview = useMemo(
    () => selectedRole ? buildRoleMenuVisibility(selectedRole, rolesModule?.roleMenuVisibility || [], menuCatalog) : {},
    [selectedRole, rolesModule?.roleMenuVisibility, menuCatalog],
  );

  const employeeActivityOptions = useMemo(
    () => [{ value: "all", label: "All employees" }].concat(
      employees.map((member) => ({
        value: member.profileId,
        label: member.fullName || member.email,
      })),
    ),
    [employees],
  );

  const activityActionOptions = useMemo(
    () => [{ value: "all", label: "All actions" }].concat(
      Array.from(new Set((teamModule?.activityTimeline || []).map((item) => item.action).filter(Boolean))).map((value) => ({
        value,
        label: formatActionLabel(value),
      })),
    ),
    [teamModule?.activityTimeline],
  );

  const activityModuleOptions = useMemo(
    () => [{ value: "all", label: "All modules" }].concat(
      Array.from(new Set((teamModule?.activityTimeline || []).map((item) => item.module).filter(Boolean))).map((value) => ({
        value,
        label: formatActionLabel(value),
      })),
    ),
    [teamModule?.activityTimeline],
  );

  const openEmployeeCreate = () => {
    setNotice("");
    setPanel({ type: "employee-create" });
    setEmployeeForm({
      ...createEmployeeForm(),
      roleId: roles.find((role) => role.isActive)?.id || "",
    });
  };

  const openEmployeeView = (employee) => {
    setNotice("");
    setPanel({ type: "employee-view", profileId: employee.profileId });
  };

  const openEmployeeEdit = (employee) => {
    setNotice("");
    setPanel({ type: "employee-edit", profileId: employee.profileId });
    setEmployeeForm({
      fullName: employee.fullName || "",
      email: employee.email || "",
      phone: employee.phone || "",
      roleId: employee.roleId || "",
      status: employee.status || "active",
      sendSetupLink: false,
    });
  };

  const openRoleCreate = () => {
    setNotice("");
    setPanel({ type: "role-create" });
    setRoleForm(createRoleForm());
  };

  const openRoleEdit = (role) => {
    const assignedPermissionCodes = (rolesModule?.rolePermissions || [])
      .filter((item) => item.roleCode === role.code)
      .map((item) => item.permissionCode);
    setNotice("");
    setPanel({ type: "role-edit", roleId: role.id });
    setRoleForm({
      name: role.name || role.label || "",
      slug: role.slug || role.code || "",
      description: role.description || "",
      isActive: role.isActive,
      permissionCodes: assignedPermissionCodes,
      menuVisibility: buildRoleMenuVisibility(role, rolesModule?.roleMenuVisibility || [], menuCatalog),
    });
  };

  const closePanel = () => {
    setPanel(null);
    setIsSaving(false);
  };

  const persistEmployee = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      if (panel?.type === "employee-create") {
        await createAdminTeamMember(employeeForm);
        if (employeeForm.sendSetupLink) {
          await sendAdminEmployeeSetupLink({ email: employeeForm.email });
        }
        setNotice(employeeForm.sendSetupLink ? "Employee access created and setup link sent." : "Employee access created.");
      } else if (selectedEmployee) {
        const previous = selectedEmployee;
        if (
          employeeForm.fullName !== (previous.fullName || "")
          || employeeForm.phone !== (previous.phone || "")
          || employeeForm.email.toLowerCase() !== String(previous.email || "").toLowerCase()
        ) {
          await updateAdminTeamMemberProfile(previous.profileId, employeeForm);
        }
        if (employeeForm.roleId && employeeForm.roleId !== previous.roleId) {
          await updateAdminTeamMemberRole(previous.profileId, employeeForm.roleId);
        }
        if (employeeForm.status !== previous.status) {
          await updateAdminTeamMemberStatus(previous.profileId, employeeForm.status);
        }
        setNotice("Employee updated.");
      }

      closePanel();
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save employee.");
    } finally {
      setIsSaving(false);
    }
  };

  const persistRole = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        role: {
          name: roleForm.name,
          slug: roleForm.slug,
          description: roleForm.description,
          isActive: roleForm.isActive,
          isSystemRole: selectedRole?.isSystemRole || false,
          isOwnerRole: selectedRole?.isOwnerRole || false,
          rank: selectedRole?.rank || 0,
        },
        permissionCodes: roleForm.permissionCodes,
        menuVisibility: roleForm.menuVisibility,
      };

      if (panel?.type === "role-create") {
        await createAdminRole(payload);
        setNotice("Role created.");
      } else if (selectedRole) {
        await updateAdminRoleDefinition(selectedRole.id, payload);
        setNotice("Role updated.");
      }

      closePanel();
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save role.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetupLink = async (employee) => {
    setError("");
    setNotice("");
    try {
      await sendAdminEmployeeSetupLink({ email: employee.email, profileId: employee.profileId });
      setNotice(`Setup link sent to ${employee.email}.`);
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not send setup link.");
    }
  };

  const handleStatusChange = async (employee, nextStatus) => {
    const confirmed = window.confirm(
      nextStatus === "active"
        ? `Reactivate ${employee.fullName || employee.email}?`
        : `Change ${employee.fullName || employee.email} to ${nextStatus}?`,
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    try {
      await updateAdminTeamMemberStatus(employee.profileId, nextStatus);
      setNotice(nextStatus === "active" ? "Employee reactivated." : "Employee status updated.");
      await loadModule();
      if (selectedEmployee?.profileId === employee.profileId && panel?.type === "employee-view") {
        setPanel({ ...panel });
      }
    } catch (nextError) {
      setError(nextError.message || "Could not update employee status.");
    }
  };

  const handleRemoveEmployee = async (employee) => {
    const confirmed = window.confirm(`Remove ${employee.fullName || employee.email} from employee access?`);
    if (!confirmed) return;

    setError("");
    setNotice("");
    try {
      await removeAdminTeamMember(employee.profileId);
      setNotice("Employee removed.");
      closePanel();
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not remove employee.");
    }
  };

  const handleDuplicateRole = async (role) => {
    setError("");
    setNotice("");
    try {
      await duplicateAdminRole(role.id);
      setNotice(`Role "${role.name}" duplicated.`);
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not duplicate role.");
    }
  };

  const handleRoleStatusToggle = async (role) => {
    const nextIsActive = !role.isActive;
    const confirmed = window.confirm(nextIsActive ? `Activate ${role.name}?` : `Deactivate ${role.name}?`);
    if (!confirmed) return;

    setError("");
    setNotice("");
    try {
      await deactivateAdminRole(role.id, nextIsActive);
      setNotice(nextIsActive ? "Role activated." : "Role deactivated.");
      closePanel();
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not update role state.");
    }
  };

  const handleDeleteRole = async (role) => {
    const confirmed = window.confirm(`Delete ${role.name}? This only works for custom roles without assigned employees.`);
    if (!confirmed) return;

    setError("");
    setNotice("");
    try {
      await deleteAdminRole(role.id);
      setNotice("Role deleted.");
      closePanel();
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not delete role.");
    }
  };

  const selectedActivityMetrics = useMemo(() => {
    const focusedEmployee = activityFilters.employeeId === "all"
      ? null
      : employees.find((item) => item.profileId === activityFilters.employeeId) || null;
    const todayActions = activityRows.filter((item) => getDateBucket(item.created_at) === "today").length;
    const weekActions = activityRows.filter((item) => {
      const timestamp = new Date(item.created_at || 0).getTime();
      return timestamp >= Date.now() - (7 * 24 * 60 * 60 * 1000);
    }).length;
    return {
      todayActions,
      weekActions,
      activeTimeToday: focusedEmployee ? focusedEmployee.activeTimeTodaySeconds : null,
      activeTimeThisWeek: focusedEmployee ? focusedEmployee.activeTimeThisWeekSeconds : null,
      lastLoginAt: focusedEmployee?.lastLoginAt || null,
      lastLogoutAt: focusedEmployee?.lastLogoutAt || null,
    };
  }, [activityRows, employees, activityFilters.employeeId]);

  const renderEmployeesTab = () => (
    <>
      <section className="admin-card admin-card-compact admin-employees-page__toolbar-card">
        <AdminFilterBar
          searchValue={employeeFilters.search}
          onSearchChange={(value) => setEmployeeFilters((current) => ({ ...current, search: value }))}
          searchPlaceholder="Search name, email, phone, role"
          statusFilter={employeeFilters.status}
          onStatusFilterChange={(value) => setEmployeeFilters((current) => ({ ...current, status: value }))}
          statusOptions={EMPLOYEE_STATUS_OPTIONS}
          ownerFilter={employeeFilters.roleId}
          onOwnerFilterChange={(value) => setEmployeeFilters((current) => ({ ...current, roleId: value }))}
          ownerOptions={[{ value: "all", label: "All roles" }].concat(
            roles.map((role) => ({ value: role.id, label: role.name })),
          )}
          dateRange={employeeFilters.dateRange}
          onDateRangeChange={(value) => setEmployeeFilters((current) => ({ ...current, dateRange: value }))}
        >
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setEmployeeFilters({
              search: "",
              status: "all",
              roleId: "all",
              dateRange: { from: "", to: "" },
            })}
          >
            Clear filters
          </button>
        </AdminFilterBar>
      </section>

      {!teamModule?.supportsTeamMembersV1 && !isLoading ? (
        <p className="admin-message">
          Team registry is not configured yet. Apply the dynamic admin team migration before managing employees.
        </p>
      ) : null}

      <section className="admin-employees-page__employee-grid">
        {filteredEmployees.length ? filteredEmployees.map((employee) => {
          const canChangeProtectedEmployee = !(employee.isOwner && (ownerMemberCount <= 1 || employee.profileId === user?.id));
          return (
            <button
              key={employee.profileId}
              type="button"
              className={`admin-card admin-employees-page__employee-card${selectedEmployee?.profileId === employee.profileId ? " is-active" : ""}`}
              onClick={() => openEmployeeView(employee)}
            >
              <div className="admin-employees-page__employee-head">
                <span className="admin-employees-page__avatar">{getInitials(employee.fullName || employee.email)}</span>
                <div className="admin-employees-page__employee-meta">
                  <strong>{employee.fullName || "Unnamed employee"}</strong>
                  <span>{employee.email || "—"}</span>
                </div>
                <AdminStatusBadge tone={getEmployeeStatusTone(employee.status)}>{formatActionLabel(employee.status)}</AdminStatusBadge>
              </div>

              <div className="admin-employees-page__employee-summary">
                <div>
                  <span>Role</span>
                  <strong>{employee.roleLabel || "No role"}</strong>
                </div>
                <div>
                  <span>Last login</span>
                  <strong>{formatDateTime(employee.lastLoginAt)}</strong>
                </div>
                <div>
                  <span>Last activity</span>
                  <strong>{formatDateTime(employee.lastActivityAt)}</strong>
                </div>
                <div>
                  <span>Active time this week</span>
                  <strong>{formatDuration(employee.activeTimeThisWeekSeconds)}</strong>
                </div>
                <div>
                  <span>Actions this week</span>
                  <strong>{employee.actionsThisWeek || 0}</strong>
                </div>
                <div>
                  <span>Sessions</span>
                  <strong>{employee.totalSessionCount || 0}</strong>
                </div>
              </div>

              <div className="admin-employees-page__employee-footer">
                <span>{employee.phone || "No phone on file"}</span>
                <small>{canChangeProtectedEmployee ? "Open drawer to manage access" : "Protected owner access"}</small>
              </div>
            </button>
          );
        }) : (
          <section className="admin-card admin-card-compact">
            <p className="admin-message">No employees found for the current filters.</p>
          </section>
        )}
      </section>
    </>
  );

  const renderRolesTab = () => (
    <>
      <section className="admin-card admin-card-compact admin-employees-page__toolbar-card">
        <AdminFilterBar
          searchValue={roleFilters.search}
          onSearchChange={(value) => setRoleFilters((current) => ({ ...current, search: value }))}
          searchPlaceholder="Search role name, slug, description"
          statusFilter={roleFilters.status}
          onStatusFilterChange={(value) => setRoleFilters((current) => ({ ...current, status: value }))}
          statusOptions={ROLE_STATUS_OPTIONS}
          ownerFilter={roleFilters.type}
          onOwnerFilterChange={(value) => setRoleFilters((current) => ({ ...current, type: value }))}
          ownerOptions={ROLE_TYPE_OPTIONS}
        >
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setRoleFilters({ search: "", status: "all", type: "all" })}
          >
            Clear filters
          </button>
        </AdminFilterBar>
      </section>

      <section className="admin-employees-page__role-grid">
        {filteredRoles.length ? filteredRoles.map((role) => (
          <button
            key={role.id}
            type="button"
            className={`admin-card admin-employees-page__role-card${selectedRole?.id === role.id ? " is-active" : ""}`}
            onClick={() => openRoleEdit(role)}
          >
            <div className="admin-employees-page__role-card-head">
              <div>
                <strong>{role.name}</strong>
                <span>{role.slug || role.code}</span>
              </div>
              <div className="admin-employees-page__role-badges">
                <AdminStatusBadge tone={role.isActive ? "success" : "neutral"}>
                  {role.isActive ? "Active" : "Inactive"}
                </AdminStatusBadge>
                <AdminStatusBadge tone={getRoleTypeTone(role)}>{formatActionLabel(getRoleType(role))}</AdminStatusBadge>
              </div>
            </div>
            <p>{role.description || "No role description yet."}</p>
            <div className="admin-employees-page__role-card-meta">
              <div>
                <span>Employees</span>
                <strong>{role.memberCount || 0}</strong>
              </div>
              <div>
                <span>Permissions</span>
                <strong>{(rolesModule?.rolePermissions || []).filter((item) => item.roleCode === role.code).length}</strong>
              </div>
              <div>
                <span>Visible pages</span>
                <strong>{menuCatalog.filter((item) => buildRoleMenuVisibility(role, rolesModule?.roleMenuVisibility || [], menuCatalog)[item.route] !== false).length}</strong>
              </div>
            </div>
          </button>
        )) : (
          <section className="admin-card admin-card-compact">
            <p className="admin-message">No roles found for the current filters.</p>
          </section>
        )}
      </section>
    </>
  );

  const renderAccessTab = () => {
    const focusRole = roles.find((role) => role.id === accessRoleId) || roles[0] || null;
    const visibility = focusRole ? buildRoleMenuVisibility(focusRole, rolesModule?.roleMenuVisibility || [], menuCatalog) : {};
    const rolePermissionCodes = new Set(
      (rolesModule?.rolePermissions || [])
        .filter((item) => item.roleCode === focusRole?.code)
        .map((item) => item.permissionCode),
    );

    return (
      <section className="admin-employees-page__access-layout">
        <article className="admin-card admin-card-compact">
          <div className="admin-employees-page__section-head">
            <div>
              <span>Role access</span>
              <h3>Sidebar preview and permissions</h3>
            </div>
            <div className="admin-employees-page__section-head-actions">
              <select
                className="admin-select admin-filter-control"
                value={focusRole?.id || ""}
                onChange={(event) => setAccessRoleId(event.target.value)}
              >
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              {focusRole ? (
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => openRoleEdit(focusRole)}>
                  Edit role
                </button>
              ) : null}
            </div>
          </div>

          {focusRole ? (
            <div className="admin-employees-page__access-summary">
              <div className="admin-employees-page__access-tree">
                {adminNavigationSections.map((section) => {
                  const pages = section.pages.filter((page) => visibility[page.path] !== false);
                  if (!pages.length) return null;
                  return (
                    <article key={section.key} className="admin-panel-card">
                      <header>
                        <strong>{section.label}</strong>
                        <small>{pages.length} visible</small>
                      </header>
                      <div className="admin-employees-page__access-list">
                        {pages.map((page) => (
                          <div key={page.key} className="admin-employees-page__access-item">
                            <div>
                              <span>{page.label}</span>
                              <small>{page.permission || (page.anyPermissions || []).join(" / ") || "No explicit permission"}</small>
                            </div>
                            <AdminStatusBadge tone="success">Visible</AdminStatusBadge>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>

              <article className="admin-panel-card">
                <header>
                  <strong>Permission summary</strong>
                  <small>{rolePermissionCodes.size} allowed permissions</small>
                </header>
                <div className="admin-employees-page__permission-preview">
                  {Object.entries(permissionGroups).map(([moduleKey, items]) => (
                    <div key={moduleKey} className="admin-employees-page__permission-preview-group">
                      <strong>{formatActionLabel(moduleKey)}</strong>
                      <div className="admin-employees-page__badge-list">
                        {items.map((permission) => (
                          <AdminStatusBadge
                            key={permission.code}
                            tone={rolePermissionCodes.has(permission.code) ? "success" : "neutral"}
                          >
                            {permission.label || formatPermissionLabel(permission.code)}
                          </AdminStatusBadge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : (
            <p className="admin-message">No roles configured yet.</p>
          )}
        </article>
      </section>
    );
  };

  const renderActivityTab = () => (
    <>
      <section className="admin-card admin-card-compact admin-employees-page__toolbar-card">
        <AdminFilterBar
          statusFilter={activityFilters.actionType}
          onStatusFilterChange={(value) => setActivityFilters((current) => ({ ...current, actionType: value }))}
          statusOptions={activityActionOptions}
          ownerFilter={activityFilters.employeeId}
          onOwnerFilterChange={(value) => setActivityFilters((current) => ({ ...current, employeeId: value }))}
          ownerOptions={employeeActivityOptions}
          dateRange={activityFilters.dateRange}
          onDateRangeChange={(value) => setActivityFilters((current) => ({ ...current, dateRange: value }))}
        >
          <select
            className="admin-select admin-filter-control"
            value={activityFilters.module}
            onChange={(event) => setActivityFilters((current) => ({ ...current, module: event.target.value }))}
          >
            {activityModuleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            className="admin-select admin-filter-control"
            value={activityFilters.dateBucket}
            onChange={(event) => setActivityFilters((current) => ({ ...current, dateBucket: event.target.value }))}
          >
            {ACTIVITY_DATE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setActivityFilters({
              employeeId: "all",
              actionType: "all",
              module: "all",
              dateBucket: "all",
              dateRange: { from: "", to: "" },
            })}
          >
            Clear filters
          </button>
        </AdminFilterBar>
      </section>

      <section className="admin-employees-page__activity-metrics">
        <AdminKpiCard label="Actions today" value={selectedActivityMetrics.todayActions} icon={Activity} />
        <AdminKpiCard label="Actions this week" value={selectedActivityMetrics.weekActions} icon={Activity} />
        <AdminKpiCard label="Active time today" value={selectedActivityMetrics.activeTimeToday !== null ? formatDuration(selectedActivityMetrics.activeTimeToday) : "—"} icon={Clock3} />
        <AdminKpiCard label="Active time this week" value={selectedActivityMetrics.activeTimeThisWeek !== null ? formatDuration(selectedActivityMetrics.activeTimeThisWeek) : "—"} icon={Clock3} />
        <AdminKpiCard label="Last login" value={selectedActivityMetrics.lastLoginAt ? formatDateTime(selectedActivityMetrics.lastLoginAt) : "—"} icon={UserCog} />
        <AdminKpiCard label="Last logout" value={selectedActivityMetrics.lastLogoutAt ? formatDateTime(selectedActivityMetrics.lastLogoutAt) : "—"} icon={ArrowUpRight} />
      </section>

      <section className="admin-card admin-card-compact admin-employees-page__activity-table">
        <div className="admin-employees-page__section-head">
          <div>
            <span>Activity timeline</span>
            <h3>Employee actions and work-session trail</h3>
          </div>
        </div>

        {activityRows.length ? (
          <div className="admin-employees-page__activity-list">
            {activityRows.map((item) => (
              <article key={`${item.source}-${item.id}`} className="admin-employees-page__activity-row">
                <div>
                  <strong>{item.member?.fullName || item.member?.email || "Employee"}</strong>
                  <span>{item.member?.roleLabel || "—"}</span>
                </div>
                <div>
                  <AdminStatusBadge tone={getActivityTone(item.action)}>{formatActionLabel(item.action)}</AdminStatusBadge>
                </div>
                <div>
                  <strong>{formatActionLabel(item.module || "general")}</strong>
                  <span>{formatActionLabel(item.entity_type || "entity")}</span>
                </div>
                <div>
                  <strong>{item.entity_id || "—"}</strong>
                  <span>{summarizeMetadata(item.metadata)}</span>
                </div>
                <time>{formatDateTime(item.created_at)}</time>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-message">No activity found for the selected filters.</p>
        )}
      </section>
    </>
  );

  const renderEmployeePanel = () => {
    if (panel?.type === "employee-create" || panel?.type === "employee-edit") {
      const isEdit = panel.type === "employee-edit";
      return (
        <AdminSidePanel
          open
          title={isEdit ? "Edit employee" : "Add employee"}
          subtitle={isEdit ? "Update internal worker access, role, and status." : "Assign an existing profile to the admin workspace and use setup-link access."}
          onClose={closePanel}
        >
          <div className="admin-employees-page__panel-grid">
            <article className="admin-panel-card">
              <header>
                <strong>Account details</strong>
                <small>No password is stored or logged here.</small>
              </header>
              <div className="admin-employees-page__form-grid">
                <label>
                  <span>Full name</span>
                  <input className="admin-input" value={employeeForm.fullName} onChange={(event) => setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input className="admin-input" type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  <span>Phone</span>
                  <input className="admin-input" value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label>
                  <span>Role</span>
                  <select className="admin-select" value={employeeForm.roleId} onChange={(event) => setEmployeeForm((current) => ({ ...current, roleId: event.target.value }))}>
                    <option value="">Select role</option>
                    {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select className="admin-select" value={employeeForm.status} onChange={(event) => setEmployeeForm((current) => ({ ...current, status: event.target.value }))}>
                    {EMPLOYEE_STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </article>

            <article className="admin-panel-card">
              <header>
                <strong>Secure setup flow</strong>
                <small>Use password setup email instead of storing passwords in the database.</small>
              </header>
              <p className="admin-employees-page__panel-note">
                Employee creation is limited to existing Auth/Profile records. If the email does not exist in `profiles`, a secure backend worker such as `create-admin-employee` is still needed.
              </p>
              <label className="admin-employees-page__checkbox-row">
                <input
                  type="checkbox"
                  checked={employeeForm.sendSetupLink}
                  onChange={(event) => setEmployeeForm((current) => ({ ...current, sendSetupLink: event.target.checked }))}
                />
                <span>Send setup link after save</span>
              </label>
            </article>

            <div className="admin-employees-page__panel-actions">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={closePanel}>Cancel</button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={persistEmployee} disabled={isSaving}>
                {isSaving ? "Saving..." : isEdit ? "Save employee" : "Add employee"}
              </button>
            </div>
          </div>
        </AdminSidePanel>
      );
    }

    if (!selectedEmployee) return null;

    const canChangeProtectedEmployee = !(selectedEmployee.isOwner && (ownerMemberCount <= 1 || selectedEmployee.profileId === user?.id));

    return (
      <AdminSidePanel
        open
        eyebrow="Employee"
        title={selectedEmployee.fullName || selectedEmployee.email}
        subtitle={selectedEmployee.email}
        onClose={closePanel}
      >
        <div className="admin-employees-page__panel-grid">
          <article className="admin-panel-card">
            <header>
              <strong>Profile</strong>
              <small>{selectedEmployee.roleLabel || "No role"}</small>
            </header>
            <div className="admin-employees-page__identity">
              <span className="admin-employees-page__avatar is-large">{getInitials(selectedEmployee.fullName || selectedEmployee.email)}</span>
              <div>
                <strong>{selectedEmployee.fullName || "Unnamed employee"}</strong>
                <span>{selectedEmployee.email || "—"}</span>
              </div>
            </div>
            <div className="admin-employees-page__summary-grid">
              <div><span>Status</span><strong><AdminStatusBadge tone={getEmployeeStatusTone(selectedEmployee.status)}>{formatActionLabel(selectedEmployee.status)}</AdminStatusBadge></strong></div>
              <div><span>Phone</span><strong>{selectedEmployee.phone || "—"}</strong></div>
              <div><span>Created</span><strong>{formatDate(selectedEmployee.createdAt)}</strong></div>
              <div><span>Source</span><strong>{formatActionLabel(selectedEmployee.source)}</strong></div>
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Access</strong>
              <small>Role permissions and menu visibility summary</small>
            </header>
            <div className="admin-employees-page__summary-grid">
              <div><span>Assigned role</span><strong>{selectedEmployee.roleLabel || "No role"}</strong></div>
              <div><span>Visible pages</span><strong>{selectedEmployee.roleId ? menuCatalog.filter((item) => buildRoleMenuVisibility(roles.find((role) => role.id === selectedEmployee.roleId), rolesModule?.roleMenuVisibility || [], menuCatalog)[item.route] !== false).length : "—"}</strong></div>
              <div><span>Permissions</span><strong>{selectedEmployee.roleCode ? (rolesModule?.rolePermissions || []).filter((item) => item.roleCode === selectedEmployee.roleCode).length : "—"}</strong></div>
              <div><span>Owner protected</span><strong>{selectedEmployee.isOwner ? "Yes" : "No"}</strong></div>
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Work activity</strong>
              <small>Sessions and last known access</small>
            </header>
            <div className="admin-employees-page__summary-grid">
              <div><span>Last login</span><strong>{formatDateTime(selectedEmployee.lastLoginAt)}</strong></div>
              <div><span>Last logout</span><strong>{formatDateTime(selectedEmployee.lastLogoutAt)}</strong></div>
              <div><span>Active today</span><strong>{formatDuration(selectedEmployee.activeTimeTodaySeconds)}</strong></div>
              <div><span>Active this week</span><strong>{formatDuration(selectedEmployee.activeTimeThisWeekSeconds)}</strong></div>
              <div><span>Total sessions</span><strong>{selectedEmployee.totalSessionCount || 0}</strong></div>
              <div><span>Actions this week</span><strong>{selectedEmployee.actionsThisWeek || 0}</strong></div>
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Recent actions</strong>
              <small>Linked to activity log and admin work tracking</small>
            </header>
            <div className="admin-employees-page__mini-activity">
              {selectedEmployee.recentActivity?.length ? selectedEmployee.recentActivity.slice(0, 6).map((item) => (
                <div key={`${item.id}-${item.createdAt}`} className="admin-employees-page__mini-activity-row">
                  <div>
                    <strong>{formatActionLabel(item.action)}</strong>
                    <span>{formatActionLabel(item.module || item.entityType || "team")}</span>
                  </div>
                  <time>{formatDateTime(item.createdAt)}</time>
                </div>
              )) : (
                <p className="admin-message">No recent actions recorded yet.</p>
              )}
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Controls</strong>
              <small>Manage employee access carefully</small>
            </header>
            <div className="admin-employees-page__panel-actions is-wrap">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => openEmployeeEdit(selectedEmployee)}>
                Edit employee
              </button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleSetupLink(selectedEmployee)}>
                Send setup link
              </button>
              <a className="admin-btn admin-btn-ghost" href={`/admin/team/${selectedEmployee.profileId}/activity`}>
                Open activity
              </a>
              {selectedEmployee.status === "active" ? (
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleStatusChange(selectedEmployee, "suspended")} disabled={!canChangeProtectedEmployee}>
                  Suspend
                </button>
              ) : (
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleStatusChange(selectedEmployee, "active")}>
                  Reactivate
                </button>
              )}
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => handleRemoveEmployee(selectedEmployee)} disabled={!canChangeProtectedEmployee}>
                Remove employee
              </button>
            </div>
          </article>
        </div>
      </AdminSidePanel>
    );
  };

  const renderRolePanel = () => {
    const isCreate = panel?.type === "role-create";
    const role = isCreate ? null : selectedRole;
    if (!isCreate && !role) return null;

    const assignedEmployees = employees.filter((member) => member.roleId === role?.id);
    const deleteDisabled = !role || role.isSystemRole || role.isOwnerRole || (role.memberCount || 0) > 0;
    const isOwnerRole = Boolean(role?.isOwnerRole);

    return (
      <AdminSidePanel
        open
        eyebrow="Role"
        title={isCreate ? "Create role" : role.name}
        subtitle={isCreate ? "Create a custom employee role with scoped permissions and menu access." : "Edit permissions and menu visibility for this role."}
        onClose={closePanel}
      >
        <div className="admin-employees-page__panel-grid">
          <article className="admin-panel-card">
            <header>
              <strong>Role details</strong>
              <small>{role?.isSystemRole ? "System role" : "Custom role"}</small>
            </header>
            <div className="admin-employees-page__form-grid">
              <label>
                <span>Name</span>
                <input className="admin-input" value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Slug</span>
                <input className="admin-input" value={roleForm.slug} onChange={(event) => setRoleForm((current) => ({ ...current, slug: event.target.value }))} readOnly={!isCreate} />
              </label>
              <label className="admin-employees-page__form-span">
                <span>Description</span>
                <textarea className="admin-input admin-employees-page__textarea" value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="admin-employees-page__checkbox-row">
                <input
                  type="checkbox"
                  checked={roleForm.isActive}
                  disabled={isOwnerRole}
                  onChange={(event) => setRoleForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <span>Role is active</span>
              </label>
            </div>
            {role ? (
              <div className="admin-employees-page__badge-list">
                <AdminStatusBadge tone={role.isActive ? "success" : "neutral"}>{role.isActive ? "Active" : "Inactive"}</AdminStatusBadge>
                <AdminStatusBadge tone={getRoleTypeTone(role)}>{formatActionLabel(getRoleType(role))}</AdminStatusBadge>
              </div>
            ) : null}
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Assigned employees</strong>
              <small>{assignedEmployees.length} linked employees</small>
            </header>
            <div className="admin-employees-page__drawer-list">
              {assignedEmployees.length ? assignedEmployees.map((member) => (
                <div key={member.profileId} className="admin-employees-page__drawer-list-row">
                  <div>
                    <strong>{member.fullName || member.email}</strong>
                    <span>{member.email}</span>
                  </div>
                  <AdminStatusBadge tone={getEmployeeStatusTone(member.status)}>{formatActionLabel(member.status)}</AdminStatusBadge>
                </div>
              )) : (
                <p className="admin-message">No employees assigned yet.</p>
              )}
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Permissions</strong>
              <small>Permissions are the security boundary.</small>
            </header>
            <div className="admin-employees-page__permission-groups">
              {Object.entries(permissionGroups).map(([moduleKey, items]) => (
                <div key={moduleKey} className="admin-employees-page__permission-group">
                  <strong>{formatActionLabel(moduleKey)}</strong>
                  <div className="admin-employees-page__toggle-list">
                    {items.map((permission) => {
                      const checked = roleForm.permissionCodes.includes(permission.code);
                      const isCritical = isOwnerRole && CRITICAL_OWNER_PERMISSIONS.has(permission.code);
                      return (
                        <label key={permission.code} className="admin-employees-page__toggle-row">
                          <div>
                            <span>{permission.label || formatPermissionLabel(permission.code)}</span>
                            <small>{permission.code}</small>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isCritical}
                            onChange={(event) => {
                              const nextChecked = event.target.checked;
                              setRoleForm((current) => ({
                                ...current,
                                permissionCodes: nextChecked
                                  ? Array.from(new Set([...current.permissionCodes, permission.code]))
                                  : current.permissionCodes.filter((code) => code !== permission.code),
                              }));
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Menu visibility</strong>
              <small>Sidebar visibility is UX only. Permissions still control access.</small>
            </header>
            <div className="admin-employees-page__permission-groups">
              {adminNavigationSections.map((section) => (
                <div key={section.key} className="admin-employees-page__permission-group">
                  <strong>{section.label}</strong>
                  <div className="admin-employees-page__toggle-list">
                    {section.pages.map((page) => {
                      const isForcedVisible = isOwnerRole && CRITICAL_OWNER_ROUTES.has(page.path);
                      const checked = roleForm.menuVisibility[page.path] !== false;
                      const permissionLabel = page.permission || (page.anyPermissions || []).join(" / ") || "No explicit permission";
                      return (
                        <label key={page.key} className="admin-employees-page__toggle-row">
                          <div>
                            <span>{page.label}</span>
                            <small>{permissionLabel}</small>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isForcedVisible}
                            onChange={(event) => setRoleForm((current) => ({
                              ...current,
                              menuVisibility: {
                                ...current.menuVisibility,
                                [page.path]: event.target.checked,
                              },
                            }))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel-card">
            <header>
              <strong>Live sidebar preview</strong>
              <small>Visible pages for this role</small>
            </header>
            <div className="admin-employees-page__access-tree">
              {adminNavigationSections.map((section) => {
                const visiblePages = section.pages.filter((page) => roleForm.menuVisibility[page.path] !== false);
                if (!visiblePages.length) return null;
                return (
                  <div key={section.key} className="admin-employees-page__preview-block">
                    <strong>{section.label}</strong>
                    <div className="admin-employees-page__badge-list">
                      {visiblePages.map((page) => (
                        <AdminStatusBadge key={page.key} tone="info">{page.label}</AdminStatusBadge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <div className="admin-employees-page__panel-actions is-wrap">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={closePanel}>Cancel</button>
            {!isCreate ? (
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleDuplicateRole(role)}>
                Duplicate role
              </button>
            ) : null}
            {!isCreate ? (
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleRoleStatusToggle(role)} disabled={isOwnerRole}>
                {role.isActive ? "Deactivate role" : "Activate role"}
              </button>
            ) : null}
            {!isCreate ? (
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => handleDeleteRole(role)} disabled={deleteDisabled}>
                Delete role
              </button>
            ) : null}
            <button type="button" className="admin-btn admin-btn-primary" onClick={persistRole} disabled={isSaving}>
              {isSaving ? "Saving..." : isCreate ? "Create role" : "Save role"}
            </button>
          </div>
        </div>
      </AdminSidePanel>
    );
  };

  const renderPanel = () => {
    if (!panel) return null;
    if (panel.type?.startsWith("role")) return renderRolePanel();
    return renderEmployeePanel();
  };

  return (
    <div className="admin-page admin-employees-page">
      <AdminPageHeader
        eyebrow={<><Users size={16} /> People</>}
        title="Employees"
        subtitle="Manage internal workers, roles, access, and activity."
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "People" },
          { label: "Employees" },
        ]}
        primaryAction={canManageEmployees ? {
          label: "Add employee",
          icon: UserPlus,
          onClick: openEmployeeCreate,
        } : null}
        secondaryActions={canManageEmployees ? [
          {
            label: "Create role",
            icon: Plus,
            onClick: openRoleCreate,
          },
        ] : []}
      />

      {notice ? <p className="admin-message">{notice}</p> : null}
      {error ? <p className="admin-message is-error">{error}</p> : null}

      {!canManageEmployees ? (
        <section className="admin-card admin-card-compact">
          <div className="admin-employees-page__access-required">
            <ShieldCheck size={20} />
            <div>
              <h2>Admin access required</h2>
              <p>Admin access required. Only admins can manage employees, roles, and access settings.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="admin-employees-page__kpis">
            {kpis.map((item) => <AdminKpiCard key={item.label} label={item.label} value={item.value} icon={item.icon} />)}
          </section>

          <section className="admin-card admin-card-compact admin-employees-page__tabs">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`admin-employees-page__tab${activeTab === tab.key ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </section>

          {isLoading ? <p className="admin-message">Loading employees...</p> : null}

          {!isLoading && activeTab === "employees" ? renderEmployeesTab() : null}
          {!isLoading && activeTab === "roles" ? renderRolesTab() : null}
          {!isLoading && activeTab === "access" ? renderAccessTab() : null}
          {!isLoading && activeTab === "activity" ? renderActivityTab() : null}
        </>
      )}

      {renderPanel()}
    </div>
  );
}
