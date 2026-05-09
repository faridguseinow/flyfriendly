import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FilterX, Plus, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createTask,
  fetchCasesModuleData,
  getDocumentDownloadUrl,
  logAdminActivity,
  updateCaseWorkflow,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
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

const taskPriorities = ["low", "medium", "high", "urgent"];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatCaseReference(caseRow) {
  if (caseRow?.case_code) return caseRow.case_code;
  if (caseRow?.id) return `Case ${String(caseRow.id).slice(0, 8)}`;
  return "Case";
}

function formatCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "Pending review";
  return `€${Number(value || 0).toFixed(0)}${currency && currency !== "EUR" ? ` ${currency}` : ""}`;
}

function formatEstimateCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "Estimate pending review";
  return `Up to €${Number(value || 0).toFixed(0)}${currency && currency !== "EUR" ? ` ${currency}` : ""}`;
}

function formatEstimateStatus(status) {
  if (status === "calculated") return "Calculated";
  if (status === "manual_override") return "Manual override";
  return "Estimate pending review";
}

function formatDistanceBand(band) {
  if (band === "short") return "Short";
  if (band === "medium") return "Medium";
  if (band === "long") return "Long";
  return "Unknown";
}

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "paid", "closed", "completed", "payment_received", "customer_paid", "company_fee_collected"].includes(normalized)) {
    return "success";
  }
  if (["rejected"].includes(normalized)) return "danger";
  if (["documents_pending", "awaiting_response", "awaiting_payment", "submitted_to_airline", "escalated", "ready_to_submit"].includes(normalized)) {
    return "warning";
  }
  return "neutral";
}

function getPriorityTone(priority) {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "success";
}

function getTaskStatusTone(status) {
  if (status === "done") return "success";
  if (status === "cancelled") return "danger";
  if (status === "in_progress") return "warning";
  return "neutral";
}

function getEstimateTone(status) {
  if (status === "calculated") return "success";
  if (status === "manual_override") return "warning";
  return "neutral";
}

function deriveNextAction(caseRow, lead, finance, documents = []) {
  if (!caseRow) return "Review case";
  if (caseRow.status === "documents_pending" || documents.some((item) => item.status === "missing" || item.status === "requested")) {
    return "Collect documents";
  }
  if (lead?.estimate_status === "pending_review") {
    return "Review estimate";
  }
  if (caseRow.status === "ready_to_submit") {
    return "Submit to airline";
  }
  if (caseRow.status === "submitted_to_airline" || caseRow.status === "awaiting_response") {
    return "Wait for airline";
  }
  if ((finance?.payment_status || caseRow.payout_status) === "awaiting_payment") {
    return "Collect payment";
  }
  if (caseRow.status === "approved" && (finance?.payment_status || caseRow.payout_status) !== "completed") {
    return "Prepare payout";
  }
  if (["paid", "closed"].includes(caseRow.status)) {
    return "Completed";
  }
  return "Review case";
}

function formatRouteLabel(caseRow) {
  return `${caseRow?.route_from || "—"} → ${caseRow?.route_to || "—"}`;
}

function getSortTimestamp(caseRow) {
  if (caseRow?.updated_at) return new Date(caseRow.updated_at).getTime();
  if (caseRow?.created_at) return new Date(caseRow.created_at).getTime();
  return 0;
}

