import { useEffect, useMemo, useState } from "react";
import { Activity, Filter, Search, ShieldCheck } from "lucide-react";
import { fetchActivityLogsData } from "../../services/adminService.js";
import "./style.scss";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function AdminActivity() {
  const [moduleData, setModuleData] = useState(null);
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchActivityLogsData();
      setModuleData(next);
      if (!selectedLogId && next.logs[0]) {
        setSelectedLogId(next.logs[0].id);
      }
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
    return (moduleData?.logs || []).map((item) => ({
      ...item,
      userLabel: users.get(item.user_id)?.full_name || users.get(item.user_id)?.email || "System",
    }));
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesSearch = !query || [
        item.userLabel,
        item.module,
        item.action,
        item.target_entity_type,
        item.target_entity_id,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesModule = moduleFilter === "all" || item.module === moduleFilter;
      const matchesAction = actionFilter === "all" || item.action === actionFilter;
      return matchesSearch && matchesModule && matchesAction;
    });
  }, [rows, search, moduleFilter, actionFilter]);

  const selectedLog = useMemo(
    () => filteredRows.find((item) => item.id === selectedLogId)
      || rows.find((item) => item.id === selectedLogId)
      || filteredRows[0]
      || null,
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

  return (
    <div className="admin-page admin-activity-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Activity size={16} /> Business Modules</span>
          <h1>Activity Logs</h1>
          <p>
            Review the audit trail for operational and business actions across the admin system.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsActivityLogsV1 && (
        <p className="admin-message">
          Activity logs schema is not available yet. Run `009_activity_logs_module_v1.sql` in Supabase to unlock this module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading activity logs...</p>
      ) : (
        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2>Audit trail</h2>
              <p>Every critical action can be reviewed by module, action type, and target entity.</p>
            </div>
          </div>

          <div className="admin-activity__filters">
            <label className="admin-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search user, module, action, entity" />
            </label>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {modules.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="all">All actions</option>
              {actions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="admin-activity__grid">
            <section className="admin-panel">
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Module</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((item) => (
                      <tr key={item.id} className={selectedLog?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedLogId(item.id)}>
                        <td>{item.userLabel}</td>
                        <td>{item.module}</td>
                        <td>{item.action}</td>
                        <td>{item.target_entity_type} · {item.target_entity_id || "-"}</td>
                        <td>{formatDate(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-panel admin-activity__detail">
              <div className="admin-panel__head">
                <div>
                  <h2>Log detail</h2>
                  <p>{selectedLog ? `${selectedLog.module} · ${selectedLog.action}` : "Select an activity record to inspect."}</p>
                </div>
              </div>

              {selectedLog ? (
                <div className="admin-activity__detail-body">
                  <div className="admin-activity__summary">
                    <article><strong>User</strong><span>{selectedLog.userLabel}</span></article>
                    <article><strong>Module</strong><span>{selectedLog.module}</span></article>
                    <article><strong>Action</strong><span>{selectedLog.action}</span></article>
                    <article><strong>Target</strong><span>{selectedLog.target_entity_type} · {selectedLog.target_entity_id || "-"}</span></article>
                  </div>

                  <section className="admin-activity__section">
                    <h3>Previous value</h3>
                    <pre>{JSON.stringify(selectedLog.previous_value || {}, null, 2)}</pre>
                  </section>

                  <section className="admin-activity__section">
                    <h3>New value</h3>
                    <pre>{JSON.stringify(selectedLog.new_value || {}, null, 2)}</pre>
                  </section>

                  <section className="admin-activity__section">
                    <h3>Meta</h3>
                    <pre>{JSON.stringify(selectedLog.meta || {}, null, 2)}</pre>
                  </section>

                  <section className="admin-activity__section">
                    <h3>Timestamp</h3>
                    <p>{formatDate(selectedLog.created_at)}</p>
                  </section>
                </div>
              ) : (
                <div className="admin-empty admin-empty--module">
                  <h2>No log selected</h2>
                  <p>Select a record to inspect previous value, new value, and metadata.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}

export default AdminActivity;
