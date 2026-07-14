import { useEffect, useMemo, useState } from "react";
import {
  FilterX,
  RefreshCw,
  ShieldCheck,
  UserCog,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  createAdminTeamMember,
  fetchAdminTeamModuleData,
  sendAdminEmployeeSetupLink,
  updateAdminEmployeePageAccess,
  updateAdminTeamMemberRole,
  updateAdminTeamMemberStatus,
} from "../../services/adminService.js";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import {
  ADMIN_ACCESS_TEMPLATES,
  ADMIN_ACCESS_TEMPLATES_BY_KEY,
  ADMIN_NAVIGATION_PAGE_DEFINITIONS,
  ADMIN_PAGE_SECTIONS,
  detectAccessTemplate,
} from "../../admin/adminPages.js";
import { ProfileAvatar } from "../../components/profile/ProfileAvatarUploader.jsx";
import PasswordField from "../../components/forms/PasswordField.jsx";
import "./style.scss";

const TAB_OPTIONS = [
  { key: "employees", label: "Employees" },
  { key: "access", label: "Employee Access" },
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

function createEmployeeForm() {
  return {
    fullName: "",
    email: "",
    phone: "",
    password: "",
    status: "active",
    templateKey: "read_only",
    sendSetupLink: false,
  };
}

function createAccessRowsMap(rows = []) {
  return rows.reduce((acc, row) => {
    if (row?.pageKey && row.canView) {
      acc[row.pageKey] = { pageKey: row.pageKey, canView: true, canEdit: row.canEdit === true };
    }
    return acc;
  }, {});
}

function getEmployeeStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "success";
  if (normalized === "invited") return "info";
  if (normalized === "suspended") return "warning";
  if (normalized === "archived" || normalized === "removed") return "danger";
  return "neutral";
}

function getEmployeeActivityTone(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized.includes("approve") || normalized.includes("reactivate") || normalized.includes("login")) return "success";
  if (normalized.includes("suspend") || normalized.includes("reject")) return "warning";
  if (normalized.includes("delete") || normalized.includes("remove")) return "danger";
  return "info";
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "0m";

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (hours) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
}

