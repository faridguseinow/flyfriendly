import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, BarChart3, Briefcase, CircleAlert, Clock3, Download, Search, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { fetchCasesModuleData, getDocumentDownloadUrl, updateCaseWorkflow } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const caseStatuses = [
  "draft",
  "documents_pending",
  "ready_to_submit",
  "submitted_to_airline",
  "awaiting_response",
  "airline_replied",
  "escalated",
  "approved",
  "rejected",
  "paid",
  "closed",
];

const payoutStatuses = [
  "not_started",
  "awaiting_payment",
  "payment_received",
  "customer_paid",
  "company_fee_collected",
  "referral_paid",
  "completed",
];

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

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(0)} EUR`;
}

function formatEstimateCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function formatEstimateStatus(status) {
  if (status === "calculated") return "Calculated";
  if (status === "manual_override") return "Manual override";
  return "Pending review";
}

function formatDistanceBand(band) {
  if (band === "short") return "Short";
  if (band === "medium") return "Medium";
  if (band === "long") return "Long";
  return "Unknown";
}

function extractReasonCodes(explanation) {
  if (!explanation || typeof explanation !== "object") {
    return [];
  }

  return Array.isArray(explanation.reason_codes) ? explanation.reason_codes.filter(Boolean) : [];
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / (1000 * 60 * 60 * 24);
}

function exportCasesCsv(rows) {
  const headers = ["Case Code", "Status", "Payout Status", "Airline", "Route", "Compensation", "Created At"];
  const lines = rows.map((item) => [
    item.case_code,
    item.status,
    item.payout_status,
    item.airline,
    `${item.route_from || "-"} -> ${item.route_to || "-"}`,
    item.estimated_compensation,
    item.created_at,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatusChart({ rows }) {
  const counts = caseStatuses.map((status) => ({
    status,
    value: rows.filter((row) => row.status === status).length,
  }));
  const max = Math.max(1, ...counts.map((item) => item.value));

  return (
    <div className="admin-cases__chart">
      {counts.map((item) => (
        <article key={item.status}>
          <div><span style={{ width: `${(item.value / max) * 100}%` }} /></div>
          <strong>{item.status}</strong>
          <small>{item.value}</small>
        </article>
      ))}
    </div>
  );
}

function AdminCases() {
  const { hasPermission } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payoutFilter, setPayoutFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState("");

  const pageSize = 12;

  const loadCases = async (nextPage = page) => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchCasesModuleData({
        page: nextPage,
        pageSize,
        filters: {
          search,
          status: statusFilter,
          payoutStatus: payoutFilter,
          managerId: managerFilter,
        },
      });
      setModuleData(next);
      setPage(nextPage);
      const requestedCaseId = searchParams.get("case");
      if (next.cases.length === 0) {
        setSelectedCaseId(null);
      } else if (requestedCaseId && next.cases.some((item) => item.id === requestedCaseId)) {
        setSelectedCaseId(requestedCaseId);
      } else if (!selectedCaseId || !next.cases.some((item) => item.id === selectedCaseId)) {
        setSelectedCaseId(next.cases[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load cases module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCases(1);
  }, [search, statusFilter, payoutFilter, managerFilter]);

  const selectedCase = useMemo(
    () => moduleData?.cases?.find((item) => item.id === selectedCaseId) || moduleData?.cases?.[0] || null,
    [moduleData, selectedCaseId],
  );

  const selectedLead = useMemo(
    () => moduleData?.leads?.find((lead) => lead.id === selectedCase?.lead_id) || null,
    [moduleData, selectedCase],
  );

  const selectedCustomer = useMemo(
    () => moduleData?.customers?.find((customer) => customer.id === selectedCase?.customer_id) || null,
    [moduleData, selectedCase],
  );

  const selectedFinance = useMemo(
    () => moduleData?.finance?.find((item) => item.case_id === selectedCase?.id) || null,
    [moduleData, selectedCase],
  );

  const leadById = useMemo(
    () => new Map((moduleData?.leads || []).map((lead) => [lead.id, lead])),
    [moduleData],
  );

  const selectedDocuments = useMemo(
    () => (moduleData?.documents || []).filter((item) => item.case_id === selectedCase?.id),
    [moduleData, selectedCase],
  );

  const selectedStatusHistory = useMemo(
    () => (moduleData?.statusHistory || []).filter((item) => item.case_id === selectedCase?.id),
    [moduleData, selectedCase],
  );

  const selectedTaskIds = useMemo(
    () => new Set((moduleData?.caseTasks || []).filter((item) => item.case_id === selectedCase?.id).map((item) => item.task_id)),
    [moduleData, selectedCase],
  );

  const selectedTasks = useMemo(
    () => (moduleData?.tasks || []).filter((task) => selectedTaskIds.has(task.id)),
    [moduleData, selectedTaskIds],
  );

  const selectedCommunicationIds = useMemo(
    () => new Set((moduleData?.caseCommunications || []).filter((item) => item.case_id === selectedCase?.id).map((item) => item.communication_id)),
    [moduleData, selectedCase],
  );

  const selectedCommunications = useMemo(
    () => (moduleData?.communications || []).filter((item) => selectedCommunicationIds.has(item.id)),
    [moduleData, selectedCommunicationIds],
  );

  const metrics = useMemo(() => {
    const rows = moduleData?.metricsRows || [];
    const total = rows.length;
    const active = rows.filter((row) => !["approved", "rejected", "paid", "closed"].includes(row.status)).length;
    const approved = rows.filter((row) => row.status === "approved").length;
    const rejected = rows.filter((row) => row.status === "rejected").length;
    const paid = rows.filter((row) => row.status === "paid").length;
    const avgComp = total ? rows.reduce((sum, row) => sum + Number(row.estimated_compensation || 0), 0) / total : 0;
    const resolutionRows = rows
      .map((row) => daysBetween(row.created_at, row.closed_at || row.paid_at || row.approved_at || row.rejected_at))
      .filter((value) => value !== null);
    const avgResolution = resolutionRows.length ? resolutionRows.reduce((sum, value) => sum + value, 0) / resolutionRows.length : 0;

    return {
      total,
      active,
      approved,
      rejected,
      paid,
      avgResolution,
      approvalRate: total ? (approved / total) * 100 : 0,
      avgComp,
      avgDuration: avgResolution,
    };
  }, [moduleData]);

  const pagination = useMemo(() => ({
    page,
    totalPages: Math.max(1, Math.ceil((moduleData?.totalCount || 0) / pageSize)),
  }), [moduleData, page]);

  const updateCase = async (updates) => {
    if (!selectedCase) return;
    setError("");
    setIsSaving(true);

    try {
      await updateCaseWorkflow(selectedCase.id, updates);
      await loadCases(page);
    } catch (nextError) {
      setError(nextError.message || "Could not update case.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectCase = (caseId) => {
    setSelectedCaseId(caseId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("case", caseId);
    setSearchParams(nextParams, { replace: true });
  };

  const downloadDocument = async (document) => {
    if (!document?.file_path) return;

    setError("");
    setDownloadingDocumentId(document.id);

    try {
      const url = await getDocumentDownloadUrl({ ...document, bucket: "case-documents" });
      const link = document.createElement("a");
      link.href = url;
      link.download = document.file_name || "case-document";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (nextError) {
      setError(nextError.message || "Could not download case document.");
    } finally {
      setDownloadingDocumentId("");
    }
  };

  return (
    <div className="admin-page admin-cases-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Briefcase size={16} /> Core Operations</span>
          <h1>Cases</h1>
          <p>
            Manage compensation cases from submission through resolution, track financial outcomes, and inspect all linked
            operational data in one place.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsCaseModuleV1 && (
        <p className="admin-message">
          Cases schema is not available yet. Run `006_core_operations_schema_v1.sql` and `007_cases_module_v1.sql` in Supabase
          to unlock the full cases module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading cases...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Briefcase} label="Total cases" value={metrics.total} />
            <MetricCard icon={Clock3} label="Active cases" value={metrics.active} />
            <MetricCard icon={BadgeCheck} label="Approved cases" value={metrics.approved} />
            <MetricCard icon={CircleAlert} label="Rejected cases" value={metrics.rejected} />
            <MetricCard icon={Wallet} label="Paid cases" value={metrics.paid} />
            <MetricCard icon={BarChart3} label="Avg. resolution time" value={`${metrics.avgResolution.toFixed(1)} d`} />
          </section>

          <section className="admin-cases__widgets">
            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>Cases by status</h2>
                  <p>Live distribution of the current case pipeline.</p>
                </div>
              </div>
              <div className="admin-cases__widget-body">
                <StatusChart rows={moduleData?.metricsRows || []} />
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>Case widgets</h2>
                  <p>Operational performance indicators for the cases workflow.</p>
                </div>
              </div>
              <div className="admin-cases__mini-stats">
                <article><strong>{metrics.approvalRate.toFixed(1)}%</strong><span>Approval rate</span></article>
                <article><strong>{formatCurrency(metrics.avgComp)}</strong><span>Average compensation</span></article>
                <article><strong>{metrics.avgDuration.toFixed(1)} d</strong><span>Average case duration</span></article>
              </div>
            </section>
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Cases table</h2>
                <p>Optimized list view with filters, paging, and quick actions.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportCasesCsv(moduleData?.cases || [])}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="admin-cases__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search case, airline, route" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {caseStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={payoutFilter} onChange={(event) => setPayoutFilter(event.target.value)}>
                <option value="all">All payout statuses</option>
                {payoutStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
                <option value="all">All managers</option>
                {(moduleData?.managers || []).map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                ))}
              </select>
            </div>
            <div className="admin-cases__grid">
              <section className="admin-panel admin-cases__table">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Status</th>
                        <th>Payout</th>
                        <th>Airline</th>
                        <th>Route</th>
                        <th>Compensation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(moduleData?.cases || []).map((item) => (
                        <tr key={item.id} className={selectedCase?.id === item.id ? "is-selected" : ""} onClick={() => selectCase(item.id)}>
                          <td>{item.case_code || item.id.slice(0, 8)}</td>
                          <td>{item.status}</td>
                          <td>{item.payout_status}</td>
                          <td>{item.airline || "-"}</td>
                          <td>{item.route_from || "-"} → {item.route_to || "-"}</td>
                          <td>
                            <div className="admin-case-estimate-cell">
                              <span>{formatCurrency(item.estimated_compensation)}</span>
                              {leadById.get(item.lead_id)?.estimate_status === "pending_review" ? <small>Pending review</small> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-cases__pagination">
                  <button className="admin-link-button" type="button" disabled={pagination.page <= 1} onClick={() => loadCases(page - 1)}>Previous</button>
                  <span>Page {pagination.page} / {pagination.totalPages}</span>
                  <button className="admin-link-button" type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => loadCases(page + 1)}>Next</button>
                </div>
              </section>

              <section className="admin-panel admin-cases__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Case detail</h2>
                    <p>{selectedCase ? `Case ${selectedCase.case_code || selectedCase.id.slice(0, 8)}` : "Select a case to inspect."}</p>
                  </div>
                </div>

                {selectedCase ? (
                  <div className="admin-cases__detail-body">
                    <div className="admin-cases__summary">
                      <article><strong>Lead link</strong><span>{selectedLead?.lead_code || selectedCase.lead_id || "-"}</span></article>
                      <article><strong>Customer</strong><span>{selectedCustomer?.full_name || selectedCase.customer_id || "-"}</span></article>
                      <article><strong>Airline</strong><span>{selectedCase.airline || "-"}</span></article>
                      <article><strong>Route</strong><span>{selectedCase.route_from || "-"} → {selectedCase.route_to || "-"}</span></article>
                    </div>

                    <div className="admin-cases__actions">
                      <label>
                        <span>Case status</span>
                        <select value={selectedCase.status || "draft"} onChange={(event) => updateCase({ status: event.target.value })} disabled={!hasPermission("cases.edit") || isSaving}>
                          {caseStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Payout status</span>
                        <select value={selectedCase.payout_status || "not_started"} onChange={(event) => updateCase({ payout_status: event.target.value })} disabled={!hasPermission("cases.edit") || isSaving}>
                          {payoutStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Assigned manager</span>
                        <select value={selectedCase.assigned_manager_id || ""} onChange={(event) => updateCase({ assigned_manager_id: event.target.value || null })} disabled={!hasPermission("cases.assign") || isSaving}>
                          <option value="">Unassigned</option>
                          {(moduleData?.managers || []).map((manager) => (
                            <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <section className="admin-cases__section">
                      <h3>Compensation estimate</h3>
                      {selectedLead ? (
                        <>
                          <div className="admin-cases__stack">
                            <article><strong>Calculated distance</strong><span>{selectedLead.distance_km ? `${Math.round(Number(selectedLead.distance_km))} km` : "-"}</span></article>
                            <article><strong>Distance band</strong><span>{formatDistanceBand(selectedLead.distance_band)}</span></article>
                            <article><strong>Estimated compensation</strong><span>{formatEstimateCurrency(selectedLead.estimated_compensation_eur, selectedLead.compensation_currency)}</span></article>
                            <article><strong>Estimate status</strong><span className={selectedLead.estimate_status === "pending_review" ? "admin-estimate-status is-pending" : "admin-estimate-status"}>{formatEstimateStatus(selectedLead.estimate_status)}</span></article>
                          </div>
                          {extractReasonCodes(selectedLead.estimate_explanation).length ? (
                            <div className="admin-cases__reason-codes">
                              {extractReasonCodes(selectedLead.estimate_explanation).map((code) => (
                                <span key={code}>{code}</span>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : <p>No linked lead estimate is available for this case yet.</p>}
                    </section>

                    <section className="admin-cases__section">
                      <h3>Finance</h3>
                      {selectedFinance ? (
                        <div className="admin-cases__stack">
                          <article><strong>Compensation</strong><span>{formatCurrency(selectedFinance.compensation_amount)}</span></article>
                          <article><strong>Company fee</strong><span>{formatCurrency(selectedFinance.company_fee)}</span></article>
                          <article><strong>Customer payout</strong><span>{formatCurrency(selectedFinance.customer_payout)}</span></article>
                          <article><strong>Referral commission</strong><span>{formatCurrency(selectedFinance.referral_commission)}</span></article>
                          <article><strong>Agent bonus</strong><span>{formatCurrency(selectedFinance.agent_bonus)}</span></article>
                          <article><strong>Payment status</strong><span>{selectedFinance.payment_status}</span></article>
                        </div>
                      ) : <p>No finance record linked yet.</p>}
                    </section>

                    <section className="admin-cases__section">
                      <h3>Documents</h3>
                      <div className="admin-cases__timeline">
                        {selectedDocuments.length ? selectedDocuments.map((item) => (
                          <article key={item.id}>
                            <div className="admin-cases__timeline-row">
                              <div>
                                <strong>{item.document_type}</strong>
                                <p>{item.file_name} · {item.status}</p>
                              </div>
                              {item.file_path ? (
                                <button
                                  className="admin-link-button"
                                  type="button"
                                  onClick={() => downloadDocument(item)}
                                  disabled={downloadingDocumentId === item.id}
                                >
                                  <Download size={14} />
                                  <span>{downloadingDocumentId === item.id ? "Loading..." : "Download"}</span>
                                </button>
                              ) : null}
                            </div>
                          </article>
                        )) : <p>No case documents linked yet.</p>}
                      </div>
                    </section>

                    <section className="admin-cases__section">
                      <h3>Tasks</h3>
                      <div className="admin-cases__timeline">
                        {selectedTasks.length ? selectedTasks.map((task) => (
                          <article key={task.id}>
                            <strong>{task.title}</strong>
                            <p>{task.status} · {task.priority}{task.due_date ? ` · due ${formatDate(task.due_date)}` : ""}</p>
                          </article>
                        )) : <p>No linked tasks yet.</p>}
                      </div>
                    </section>

                    <section className="admin-cases__section">
                      <h3>Communications</h3>
                      <div className="admin-cases__timeline">
                        {selectedCommunications.length ? selectedCommunications.map((item) => (
                          <article key={item.id}>
                            <strong>{item.channel} · {formatDate(item.created_at)}</strong>
                            <p>{item.subject || item.body || "No content"}</p>
                          </article>
                        )) : <p>No linked communications yet.</p>}
                      </div>
                    </section>

                    <section className="admin-cases__section">
                      <h3>Status history</h3>
                      <div className="admin-cases__timeline">
                        {selectedStatusHistory.length ? selectedStatusHistory.map((item) => (
                          <article key={item.id}>
                            <strong>{formatDate(item.created_at)}</strong>
                            <p>{item.previous_status || "unknown"} → {item.next_status}</p>
                          </article>
                        )) : <p>No status history yet.</p>}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No case selected</h2>
                    <p>Select a case to review its workflow, linked data, and finance information.</p>
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminCases;
