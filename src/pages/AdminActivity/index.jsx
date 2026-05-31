import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, CalendarRange, Filter, FilterX, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchActivityLogsData } from "../../services/adminService.js";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import "./style.scss";

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "signature",
  "content",
  "html",
  "body",
  "base64",
  "raw",
  "file_path",
  "signed_url",
];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "—";
  const diff = timestamp - Date.now();
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [
    { label: "year", value: 1000 * 60 * 60 * 24 * 365 },
    { label: "month", value: 1000 * 60 * 60 * 24 * 30 },
    { label: "week", value: 1000 * 60 * 60 * 24 * 7 },
    { label: "day", value: 1000 * 60 * 60 * 24 },
    { label: "hour", value: 1000 * 60 * 60 },
    { label: "minute", value: 1000 * 60 },
  ];

  for (const unit of units) {
    if (Math.abs(diff) >= unit.value || unit.label === "minute") {
      return formatter.format(Math.round(diff / unit.value), unit.label);
    }
  }

  return "just now";
}

function formatActionLabel(value) {
  const normalized = String(value || "unknown").replace(/_/g, " ").trim();
  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatModuleLabel(value) {
  const normalized = String(value || "system").replace(/_/g, " ").trim();
  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

function shortenId(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value || "").trim());
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => {
          const lowered = key.toLowerCase();
          if (SENSITIVE_KEYS.some((sensitive) => lowered.includes(sensitive))) return false;
          return item !== undefined;
        })
        .map(([key, item]) => [key, sanitizeValue(item)]),
    );
  }

  return value;
}

function flattenTopLevelObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(sanitizeValue(value)).filter(([, item]) => item !== null && item !== "" && item !== undefined);
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") {
    const compact = Object.entries(value).slice(0, 4).map(([key, item]) => `${formatActionLabel(key)}: ${formatFieldValue(item)}`);
    return compact.length ? compact.join(" • ") : "—";
  }
  if (typeof value === "string" && isUuidLike(value)) return shortenId(value);
  return String(value);
}

function getToneForAction(action) {
  const normalized = String(action || "").toLowerCase();
  if (["create", "approve", "restore", "reactivate", "login", "convert"].some((item) => normalized.includes(item))) return "success";
  if (["delete", "remove", "reject", "suspend", "trash", "failed"].some((item) => normalized.includes(item))) return "danger";
  if (["update", "assign", "download", "payout", "logout"].some((item) => normalized.includes(item))) return "info";
  return "neutral";
}

function buildEntityLink(log) {
  const entityType = String(log.target_entity_type || "").toLowerCase();
  const module = String(log.module || "").toLowerCase();
  const entityId = log.target_entity_id || "";

  if (module === "leads" || entityType === "lead") return `/admin/operations/leads?record=${entityId}`;
  if (module === "cases" || entityType === "case") return `/admin/operations/cases?record=${entityId}`;
  if (module === "tasks" || entityType === "task") return `/admin/operations/tasks?record=${entityId}`;
  if (module === "documents" || entityType.includes("document")) return `/admin/operations/documents?record=${entityId}`;
  if (module === "customers" || entityType === "customer" || entityType === "profile") return `/admin/people/customers?record=${entityId}`;
  if (module === "partners" || module === "referral" || entityType.includes("partner") || entityType.includes("referral")) return `/admin/people/referral?record=${entityId}`;
  if (module === "finance" || entityType.includes("finance") || entityType.includes("payment")) return `/admin/finances/finance?record=${entityId}`;
  if (module === "team" || module === "users" || entityType.includes("admin_")) return `/admin/people/users-roles`;
  return null;
}

function formatTargetLabel(log) {
  const meta = sanitizeValue(log.meta || {});
  const newValue = sanitizeValue(log.new_value || {});
  const previousValue = sanitizeValue(log.previous_value || {});
  const module = formatModuleLabel(log.module);
  const entityType = formatActionLabel(log.target_entity_type || "Entity");

  const explicitReference = [
    meta.reference,
    meta.case_code,
    meta.lead_code,
    meta.task_title,
    meta.document_name,
    meta.partner_name,
    meta.customer_name,
    newValue.case_code,
    newValue.lead_code,
    newValue.title,
    newValue.name,
    previousValue.case_code,
    previousValue.lead_code,
    previousValue.title,
    previousValue.name,
  ].find(Boolean);

  if (explicitReference) {
    return `${entityType} ${explicitReference}`;
  }

  if (log.target_entity_id) {
    return `${entityType} ${shortenId(log.target_entity_id)}`;
  }

  return module;
}