function exportCasesCsv(rows) {
  const headers = [
    "Case Reference",
    "Customer",
    "Email",
    "Route",
    "Airline",
    "Status",
    "Payout Status",
    "Owner",
    "Next Action",
    "Updated At",
  ];
  const lines = rows.map((item) => [
    item.reference,
    item.customerName,
    item.customerEmail,
    item.routeLabel,
    item.airline,
    item.status,
    item.financeStatus,
    item.ownerLabel,
    item.nextAction,
    item.updated_at || item.created_at,
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

export default function AdminCases() {
  const { hasPermission } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [financeFilter, setFinanceFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigned_user_id: "",
    priority: "medium",
    due_date: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [activeDownloadId, setActiveDownloadId] = useState("");
  const lastViewedCaseIdRef = useRef("");

  const loadCases = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchCasesModuleData({ page: 1, pageSize: 500 });
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load cases module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    const deepLinkedCaseId = searchParams.get("case");
    if (deepLinkedCaseId) {
      setSelectedCaseId(deepLinkedCaseId);
      setPreviewOpen(true);
    }
  }, [searchParams]);

  const leadById = useMemo(
    () => new Map((moduleData?.leads || []).map((lead) => [lead.id, lead])),
    [moduleData?.leads],
  );
  const customerById = useMemo(
    () => new Map((moduleData?.customers || []).map((customer) => [customer.id, customer])),
    [moduleData?.customers],
  );
  const managerById = useMemo(
    () => new Map((moduleData?.managers || []).map((manager) => [manager.id, manager])),
    [moduleData?.managers],
  );
  const financeByCaseId = useMemo(
    () => new Map((moduleData?.finance || []).map((item) => [item.case_id, item])),
    [moduleData?.finance],
  );
  const documentsByCaseId = useMemo(() => {
    const map = new Map();
    (moduleData?.documents || []).forEach((item) => {
      const current = map.get(item.case_id) || [];
      current.push(item);
      map.set(item.case_id, current);
    });
    return map;
  }, [moduleData?.documents]);
  const taskIdsByCaseId = useMemo(() => {
    const map = new Map();
    (moduleData?.caseTasks || []).forEach((item) => {
      const current = map.get(item.case_id) || [];
      current.push(item.task_id);
      map.set(item.case_id, current);
    });
    return map;
  }, [moduleData?.caseTasks]);
  const communicationIdsByCaseId = useMemo(() => {
    const map = new Map();
    (moduleData?.caseCommunications || []).forEach((item) => {
      const current = map.get(item.case_id) || [];
      current.push(item.communication_id);
      map.set(item.case_id, current);
    });
    return map;
  }, [moduleData?.caseCommunications]);
  const taskById = useMemo(
    () => new Map((moduleData?.tasks || []).map((task) => [task.id, task])),
    [moduleData?.tasks],
  );
  const communicationById = useMemo(
    () => new Map((moduleData?.communications || []).map((item) => [item.id, item])),
    [moduleData?.communications],
  );

  const casesWithMeta = useMemo(() => (
    (moduleData?.cases || []).map((caseRow) => {
      const lead = leadById.get(caseRow.lead_id) || null;
      const customer = customerById.get(caseRow.customer_id) || null;
      const owner = managerById.get(caseRow.assigned_manager_id) || null;
      const finance = financeByCaseId.get(caseRow.id) || null;
      const documents = documentsByCaseId.get(caseRow.id) || [];
      const nextAction = deriveNextAction(caseRow, lead, finance, documents);
      const financeStatus = finance?.payment_status || caseRow.payout_status || "not_started";

      return {
        ...caseRow,
        lead,
        customer,
        owner,
        finance,
        documents,
        nextAction,
        financeStatus,
        reference: formatCaseReference(caseRow),
        customerName: customer?.full_name || lead?.full_name || "Unknown customer",
        customerEmail: customer?.email || lead?.email || "No email",
        ownerLabel: owner?.full_name || owner?.email || "Unassigned",
        routeLabel: formatRouteLabel(caseRow),
        estimatedLabel: lead
          ? formatEstimateCurrency(lead.estimated_compensation_eur, lead.compensation_currency)
          : formatCurrency(caseRow.estimated_compensation),
        sortTimestamp: getSortTimestamp(caseRow),
      };
    })
  ), [customerById, documentsByCaseId, financeByCaseId, leadById, managerById, moduleData?.cases]);

  const airlineOptions = useMemo(() => {
    const values = Array.from(new Set(casesWithMeta.map((item) => item.airline).filter(Boolean)));
    return values.sort((left, right) => String(left).localeCompare(String(right)));
  }, [casesWithMeta]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromMs = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
    const toMs = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : null;

    return casesWithMeta.filter((item) => {
      const matchesSearch = !query || [
        item.reference,
        item.customerName,
        item.customerEmail,
        item.routeLabel,
        item.airline,
        item.ownerLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesOwner = ownerFilter === "all" || String(item.assigned_manager_id || "") === ownerFilter;
      const matchesAirline = airlineFilter === "all" || item.airline === airlineFilter;
      const matchesFinance = financeFilter === "all" || item.financeStatus === financeFilter;
      const updatedAtMs = item.sortTimestamp || 0;
      const matchesDateFrom = !fromMs || (updatedAtMs && updatedAtMs >= fromMs);
      const matchesDateTo = !toMs || (updatedAtMs && updatedAtMs <= toMs);

      return matchesSearch && matchesStatus && matchesOwner && matchesAirline && matchesFinance && matchesDateFrom && matchesDateTo;
    }).sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  }, [airlineFilter, casesWithMeta, dateRange.from, dateRange.to, financeFilter, ownerFilter, search, statusFilter]);

  const selectedCase = useMemo(
    () => filteredCases.find((item) => item.id === selectedCaseId)
      || casesWithMeta.find((item) => item.id === selectedCaseId)
      || null,
    [casesWithMeta, filteredCases, selectedCaseId],
  );

  const selectedDocuments = useMemo(
    () => selectedCase?.documents || [],
    [selectedCase],
  );
  const selectedTasks = useMemo(() => {
    const taskIds = taskIdsByCaseId.get(selectedCase?.id) || [];
    return taskIds
      .map((taskId) => taskById.get(taskId))
      .filter(Boolean)
      .sort((left, right) => {
        const leftTs = left?.due_date ? new Date(left.due_date).getTime() : 0;
        const rightTs = right?.due_date ? new Date(right.due_date).getTime() : 0;
        return leftTs - rightTs;
      });
  }, [selectedCase?.id, taskById, taskIdsByCaseId]);
  const selectedCommunications = useMemo(() => {
    const ids = communicationIdsByCaseId.get(selectedCase?.id) || [];
    return ids
      .map((communicationId) => communicationById.get(communicationId))
      .filter(Boolean)
      .slice(0, 6);
  }, [communicationById, communicationIdsByCaseId, selectedCase?.id]);
  const selectedStatusHistory = useMemo(
    () => (moduleData?.statusHistory || []).filter((item) => item.case_id === selectedCase?.id),
    [moduleData?.statusHistory, selectedCase?.id],
  );

  useEffect(() => {
    if (!selectedCase?.id || isLoading || lastViewedCaseIdRef.current === selectedCase.id) return;
    lastViewedCaseIdRef.current = selectedCase.id;
    void logAdminActivity("view_case", "case", selectedCase.id, {
      module: "cases",
      case_code: selectedCase.case_code || null,
      status: selectedCase.status || null,
      payout_status: selectedCase.payout_status || null,
    });
  }, [isLoading, selectedCase]);

  const updateCase = async (updates) => {
    if (!selectedCase) return;
    setError("");
    setIsSaving(true);
    try {
      await updateCaseWorkflow(selectedCase.id, updates);
      await loadCases();
    } catch (nextError) {
      setError(nextError.message || "Could not update case.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCase = (caseId) => {
    setSelectedCaseId(caseId);
    setPreviewOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("case", caseId);
    setSearchParams(nextParams, { replace: true });
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setTaskModalOpen(false);
    setSelectedCaseId(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("case");
    setSearchParams(nextParams, { replace: true });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setOwnerFilter("all");
    setAirlineFilter("all");
    setFinanceFilter("all");
    setDateRange({ from: "", to: "" });
  };

  const downloadDocument = async (file) => {
    if (!file?.file_path) return;
    setError("");
    setActiveDownloadId(file.id);
    try {
      const url = await getDocumentDownloadUrl({ ...file, bucket: "case-documents" });
      const link = document.createElement("a");
      link.href = url;
      link.download = file.file_name || "case-document";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      void logAdminActivity("download_document", "case_document", file.id, {
        module: "documents",
        owner_type: "case",
        owner_id: file.case_id || null,
        document_type: file.document_type || null,
      });
    } catch (nextError) {
      setError(nextError.message || "Could not download case document.");
    } finally {
      setActiveDownloadId("");
    }
  };

  const openTaskModal = () => {
    if (!selectedCase) return;
    setTaskForm({
      title: `Follow up ${formatCaseReference(selectedCase)}`,
      description: "",
      assigned_user_id: selectedCase.assigned_manager_id || "",
      priority: selectedCase.priority || "medium",
      due_date: "",
    });
    setTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setTaskModalOpen(false);
  };

  const submitTask = async (event) => {
    event.preventDefault();
    if (!selectedCase || !taskForm.title.trim()) {
      setError("Task title is required.");
      return;
    }

    setError("");
    setIsCreatingTask(true);
    try {
      await createTask({
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        related_entity_type: "case",
        related_entity_id: selectedCase.id,
        assigned_user_id: taskForm.assigned_user_id || null,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        status: "todo",
      });
      setTaskModalOpen(false);
      await loadCases();
    } catch (nextError) {
      setError(nextError.message || "Could not create task.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const listCountLabel = `${filteredCases.length} case${filteredCases.length === 1 ? "" : "s"}`;
  const selectedFinanceStatus = selectedCase?.finance?.payment_status || selectedCase?.payout_status || "not_started";
  const internalNotes = [selectedCase?.finance?.notes, selectedCase?.legal_basis].filter(Boolean);

  return (
    <div className="admin-page admin-cases-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsCaseModuleV1 ? (
        <p className="admin-message">
          Cases schema is not available yet. Run `006_core_operations_schema_v1.sql` and `007_cases_module_v1.sql` in Supabase
          to unlock the full cases module.
        </p>
      ) : null}

      <section className="admin-cases-page__toolbar">
        <label className="admin-cases-page__search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search case, customer, email, route, airline"
          />
        </label>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All case statuses</option>
          {caseStatuses.map((status) => (
            <option key={status} value={status}>{normalizeLabel(status)}</option>
          ))}
        </select>

        <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="all">All owners</option>
          {(moduleData?.managers || []).map((manager) => (
            <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
          ))}
        </select>

        <select value={airlineFilter} onChange={(event) => setAirlineFilter(event.target.value)}>
          <option value="all">All airlines</option>
          {airlineOptions.map((airline) => (
            <option key={airline} value={airline}>{airline}</option>
          ))}
        </select>

        <select value={financeFilter} onChange={(event) => setFinanceFilter(event.target.value)}>
          <option value="all">All finance states</option>
          {payoutStatuses.map((status) => (
            <option key={status} value={status}>{normalizeLabel(status)}</option>
          ))}
        </select>

        <label className="admin-cases-page__date-field">
          <span>From</span>
          <input
            type="date"
            value={dateRange.from}
            onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
          />
        </label>

        <label className="admin-cases-page__date-field">
          <span>To</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
          />
        </label>

        <button type="button" className="admin-cases-page__clear" onClick={clearFilters}>
          <FilterX size={15} />
          <span>Clear filters</span>
        </button>

        <button
          type="button"
          className="admin-cases-page__export"
          onClick={() => exportCasesCsv(filteredCases)}
          disabled={!filteredCases.length}
        >
          <Download size={15} />
          <span>Export CSV</span>
        </button>
      </section>

      <section className={`admin-cases-page__workspace${selectedCase ? " has-selection" : ""}${previewOpen ? " is-preview-open" : ""}`}>
        <div className="admin-cases-page__list-pane">
          <header className="admin-cases-page__list-header">
            <div>
              <span className="admin-cases-page__eyebrow">Case inbox</span>
              <h2>{listCountLabel}</h2>
            </div>
            <p>Most recently updated cases first.</p>
          </header>

          <div className="admin-cases-page__list-scroll">
            {isLoading ? (
              <div className="admin-cases-page__state">Loading cases...</div>
            ) : !filteredCases.length ? (
              <div className="admin-cases-page__state">No cases yet</div>
            ) : (
              filteredCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-cases-page__case-row${selectedCase?.id === item.id ? " is-active" : ""}`}
                  onClick={() => openCase(item.id)}
                >
                  <div className="admin-cases-page__case-main">
                    <div className="admin-cases-page__case-topline">
                      <strong>{item.reference}</strong>
                      <span>{formatDateTime(item.updated_at || item.created_at)}</span>
                    </div>

                    <div className="admin-cases-page__case-customer">
                      <span>{item.customerName}</span>
                      <small>{item.customerEmail}</small>
                    </div>

                    <div className="admin-cases-page__case-route">
                      <span>{item.routeLabel}</span>
                      <small>{item.airline || "No airline"}{item.flight_date ? ` • ${formatDate(item.flight_date)}` : ""}</small>
                    </div>
                  </div>

                  <div className="admin-cases-page__case-side">
                    <div className="admin-cases-page__case-badges">
                      <AdminStatusBadge tone={getStatusTone(item.status)}>{normalizeLabel(item.status)}</AdminStatusBadge>
                      <AdminStatusBadge tone={getStatusTone(item.financeStatus)}>{normalizeLabel(item.financeStatus)}</AdminStatusBadge>
                      {item.priority ? <AdminStatusBadge tone={getPriorityTone(item.priority)}>{normalizeLabel(item.priority)}</AdminStatusBadge> : null}
                    </div>

                    <div className="admin-cases-page__case-meta">
                      <span>{item.nextAction}</span>
                      <span>{item.ownerLabel}</span>
                      <span>{item.estimatedLabel}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {selectedCase && previewOpen ? (
          <button type="button" className="admin-cases-page__overlay" onClick={closePreview} aria-label="Close case preview" />
        ) : null}

        <aside className={`admin-cases-page__preview${selectedCase && previewOpen ? " is-open" : ""}`}>
          {!selectedCase ? (
            <div className="admin-cases-page__empty-preview">
              <strong>Select a case to preview details</strong>
              <p>Choose a case from the list to inspect customer, route, documents, finance, communications, tasks, and operational status.</p>
            </div>
          ) : (
            <div className="admin-cases-page__preview-inner">
              <header className="admin-cases-page__preview-header">
                <div>
                  <span className="admin-cases-page__eyebrow">Case preview</span>
                  <h3>{formatCaseReference(selectedCase)}</h3>
                  <p>{selectedCase.customerName} • Updated {formatDateTime(selectedCase.updated_at || selectedCase.created_at)}</p>
                </div>
                <div className="admin-cases-page__preview-actions">
                  <button
                    className="btn btn--primary"
                    type="button"
                    onClick={openTaskModal}
                    disabled={!hasPermission("tasks.edit") || isCreatingTask}
                    title={hasPermission("tasks.edit") ? "Create task" : "You do not have permission to create tasks."}
                  >
                    <Plus size={15} />
                    <span>Create task</span>
                  </button>
                  <button type="button" className="admin-cases-page__close" onClick={closePreview} aria-label="Close preview">
                    <X size={16} />
                  </button>
                </div>
              </header>

              <div className="admin-cases-page__preview-scroll">
                <section className="admin-cases-page__identity">
                  <div>
                    <h4>{selectedCase.customerName}</h4>
                    <p>{selectedCase.customerEmail}{selectedCase.customer?.phone ? ` • ${selectedCase.customer.phone}` : ""}</p>
                  </div>
                  <div className="admin-cases-page__case-badges">
                    <AdminStatusBadge tone={getStatusTone(selectedCase.status)}>{normalizeLabel(selectedCase.status)}</AdminStatusBadge>
                    <AdminStatusBadge tone={getStatusTone(selectedFinanceStatus)}>{normalizeLabel(selectedFinanceStatus)}</AdminStatusBadge>
                    {selectedCase.priority ? <AdminStatusBadge tone={getPriorityTone(selectedCase.priority)}>{normalizeLabel(selectedCase.priority)}</AdminStatusBadge> : null}
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Customer</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>Full name</strong><span>{selectedCase.customerName}</span></article>
                    <article><strong>Email</strong><span>{selectedCase.customerEmail}</span></article>
                    <article><strong>Phone</strong><span>{selectedCase.customer?.phone || selectedCase.lead?.phone || "—"}</span></article>
                    <article>
                      <strong>Client record</strong>
                      <span>
                        {selectedCase.customer_id ? <Link to={`/admin/customers?customer=${selectedCase.customer_id}`}>Open customer</Link> : "Not linked"}
                      </span>
                    </article>
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Route / Flight</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>Departure airport</strong><span>{selectedCase.route_from || selectedCase.lead?.departure_airport || "—"}</span></article>
                    <article><strong>Arrival airport</strong><span>{selectedCase.route_to || selectedCase.lead?.arrival_airport || "—"}</span></article>
                    <article><strong>Flight date</strong><span>{formatDate(selectedCase.flight_date)}</span></article>
                    <article><strong>Airline</strong><span>{selectedCase.airline || "—"}</span></article>
                    <article><strong>Flight number</strong><span>Not configured</span></article>
                    <article><strong>Route type</strong><span>Not configured</span></article>
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Case status</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>Current status</strong><span>{normalizeLabel(selectedCase.status)}</span></article>
                    <article><strong>Owner</strong><span>{selectedCase.ownerLabel}</span></article>
                    <article><strong>Next action</strong><span>{selectedCase.nextAction}</span></article>
                    <article><strong>Priority</strong><span>{selectedCase.priority ? normalizeLabel(selectedCase.priority) : "Not configured"}</span></article>
                  </div>

                  <div className="admin-cases-page__workflow-grid">
                    <label>
                      <span>Case status</span>
                      <select
                        value={selectedCase.status || "draft"}
                        onChange={(event) => updateCase({ status: event.target.value })}
                        disabled={!hasPermission("cases.update") || isSaving}
                      >
                        {caseStatuses.map((status) => <option key={status} value={status}>{normalizeLabel(status)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Finance status</span>
                      <select
                        value={selectedCase.payout_status || "not_started"}
                        onChange={(event) => updateCase({ payout_status: event.target.value })}
                        disabled={!hasPermission("cases.update") || isSaving}
                      >
                        {payoutStatuses.map((status) => <option key={status} value={status}>{normalizeLabel(status)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Owner</span>
                      <select
                        value={selectedCase.assigned_manager_id || ""}
                        onChange={(event) => updateCase({ assigned_manager_id: event.target.value || null })}
                        disabled={!hasPermission("cases.update") || isSaving}
                      >
                        <option value="">Unassigned</option>
                        {(moduleData?.managers || []).map((manager) => (
                          <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Compensation / Finance</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>Estimated compensation</strong><span>{selectedCase.lead ? formatEstimateCurrency(selectedCase.lead.estimated_compensation_eur, selectedCase.lead.compensation_currency) : formatCurrency(selectedCase.estimated_compensation)}</span></article>
                    <article><strong>Distance</strong><span>{selectedCase.lead?.distance_km ? `${Math.round(Number(selectedCase.lead.distance_km))} km` : "Pending review"}</span></article>
                    <article><strong>Distance band</strong><span>{selectedCase.lead ? formatDistanceBand(selectedCase.lead.distance_band) : "Pending review"}</span></article>
                    <article><strong>Estimate status</strong><span>{selectedCase.lead ? formatEstimateStatus(selectedCase.lead.estimate_status) : "Estimate pending review"}</span></article>
                    <article><strong>Recovered amount</strong><span>{selectedCase.finance ? formatCurrency(selectedCase.finance.compensation_amount, selectedCase.finance.currency) : "Finance details not configured yet"}</span></article>
                    <article><strong>Payout status</strong><span>{normalizeLabel(selectedFinanceStatus)}</span></article>
                    <article><strong>Company fee / revenue</strong><span>{selectedCase.finance ? formatCurrency(selectedCase.finance.company_fee, selectedCase.finance.currency) : "Not configured"}</span></article>
                    <article><strong>Customer payout</strong><span>{selectedCase.finance ? formatCurrency(selectedCase.finance.customer_payout, selectedCase.finance.currency) : "Not configured"}</span></article>
                  </div>
                  {!selectedCase.finance && !selectedCase.lead ? (
                    <p className="admin-cases-page__empty-copy">Finance details not configured yet</p>
                  ) : null}
                  {selectedCase.lead ? (
                    <div className="admin-cases-page__finance-tags">
                      <AdminStatusBadge tone={getEstimateTone(selectedCase.lead.estimate_status)}>{formatEstimateStatus(selectedCase.lead.estimate_status)}</AdminStatusBadge>
                    </div>
                  ) : null}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Documents</h4>
                  </div>
                  {selectedDocuments.length ? (
                    <div className="admin-cases-page__timeline">
                      {selectedDocuments.map((item) => (
                        <article key={item.id}>
                          <div>
                            <strong>{item.file_name || item.document_type || "Case document"}</strong>
                            <p>{item.document_type || "—"} • {normalizeLabel(item.status || "uploaded")} • {formatDateTime(item.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            className="admin-link-button"
                            onClick={() => downloadDocument(item)}
                            disabled={!item.file_path || activeDownloadId === item.id}
                            title={item.file_path ? "Open document" : "Document file path is not available."}
                          >
                            {activeDownloadId === item.id ? "Opening..." : "Open"}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">No documents uploaded yet</p>
                  )}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Communications</h4>
                  </div>
                  {selectedCommunications.length ? (
                    <div className="admin-cases-page__timeline">
                      {selectedCommunications.map((item) => (
                        <article key={item.id}>
                          <div>
                            <strong>{normalizeLabel(item.channel || "message")} • {formatDateTime(item.created_at)}</strong>
                            <p>{item.subject || item.body || "No content"}</p>
                          </div>
                          <span className="admin-cases-page__signature-summary">{normalizeLabel(item.direction || "internal")}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">No communications yet</p>
                  )}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Tasks</h4>
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={openTaskModal}
                      disabled={!hasPermission("tasks.edit") || isCreatingTask}
                    >
                      <Plus size={14} />
                      <span>Create task</span>
                    </button>
                  </div>
                  {selectedTasks.length ? (
                    <div className="admin-cases-page__timeline">
                      {selectedTasks.map((task) => {
                        const assignee = managerById.get(task.assigned_user_id);
                        return (
                          <article key={task.id}>
                            <div>
                              <strong>{task.title || "Untitled task"}</strong>
                              <p>
                                {assignee?.full_name || assignee?.email || "Unassigned"}
                                {" • "}
                                {task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}
                              </p>
                            </div>
                            <div className="admin-cases-page__task-meta">
                              <AdminStatusBadge tone={getTaskStatusTone(task.status)}>{normalizeLabel(task.status)}</AdminStatusBadge>
                              <AdminStatusBadge tone={getPriorityTone(task.priority)}>{normalizeLabel(task.priority || "medium")}</AdminStatusBadge>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">No tasks created for this case yet</p>
                  )}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>Internal notes / timeline</h4>
                  </div>
                  {internalNotes.length || selectedStatusHistory.length ? (
                    <div className="admin-cases-page__timeline">
                      {internalNotes.map((note, index) => (
                        <article key={`note-${index}`}>
                          <div>
                            <strong>Internal note</strong>
                            <p>{note}</p>
                          </div>
                        </article>
                      ))}
                      {selectedStatusHistory.map((item) => (
                        <article key={item.id}>
                          <div>
                            <strong>{normalizeLabel(item.previous_status || "unknown")} → {normalizeLabel(item.next_status || "unknown")}</strong>
                            <p>{item.note || "No note"} • {formatDateTime(item.created_at)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">No internal notes or timeline entries yet</p>
                  )}
                </section>
              </div>
            </div>
          )}
        </aside>
      </section>

      {taskModalOpen && selectedCase ? (
        <div className="admin-cases-page__task-modal-layer" role="presentation">
          <button type="button" className="admin-cases-page__task-modal-backdrop" onClick={closeTaskModal} aria-label="Close task creator" />
          <section className="admin-cases-page__task-modal" role="dialog" aria-modal="true" aria-labelledby="case-task-modal-title">
            <header className="admin-cases-page__task-modal-header">
              <div>
                <span className="admin-cases-page__eyebrow">Task</span>
                <h3 id="case-task-modal-title">Create task for {formatCaseReference(selectedCase)}</h3>
                <p>The task will be linked to this case and appear in the case task list after refresh.</p>
              </div>
              <button type="button" className="admin-cases-page__close" onClick={closeTaskModal} aria-label="Close task creator">
                <X size={16} />
              </button>
            </header>

            <form className="admin-cases-page__task-form" onSubmit={submitTask}>
              <label>
                <span>Task title</span>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={`Follow up ${formatCaseReference(selectedCase)}`}
                />
              </label>

              <label>
                <span>Assignee</span>
                <select
                  value={taskForm.assigned_user_id}
                  onChange={(event) => setTaskForm((current) => ({ ...current, assigned_user_id: event.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {(moduleData?.managers || []).map((manager) => (
                    <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                  ))}
                </select>
              </label>

              <div className="admin-cases-page__task-form-grid">
                <label>
                  <span>Priority</span>
                  <select
                    value={taskForm.priority}
                    onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}
                  >
                    {taskPriorities.map((priority) => (
                      <option key={priority} value={priority}>{normalizeLabel(priority)}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Due date</span>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(event) => setTaskForm((current) => ({ ...current, due_date: event.target.value }))}
                  />
                </label>
              </div>

              <label>
                <span>Description</span>
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Add the next operational step for this case"
                />
              </label>

              <div className="admin-cases-page__task-form-actions">
                <button type="button" className="admin-link-button" onClick={closeTaskModal}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={!hasPermission("tasks.edit") || isCreatingTask}>
                  <span>{isCreatingTask ? "Creating..." : "Create task"}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