function formatActionLabel(action) {
  return String(action || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function resolveTemplateRoleId(templateKey, roles = []) {
  const template = ADMIN_ACCESS_TEMPLATES_BY_KEY.get(templateKey) || ADMIN_ACCESS_TEMPLATES_BY_KEY.get("read_only");
  const requestedRoleCode = template?.roleCode || "read_only";
  return roles.find((role) => role.code === requestedRoleCode)?.id
    || roles.find((role) => role.code === "read_only")?.id
    || roles.find((role) => !role.isOwnerRole)?.id
    || "";
}

function normalizeAccessRows(rowsMap = {}) {
  return Object.values(rowsMap)
    .filter((row) => row?.pageKey && row.canView)
    .sort((left, right) => left.pageKey.localeCompare(right.pageKey));
}

function buildAccessGroups() {
  const pagesBySection = ADMIN_PAGE_SECTIONS.map((section) => ({
    ...section,
    pages: ADMIN_NAVIGATION_PAGE_DEFINITIONS
      .filter((page) => page.sectionKey === section.key && !page.ownerOnly)
      .map((page) => ({
        key: page.key,
        label: page.defaultLabel,
        route: page.route,
        supportsEdit: page.supportsEdit,
        sensitive: Boolean(page.sensitive),
      })),
  })).filter((section) => section.pages.length);

  return pagesBySection;
}

function EmployeeIdentity({ employee }) {
  return (
    <div className="admin-employees-page__employee-head">
      <div className="admin-employees-page__avatar is-large">
        <ProfileAvatar avatarUrl={employee.avatarUrl} fallbackName={employee.fullName || employee.email} size="lg" />
      </div>
      <div className="admin-employees-page__employee-meta">
        <strong>{employee.fullName || "No name"}</strong>
        <span>{employee.email || "—"}</span>
        <span>{employee.roleLabel || "No role"}</span>
      </div>
    </div>
  );
}

function getEmployeeTemplateLabel(employee) {
  const template = detectAccessTemplate(employee.pageAccess || []);
  return employee.isOwner ? "Owner" : template?.label || "Custom";
}

function getActivityRowKey(row) {
  return `${row.source}:${row.id}`;
}

function getAccessSectionsLabel(employee, accessGroups) {
  if (employee.isOwner) {
    return "All sections";
  }

  const sections = accessGroups
    .filter((section) => section.pages.some((page) => (employee.pageAccess || []).some((entry) => entry.pageKey === page.key && entry.canView)))
    .map((section) => section.defaultLabel);

  if (!sections.length) {
    return "No sections";
  }

  if (sections.length === 1) {
    return sections[0];
  }

  if (sections.length === 2) {
    return sections.join(" • ");
  }

  return `${sections.slice(0, 2).join(" • ")} +${sections.length - 2}`;
}

function getEditablePagesCount(employee) {
  if (employee.isOwner) {
    return "All";
  }

  return (employee.pageAccess || []).filter((entry) => entry.canView && entry.canEdit).length;
}

function getAccessUpdatedAt(employee) {
  const timestamps = (employee.pageAccess || [])
    .map((entry) => entry.updatedAt || entry.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (!timestamps.length) {
    return employee.updatedAt || employee.createdAt || employee.lastLoginAt || null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function stopTableAction(event, callback) {
  event.stopPropagation();
  callback();
}

export default function AdminTeam() {
  const { isOwnerOrSuperAdmin } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("employees");
  const [employeeFilters, setEmployeeFilters] = useState({
    search: "",
    status: "all",
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedActivityKey, setSelectedActivityKey] = useState("");
  const [employeePreviewMode, setEmployeePreviewMode] = useState("employees");
  const [employeePreviewOpen, setEmployeePreviewOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [accessPanelOpen, setAccessPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(createEmployeeForm());
  const [accessForm, setAccessForm] = useState({
    employeeId: "",
    templateKey: "custom",
    rowsMap: {},
  });

  const accessGroups = useMemo(() => buildAccessGroups(), []);

  const loadModule = async (options = {}) => {
    setIsLoading(true);
    setError("");
    try {
      const next = await fetchAdminTeamModuleData({ force: options.force });
      setModuleData(next);
      setSelectedEmployeeId((current) => current || next?.members?.[0]?.id || "");
    } catch (nextError) {
      setError(nextError.message || "Could not load employees.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadModule();
  }, []);

  useEffect(() => {
    setEmployeePreviewOpen(false);
    setSelectedActivityKey("");
  }, [activeTab]);

  const employees = moduleData?.members || [];
  const roles = moduleData?.roles || [];
  const filteredEmployees = useMemo(() => {
    const query = employeeFilters.search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch = !query || [
        employee.fullName,
        employee.email,
        employee.roleLabel,
        getEmployeeTemplateLabel(employee),
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = employeeFilters.status === "all" || employee.status === employeeFilters.status;
      return matchesSearch && matchesStatus;
    });
  }, [employeeFilters.search, employeeFilters.status, employees]);

  const selectedEmployee = useMemo(
    () => filteredEmployees.find((employee) => employee.id === selectedEmployeeId)
      || employees.find((employee) => employee.id === selectedEmployeeId)
      || filteredEmployees[0]
      || employees[0]
      || null,
    [employees, filteredEmployees, selectedEmployeeId],
  );

  useEffect(() => {
    if (selectedEmployee?.id && selectedEmployee.id !== selectedEmployeeId) {
      setSelectedEmployeeId(selectedEmployee.id);
    }
  }, [selectedEmployee?.id, selectedEmployeeId]);

  const metrics = useMemo(() => ([
    { label: "Total employees", value: employees.length },
    { label: "Active employees", value: employees.filter((employee) => employee.status === "active").length },
    { label: "Suspended employees", value: employees.filter((employee) => employee.status === "suspended").length },
    { label: "With page access", value: employees.filter((employee) => employee.allowedPagesCount > 0).length },
    { label: "No access assigned", value: employees.filter((employee) => employee.allowedPagesCount < 1 && !employee.isOwner).length },
  ]), [employees]);

  const openEmployeePreview = (employee, mode = "employees") => {
    setSelectedEmployeeId(employee.id);
    setEmployeePreviewMode(mode);
    setEmployeePreviewOpen(true);
  };

  const openAccessEditor = (employee) => {
    if (!employee?.id || employee.source !== "team_member") {
      setError("Employee access can only be managed for team members in the team registry.");
      return;
    }

    const detectedTemplate = detectAccessTemplate(employee.pageAccess || []);
    setNotice("");
    setAccessForm({
      employeeId: employee.id,
      templateKey: detectedTemplate?.key || "custom",
      rowsMap: createAccessRowsMap(employee.pageAccess || []),
    });
    setAccessPanelOpen(true);
  };

  const openCreateEmployeePanel = () => {
    setNotice("");
    setEmployeeForm(createEmployeeForm());
    setCreatePanelOpen(true);
  };

  const handleCreateEmployee = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const roleId = resolveTemplateRoleId(employeeForm.templateKey, roles);
      const template = ADMIN_ACCESS_TEMPLATES_BY_KEY.get(employeeForm.templateKey) || ADMIN_ACCESS_TEMPLATES_BY_KEY.get("read_only");
      const createdEmployee = await createAdminTeamMember({
        fullName: employeeForm.fullName,
        email: employeeForm.email,
        phone: employeeForm.phone,
        password: employeeForm.password,
        status: employeeForm.status,
        sendSetupLink: employeeForm.sendSetupLink,
        roleId,
      });

      if (createdEmployee?.id) {
        await updateAdminEmployeePageAccess(createdEmployee.id, template?.access || []);
      }

      setNotice("Employee created.");
      setCreatePanelOpen(false);
      await loadModule({ force: true });
    } catch (nextError) {
      setError(nextError.message || "Could not create employee.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAccess = async () => {
    const employee = employees.find((item) => item.id === accessForm.employeeId);
    if (!employee?.id) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const nextRows = normalizeAccessRows(accessForm.rowsMap);
      await updateAdminEmployeePageAccess(employee.id, nextRows);

      const template = ADMIN_ACCESS_TEMPLATES_BY_KEY.get(accessForm.templateKey);
      const compatibilityRoleId = resolveTemplateRoleId(accessForm.templateKey, roles);
      if (!employee.isOwner && template?.key && template.key !== "custom" && compatibilityRoleId && compatibilityRoleId !== employee.roleId) {
        await updateAdminTeamMemberRole(employee.profileId, compatibilityRoleId);
      }

      setNotice("Employee access updated.");
      setAccessPanelOpen(false);
      await loadModule({ force: true });
    } catch (nextError) {
      setError(nextError.message || "Could not save employee access.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (employee, nextStatus) => {
    setError("");
    setNotice("");

    try {
      await updateAdminTeamMemberStatus(employee.profileId, nextStatus);
      setNotice(nextStatus === "active" ? "Employee reactivated." : "Employee status updated.");
      await loadModule({ force: true });
    } catch (nextError) {
      setError(nextError.message || "Could not update employee status.");
    }
  };

  const handleSendSetupLink = async (employee) => {
    setError("");
    setNotice("");

    try {
      await sendAdminEmployeeSetupLink(employee.email);
      setNotice("Password setup link sent.");
    } catch (nextError) {
      setError(nextError.message || "Could not send setup link.");
    }
  };

  const selectedAccessEmployee = useMemo(
    () => employees.find((employee) => employee.id === accessForm.employeeId) || null,
    [accessForm.employeeId, employees],
  );

  const selectedAccessRows = useMemo(
    () => normalizeAccessRows(accessForm.rowsMap),
    [accessForm.rowsMap],
  );

  const activityRows = useMemo(
    () => (moduleData?.activityTimeline || []).slice(0, 150),
    [moduleData?.activityTimeline],
  );

  const selectedActivity = useMemo(
    () => activityRows.find((row) => getActivityRowKey(row) === selectedActivityKey) || null,
    [activityRows, selectedActivityKey],
  );

  const selectedActivityEmployee = useMemo(
    () => employees.find((employee) => employee.profileId === selectedActivity?.admin_profile_id) || null,
    [employees, selectedActivity?.admin_profile_id],
  );

  const employeeVisibleAccessGroups = useMemo(() => {
    if (!selectedEmployee) {
      return [];
    }

    if (selectedEmployee.isOwner) {
      return accessGroups;
    }

    return accessGroups
      .map((section) => ({
        ...section,
        pages: section.pages.filter((page) => (selectedEmployee.pageAccess || []).some((entry) => entry.pageKey === page.key && entry.canView)),
      }))
      .filter((section) => section.pages.length);
  }, [accessGroups, selectedEmployee]);

  const employeeColumns = useMemo(() => ([
    {
      key: "employee",
      label: "Employee",
      width: 240,
      minWidth: 200,
      maxWidth: 360,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => (
        <div className="admin-crm-table__identity">
          <ProfileAvatar avatarUrl={employee.avatarUrl} fallbackName={employee.fullName || employee.email} size="md" />
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{employee.fullName || "No name"}</span>
            <span className="admin-crm-table__cell-sub">{employee.email || "—"}</span>
          </div>
        </div>
      ),
      getCellTitle: (employee) => employee.fullName || employee.email || "Employee",
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <AdminStatusBadge tone={getEmployeeStatusTone(employee.status)}>{employee.status}</AdminStatusBadge>,
      getCellTitle: (employee) => employee.status,
    },
    {
      key: "template",
      label: "Access template",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{getEmployeeTemplateLabel(employee)}</span>
          <span className="admin-crm-table__cell-sub">{employee.roleLabel || "No role"}</span>
        </div>
      ),
      getCellTitle: (employee) => `${getEmployeeTemplateLabel(employee)} • ${employee.roleLabel || "No role"}`,
    },
    {
      key: "pages",
      label: "Allowed pages",
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <span className="admin-crm-table__cell-main">{employee.isOwner ? "All pages" : employee.allowedPagesCount}</span>,
      getCellTitle: (employee) => employee.isOwner ? "All pages" : String(employee.allowedPagesCount || 0),
    },
    {
      key: "recentActivity",
      label: "Recent activity",
      width: 160,
      minWidth: 130,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{employee.recentActivityCount} actions</span>
          <span className="admin-crm-table__cell-sub">{formatDuration(employee.activeTimeThisWeekSeconds)} this week</span>
        </div>
      ),
      getCellTitle: (employee) => `${employee.recentActivityCount} actions • ${formatDuration(employee.activeTimeThisWeekSeconds)} this week`,
    },
    {
      key: "lastActive",
      label: "Last active",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => {
        const lastSeen = employee.lastLoginAt || employee.currentSession?.last_seen_at;
        return (
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{formatDateTime(lastSeen)}</span>
            <span className="admin-crm-table__cell-sub">{employee.currentSession ? "Session active" : "Offline"}</span>
          </div>
        );
      },
      getCellTitle: (employee) => formatDateTime(employee.lastLoginAt || employee.currentSession?.last_seen_at),
    },
    {
      key: "actions",
      label: "Actions",
      width: 260,
      minWidth: 220,
      maxWidth: 340,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => (
        <div className="admin-employees-page__badge-list">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={(event) => stopTableAction(event, () => openEmployeePreview(employee))}
          >
            Open
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={(event) => stopTableAction(event, () => openAccessEditor(employee))}
            disabled={employee.isOwner || employee.source !== "team_member"}
          >
            Edit access
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={(event) => stopTableAction(event, () => handleSendSetupLink(employee))}
          >
            Setup link
          </button>
        </div>
      ),
      hideable: false,
    },
  ]), [accessGroups, employeeFilters.search, employeeFilters.status]);

  const accessColumns = useMemo(() => ([
    {
      key: "employee",
      label: "Employee",
      width: 230,
      minWidth: 190,
      maxWidth: 340,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => (
        <div className="admin-crm-table__identity">
          <ProfileAvatar avatarUrl={employee.avatarUrl} fallbackName={employee.fullName || employee.email} size="md" />
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{employee.fullName || "No name"}</span>
            <span className="admin-crm-table__cell-sub">{employee.email || "—"}</span>
          </div>
        </div>
      ),
      getCellTitle: (employee) => employee.fullName || employee.email || "Employee",
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      minWidth: 110,
      maxWidth: 170,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <AdminStatusBadge tone={getEmployeeStatusTone(employee.status)}>{employee.status}</AdminStatusBadge>,
      getCellTitle: (employee) => employee.status,
    },
    {
      key: "template",
      label: "Template",
      width: 160,
      minWidth: 130,
      maxWidth: 220,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <span className="admin-crm-table__cell-main">{getEmployeeTemplateLabel(employee)}</span>,
      getCellTitle: (employee) => getEmployeeTemplateLabel(employee),
    },
    {
      key: "pages",
      label: "Visible pages",
      width: 120,
      minWidth: 110,
      maxWidth: 160,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <span className="admin-crm-table__cell-main">{employee.isOwner ? "All" : employee.allowedPagesCount}</span>,
      getCellTitle: (employee) => employee.isOwner ? "All visible pages" : `${employee.allowedPagesCount || 0} pages`,
    },
    {
      key: "editPages",
      label: "Edit-enabled",
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <span className="admin-crm-table__cell-main">{getEditablePagesCount(employee)}</span>,
      getCellTitle: (employee) => String(getEditablePagesCount(employee)),
    },
    {
      key: "sections",
      label: "Sections",
      width: 240,
      minWidth: 180,
      maxWidth: 360,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => <span className="admin-crm-table__cell-main">{getAccessSectionsLabel(employee, accessGroups)}</span>,
      getCellTitle: (employee) => getAccessSectionsLabel(employee, accessGroups),
    },
    {
      key: "updated",
      label: "Last access update",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (employee) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{formatDateTime(getAccessUpdatedAt(employee))}</span>
          <span className="admin-crm-table__cell-sub">{employee.isOwner ? "Protected access" : "Page map"}</span>
        </div>
      ),
      getCellTitle: (employee) => formatDateTime(getAccessUpdatedAt(employee)),
    },
  ]), [accessGroups]);

  const activityColumns = useMemo(() => ([
    {
      key: "time",
      label: "Time",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{formatDateTime(row.created_at)}</span>
          <span className="admin-crm-table__cell-sub">{row.source === "admin_activity_logs" ? "Admin log" : "Core log"}</span>
        </div>
      ),
      getCellTitle: (row) => formatDateTime(row.created_at),
    },
    {
      key: "employee",
      label: "Employee",
      width: 220,
      minWidth: 180,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => {
        const employee = employees.find((employeeItem) => employeeItem.profileId === row.admin_profile_id);
        return (
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{employee?.fullName || employee?.email || "Unknown employee"}</span>
            <span className="admin-crm-table__cell-sub">{employee?.roleLabel || "No role"}</span>
          </div>
        );
      },
      getCellTitle: (row) => {
        const employee = employees.find((employeeItem) => employeeItem.profileId === row.admin_profile_id);
        return employee?.fullName || employee?.email || "Unknown employee";
      },
    },
    {
      key: "action",
      label: "Action",
      width: 160,
      minWidth: 130,
      maxWidth: 220,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <AdminStatusBadge tone={getEmployeeActivityTone(row.action)}>{formatActionLabel(row.action)}</AdminStatusBadge>,
      getCellTitle: (row) => formatActionLabel(row.action),
    },
    {
      key: "module",
      label: "Module",
      width: 140,
      minWidth: 120,
      maxWidth: 220,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{formatActionLabel(row.module)}</span>,
      getCellTitle: (row) => formatActionLabel(row.module),
    },
    {
      key: "reference",
      label: "Reference",
      width: 180,
      minWidth: 140,
      maxWidth: 260,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.entityReference || row.entity_id || "—"}</span>
          <span className="admin-crm-table__cell-sub">{formatActionLabel(row.entity_type)}</span>
        </div>
      ),
      getCellTitle: (row) => row.entityReference || row.entity_id || "—",
    },
    {
      key: "summary",
      label: "Summary",
      width: 320,
      minWidth: 240,
      maxWidth: 520,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.metadataSummary || "No metadata summary"}</span>,
      getCellTitle: (row) => row.metadataSummary || "No metadata summary",
    },
  ]), [employees]);

  return (
    <div className="admin-page admin-employees-page">
      <AdminPageHeader
        eyebrow={<><ShieldCheck size={16} /> People</>}
        title="Employees"
        subtitle="Simplified employee access control. Assign visible admin pages directly to each employee."
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Employees" },
        ]}
        primaryAction={isOwnerOrSuperAdmin ? {
          label: "Add employee",
          icon: UserPlus,
          onClick: openCreateEmployeePanel,
        } : null}
        secondaryActions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onClick: () => loadModule({ force: true }),
          },
          {
            label: "Legacy roles",
            icon: UserCog,
            path: "/admin/roles",
          },
        ]}
      />

      {notice ? <p className="admin-message">{notice}</p> : null}
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {!moduleData?.supportsEmployeePageAccessV1 && !isLoading ? (
        <p className="admin-message is-error">
          Employee page access table is not available yet. Apply the latest employee access migration in Supabase.
        </p>
      ) : null}

      <AdminMetricsStrip items={metrics} />

      <section className="admin-panel admin-employees-page__tabs">
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

      <section className="admin-panel admin-employees-page__toolbar-card">
        <AdminFilterBar
          searchValue={employeeFilters.search}
          onSearchChange={(search) => setEmployeeFilters((current) => ({ ...current, search }))}
          searchPlaceholder="Search employee, email, template"
          statusFilter={employeeFilters.status}
          onStatusFilterChange={(status) => setEmployeeFilters((current) => ({ ...current, status }))}
          statusOptions={EMPLOYEE_STATUS_OPTIONS}
        >
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setEmployeeFilters({ search: "", status: "all" })}
          >
            <FilterX size={14} />
            <span>Clear filters</span>
          </button>
        </AdminFilterBar>
      </section>

      {activeTab === "employees" ? (
        <AdminColumnTable
          storageKey="ff-admin-table-layout-employees"
          title="Employees"
          countLabel={`${filteredEmployees.length} employee${filteredEmployees.length === 1 ? "" : "s"}`}
          columns={employeeColumns}
          rows={filteredEmployees}
          loading={isLoading}
          error={error}
          emptyTitle="No employees found"
          emptyDetail="Try adjusting the current filters."
          selectedRowId={employeePreviewOpen ? selectedEmployee?.id || "" : ""}
          getRowKey={(employee) => employee.id}
          onRowClick={(employee) => openEmployeePreview(employee, "employees")}
        />
      ) : null}

      {activeTab === "access" ? (
        <AdminColumnTable
          storageKey="ff-admin-table-layout-employee-access"
          title="Employee access"
          countLabel={`${filteredEmployees.length} access record${filteredEmployees.length === 1 ? "" : "s"}`}
          columns={accessColumns}
          rows={filteredEmployees}
          loading={isLoading}
          error={error}
          emptyTitle="No access records found"
          emptyDetail="Try adjusting the current filters."
          selectedRowId={employeePreviewOpen ? selectedEmployee?.id || "" : ""}
          getRowKey={(employee) => employee.id}
          onRowClick={(employee) => openEmployeePreview(employee, "access")}
        />
      ) : null}

      {activeTab === "activity" ? (
        <AdminColumnTable
          storageKey="ff-admin-table-layout-employee-activity"
          title="Activity"
          countLabel={`${activityRows.length} event${activityRows.length === 1 ? "" : "s"}`}
          columns={activityColumns}
          rows={activityRows}
          loading={isLoading}
          error={error}
          emptyTitle="No activity yet"
          emptyDetail="Employee actions will appear here once activity logs are available."
          selectedRowId={selectedActivityKey}
          getRowKey={(row) => getActivityRowKey(row)}
          onRowClick={(row) => setSelectedActivityKey(getActivityRowKey(row))}
        />
      ) : null}

      <AdminSidePanel
        open={employeePreviewOpen && Boolean(selectedEmployee)}
        onClose={() => setEmployeePreviewOpen(false)}
        eyebrow={employeePreviewMode === "access" ? "Employee access" : "Employee"}
        title={selectedEmployee?.fullName || selectedEmployee?.email || "Employee detail"}
        subtitle={selectedEmployee ? `${selectedEmployee.roleLabel || "No role"} • ${selectedEmployee.email || "—"}` : ""}
        className="admin-employees-page__drawer"
        withOverlay
      >
        {selectedEmployee ? (
          <div className="admin-employees-page__permission-preview">
            <EmployeeIdentity employee={selectedEmployee} />

            <div className="admin-employees-page__summary-grid">
              <div>
                <span>Status</span>
                <strong>{selectedEmployee.status}</strong>
              </div>
              <div>
                <span>Template</span>
                <strong>{getEmployeeTemplateLabel(selectedEmployee)}</strong>
              </div>
              <div>
                <span>Allowed pages</span>
                <strong>{selectedEmployee.isOwner ? "All pages" : selectedEmployee.allowedPagesCount}</strong>
              </div>
              <div>
                <span>Edit-enabled pages</span>
                <strong>{getEditablePagesCount(selectedEmployee)}</strong>
              </div>
              <div>
                <span>Last login</span>
                <strong>{formatDateTime(selectedEmployee.lastLoginAt || selectedEmployee.currentSession?.last_seen_at)}</strong>
              </div>
              <div>
                <span>Active this week</span>
                <strong>{formatDuration(selectedEmployee.activeTimeThisWeekSeconds)}</strong>
              </div>
            </div>

            <div className="admin-employees-page__panel-actions is-wrap">
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => openAccessEditor(selectedEmployee)}
                disabled={selectedEmployee.isOwner || selectedEmployee.source !== "team_member"}
              >
                Edit access
              </button>
              {selectedEmployee.status === "active" ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => handleStatusChange(selectedEmployee, "suspended")}
                  disabled={selectedEmployee.isOwner}
                >
                  Suspend
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => handleStatusChange(selectedEmployee, "active")}
                >
                  Reactivate
                </button>
              )}
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleSendSetupLink(selectedEmployee)}>
                Setup link
              </button>
              <Link to={`/admin/team/${selectedEmployee.profileId}/activity`} className="admin-btn admin-btn-secondary">
                Full activity
              </Link>
            </div>

            <section className="admin-panel admin-panel--nested">
              <div className="admin-panel__head">
                <div>
                  <h2>Visible pages</h2>
                  <p>{selectedEmployee.isOwner ? "Owner access always includes the full admin workspace." : "Current page-level access for this employee."}</p>
                </div>
              </div>

              {selectedEmployee.isOwner ? (
                <p className="admin-panel__hint">Owner access is protected and cannot be limited from this screen.</p>
              ) : employeeVisibleAccessGroups.length ? (
                <div className="admin-employees-page__drawer-list">
                  {employeeVisibleAccessGroups.map((section) => (
                    <div key={section.key} className="admin-employees-page__drawer-list-row">
                      <div>
                        <strong>{section.defaultLabel}</strong>
                        <small>{section.pages.map((page) => page.label).join(", ")}</small>
                      </div>
                      <div className="admin-employees-page__badge-list">
                        <AdminStatusBadge tone="info">{section.pages.length} pages</AdminStatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-panel__hint">No pages are currently visible for this employee.</p>
              )}
            </section>

            <section className="admin-panel admin-panel--nested">
              <div className="admin-panel__head">
                <div>
                  <h2>Recent activity</h2>
                  <p>Latest admin actions attributed to this employee.</p>
                </div>
              </div>

              {selectedEmployee.recentActivity?.length ? (
                <div className="admin-employees-page__mini-activity">
                  {selectedEmployee.recentActivity.map((row) => (
                    <div key={getActivityRowKey(row)} className="admin-employees-page__mini-activity-row">
                      <div>
                        <strong>{formatActionLabel(row.action)}</strong>
                        <small>{formatActionLabel(row.module)} • {row.entity_id || row.target_entity_id || "No reference"}</small>
                      </div>
                      <time>{formatDateTime(row.created_at)}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-panel__hint">No recent activity is available for this employee yet.</p>
              )}
            </section>
          </div>
        ) : null}
      </AdminSidePanel>

      <AdminSidePanel
        open={Boolean(selectedActivity)}
        onClose={() => setSelectedActivityKey("")}
        eyebrow={selectedActivity ? formatActionLabel(selectedActivity.module) : "Activity"}
        title={selectedActivity ? formatActionLabel(selectedActivity.action) : "Activity detail"}
        subtitle={selectedActivity ? formatDateTime(selectedActivity.created_at) : ""}
        className="admin-employees-page__drawer"
        withOverlay
      >
        {selectedActivity ? (
          <div className="admin-employees-page__permission-preview">
            <div className="admin-employees-page__summary-grid">
              <div>
                <span>Employee</span>
                <strong>{selectedActivityEmployee?.fullName || selectedActivityEmployee?.email || "Unknown employee"}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{selectedActivityEmployee?.roleLabel || "No role"}</strong>
              </div>
              <div>
                <span>Module</span>
                <strong>{formatActionLabel(selectedActivity.module)}</strong>
              </div>
              <div>
                <span>Action</span>
                <strong>{formatActionLabel(selectedActivity.action)}</strong>
              </div>
              <div>
                <span>Entity type</span>
                <strong>{formatActionLabel(selectedActivity.entity_type)}</strong>
              </div>
              <div>
                <span>Reference</span>
                <strong>{selectedActivity.entityReference || selectedActivity.entity_id || "—"}</strong>
              </div>
            </div>

            <section className="admin-panel admin-panel--nested">
              <div className="admin-panel__head">
                <div>
                  <h2>Summary</h2>
                  <p>Quick description generated from the activity metadata.</p>
                </div>
              </div>
              <p className="admin-panel__hint">{selectedActivity.metadataSummary || "No metadata summary is available for this entry."}</p>
            </section>

            <section className="admin-panel admin-panel--nested">
              <div className="admin-panel__head">
                <div>
                  <h2>Metadata</h2>
                  <p>Top-level metadata fields captured for this action.</p>
                </div>
              </div>
              {Object.entries(selectedActivity.metadata || {}).length ? (
                <div className="admin-employees-page__drawer-list">
                  {Object.entries(selectedActivity.metadata || {}).map(([key, value]) => (
                    <div key={key} className="admin-employees-page__drawer-list-row">
                      <div>
                        <strong>{formatActionLabel(key)}</strong>
                        <small>{typeof value === "object" ? JSON.stringify(value) : String(value || "—")}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-panel__hint">This activity entry does not include extra metadata.</p>
              )}
            </section>
          </div>
        ) : null}
      </AdminSidePanel>

      <AdminSidePanel
        open={createPanelOpen}
        onClose={() => setCreatePanelOpen(false)}
        eyebrow="Employee"
        title="Add employee"
        subtitle="Create a team member and assign a simple page access template."
        withOverlay
      >
        <div className="admin-form-grid">
          <label className="admin-form-field">
            <span>Full name</span>
            <input className="admin-input" value={employeeForm.fullName} onChange={(event) => setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))} />
          </label>
          <label className="admin-form-field">
            <span>Email</span>
            <input className="admin-input" type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="admin-form-field">
            <span>Phone</span>
            <input className="admin-input" value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label className="admin-form-field">
            <span>Password</span>
            <PasswordField className="admin-input" value={employeeForm.password} onChange={(event) => setEmployeeForm((current) => ({ ...current, password: event.target.value }))} />
          </label>
          <label className="admin-form-field">
            <span>Status</span>
            <select className="admin-select" value={employeeForm.status} onChange={(event) => setEmployeeForm((current) => ({ ...current, status: event.target.value }))}>
              {EMPLOYEE_STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-field">
            <span>Access template</span>
            <select className="admin-select" value={employeeForm.templateKey} onChange={(event) => setEmployeeForm((current) => ({ ...current, templateKey: event.target.value }))}>
              {ADMIN_ACCESS_TEMPLATES.filter((template) => template.key !== "custom").map((template) => (
                <option key={template.key} value={template.key}>{template.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={employeeForm.sendSetupLink} onChange={(event) => setEmployeeForm((current) => ({ ...current, sendSetupLink: event.target.checked }))} />
            <span>Send password setup link after creating employee</span>
          </label>
        </div>

        <div className="admin-employees-page__panel-actions is-wrap">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setCreatePanelOpen(false)}>Cancel</button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={handleCreateEmployee} disabled={isSaving}>Create employee</button>
        </div>
      </AdminSidePanel>

      <AdminSidePanel
        open={accessPanelOpen}
        onClose={() => setAccessPanelOpen(false)}
        eyebrow="Employee access"
        title={selectedAccessEmployee?.fullName || selectedAccessEmployee?.email || "Edit access"}
        subtitle="Assign visible admin pages directly. Owner-only pages remain protected and are not assignable here."
        withOverlay
      >
        {selectedAccessEmployee ? <EmployeeIdentity employee={selectedAccessEmployee} /> : null}

        <div className="admin-form-grid">
          <label className="admin-form-field">
            <span>Template</span>
            <select
              className="admin-select"
              value={accessForm.templateKey}
              onChange={(event) => {
                const templateKey = event.target.value;
                const template = ADMIN_ACCESS_TEMPLATES_BY_KEY.get(templateKey);
                setAccessForm((current) => ({
                  ...current,
                  templateKey,
                  rowsMap: template?.key === "custom" ? current.rowsMap : createAccessRowsMap(template?.access || []),
                }));
              }}
            >
              {ADMIN_ACCESS_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key}>{template.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="admin-employees-page__panel-actions is-wrap">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => {
              const template = ADMIN_ACCESS_TEMPLATES_BY_KEY.get(accessForm.templateKey) || ADMIN_ACCESS_TEMPLATES_BY_KEY.get("read_only");
              setAccessForm((current) => ({ ...current, rowsMap: createAccessRowsMap(template?.access || []) }));
            }}
          >
            Reset to template
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setAccessForm((current) => ({ ...current, templateKey: "custom", rowsMap: {} }))}
          >
            Clear access
          </button>
        </div>

        <div className="admin-employees-page__access-tree">
          {accessGroups.map((section) => (
            <article key={section.key} className="admin-panel admin-panel--nested">
              <div className="admin-panel__head">
                <div>
                  <h2>{section.defaultLabel}</h2>
                  <p>Choose visible pages for this employee.</p>
                </div>
              </div>
              <div className="admin-employees-page__toggle-list">
                {section.pages.map((page) => {
                  const entry = accessForm.rowsMap[page.key];

                  return (
                    <label key={page.key} className="admin-checkbox admin-checkbox--row">
                      <input
                        type="checkbox"
                        checked={Boolean(entry?.canView)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setAccessForm((current) => {
                            const nextRowsMap = { ...current.rowsMap };
                            if (checked) {
                              nextRowsMap[page.key] = { pageKey: page.key, canView: true, canEdit: Boolean(nextRowsMap[page.key]?.canEdit) };
                            } else {
                              delete nextRowsMap[page.key];
                            }
                            return { ...current, rowsMap: nextRowsMap };
                          });
                        }}
                      />
                      <span>
                        <strong>{page.label}</strong>
                        <small>{page.route}</small>
                      </span>
                      <div className="admin-employees-page__badge-list">
                        {page.sensitive ? <AdminStatusBadge tone="warning">Sensitive</AdminStatusBadge> : null}
                        {page.supportsEdit ? (
                          <label className="admin-checkbox">
                            <input
                              type="checkbox"
                              checked={Boolean(entry?.canEdit)}
                              disabled={!entry?.canView}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setAccessForm((current) => ({
                                  ...current,
                                  rowsMap: {
                                    ...current.rowsMap,
                                    [page.key]: {
                                      pageKey: page.key,
                                      canView: true,
                                      canEdit: checked,
                                    },
                                  },
                                }));
                              }}
                            />
                            <span>Edit</span>
                          </label>
                        ) : (
                          <AdminStatusBadge tone="neutral">View only</AdminStatusBadge>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        <div className="admin-employees-page__summary-grid">
          <div>
            <span>Selected pages</span>
            <strong>{selectedAccessRows.length}</strong>
          </div>
          <div>
            <span>Edit-enabled pages</span>
            <strong>{selectedAccessRows.filter((row) => row.canEdit).length}</strong>
          </div>
        </div>

        <p className="admin-panel__hint">
          Owner access is not controlled here. Non-owner employees see only the pages checked above, and direct URL access is blocked by the same page-access map.
        </p>

        <div className="admin-employees-page__panel-actions is-wrap">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setAccessPanelOpen(false)}>Cancel</button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={handleSaveAccess} disabled={isSaving}>Save access</button>
        </div>
      </AdminSidePanel>
    </div>
  );
}
