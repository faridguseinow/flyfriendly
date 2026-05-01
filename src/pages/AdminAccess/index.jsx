import { useEffect, useMemo, useState } from "react";
import { KeyRound, Search, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { ADMIN_ROLES } from "../../admin/rbac.js";
import { fetchAccessModuleData, moveUserToTrash, updateUserAdminRoles } from "../../services/adminService.js";
import { useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric">
      <span><Icon size={22} strokeWidth={1.8} /></span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

export default function AdminAccess() {
  const { isSuperAdmin } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadModule = async (keepSelected = true) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchAccessModuleData();
      setModuleData(next);
      if (!keepSelected && next.profiles[0]) {
        setSelectedUserId(next.profiles[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load Users & Roles module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule(false);
  }, []);

  useEffect(() => {
    const deepLinkedUserId = searchParams.get("user");
    if (deepLinkedUserId) {
      setSelectedUserId(deepLinkedUserId);
    }
  }, [searchParams]);

  const profiles = moduleData?.profiles || [];
  const roles = moduleData?.roles?.length
    ? moduleData.roles
    : Object.entries(ADMIN_ROLES).map(([code, meta]) => ({ code, label: meta.label, rank: meta.rank }));
  const permissions = moduleData?.permissions || [];
  const userRoles = moduleData?.userRoles || [];
  const rolePermissions = moduleData?.rolePermissions || [];

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const assigned = userRoles.filter((item) => item.user_id === profile.id).map((item) => item.role_code);
      const matchesSearch = !q || [profile.full_name, profile.email, profile.phone].some((value) =>
        String(value || "").toLowerCase().includes(q),
      );
      const matchesRole = roleFilter === "all" || assigned.includes(roleFilter) || profile.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [profiles, roleFilter, search, userRoles]);

  const selectedProfile = useMemo(
    () => filteredProfiles.find((item) => item.id === selectedUserId) || profiles.find((item) => item.id === selectedUserId) || null,
    [filteredProfiles, profiles, selectedUserId],
  );

  const selectedUserRoleCodes = useMemo(
    () => userRoles.filter((item) => item.user_id === selectedProfile?.id).map((item) => item.role_code),
    [selectedProfile, userRoles],
  );

  useEffect(() => {
    setSelectedRoles(selectedUserRoleCodes);
  }, [selectedUserRoleCodes]);

  const selectedPermissionCodes = useMemo(() => {
    const codes = new Set();
    selectedRoles.forEach((roleCode) => {
      rolePermissions.filter((item) => item.role_code === roleCode).forEach((item) => codes.add(item.permission_code));
      if (!rolePermissions.length && ADMIN_ROLES[roleCode]) {
        ADMIN_ROLES[roleCode].permissions.forEach((code) => code !== "*" && codes.add(code));
      }
    });
    return Array.from(codes).sort();
  }, [rolePermissions, selectedRoles]);

  const groupedPermissions = useMemo(() => {
    const source = permissions.length
      ? permissions
      : Array.from(new Set(Object.values(ADMIN_ROLES).flatMap((item) => item.permissions.filter((code) => code !== "*"))))
        .map((code) => {
          const [module, action] = code.split(".");
          return { code, module, action, label: code };
        });

    return source.reduce((acc, item) => {
      acc[item.module] ||= [];
      acc[item.module].push(item);
      return acc;
    }, {});
  }, [permissions]);

  const metrics = useMemo(() => ({
    users: profiles.length,
    adminUsers: profiles.filter((profile) => (userRoles.some((item) => item.user_id === profile.id) || profile.role === "admin")).length,
    roles: roles.length,
    permissions: permissions.length || Object.values(groupedPermissions).flat().length,
  }), [groupedPermissions, permissions.length, profiles, roles.length, userRoles]);

  const toggleRole = (roleCode) => {
    setSelectedRoles((current) =>
      current.includes(roleCode) ? current.filter((item) => item !== roleCode) : [...current, roleCode],
    );
  };

  const saveRoles = async () => {
    if (!selectedProfile) return;
    setIsSaving(true);
    setError("");
    try {
      await updateUserAdminRoles(selectedProfile.id, selectedRoles);
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save user roles.");
    } finally {
      setIsSaving(false);
    }
  };

  const trashUser = async () => {
    if (!selectedProfile || !isSuperAdmin) return;
    const confirmed = window.confirm(`Move ${selectedProfile.full_name || selectedProfile.email || "this user"} to trash? Only a super admin will be able to permanently purge the account.`);
    if (!confirmed) return;

    setIsSaving(true);
    setError("");
    try {
      await moveUserToTrash(selectedProfile.id);
      setSelectedUserId(null);
      await loadModule(false);
    } catch (nextError) {
      setError(nextError.message || "Could not move the user to trash.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-access-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><ShieldCheck size={16} /> Foundation</span>
          <h1>Users & Roles</h1>
          <p>Manage internal user access, assign admin roles, and inspect the permission surface of each role.</p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsAccessModuleV1 && (
        <p className="admin-message">Run `005_admin_foundation_rbac.sql` in Supabase to enable normalized role assignments.</p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading users and roles...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={UsersRound} label="Users" value={metrics.users} />
            <MetricCard icon={ShieldCheck} label="Admin users" value={metrics.adminUsers} />
            <MetricCard icon={KeyRound} label="Roles" value={metrics.roles} />
            <MetricCard icon={KeyRound} label="Permissions" value={metrics.permissions} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Access control</h2>
                <p>Role assignment and permission visibility for internal accounts.</p>
              </div>
            </div>

            <div className="admin-access__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search user name, email, phone" />
              </label>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">All roles</option>
                {roles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
              </select>
            </div>

            <div className="admin-access__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Legacy role</th>
                        <th>Assigned roles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.map((profile) => {
                        const assigned = userRoles.filter((item) => item.user_id === profile.id).map((item) => item.role_code);
                        return (
                          <tr
                            key={profile.id}
                            className={selectedProfile?.id === profile.id ? "is-selected" : ""}
                            onClick={() => setSelectedUserId(profile.id)}
                          >
                            <td className="admin-cell-wrap">
                              <strong>{profile.full_name || "No name"}</strong>
                              <div>{profile.email || "No email"}</div>
                            </td>
                            <td>{profile.role || "-"}</td>
                            <td className="admin-cell-wrap">{assigned.length ? assigned.join(", ") : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="admin-access__detail">
                <section className="admin-panel">
                  <div className="admin-panel__head">
                    <div>
                      <h2>{selectedProfile?.full_name || "Select user"}</h2>
                      <p>{selectedProfile?.email || "Choose a user to inspect and assign roles."}</p>
                    </div>
                  </div>

                  <div className="admin-access__detail-body">
                    {selectedProfile ? (
                      <>
                        <div className="admin-access__roles">
                          {roles.map((role) => (
                            <label key={role.code} className="admin-access__role-toggle">
                              <input
                                type="checkbox"
                                checked={selectedRoles.includes(role.code)}
                                onChange={() => toggleRole(role.code)}
                              />
                              <div>
                                <strong>{role.label}</strong>
                                <span>{role.code}</span>
                              </div>
                            </label>
                          ))}
                        </div>

                        <div className="admin-access__actions">
                          <button className="btn btn--primary" type="button" disabled={isSaving} onClick={saveRoles}>
                            Save roles
                          </button>
                          {isSuperAdmin ? (
                            <button className="admin-link-button" type="button" disabled={isSaving} onClick={trashUser}>
                              <Trash2 size={14} />
                              <span>Delete user</span>
                            </button>
                          ) : null}
                        </div>

                        <div className="admin-access__permissions">
                          {Object.entries(groupedPermissions).map(([moduleKey, items]) => (
                            <article key={moduleKey}>
                              <strong>{moduleKey}</strong>
                              <div className="admin-access__permission-tags">
                                {items.map((item) => (
                                  <span
                                    key={item.code}
                                    className={`admin-access__permission-tag ${selectedPermissionCodes.includes(item.code) ? "is-active" : ""}`}
                                  >
                                    {item.action}
                                  </span>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="admin-message">Select a user to assign roles and inspect permissions.</p>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