function formatDescription(log, actorLabel, targetLabel) {
  const action = String(log.action || "").toLowerCase();
  const moduleLabel = formatModuleLabel(log.module);

  if (action === "create") return `${actorLabel} created ${targetLabel.toLowerCase()}.`;
  if (action === "update") return `${actorLabel} updated ${targetLabel.toLowerCase()}.`;
  if (action === "delete") return `${actorLabel} deleted ${targetLabel.toLowerCase()}.`;
  if (action === "trash") return `${actorLabel} moved ${targetLabel.toLowerCase()} to trash.`;
  if (action === "restore") return `${actorLabel} restored ${targetLabel.toLowerCase()}.`;
  if (action === "approve") return `${actorLabel} approved ${targetLabel.toLowerCase()}.`;
  if (action === "reject") return `${actorLabel} rejected ${targetLabel.toLowerCase()}.`;
  if (action === "login") return `${actorLabel} logged in.`;
  if (action === "logout") return `${actorLabel} logged out.`;
  if (action === "assign") return `${actorLabel} assigned ${targetLabel.toLowerCase()}.`;
  if (action === "convert") return `${actorLabel} converted ${targetLabel.toLowerCase()}.`;
  if (action === "download") return `${actorLabel} downloaded ${targetLabel.toLowerCase()}.`;
  if (action === "payout") return `${actorLabel} updated payout details for ${targetLabel.toLowerCase()}.`;
  if (action === "review") return `${actorLabel} reviewed ${targetLabel.toLowerCase()}.`;

  return `${actorLabel} performed ${formatActionLabel(action)} in ${moduleLabel}.`;
}

function formatActivityLogEntry(log, user) {
  const actorLabel = user?.full_name || user?.email || "System";
  const roleLabel = user?.role ? formatActionLabel(user.role) : null;
  const moduleLabel = formatModuleLabel(log.module);
  const actionLabel = formatActionLabel(log.action);
  const targetLabel = formatTargetLabel(log);
  const description = formatDescription(log, actorLabel, targetLabel);
  const entityLink = buildEntityLink(log);

  return {
    actorLabel,
    roleLabel,
    moduleLabel,
    actionLabel,
    targetLabel,
    description,
    severity: getToneForAction(log.action),
    entityLink,
  };
}

function matchesDateRange(value, dateRange) {
  if (!dateRange?.from && !dateRange?.to) return true;
  const timestamp = new Date(value || 0).getTime();
  if (Number.isNaN(timestamp)) return false;
  if (dateRange.from) {
    const from = new Date(dateRange.from).getTime();
    if (!Number.isNaN(from) && timestamp < from) return false;
  }
  if (dateRange.to) {
    const to = new Date(dateRange.to).getTime() + (24 * 60 * 60 * 1000) - 1;
    if (!Number.isNaN(to) && timestamp > to) return false;
  }
  return true;
}

function buildChangeRows(log) {
  const previousEntries = new Map(flattenTopLevelObject(log.previous_value));
  const nextEntries = new Map(flattenTopLevelObject(log.new_value));
  const keys = Array.from(new Set([...previousEntries.keys(), ...nextEntries.keys()]));
  return keys
    .map((key) => ({
      key,
      previous: previousEntries.get(key),
      next: nextEntries.get(key),
    }))
    .filter((item) => item.previous !== undefined || item.next !== undefined);
}

