import { useEffect, useMemo, useState } from "react";
import { Activity, Briefcase, Clock3, FileCheck2, HandCoins, TimerReset, UserSquare2, Wallet } from "lucide-react";
import { useParams } from "react-router-dom";
import { fetchAdminTeamMemberActivity } from "../../services/adminService.js";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminSidePanel,
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
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
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

    void load();
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

  const selectedActivity = useMemo(
    () => timeline.find((item) => item.id === selectedActivityId) || null,
    [selectedActivityId, timeline],
  );

  const metadataEntries = useMemo(
    () => Object.entries(selectedActivity?.metadata || {}).filter(([, value]) => value !== null && value !== undefined && value !== ""),
    [selectedActivity?.metadata],
  );

  const activityColumns = useMemo(() => ([
    {
      key: "timestamp",
      label: "Timestamp",
      width: 190,
      minWidth: 150,
      maxWidth: 260,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{formatDateTime(item.createdAt)}</span>
          <span className="admin-crm-table__cell-sub">{item.entityReference || item.entityId || "No reference"}</span>
        </div>
      ),
      getCellTitle: (item) => formatDateTime(item.createdAt),
    },
    {
      key: "action",
      label: "Action",
      width: 180,
      minWidth: 140,
      maxWidth: 240,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <AdminStatusBadge tone={getActionTone(item.action)}>
          {formatActionLabel(item.action)}
        </AdminStatusBadge>
      ),
      getCellTitle: (item) => formatActionLabel(item.action),
    },
    {
      key: "entity",
      label: "Entity",
      width: 150,
      minWidth: 130,
      maxWidth: 220,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (item) => <span className="admin-crm-table__cell-main">{formatActionLabel(item.entityType)}</span>,
      getCellTitle: (item) => formatActionLabel(item.entityType),
    },
    {
      key: "reference",
      label: "Reference",
      width: 180,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{item.entityReference || "—"}</span>
          <span className="admin-crm-table__cell-sub">{item.entityId || "No entity id"}</span>
        </div>
      ),
      getCellTitle: (item) => item.entityReference || item.entityId || "—",
    },
    {
      key: "summary",
      label: "Summary",
      width: 420,
      minWidth: 260,
      maxWidth: 580,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{item.metadataSummary || "—"}</span>
          <span className="admin-crm-table__cell-sub">Click to inspect the full event</span>
        </div>
      ),
      getCellTitle: (item) => item.metadataSummary || "—",
    },
  ]), []);

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

          <AdminColumnTable
            storageKey="ff-admin-table-layout-team-activity"
            title="Activity timeline"
            countLabel={`${timeline.length} event${timeline.length === 1 ? "" : "s"}`}
            columns={activityColumns}
            rows={timeline}
            loading={isLoading}
            error={!isLoading ? error : ""}
            emptyTitle="No activity for the selected filters."
            emptyDetail="Try adjusting the current filters."
            selectedRowId={activityPanelOpen ? selectedActivity?.id || "" : ""}
            getRowKey={(item) => item.id}
            onRowClick={(item) => {
              setSelectedActivityId(item.id);
              setActivityPanelOpen(true);
            }}
          />
        </>
      ) : null}

      <AdminSidePanel
        open={activityPanelOpen && Boolean(selectedActivity)}
        onClose={() => setActivityPanelOpen(false)}
        eyebrow="Activity event"
        title={selectedActivity ? formatActionLabel(selectedActivity.action) : "Activity event"}
        subtitle={selectedActivity ? formatDateTime(selectedActivity.createdAt) : ""}
        className="admin-team-activity-page__drawer-panel"
        withOverlay
      >
        {selectedActivity ? (
          <div className="admin-team-activity-page__drawer">
            <section className="admin-team-activity-page__detail-grid">
              <article className="admin-team-activity-page__detail-card">
                <span>Action</span>
                <div className="admin-team-activity-page__detail-badge">
                  <AdminStatusBadge tone={getActionTone(selectedActivity.action)}>
                    {formatActionLabel(selectedActivity.action)}
                  </AdminStatusBadge>
                </div>
              </article>
              <article className="admin-team-activity-page__detail-card">
                <span>Entity</span>
                <strong>{formatActionLabel(selectedActivity.entityType)}</strong>
              </article>
              <article className="admin-team-activity-page__detail-card">
                <span>Reference</span>
                <strong>{selectedActivity.entityReference || "—"}</strong>
              </article>
              <article className="admin-team-activity-page__detail-card">
                <span>Entity ID</span>
                <strong>{selectedActivity.entityId || "—"}</strong>
              </article>
            </section>

            <section className="admin-team-activity-page__detail-section">
              <h3>Summary</h3>
              <p>{selectedActivity.metadataSummary || "No additional summary available."}</p>
            </section>

            <section className="admin-team-activity-page__detail-section">
              <h3>Metadata</h3>
              {metadataEntries.length ? (
                <div className="admin-team-activity-page__metadata-grid">
                  {metadataEntries.map(([key, value]) => (
                    <article key={key}>
                      <strong>{formatActionLabel(key)}</strong>
                      <span>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No metadata attached to this event.</p>
              )}
            </section>
          </div>
        ) : null}
      </AdminSidePanel>

      {isLoading ? <p className="admin-message">Loading employee activity...</p> : null}
    </div>
  );
}
