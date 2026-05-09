import { useEffect, useMemo, useState } from "react";
import { Activity, Briefcase, Clock3, FileCheck2, HandCoins, TimerReset, UserSquare2, Wallet } from "lucide-react";
import { useParams } from "react-router-dom";
import { fetchAdminTeamMemberActivity } from "../../services/adminService.js";
import {
  AdminDataTable,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

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

function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "success";
  if (normalized === "invited") return "neutral";
  if (normalized === "suspended") return "warning";
  if (normalized === "archived" || normalized === "inactive") return "danger";
  return "neutral";
}

function getActionTone(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized.includes("approve") || normalized.includes("reactivate")) return "success";
  if (normalized.includes("suspend") || normalized.includes("reject")) return "warning";
  if (normalized.includes("remove") || normalized.includes("delete")) return "danger";
  return "neutral";
}

function formatActionLabel(action) {
  return String(action || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function AdminTeamActivity() {
  const { id } = useParams();
  const { isOwnerOrSuperAdmin } = useAdminAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    actionType: "all",
    entityType: "all",
    dateRange: { from: "", to: "" },
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isOwnerOrSuperAdmin) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");
      try {
        const next = await fetchAdminTeamMemberActivity(id, filters);
        if (active) {
          setData(next);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError.message || "Could not load team activity.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [id, isOwnerOrSuperAdmin, filters]);

  const member = data?.member || null;
  const workStats = data?.workStats || null;
  const operationalStats = data?.operationalStats || null;
  const timeline = data?.timeline || [];

  const actionOptions = useMemo(
    () => [
      { value: "all", label: "All actions" },
      ...((data?.filterOptions?.actionTypes || []).map((value) => ({ value, label: formatActionLabel(value) }))),
    ],
    [data?.filterOptions?.actionTypes],
  );

  const entityOptions = useMemo(
    () => [
      { value: "all", label: "All entities" },
      ...((data?.filterOptions?.entityTypes || []).map((value) => ({ value, label: formatActionLabel(value) }))),
    ],
    [data?.filterOptions?.entityTypes],
  );

  return (
    <div className="admin-page admin-team-activity-page">
      <AdminPageHeader
        title={member?.fullName || member?.email || "Employee activity"}
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "People" },
          { label: "Employees", path: "/admin/people/users-roles" },
          { label: "Activity" },
        ]}
        secondaryActions={[
          { label: "Back to employees", path: "/admin/people/users-roles" },
        ]}
      />

      {!isOwnerOrSuperAdmin ? (
        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2>Owner access required</h2>
              <p>Only the owner or super admin can inspect employee activity.</p>
            </div>
          </div>
        </section>
      ) : null}

      {error ? <p className="admin-message is-error">{error}</p> : null}

      {!isLoading && !error && member ? (
        <>
          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Profile summary</h2>
              </div>
            </div>
            <div className="admin-team-activity-page__summary">
              <article className="admin-team-activity-page__summary-card">
                <span>Name</span>
                <strong>{member.fullName || "—"}</strong>
              </article>
              <article className="admin-team-activity-page__summary-card">
                <span>Email</span>
                <strong>{member.email || "—"}</strong>
              </article>
              <article className="admin-team-activity-page__summary-card">
                <span>Role</span>
                <strong>{member.roleLabel || "—"}</strong>
              </article>
              <article className="admin-team-activity-page__summary-card">
                <span>Status</span>
                <div className="admin-team-activity-page__summary-badge">
                  <AdminStatusBadge tone={getStatusTone(member.status)}>{member.status}</AdminStatusBadge>
                </div>
              </article>
              <article className="admin-team-activity-page__summary-card">
                <span>Last login</span>
                <strong>{formatDateTime(member.lastLoginAt)}</strong>
              </article>
            </div>
          </section>

          <div className="admin-team-activity-page__kpis">
            <AdminKpiCard label="Total sessions" value={workStats ? workStats.totalSessions : "—"} icon={Clock3} />
            <AdminKpiCard label="Total active time" value={workStats ? formatDuration(workStats.totalActiveSeconds) : "—"} icon={TimerReset} />
            <AdminKpiCard label="This week" value={workStats ? formatDuration(workStats.activeTimeThisWeek) : "—"} icon={Activity} />
            <AdminKpiCard label="This month" value={workStats ? formatDuration(workStats.activeTimeThisMonth) : "—"} icon={Activity} />
          </div>

          <div className="admin-team-activity-page__kpis">
            <AdminKpiCard label="Leads reviewed" value={operationalStats ? operationalStats.leadsReviewed : "—"} icon={UserSquare2} />
            <AdminKpiCard label="Cases updated" value={operationalStats ? operationalStats.casesUpdated : "—"} icon={Briefcase} />
            <AdminKpiCard label="Documents checked" value={operationalStats ? operationalStats.documentsChecked : "—"} icon={FileCheck2} />
            <AdminKpiCard label="Partner applications reviewed" value={operationalStats ? operationalStats.partnerApplicationsReviewed : "—"} icon={HandCoins} />
            <AdminKpiCard label="Payouts updated" value={operationalStats ? operationalStats.payoutsUpdated : "—"} icon={Wallet} />
          </div>

          <AdminFilterBar
            statusFilter={filters.actionType}
            onStatusFilterChange={(value) => setFilters((current) => ({ ...current, actionType: value }))}
            statusOptions={actionOptions}
            ownerFilter={filters.entityType}
            onOwnerFilterChange={(value) => setFilters((current) => ({ ...current, entityType: value }))}
            ownerOptions={entityOptions}
            dateRange={filters.dateRange}
            onDateRangeChange={(value) => setFilters((current) => ({ ...current, dateRange: value }))}
          />

          {!data?.supportsWorkSessionsV1 ? (
          <p className="admin-message">Work session tracking is not configured yet.</p>
          ) : null}

          {!data?.supportsAdminActivityLogsV1 ? (
            <p className="admin-message">Admin activity logging is not configured yet.</p>
          ) : null}

          <AdminDataTable
            title="Activity timeline"
            columns={[
              { key: "timestamp", label: "Timestamp" },
              { key: "action", label: "Action" },
              { key: "entity", label: "Entity" },
              { key: "reference", label: "Reference" },
              { key: "summary", label: "Summary" },
            ]}
            rows={timeline}
            loading={isLoading}
            error={!isLoading ? error : ""}
            emptyLabel="No activity for the selected filters."
            compact
            renderRow={(item) => (
              <tr key={item.id}>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>
                  <AdminStatusBadge tone={getActionTone(item.action)}>
                    {formatActionLabel(item.action)}
                  </AdminStatusBadge>
                </td>
                <td>{formatActionLabel(item.entityType)}</td>
                <td>{item.entityReference || item.entityId || "—"}</td>
                <td className="admin-cell-wrap">{item.metadataSummary || "—"}</td>
              </tr>
            )}
          />
        </>
      ) : null}

      {isLoading ? <p className="admin-message">Loading employee activity...</p> : null}
    </div>
  );
}
