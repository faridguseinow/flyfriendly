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
  AdminDataTable,
  AdminDetailDrawer,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

function getStatusTone(isActive) {
  return isActive ? "success" : "neutral";
}

function getRoleTypeTone(role) {
  if (role.isOwnerRole) return "warning";
  if (role.isSystemRole) return "info";
  return "neutral";
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
    loadModule();
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
    const q = search.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesSearch = !q || [role.name, role.code, role.description].some((value) =>
        String(value || "").toLowerCase().includes(q),
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
    const assignedPermissionCodes = rolePermissions
      .filter((item) => item.roleCode === role.code)
      .map((item) => item.permissionCode);

    setNotice("");
    setEditingRoleId(role.id);
    setForm({
      name: role.name || role.label || role.code,
      slug: role.slug || role.code,
      description: role.description || "",
      isActive: role.isActive,
      permissionCodes: assignedPermissionCodes,
    });
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
      setDrawerOpen(false);
      await loadModule();
      setEditingRoleId(nextRole.id);
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
      await loadModule();
      setEditingRoleId(nextRole.id);
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

      <AdminDataTable
        title="Roles list"
        description="System roles stay protected. Custom roles can be duplicated, deactivated, and deleted when not assigned."
        columns={[
          { key: "name", label: "Role" },
          { key: "description", label: "Description" },
          { key: "members", label: "Team members" },
          { key: "status", label: "Status" },
          { key: "type", label: "Type" },
          { key: "actions", label: "Actions" },
        ]}
        rows={filteredRoles}
        loading={isLoading}
        error=""
        emptyLabel="No roles match the current filters."
        renderRow={(role) => (
          <tr key={role.id}>
            <td className="admin-cell-wrap">
              <strong>{role.name}</strong>
              <div>{role.code}</div>
            </td>
            <td className="admin-cell-wrap">{role.description || "No description provided."}</td>
            <td>{role.memberCount}</td>
            <td><AdminStatusBadge tone={getStatusTone(role.isActive)}>{role.isActive ? "Active" : "Inactive"}</AdminStatusBadge></td>
            <td>
              <div className="admin-roles-page__badges">
                <AdminStatusBadge tone={getRoleTypeTone(role)}>
                  {role.isOwnerRole ? "Owner" : role.isSystemRole ? "System" : "Custom"}
                </AdminStatusBadge>
              </div>
            </td>
            <td>
              <div className="admin-roles-page__row-actions">
                <button type="button" className="admin-link-button" onClick={() => openEdit(role)}>Edit</button>
                <button type="button" className="admin-link-button" onClick={() => duplicateRole(role)}>
                  <Copy size={14} />
                  <span>Duplicate</span>
                </button>
                <button type="button" className="admin-link-button" onClick={() => toggleRoleStatus(role)}>
                  <PauseCircle size={14} />
                  <span>{role.isActive ? "Deactivate" : "Activate"}</span>
                </button>
              </div>
            </td>
          </tr>
        )}
      />

      <AdminDetailDrawer
        open={drawerOpen}
        title={editingRole ? editingRole.name : "Create role"}
        subtitle={editingRole ? editingRole.code : "Define a custom role, then assign module permissions."}
        onClose={() => setDrawerOpen(false)}
      >
        <div className="admin-roles-page__drawer">
          <label>
            <span>Role name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Role name"
            />
          </label>

          <label>
            <span>Role slug</span>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="role-slug"
              disabled={Boolean(editingRole?.isSystemRole)}
            />
          </label>

          <label className="admin-roles-page__field-wide">
            <span>Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Describe what this role is responsible for."
            />
          </label>

          <label className="admin-roles-page__toggle">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              disabled={Boolean(editingRole?.isOwnerRole)}
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
                    const disabled = Boolean(editingRole?.isOwnerRole)
                      && ["dashboard.view", "team.manage", "roles.manage", "menu.manage", "settings.manage"].includes(permission.code);
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

          <div className="admin-roles-page__drawer-actions">
            <button type="button" className="btn btn--primary" onClick={saveRole} disabled={isSaving}>
              {editingRole ? "Save role" : "Create role"}
            </button>
            {editingRole ? (
              <>
                <button type="button" className="admin-link-button" onClick={() => duplicateRole(editingRole)} disabled={isSaving}>
                  <Copy size={14} />
                  <span>Duplicate</span>
                </button>
                <button type="button" className="admin-link-button" onClick={() => toggleRoleStatus(editingRole)} disabled={isSaving}>
                  <PauseCircle size={14} />
                  <span>{editingRole.isActive ? "Deactivate" : "Activate"}</span>
                </button>
                {canDeleteEditingRole ? (
                  <button type="button" className="admin-link-button is-danger" onClick={() => removeRole(editingRole)} disabled={isSaving}>
                    <Trash2 size={14} />
                    <span>Delete role</span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </AdminDetailDrawer>
    </div>
  );
}
