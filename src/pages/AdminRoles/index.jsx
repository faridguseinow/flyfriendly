import { useEffect, useMemo, useState } from "react";
import { Copy, PauseCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  createAdminRole,
  deactivateAdminRole,
  deleteAdminRole,
  duplicateAdminRole,
  fetchAdminRolesModuleData,
  updateAdminRoleDefinition,
} from "../../services/adminService.js";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const OWNER_LOCKED_PERMISSION_CODES = new Set([
  "dashboard.view",
  "team.manage",
  "roles.manage",
  "menu.manage",
  "settings.manage",
]);

function getStatusTone(isActive) {
  return isActive ? "success" : "neutral";
}

function getRoleTypeTone(role) {
  if (role.isOwnerRole) return "warning";
  if (role.isSystemRole) return "info";
  return "neutral";
}

function formatRoleType(role) {
  if (role.isOwnerRole) return "Owner";
  if (role.isSystemRole) return "System";
  return "Custom";
}

function createEmptyRoleForm() {
  return {
    name: "",
    slug: "",
    description: "",
    isActive: true,
    permissionCodes: [],
  };
}

function buildRoleForm(role, rolePermissions) {
  const assignedPermissionCodes = rolePermissions
    .filter((item) => item.roleCode === role.code)
    .map((item) => item.permissionCode);

  return {
    name: role.name || role.label || role.code,
    slug: role.slug || role.code,
    description: role.description || "",
    isActive: role.isActive,
    permissionCodes: assignedPermissionCodes,
  };
}