function AdminActivity() {
  const [moduleData, setModuleData] = useState(null);
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    userId: "all",
    module: "all",
    action: "all",
    dateRange: { from: "", to: "" },
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchActivityLogsData();
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load activity logs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const rows = useMemo(() => {
    const users = new Map((moduleData?.users || []).map((item) => [item.id, item]));
    return (moduleData?.logs || []).map((item) => {
      const user = users.get(item.user_id) || null;
      const formatted = formatActivityLogEntry(item, user);
      return {
        ...item,
        user,
        ...formatted,
      };
    });
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesSearch = !query || [
        item.actorLabel,
        item.user?.email,
        item.moduleLabel,
        item.actionLabel,
        item.targetLabel,
        item.description,
        item.target_entity_type,
        item.target_entity_id,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesUser = filters.userId === "all" || item.user_id === filters.userId;
      const matchesModule = filters.module === "all" || item.module === filters.module;
      const matchesAction = filters.action === "all" || item.action === filters.action;
      const matchesRange = matchesDateRange(item.created_at, filters.dateRange);
      return matchesSearch && matchesUser && matchesModule && matchesAction && matchesRange;
    });
  }, [rows, filters]);

  const selectedLog = useMemo(
    () => filteredRows.find((item) => item.id === selectedLogId) || rows.find((item) => item.id === selectedLogId) || null,
    [filteredRows, rows, selectedLogId],
  );

  const modules = useMemo(
    () => Array.from(new Set(rows.map((item) => item.module).filter(Boolean))).sort(),
    [rows],
  );

  const actions = useMemo(
    () => Array.from(new Set(rows.map((item) => item.action).filter(Boolean))).sort(),
    [rows],
  );

  const users = useMemo(
    () => (moduleData?.users || []).map((item) => ({
      value: item.id,
      label: item.full_name || item.email || item.id,
    })),
    [moduleData?.users],
  );

  const summaryCards = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayRows = filteredRows.filter((item) => new Date(item.created_at || 0).getTime() >= todayStartMs);
    const activeUsers = new Set(todayRows.map((item) => item.user_id).filter(Boolean)).size;
    const moduleCounts = todayRows.reduce((acc, item) => {
      acc[item.moduleLabel] = (acc[item.moduleLabel] || 0) + 1;
      return acc;
    }, {});
    const topModule = Object.entries(moduleCounts).sort((left, right) => right[1] - left[1])[0];
    const riskyActions = filteredRows.filter((item) => item.severity === "danger").length;

    return [
      { label: "Actions today", value: todayRows.length },
      { label: "Active employees", value: activeUsers },
      { label: "Most active module", value: topModule ? `${topModule[0]} (${topModule[1]})` : "—" },
      { label: "Dangerous actions", value: riskyActions },
    ];
  }, [filteredRows]);

  const changeRows = useMemo(() => (selectedLog ? buildChangeRows(selectedLog) : []), [selectedLog]);

  const columns = useMemo(() => ([
    {
      key: "datetime",
      label: "Date / time",
      width: 150,
      minWidth: 120,
      maxWidth: 220,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{formatRelativeTime(row.created_at)}</span>
          <span className="admin-crm-table__cell-sub">{formatDateTime(row.created_at)}</span>
        </div>
      ),
      getCellTitle: (row) => formatDateTime(row.created_at),
    },
    {
      key: "user",
      label: "User",
      width: 180,
      minWidth: 140,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__identity">
          <span className="admin-activity-page__avatar">{String(row.actorLabel || "System").slice(0, 2).toUpperCase()}</span>
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{row.actorLabel}</span>
            <span className="admin-crm-table__cell-sub">{row.roleLabel || row.user?.email || "System"}</span>
          </div>
        </div>
      ),
      getCellTitle: (row) => row.actorLabel,
    },
    {
      key: "module",
      label: "Module",
      width: 130,
      minWidth: 110,
      maxWidth: 200,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <AdminStatusBadge tone="info">{row.moduleLabel}</AdminStatusBadge>,
      getCellTitle: (row) => row.moduleLabel,
    },
    {
      key: "action",
      label: "Action",
      width: 130,
      minWidth: 110,
      maxWidth: 200,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <AdminStatusBadge tone={row.severity}>{row.actionLabel}</AdminStatusBadge>,
      getCellTitle: (row) => row.actionLabel,
    },
    {
      key: "target",
      label: "Target",
      width: 180,
      minWidth: 140,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.targetLabel}</span>
          <span className="admin-crm-table__cell-sub">{row.target_entity_id ? shortenId(row.target_entity_id) : "No entity id"}</span>
        </div>
      ),
      getCellTitle: (row) => row.targetLabel,
    },
    {
      key: "description",
      label: "Description",
      width: 320,
      minWidth: 220,
      maxWidth: 600,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.description}</span>,
      getCellTitle: (row) => row.description,
    },
    {
      key: "source",
      label: "Source",
      width: 160,
      minWidth: 120,
      maxWidth: 260,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.meta?.ip || row.meta?.source || "—"}</span>
          <span className="admin-crm-table__cell-sub">{row.meta?.user_agent ? "User agent available" : "No extra source"}</span>
        </div>
      ),
      getCellTitle: (row) => row.meta?.ip || row.meta?.source || "—",
    },
  ]), []);

  return (
    <div className="admin-page admin-activity-page">
      <AdminPageHeader
        title="Activity Log"
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsActivityLogsV1 ? (
        <p className="admin-message">
          Activity logs schema is not available yet. Run `009_activity_logs_module_v1.sql` in Supabase to unlock this module.
        </p>
      ) : null}

      {isLoading ? (
        <p className="admin-message">Loading activity logs...</p>
      ) : (
        <>
          <AdminMetricsStrip items={summaryCards} />

          <section className="admin-card admin-card-compact admin-activity-page__toolbar-card">
            <AdminFilterBar
              searchValue={filters.search}
              onSearchChange={(value) => setFilters((current) => ({ ...current, search: value }))}
              searchPlaceholder="Search user, module, action, target, description"
              statusFilter={filters.module}
              onStatusFilterChange={(value) => setFilters((current) => ({ ...current, module: value }))}
              statusOptions={[{ value: "all", label: "All modules" }].concat(modules.map((item) => ({ value: item, label: formatModuleLabel(item) })))}
              ownerFilter={filters.userId}
              onOwnerFilterChange={(value) => setFilters((current) => ({ ...current, userId: value }))}
              ownerOptions={[{ value: "all", label: "All users" }, ...users]}
              dateRange={filters.dateRange}
              onDateRangeChange={(value) => setFilters((current) => ({ ...current, dateRange: value }))}
            >
              <select
                className="admin-select admin-filter-control"
                value={filters.action}
                onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
              >
                <option value="all">All actions</option>
                {actions.map((item) => <option key={item} value={item}>{formatActionLabel(item)}</option>)}
              </select>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => setFilters({
                  search: "",
                  userId: "all",
                  module: "all",
                  action: "all",
                  dateRange: { from: "", to: "" },
                })}
              >
                <FilterX size={14} />
                Clear filters
              </button>
            </AdminFilterBar>
          </section>

          <AdminColumnTable
            storageKey="ff-admin-table-layout-activity-log"
            title="Activity log"
            countLabel={`${filteredRows.length} record${filteredRows.length === 1 ? "" : "s"}`}
            columns={columns}
            rows={filteredRows}
            loading={false}
            error=""
            emptyTitle="No activity records found"
            emptyDetail="Try adjusting the current filters."
            selectedRowId={selectedLog?.id || ""}
            getRowKey={(row) => row.id}
            onRowClick={(row) => setSelectedLogId(row.id)}
          />

          <section className="admin-activity-page__mobile-cards">
            {filteredRows.map((item) => (
              <button
                key={`${item.id}-mobile`}
                type="button"
                className={`admin-card admin-card-compact admin-activity-page__mobile-card${selectedLog?.id === item.id ? " is-active" : ""}`}
                onClick={() => setSelectedLogId(item.id)}
              >
                <div className="admin-activity-page__mobile-card-head">
                  <div>
                    <strong>{item.actorLabel}</strong>
                    <small>{formatRelativeTime(item.created_at)}</small>
                  </div>
                  <AdminStatusBadge tone={item.severity}>{item.actionLabel}</AdminStatusBadge>
                </div>
                <div className="admin-activity-page__badge-stack">
                  <AdminStatusBadge tone="info">{item.moduleLabel}</AdminStatusBadge>
                </div>
                <p>{item.description}</p>
                <span>{item.targetLabel}</span>
              </button>
            ))}
          </section>
        </>
      )}

      <AdminSidePanel
        open={Boolean(selectedLog)}
        eyebrow={selectedLog?.moduleLabel || "Activity"}
        title={selectedLog ? `${selectedLog.actionLabel}` : "Activity detail"}
        subtitle={selectedLog ? formatDateTime(selectedLog.created_at) : ""}
        onClose={() => setSelectedLogId(null)}
        className="admin-activity-page__drawer"
        withOverlay
        overlayClassName="admin-activity-page__overlay"
        overlayLabel="Close activity detail"
      >
        {selectedLog ? (
          <div className="admin-activity-page__drawer-grid">
            <article className="admin-panel-card">
              <header>
                <strong>Summary</strong>
                <small>Who did what and when</small>
              </header>
              <div className="admin-activity-page__summary-grid">
                <div><span>User</span><strong>{selectedLog.actorLabel}</strong></div>
                <div><span>Role</span><strong>{selectedLog.roleLabel || "System"}</strong></div>
                <div><span>Module</span><strong>{selectedLog.moduleLabel}</strong></div>
                <div><span>Action</span><strong>{selectedLog.actionLabel}</strong></div>
                <div><span>Target</span><strong>{selectedLog.targetLabel}</strong></div>
                <div><span>Created</span><strong>{formatDateTime(selectedLog.created_at)}</strong></div>
              </div>
            </article>

            <article className="admin-panel-card">
              <header>
                <strong>Description</strong>
                <small>Human-readable audit entry</small>
              </header>
              <p className="admin-activity-page__description-copy">{selectedLog.description}</p>
            </article>

            <article className="admin-panel-card">
              <header>
                <strong>Entity</strong>
                <small>Linked operational record</small>
              </header>
              <div className="admin-activity-page__summary-grid">
                <div><span>Entity type</span><strong>{formatActionLabel(selectedLog.target_entity_type || "Unknown")}</strong></div>
                <div><span>Entity id</span><strong>{selectedLog.target_entity_id ? shortenId(selectedLog.target_entity_id) : "—"}</strong></div>
                <div className="is-span"><span>Reference</span><strong>{selectedLog.targetLabel}</strong></div>
              </div>
              {selectedLog.entityLink ? (
                <div className="admin-activity-page__panel-actions">
                  <Link to={selectedLog.entityLink} className="admin-btn admin-btn-secondary">
                    <ArrowUpRight size={14} />
                    <span>Open related record</span>
                  </Link>
                </div>
              ) : null}
            </article>

            <article className="admin-panel-card">
              <header>
                <strong>Changes</strong>
                <small>Previous and new values in readable form</small>
              </header>
              {changeRows.length ? (
                <div className="admin-activity-page__changes">
                  {changeRows.map((item) => (
                    <div key={item.key} className="admin-activity-page__change-row">
                      <div>
                        <span>Field</span>
                        <strong>{formatActionLabel(item.key)}</strong>
                      </div>
                      <div>
                        <span>Previous</span>
                        <strong>{formatFieldValue(item.previous)}</strong>
                      </div>
                      <div>
                        <span>New</span>
                        <strong>{formatFieldValue(item.next)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-message">No structured field diff available for this entry.</p>
              )}
            </article>

            <article className="admin-panel-card">
              <details className="admin-activity-page__advanced">
                <summary>Advanced details</summary>
                <div className="admin-activity-page__advanced-body">
                  <section>
                    <strong>Previous value</strong>
                    <pre>{JSON.stringify(sanitizeValue(selectedLog.previous_value || {}), null, 2)}</pre>
                  </section>
                  <section>
                    <strong>New value</strong>
                    <pre>{JSON.stringify(sanitizeValue(selectedLog.new_value || {}), null, 2)}</pre>
                  </section>
                  <section>
                    <strong>Metadata</strong>
                    <pre>{JSON.stringify(sanitizeValue(selectedLog.meta || {}), null, 2)}</pre>
                  </section>
                </div>
              </details>
            </article>
          </div>
        ) : null}
      </AdminSidePanel>
    </div>
  );
}

export default AdminActivity;