export default function AdminRoles() {
  const { isOwnerOrSuperAdmin } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [form, setForm] = useState(createEmptyRoleForm());
  const [isSaving, setIsSaving] = useState(false);

  const loadModule = async () => {
    setIsLoading(true);
    setError("");
    try {
      const next = await fetchAdminRolesModuleData();
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load roles.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadModule();
  }, []);

  const roles = moduleData?.roles || [];
  const permissions = moduleData?.permissions || [];
  const rolePermissions = moduleData?.rolePermissions || [];

  const permissionGroups = useMemo(() => {
    return permissions.reduce((acc, permission) => {
      const key = permission.module || "general";
      acc[key] ||= [];
      acc[key].push(permission);
      return acc;
    }, {});
  }, [permissions]);

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesSearch = !query || [role.name, role.code, role.description].some((value) =>
        String(value || "").toLowerCase().includes(query),
      );
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && role.isActive)
        || (statusFilter === "inactive" && !role.isActive);
      const roleType = role.isOwnerRole ? "owner" : role.isSystemRole ? "system" : "custom";
      const matchesType = typeFilter === "all" || typeFilter === roleType;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [roles, search, statusFilter, typeFilter]);

  const editingRole = useMemo(
    () => roles.find((role) => role.id === editingRoleId) || null,
    [editingRoleId, roles],
  );

  const openCreate = () => {
    setNotice("");
    setEditingRoleId(null);
    setForm(createEmptyRoleForm());
    setDrawerOpen(true);
  };

  const openEdit = (role) => {
    setNotice("");
    setEditingRoleId(role.id);
    setForm(buildRoleForm(role, rolePermissions));
    setDrawerOpen(true);
  };

  const togglePermission = (permissionCode) => {
    setForm((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(permissionCode)
        ? current.permissionCodes.filter((item) => item !== permissionCode)
        : [...current.permissionCodes, permissionCode],
    }));
  };

  const saveRole = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        role: {
          name: form.name,
          slug: form.slug,
          description: form.description,
          isActive: form.isActive,
          isSystemRole: editingRole?.isSystemRole || false,
          isOwnerRole: editingRole?.isOwnerRole || false,
          rank: editingRole?.rank || 0,
        },
        permissionCodes: form.permissionCodes,
      };

      const nextRole = editingRole
        ? await updateAdminRoleDefinition(editingRole.id, payload)
        : await createAdminRole(payload);

      setNotice(editingRole ? "Role updated." : "Role created.");
      setEditingRoleId(nextRole.id);
      await loadModule();
      setDrawerOpen(true);
    } catch (nextError) {
      setError(nextError.message || "Could not save the role.");
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateRole = async (role) => {
    setError("");
    setNotice("");
    try {
      const nextRole = await duplicateAdminRole(role.id);
      setNotice(`Role "${role.name}" duplicated.`);
      setEditingRoleId(nextRole.id);
      await loadModule();
      setDrawerOpen(true);
    } catch (nextError) {
      setError(nextError.message || "Could not duplicate the role.");
    }
  };

  const toggleRoleStatus = async (role) => {
    const nextIsActive = !role.isActive;
    const confirmed = window.confirm(
      nextIsActive
        ? `Activate "${role.name}"?`
        : `Deactivate "${role.name}"? Team members assigned to this role will keep the assignment, but the role will be inactive.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    try {
      await deactivateAdminRole(role.id, nextIsActive);
      setNotice(nextIsActive ? "Role activated." : "Role deactivated.");
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not update role status.");
    }
  };

  const removeRole = async (role) => {
    const confirmed = window.confirm(
      `Delete "${role.name}"? This action is only allowed for custom roles without assigned team members.`,
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    try {
      await deleteAdminRole(role.id);
      setNotice("Role deleted.");
      setDrawerOpen(false);
      setEditingRoleId(null);
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not delete the role.");
    }
  };

  const roleColumns = useMemo(() => ([
    {
      key: "role",
      label: "Role",
      width: 220,
      minWidth: 180,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (role) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{role.name}</span>
          <span className="admin-crm-table__cell-sub">{role.code}</span>
        </div>
      ),
      getCellTitle: (role) => role.name,
    },
    {
      key: "description",
      label: "Description",
      width: 360,
      minWidth: 240,
      maxWidth: 520,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (role) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{role.description || "No description provided."}</span>
          <span className="admin-crm-table__cell-sub">
            {role.isOwnerRole ? "Protected owner access" : role.isSystemRole ? "System baseline role" : "Custom editable role"}
          </span>
        </div>
      ),
      getCellTitle: (role) => role.description || "No description provided.",
    },
    {
      key: "members",
      label: "Team members",
      width: 130,
      minWidth: 120,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      align: "right",
      renderCell: (role) => <span className="admin-crm-table__cell-main">{role.memberCount}</span>,
      getCellTitle: (role) => String(role.memberCount),
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
      renderCell: (role) => <AdminStatusBadge tone={getStatusTone(role.isActive)}>{role.isActive ? "Active" : "Inactive"}</AdminStatusBadge>,
      getCellTitle: (role) => role.isActive ? "Active" : "Inactive",
    },
    {
      key: "type",
      label: "Type",
      width: 120,
      minWidth: 110,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (role) => <AdminStatusBadge tone={getRoleTypeTone(role)}>{formatRoleType(role)}</AdminStatusBadge>,
      getCellTitle: (role) => formatRoleType(role),
    },
    {
      key: "actions",
      label: "Actions",
      width: 250,
      minWidth: 190,
      maxWidth: 320,
      wrap: false,
      resizable: true,
      reorderable: true,
      hideable: false,
      renderCell: (role) => (
        <div className="admin-roles-page__row-actions">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={(event) => {
              event.stopPropagation();
              openEdit(role);
            }}
          >
            {isOwnerOrSuperAdmin ? "Edit" : "Open"}
          </button>
          {isOwnerOrSuperAdmin ? (
            <>
              <button
                type="button"
                className="admin-link-button"
                onClick={(event) => {
                  event.stopPropagation();
                  void duplicateRole(role);
                }}
              >
                <Copy size={14} />
                <span>Duplicate</span>
              </button>
              <button
                type="button"
                className="admin-link-button"
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleRoleStatus(role);
                }}
              >
                <PauseCircle size={14} />
                <span>{role.isActive ? "Deactivate" : "Activate"}</span>
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ]), [isOwnerOrSuperAdmin, rolePermissions]);

  const canDeleteEditingRole = editingRole && !editingRole.isSystemRole && !editingRole.isOwnerRole && editingRole.memberCount < 1;

  return (
    <div className="admin-page admin-roles-page">
      <AdminPageHeader
        eyebrow={<><ShieldCheck size={16} /> System</>}
        title="Roles"
        subtitle="Create and manage custom admin roles, review permission sets, and keep owner access safe."
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Roles" },
        ]}
        primaryAction={isOwnerOrSuperAdmin ? {
          label: "Create role",
          icon: Plus,
          onClick: openCreate,
        } : null}
      />

      {notice ? <p className="admin-message">{notice}</p> : null}
      {error ? <p className="admin-message is-error">{error}</p> : null}

      {!isOwnerOrSuperAdmin ? (
        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2>Owner access required</h2>
              <p>Only the owner or super admin can create, edit, deactivate, duplicate, or delete admin roles.</p>
            </div>
          </div>
        </section>
      ) : null}

      {!moduleData?.supportsDynamicRolesV1 && !isLoading ? (
        <p className="admin-message">
          Dynamic admin roles foundation is not fully available yet. Apply the latest admin roles migration in Supabase.
        </p>
      ) : null}

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search role name, code, description"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { value: "all", label: "All statuses" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
      >
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All role types</option>
          <option value="owner">Owner</option>
          <option value="system">System</option>
          <option value="custom">Custom</option>
        </select>
      </AdminFilterBar>

      <AdminColumnTable
        storageKey="ff-admin-table-layout-roles"
        title="Roles list"
        countLabel={isLoading ? "" : `${filteredRoles.length} role${filteredRoles.length === 1 ? "" : "s"}`}
        columns={roleColumns}
        rows={filteredRoles}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyTitle="No roles match the current filters."
        emptyDetail="Try adjusting the current filters."
        selectedRowId={drawerOpen ? editingRole?.id || "" : ""}
        getRowKey={(role) => role.id}
        onRowClick={(role) => openEdit(role)}
      />

      <AdminSidePanel
        open={drawerOpen}
        title={editingRole ? editingRole.name : "Create role"}
        subtitle={editingRole ? editingRole.code : "Define a custom role, then assign module permissions."}
        eyebrow="Role"
        onClose={() => setDrawerOpen(false)}
        className="admin-roles-page__drawer-panel"
        withOverlay
      >
        <div className="admin-roles-page__drawer">
          {editingRole ? (
            <section className="admin-roles-page__summary-grid">
              <article>
                <span>Status</span>
                <div className="admin-roles-page__summary-slot">
                  <AdminStatusBadge tone={getStatusTone(editingRole.isActive)}>{editingRole.isActive ? "Active" : "Inactive"}</AdminStatusBadge>
                </div>
              </article>
              <article>
                <span>Type</span>
                <div className="admin-roles-page__summary-slot">
                  <AdminStatusBadge tone={getRoleTypeTone(editingRole)}>{formatRoleType(editingRole)}</AdminStatusBadge>
                </div>
              </article>
              <article>
                <span>Assigned team members</span>
                <strong>{editingRole.memberCount}</strong>
              </article>
              <article>
                <span>Enabled permissions</span>
                <strong>{form.permissionCodes.length}</strong>
              </article>
            </section>
          ) : null}

          <label>
            <span>Role name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Role name"
              disabled={!isOwnerOrSuperAdmin || isSaving}
            />
          </label>

          <label>
            <span>Role slug</span>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="role-slug"
              disabled={!isOwnerOrSuperAdmin || isSaving || Boolean(editingRole?.isSystemRole)}
            />
          </label>

          <label className="admin-roles-page__field-wide">
            <span>Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Describe what this role is responsible for."
              disabled={!isOwnerOrSuperAdmin || isSaving}
            />
          </label>

          <label className="admin-roles-page__toggle">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              disabled={!isOwnerOrSuperAdmin || isSaving || Boolean(editingRole?.isOwnerRole)}
            />
            <div>
              <strong>Active role</strong>
              <span>Inactive roles stay in the system but should not be assigned to new team members.</span>
            </div>
          </label>

          <section className="admin-roles-page__permissions">
            <div className="admin-panel__head">
              <div>
                <h2>Permissions</h2>
                <p>Grouped by module. Critical owner permissions should remain enabled for owner roles.</p>
              </div>
            </div>

            {Object.entries(permissionGroups).map(([moduleKey, items]) => (
              <article key={moduleKey} className="admin-roles-page__permission-group">
                <strong>{moduleKey.replace(/_/g, " ")}</strong>
                <div className="admin-roles-page__permission-options">
                  {items.map((permission) => {
                    const checked = form.permissionCodes.includes(permission.code);
                    const disabled = !isOwnerOrSuperAdmin
                      || isSaving
                      || (Boolean(editingRole?.isOwnerRole) && OWNER_LOCKED_PERMISSION_CODES.has(permission.code));

                    return (
                      <label key={permission.code} className={`admin-roles-page__permission-option${checked ? " is-active" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => togglePermission(permission.code)}
                        />
                        <div>
                          <strong>{permission.label}</strong>
                          <span>{permission.code}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>

          {isOwnerOrSuperAdmin ? (
            <div className="admin-roles-page__drawer-actions">
              <button type="button" className="btn btn--primary" onClick={saveRole} disabled={isSaving}>
                {editingRole ? "Save role" : "Create role"}
              </button>
              {editingRole ? (
                <>
                  <button type="button" className="admin-link-button" onClick={() => void duplicateRole(editingRole)} disabled={isSaving}>
                    <Copy size={14} />
                    <span>Duplicate</span>
                  </button>
                  <button type="button" className="admin-link-button" onClick={() => void toggleRoleStatus(editingRole)} disabled={isSaving}>
                    <PauseCircle size={14} />
                    <span>{editingRole.isActive ? "Deactivate" : "Activate"}</span>
                  </button>
                  {canDeleteEditingRole ? (
                    <button type="button" className="admin-link-button is-danger" onClick={() => void removeRole(editingRole)} disabled={isSaving}>
                      <Trash2 size={14} />
                      <span>Delete role</span>
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </AdminSidePanel>
    </div>
  );
}
