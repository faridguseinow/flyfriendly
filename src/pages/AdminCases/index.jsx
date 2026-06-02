import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FilterX, Plus, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  createTask,
  fetchCasesModuleData,
  getDocumentDownloadUrl,
  logAdminActivity,
  updateCaseWorkflow,
} from "../../services/adminService.js";
import {
  getClientPaymentByCaseId,
  getFinanceRows,
  getPartnerPayments,
  markClientPaymentPaid,
  markClientPaymentUnpaid,
  markInternalCompensationConfirmed,
  markPartnerPaymentPaid,
  markPartnerPaymentUnpaid,
  setClientVisibleApproval,
  updateClientPayment,
  updatePartnerPayment,
} from "../../services/adminFinanceService.js";
import {
  calculateClientPayout,
  calculateCompanyRevenue,
  normalizeMoneyAmount,
} from "../../lib/financeCalculations.js";
import {
  formatFinanceCurrency,
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
  formatFinanceRoute,
} from "../../lib/adminFinanceFormatters.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
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
  return formatFinanceDateTimeLabel(value);
}

function formatDate(value) {
  return formatFinanceDateParts(value).date;
}

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function translateEnum(t, value) {
  const normalized = String(value || "unknown").trim().toLowerCase();
  return t(`admin.common.enums.${normalized}`, { defaultValue: normalizeLabel(value) });
}

function formatCaseReference(caseRow, t = null) {
  if (caseRow?.case_code) return caseRow.case_code;
  if (caseRow?.id) return `${t ? t("admin.cases.title") : "Case"} ${String(caseRow.id).slice(0, 8)}`;
  return t ? t("admin.cases.title") : "Case";
}

function formatCurrency(value, currency = "EUR", t = null) {
  return formatFinanceCurrency(value, currency, {
    emptyLabel: t ? t("admin.common.enums.pending_review") : "Pending review",
  });
}

function formatEstimateCurrency(value, currency = "EUR", t = null) {
  if (value === null || value === undefined || value === "") {
    return t ? t("admin.leads.estimate.pendingReview") : "Estimate pending review";
  }
  return `Up to €${Number(value || 0).toFixed(0)}${currency && currency !== "EUR" ? ` ${currency}` : ""}`;
}

function formatEstimateStatus(status, t = null) {
  if (status === "calculated") return t ? t("admin.leads.estimate.calculated") : "Calculated";
  if (status === "manual_override") return t ? t("admin.leads.estimate.manualOverride") : "Manual override";
  return t ? t("admin.leads.estimate.pendingReview") : "Estimate pending review";
}

function formatDistanceBand(band, t = null) {
  if (band === "short") return t ? t("admin.leads.distance.short") : "Short";
  if (band === "medium") return t ? t("admin.leads.distance.medium") : "Medium";
  if (band === "long") return t ? t("admin.leads.distance.long") : "Long";
  return t ? t("admin.leads.distance.unknown") : "Unknown";
}

function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "paid", "closed", "completed", "payment_received", "customer_paid", "company_fee_collected"].includes(normalized)) {
    return "success";
  }
  if (["rejected"].includes(normalized)) return "danger";
  if (["submitted_to_airline", "airline_replied"].includes(normalized)) return "info";
  if (["documents_pending", "awaiting_response", "awaiting_payment", "escalated", "ready_to_submit"].includes(normalized)) {
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

function getBooleanTone(value) {
  return value ? "success" : "neutral";
}

function normalizeBooleanLabel(value, t = null) {
  return value ? (t ? t("admin.common.yes") : "Yes") : (t ? t("admin.common.no") : "No");
}

function normalizeCompactPaymentStatus(value, paidAt = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (paidAt || ["paid", "customer_paid", "completed", "referral_paid"].includes(normalized)) {
    return "paid";
  }
  return "unpaid";
}

function normalizePartnerPaymentValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized) return "unpaid";
  return "";
}

function getPaymentTone(status) {
  if (status === "paid") return "success";
  if (status === "unpaid") return "warning";
  return "neutral";
}

function formatPaymentFlow(value, t = null) {
  if (value === "direct_to_client") return t ? t("admin.common.enums.direct_to_client") : "Direct to client";
  return t ? t("admin.common.enums.through_company") : "Through company";
}

function deriveNextAction(caseRow, lead, finance, documents = [], t = null) {
  if (!caseRow) return t ? t("admin.cases.nextActions.reviewCase") : "Review case";
  if (caseRow.status === "documents_pending" || documents.some((item) => item.status === "missing" || item.status === "requested")) {
    return t ? t("admin.cases.nextActions.collectDocuments") : "Collect documents";
  }
  if (lead?.estimate_status === "pending_review") {
    return t ? t("admin.cases.nextActions.reviewEstimate") : "Review estimate";
  }
  if (caseRow.status === "ready_to_submit") {
    return t ? t("admin.cases.nextActions.submitToAirline") : "Submit to airline";
  }
  if (caseRow.status === "submitted_to_airline" || caseRow.status === "awaiting_response") {
    return t ? t("admin.cases.nextActions.waitForAirline") : "Wait for airline";
  }
  if ((finance?.payment_status || caseRow.payout_status) === "awaiting_payment") {
    return t ? t("admin.cases.nextActions.collectPayment") : "Collect payment";
  }
  if (caseRow.status === "approved" && (finance?.payment_status || caseRow.payout_status) !== "completed") {
    return t ? t("admin.cases.nextActions.preparePayout") : "Prepare payout";
  }
  if (["paid", "closed"].includes(caseRow.status)) {
    return t ? t("admin.cases.nextActions.completed") : "Completed";
  }
  return t ? t("admin.cases.nextActions.reviewCase") : "Review case";
}

function formatRouteLabel(caseRow) {
  return formatFinanceRoute(`${caseRow?.route_from || "—"} → ${caseRow?.route_to || "—"}`);
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
  const { t } = useTranslation();
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
  const [selectedCaseFinanceState, setSelectedCaseFinanceState] = useState({
    summaryRow: null,
    clientPayment: null,
    partnerPayment: null,
  });
  const [clientPaymentForm, setClientPaymentForm] = useState({
    paymentReference: "",
    paymentFlowType: "through_company",
    internalNote: "",
  });
  const [partnerPaymentForm, setPartnerPaymentForm] = useState({
    paymentReference: "",
    internalNote: "",
  });
  const [financeError, setFinanceError] = useState("");
  const [financeNotice, setFinanceNotice] = useState("");
  const [isFinanceLoading, setIsFinanceLoading] = useState(false);
  const [activeFinanceAction, setActiveFinanceAction] = useState("");
  const lastViewedCaseIdRef = useRef("");

  const loadCases = async (options = {}) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchCasesModuleData({ page: 1, pageSize: 500, force: options.force });
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || t("admin.cases.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, [t]);

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
      const nextAction = deriveNextAction(caseRow, lead, finance, documents, t);
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
        reference: formatCaseReference(caseRow, t),
        customerName: customer?.full_name || lead?.full_name || t("admin.common.unknownCustomer"),
        customerEmail: customer?.email || lead?.email || t("admin.common.noEmail"),
        ownerLabel: owner?.full_name || owner?.email || t("admin.common.unassigned"),
        routeLabel: formatRouteLabel(caseRow),
        estimatedLabel: lead
          ? formatEstimateCurrency(lead.estimated_compensation_eur, lead.compensation_currency, t)
          : formatCurrency(caseRow.estimated_compensation, undefined, t),
        sortTimestamp: getSortTimestamp(caseRow),
      };
    })
  ), [customerById, documentsByCaseId, financeByCaseId, leadById, managerById, moduleData?.cases, t]);

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

  const metrics = useMemo(() => {
    const total = filteredCases.length;
    const active = filteredCases.filter((item) => !["paid", "closed", "rejected"].includes(String(item.status || "").toLowerCase())).length;
    const documentsPending = filteredCases.filter((item) => item.status === "documents_pending").length;
    const readyToSubmit = filteredCases.filter((item) => item.status === "ready_to_submit").length;
    const approved = filteredCases.filter((item) => item.status === "approved").length;
    const paid = filteredCases.filter((item) => item.status === "paid").length;

    return [
      { label: t("admin.cases.metrics.total"), value: total },
      { label: t("admin.cases.metrics.active"), value: active },
      { label: t("admin.cases.metrics.documentsPending"), value: documentsPending },
      { label: t("admin.cases.metrics.readyToSubmit"), value: readyToSubmit },
      { label: t("admin.cases.metrics.approved"), value: approved },
      { label: t("admin.cases.metrics.paid"), value: paid },
    ];
  }, [filteredCases, t]);

  const caseColumns = useMemo(() => ([
    {
      key: "case",
      label: t("admin.cases.title"),
      width: 140,
      minWidth: 110,
      maxWidth: 240,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (item) => (
        <div className="admin-crm-page__primary" title={item.reference}>
          <strong className="admin-crm-page__code admin-crm-table__cell-main">{item.reference}</strong>
          <span className="admin-crm-table__cell-sub">{item.nextAction}</span>
        </div>
      ),
      getCellTitle: (item) => item.reference,
    },
    {
      key: "customer",
      label: t("admin.common.customer"),
      width: 180,
      minWidth: 140,
      maxWidth: 320,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (item) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={item.customerName}>{item.customerName}</strong>
          <span className="admin-crm-table__cell-sub" title={item.customerEmail}>{item.customerEmail}</span>
        </div>
      ),
      getCellTitle: (item) => `${item.customerName}${item.customerEmail ? ` · ${item.customerEmail}` : ""}`,
    },
    {
      key: "route",
      label: t("admin.common.route"),
      width: 260,
      minWidth: 180,
      maxWidth: 480,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (item) => (
        <div className="admin-crm-page__route">
          <strong className="admin-crm-table__cell-main" title={item.routeLabel}>{item.routeLabel}</strong>
          <span className="admin-crm-table__cell-sub">{item.lead?.disruption_type ? translateEnum(t, item.lead.disruption_type) : "—"}</span>
        </div>
      ),
      getCellTitle: (item) => item.routeLabel,
    },
    {
      key: "flight",
      label: t("admin.common.flight"),
      width: 180,
      minWidth: 130,
      maxWidth: 300,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (item) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={item.airline || "—"}>{item.airline || "—"}</strong>
          <span className="admin-crm-table__cell-sub">{formatDate(item.flight_date)}</span>
        </div>
      ),
      getCellTitle: (item) => `${item.airline || "—"}${item.flight_date ? ` · ${formatDate(item.flight_date)}` : ""}`,
    },
    {
      key: "caseStatus",
      label: t("admin.cases.sections.caseStatus"),
      width: 190,
      minWidth: 150,
      maxWidth: 320,
      resizable: true,
      reorderable: true,
      wrap: false,
      renderCell: (item) => (
        <div className="admin-cases-page__table-badges">
          <AdminStatusBadge tone={getStatusTone(item.status)}>{translateEnum(t, item.status)}</AdminStatusBadge>
          {item.priority ? <AdminStatusBadge tone={getPriorityTone(item.priority)}>{translateEnum(t, item.priority)}</AdminStatusBadge> : null}
        </div>
      ),
    },
    {
      key: "finance",
      label: t("admin.cases.sections.finance"),
      width: 180,
      minWidth: 140,
      maxWidth: 300,
      resizable: true,
      reorderable: true,
      wrap: false,
      renderCell: (item) => (
        <div className="admin-cases-page__finance-cell">
          <AdminStatusBadge tone={getStatusTone(item.financeStatus)}>{translateEnum(t, item.financeStatus)}</AdminStatusBadge>
          <span className="admin-crm-table__cell-sub" title={item.estimatedLabel}>{item.estimatedLabel}</span>
        </div>
      ),
      getCellTitle: (item) => item.estimatedLabel,
    },
    {
      key: "owner",
      label: t("admin.common.owner"),
      width: 130,
      minWidth: 100,
      maxWidth: 220,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (item) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={item.ownerLabel}>{item.ownerLabel}</strong>
        </div>
      ),
      getCellTitle: (item) => item.ownerLabel,
    },
    {
      key: "updated",
      label: t("admin.common.created"),
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (item) => {
        const updated = formatFinanceDateParts(item.updated_at || item.created_at);
        return (
          <div className="admin-crm-page__date">
            <strong className="admin-crm-table__cell-main">{updated.date}</strong>
            {updated.time ? <span className="admin-crm-table__cell-sub">{updated.time}</span> : null}
          </div>
        );
      },
      getCellTitle: (item) => formatDateTime(item.updated_at || item.created_at),
    },
  ]), [t]);

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
    if (!selectedCase?.id || !previewOpen) {
      setSelectedCaseFinanceState({
        summaryRow: null,
        clientPayment: null,
        partnerPayment: null,
      });
      setFinanceError("");
      setFinanceNotice("");
      setActiveFinanceAction("");
      return;
    }

    void loadSelectedCaseFinance(selectedCase.id);
  }, [previewOpen, selectedCase?.id]);

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
      await loadCases({ force: true });
    } catch (nextError) {
      setError(nextError.message || "Could not update case.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadSelectedCaseFinance = async (caseId, options = {}) => {
    if (!caseId) {
      setSelectedCaseFinanceState({
        summaryRow: null,
        clientPayment: null,
        partnerPayment: null,
      });
      setClientPaymentForm({
        paymentReference: "",
        paymentFlowType: "through_company",
        internalNote: "",
      });
      setPartnerPaymentForm({
        paymentReference: "",
        internalNote: "",
      });
      return;
    }

    if (options.resetMessages !== false) {
      setFinanceError("");
    }

    if (options.showLoader !== false) {
      setIsFinanceLoading(true);
    }

    try {
      const [summaryRows, clientPayment, partnerPayments] = await Promise.all([
        getFinanceRows({ caseId, limit: 20 }),
        getClientPaymentByCaseId(caseId),
        getPartnerPayments({ caseId, limit: 20 }),
      ]);

      const nextSummaryRow = summaryRows[0] || null;
      const nextPartnerPayment = partnerPayments[0] || null;

      setSelectedCaseFinanceState({
        summaryRow: nextSummaryRow,
        clientPayment: clientPayment || null,
        partnerPayment: nextPartnerPayment,
      });
      setClientPaymentForm({
        paymentReference: clientPayment?.paymentReference || "",
        paymentFlowType: clientPayment?.paymentFlowType || "through_company",
        internalNote: clientPayment?.internalNote || "",
      });
      setPartnerPaymentForm({
        paymentReference: nextPartnerPayment?.paymentReference || "",
        internalNote: nextPartnerPayment?.internalNote || "",
      });
    } catch (nextError) {
      setFinanceError(nextError.message || "Could not load finance details.");
    } finally {
      if (options.showLoader !== false) {
        setIsFinanceLoading(false);
      }
    }
  };

  const refreshSelectedCaseFinance = async (caseId, successMessage = "") => {
    await loadCases({ force: true });
    await loadSelectedCaseFinance(caseId, { showLoader: false, resetMessages: false });
    if (successMessage) {
      setFinanceNotice(successMessage);
    }
  };

  const runFinanceAction = async (actionKey, action, successMessage) => {
    if (!selectedCase?.id) return;
    setFinanceError("");
    setFinanceNotice("");
    setActiveFinanceAction(actionKey);
    try {
      await action();
      await refreshSelectedCaseFinance(selectedCase.id, successMessage);
    } catch (nextError) {
      setFinanceError(nextError.message || "Could not update finance state.");
    } finally {
      setActiveFinanceAction("");
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
      await loadCases({ force: true });
    } catch (nextError) {
      setError(nextError.message || "Could not create task.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const listCountLabel = t("admin.cases.countLabel", { count: filteredCases.length });
  const selectedFinanceStatus = selectedCase?.finance?.payment_status || selectedCase?.payout_status || "not_started";
  const internalNotes = [selectedCase?.finance?.notes, selectedCase?.legal_basis].filter(Boolean);
  const canManageCaseStatus = hasPermission("cases.update") || hasPermission("cases.edit");
  const canManageFinance = hasPermission("finance.edit");
  const caseCompensationAmount = normalizeMoneyAmount(
    selectedCaseFinanceState.clientPayment?.compensationAmount
    ?? selectedCase?.finance?.compensation_amount
    ?? selectedCase?.estimated_compensation
    ?? selectedCase?.lead?.estimated_compensation_eur,
  );
  const financeRevenueAmount = normalizeMoneyAmount(
    selectedCaseFinanceState.clientPayment?.companyRevenueAmount
    ?? selectedCase?.finance?.company_fee
    ?? calculateCompanyRevenue(caseCompensationAmount),
  );
  const financeClientPayoutAmount = normalizeMoneyAmount(
    selectedCaseFinanceState.clientPayment?.finalClientPayoutAmount
    ?? selectedCase?.finance?.customer_payout
    ?? calculateClientPayout(caseCompensationAmount),
  );
  const isReferralCase = Boolean(
    selectedCaseFinanceState.summaryRow?.partnerName
    || selectedCaseFinanceState.partnerPayment?.partnerId
    || selectedCase?.referral_partner_label,
  );
  const partnerCommissionAmount = isReferralCase
    ? normalizeMoneyAmount(
      selectedCaseFinanceState.summaryRow?.partnerCommissionAmount
      ?? selectedCase?.finance?.referral_commission,
    )
    : 0;
  const partnerRate = selectedCaseFinanceState.summaryRow?.partnerRate ?? null;
  const internalCompensationConfirmed = Boolean(selectedCaseFinanceState.summaryRow?.internalCompensationConfirmed);
  const clientVisibleApproval = Boolean(selectedCaseFinanceState.summaryRow?.clientVisibleApproval);
  const clientPaymentStatus = selectedCaseFinanceState.clientPayment?.status
    || normalizeCompactPaymentStatus(selectedCase?.finance?.payment_status, selectedCase?.finance?.customer_paid_at);
  const partnerPaymentStatus = normalizePartnerPaymentValue(selectedCaseFinanceState.partnerPayment?.status);

  return (
    <div className="admin-page admin-cases-page admin-crm-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsCaseModuleV1 ? (
        <p className="admin-message">
          {t("admin.cases.title")} schema is not available yet. Run `006_core_operations_schema_v1.sql` and `007_cases_module_v1.sql` in Supabase
          to unlock the full cases module.
        </p>
      ) : null}

      <AdminPageHeader
        title={t("admin.cases.title")}
        secondaryActions={[
          {
            label: t("admin.common.refresh"),
            icon: RefreshCw,
            onClick: () => void loadCases({ force: true }),
            disabled: isLoading || isSaving || isCreatingTask,
          },
          {
            label: t("admin.common.exportCsv"),
            icon: Download,
            onClick: () => exportCasesCsv(filteredCases),
            disabled: !filteredCases.length,
          },
        ]}
      />

      <section className="admin-crm-page__workspace">
        <AdminMetricsStrip items={metrics} />

        <AdminFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("admin.cases.searchPlaceholder")}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={[
            { value: "all", label: t("admin.cases.filters.allCaseStatuses") },
            ...caseStatuses.map((status) => ({ value: status, label: translateEnum(t, status) })),
          ]}
          ownerFilter={ownerFilter}
          onOwnerFilterChange={setOwnerFilter}
          ownerOptions={[
            { value: "all", label: t("admin.cases.filters.allOwners") },
            ...((moduleData?.managers || []).map((manager) => ({ value: manager.id, label: manager.full_name || manager.email }))),
          ]}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        >
          <select className="admin-filter-control admin-select" value={airlineFilter} onChange={(event) => setAirlineFilter(event.target.value)}>
            <option value="all">{t("admin.cases.filters.allAirlines")}</option>
            {airlineOptions.map((airline) => (
              <option key={airline} value={airline}>{airline}</option>
            ))}
          </select>

          <select className="admin-filter-control admin-select" value={financeFilter} onChange={(event) => setFinanceFilter(event.target.value)}>
            <option value="all">{t("admin.cases.filters.allFinanceStates")}</option>
            {payoutStatuses.map((status) => (
              <option key={status} value={status}>{translateEnum(t, status)}</option>
            ))}
          </select>

          <button type="button" className="admin-btn admin-btn-secondary admin-crm-page__clear" onClick={clearFilters}>
            <FilterX size={15} />
            <span>{t("admin.common.clearFilters")}</span>
          </button>
        </AdminFilterBar>

        <AdminColumnTable
          storageKey="ff-admin-table-layout-cases"
          title={t("admin.cases.title")}
          countLabel={listCountLabel}
          columns={caseColumns}
          rows={filteredCases}
          loading={isLoading}
          error={error}
          emptyTitle={t("admin.cases.emptyTitle")}
          emptyDetail={t("admin.cases.emptyDetail")}
          selectedRowId={selectedCase?.id || ""}
          getRowKey={(item) => item.id}
          onRowClick={(item) => openCase(item.id)}
        />

        <AdminSidePanel
          open={Boolean(selectedCase && previewOpen)}
          eyebrow={t("admin.cases.previewEyebrow")}
          title={selectedCase ? formatCaseReference(selectedCase, t) : t("admin.cases.previewTitle")}
          subtitle={selectedCase ? `${selectedCase.customerName} • ${t("admin.common.created")} ${formatDateTime(selectedCase.updated_at || selectedCase.created_at)}` : ""}
          onClose={closePreview}
          className="admin-cases-page__preview"
          withOverlay
          overlayClassName="admin-cases-page__overlay"
          overlayLabel={t("admin.cases.closePreview")}
        >
          {!selectedCase ? (
            <div className="admin-cases-page__empty-preview">
              <strong>{t("admin.cases.selectCaseTitle")}</strong>
              <p>{t("admin.cases.selectCaseDescription")}</p>
            </div>
          ) : (
            <div className="admin-cases-page__preview-inner">
              <div className="admin-cases-page__preview-actions admin-cases-page__preview-actions--body">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={openTaskModal}
                  disabled={!hasPermission("tasks.edit") || isCreatingTask}
                  title={hasPermission("tasks.edit") ? t("admin.cases.createTask") : t("admin.cases.createTask")}
                >
                  <Plus size={15} />
                  <span>{t("admin.cases.createTask")}</span>
                </button>
              </div>
              <div className="admin-cases-page__preview-scroll">
                <section className="admin-cases-page__identity">
                  <div>
                    <h4>{selectedCase.customerName}</h4>
                    <p>{selectedCase.customerEmail}{selectedCase.customer?.phone ? ` • ${selectedCase.customer.phone}` : ""}</p>
                  </div>
                  <div className="admin-cases-page__case-badges">
                    <AdminStatusBadge tone={getStatusTone(selectedCase.status)}>{translateEnum(t, selectedCase.status)}</AdminStatusBadge>
                    <AdminStatusBadge tone={getStatusTone(selectedFinanceStatus)}>{translateEnum(t, selectedFinanceStatus)}</AdminStatusBadge>
                    {selectedCase.priority ? <AdminStatusBadge tone={getPriorityTone(selectedCase.priority)}>{translateEnum(t, selectedCase.priority)}</AdminStatusBadge> : null}
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.customer")}</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>{t("admin.common.customer")}</strong><span>{selectedCase.customerName}</span></article>
                    <article><strong>{t("admin.common.email")}</strong><span>{selectedCase.customerEmail}</span></article>
                    <article><strong>{t("admin.common.phone")}</strong><span>{selectedCase.customer?.phone || selectedCase.lead?.phone || "—"}</span></article>
                    <article>
                      <strong>{t("admin.common.customer")}</strong>
                      <span>
                        {selectedCase.customer_id ? <Link to={`/admin/customers?customer=${selectedCase.customer_id}`}>{t("admin.common.open")}</Link> : t("admin.common.notLinked")}
                      </span>
                    </article>
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.routeFlight")}</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>{t("admin.common.departureAirport")}</strong><span>{selectedCase.route_from || selectedCase.lead?.departure_airport || "—"}</span></article>
                    <article><strong>{t("admin.common.arrivalAirport")}</strong><span>{selectedCase.route_to || selectedCase.lead?.arrival_airport || "—"}</span></article>
                    <article><strong>{t("admin.common.flightDate")}</strong><span>{formatDate(selectedCase.flight_date)}</span></article>
                    <article><strong>{t("admin.common.airline")}</strong><span>{selectedCase.airline || "—"}</span></article>
                    <article><strong>{t("admin.common.connectionAirport")}</strong><span>{selectedCase.lead?.payload?.connectionCity || selectedCase.lead?.flight_number || "—"}</span></article>
                    <article><strong>{t("admin.common.routeType")}</strong><span>{t("admin.common.notConfigured")}</span></article>
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.caseStatus")}</h4>
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>{t("admin.common.currentStatus")}</strong><span>{translateEnum(t, selectedCase.status)}</span></article>
                    <article><strong>{t("admin.common.owner")}</strong><span>{selectedCase.ownerLabel}</span></article>
                    <article><strong>{t("admin.common.nextAction")}</strong><span>{selectedCase.nextAction}</span></article>
                    <article><strong>{t("admin.common.priority")}</strong><span>{selectedCase.priority ? translateEnum(t, selectedCase.priority) : t("admin.common.notConfigured")}</span></article>
                  </div>

                  <div className="admin-cases-page__workflow-grid">
                    <label>
                      <span>{t("admin.cases.sections.caseStatus")}</span>
                      <select
                        value={selectedCase.status || "draft"}
                        onChange={(event) => updateCase({ status: event.target.value })}
                        disabled={!canManageCaseStatus || isSaving}
                      >
                        {caseStatuses.map((status) => <option key={status} value={status}>{translateEnum(t, status)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>{t("admin.cases.sections.finance")}</span>
                      <select
                        value={selectedCase.payout_status || "not_started"}
                        onChange={(event) => updateCase({ payout_status: event.target.value })}
                        disabled={!canManageCaseStatus || isSaving}
                      >
                        {payoutStatuses.map((status) => <option key={status} value={status}>{translateEnum(t, status)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>{t("admin.common.owner")}</span>
                      <select
                        value={selectedCase.assigned_manager_id || ""}
                        onChange={(event) => updateCase({ assigned_manager_id: event.target.value || null })}
                        disabled={!canManageCaseStatus || isSaving}
                      >
                        <option value="">{t("admin.common.unassigned")}</option>
                        {(moduleData?.managers || []).map((manager) => (
                          <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.finance")}</h4>
                  </div>
                  {financeError ? <p className="admin-message is-error">{financeError}</p> : null}
                  {financeNotice ? <p className="admin-message">{financeNotice}</p> : null}
                  {isFinanceLoading ? <p className="admin-cases-page__empty-copy">{t("admin.common.loading")}</p> : null}
                  <div className="admin-cases-page__finance-flags">
                    <AdminStatusBadge tone={getBooleanTone(internalCompensationConfirmed)}>{t("admin.common.status")}: {normalizeBooleanLabel(internalCompensationConfirmed, t)}</AdminStatusBadge>
                    <AdminStatusBadge tone={getBooleanTone(clientVisibleApproval)}>{t("admin.common.clientVisible")}: {normalizeBooleanLabel(clientVisibleApproval, t)}</AdminStatusBadge>
                    <AdminStatusBadge tone={getPaymentTone(clientPaymentStatus)}>{t("admin.common.clientPayment")}: {translateEnum(t, clientPaymentStatus)}</AdminStatusBadge>
                    {isReferralCase ? (
                      <AdminStatusBadge tone={getPaymentTone(partnerPaymentStatus || "unpaid")}>
                        {t("admin.common.partnerPayment")}: {partnerPaymentStatus ? translateEnum(t, partnerPaymentStatus) : t("admin.common.pending")}
                      </AdminStatusBadge>
                    ) : null}
                  </div>
                  <div className="admin-cases-page__meta-grid">
                    <article><strong>{t("admin.common.compensation")}</strong><span>{formatCurrency(caseCompensationAmount, undefined, t)}</span></article>
                    <article><strong>{t("admin.common.revenue")}</strong><span>{formatCurrency(financeRevenueAmount, undefined, t)}</span></article>
                    <article><strong>{t("admin.common.clientPayout")}</strong><span>{formatCurrency(financeClientPayoutAmount, undefined, t)}</span></article>
                    <article><strong>{t("admin.common.flow")}</strong><span>{formatPaymentFlow(selectedCaseFinanceState.clientPayment?.paymentFlowType || "through_company", t)}</span></article>
                    <article><strong>{t("admin.common.status")}</strong><span>{normalizeBooleanLabel(internalCompensationConfirmed, t)}</span></article>
                    <article><strong>{t("admin.common.clientVisible")}</strong><span>{normalizeBooleanLabel(clientVisibleApproval, t)}</span></article>
                    <article><strong>{t("admin.common.clientPayment")}</strong><span>{translateEnum(t, clientPaymentStatus)}</span></article>
                    <article><strong>{t("admin.common.paymentReference")}</strong><span>{selectedCaseFinanceState.clientPayment?.paymentReference || "—"}</span></article>
                    {isReferralCase ? (
                      <article><strong>{t("admin.common.partnerCommission")}</strong><span>{partnerCommissionAmount ? `${formatCurrency(partnerCommissionAmount, undefined, t)}${partnerRate ? ` • ${(partnerRate * 100).toFixed(0)}%` : ""}` : t("admin.common.pending")}</span></article>
                    ) : null}
                    {isReferralCase ? (
                      <article><strong>{t("admin.common.partnerPayment")}</strong><span>{selectedCaseFinanceState.partnerPayment?.id ? translateEnum(t, partnerPaymentStatus || "unpaid") : t("admin.common.noPartnerPayoutYet")}</span></article>
                    ) : null}
                  </div>
                  <div className="admin-cases-page__finance-actions">
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={() => runFinanceAction(
                        internalCompensationConfirmed ? "unconfirm-compensation" : "confirm-compensation",
                        () => markInternalCompensationConfirmed(selectedCase.id, !internalCompensationConfirmed),
                        internalCompensationConfirmed ? "Internal compensation removed." : "Compensation confirmed.",
                      )}
                      disabled={!canManageFinance || activeFinanceAction !== ""}
                    >
                      {activeFinanceAction === "confirm-compensation" || activeFinanceAction === "unconfirm-compensation"
                        ? "Saving..."
                        : internalCompensationConfirmed ? "Unconfirm" : "Confirm compensation"}
                    </button>
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={() => runFinanceAction(
                        clientVisibleApproval ? "hide-client-approval" : "show-client-approval",
                        () => setClientVisibleApproval(selectedCase.id, !clientVisibleApproval),
                        clientVisibleApproval ? "Client approval hidden." : "Client approval enabled.",
                      )}
                      disabled={!canManageFinance || activeFinanceAction !== ""}
                    >
                      {activeFinanceAction === "show-client-approval" || activeFinanceAction === "hide-client-approval"
                        ? "Saving..."
                        : clientVisibleApproval ? "Hide from client" : "Show approval to client"}
                    </button>
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={() => runFinanceAction(
                        clientPaymentStatus === "paid" ? "mark-client-unpaid" : "mark-client-paid",
                        () => (clientPaymentStatus === "paid"
                          ? markClientPaymentUnpaid(selectedCase.id)
                          : markClientPaymentPaid(selectedCase.id)),
                        clientPaymentStatus === "paid" ? "Client payment marked unpaid." : "Client payment marked paid.",
                      )}
                      disabled={!canManageFinance || activeFinanceAction !== "" || !internalCompensationConfirmed || !(selectedCase.finance || selectedCaseFinanceState.clientPayment)}
                    >
                      {activeFinanceAction === "mark-client-paid" || activeFinanceAction === "mark-client-unpaid"
                        ? "Saving..."
                        : clientPaymentStatus === "paid" ? "Mark unpaid" : "Mark client paid"}
                    </button>
                    {isReferralCase && selectedCaseFinanceState.partnerPayment?.id ? (
                      <button
                        type="button"
                        className="admin-link-button"
                        onClick={() => runFinanceAction(
                          partnerPaymentStatus === "paid" ? "mark-partner-unpaid" : "mark-partner-paid",
                          () => (partnerPaymentStatus === "paid"
                            ? markPartnerPaymentUnpaid(selectedCaseFinanceState.partnerPayment.id)
                            : markPartnerPaymentPaid(selectedCaseFinanceState.partnerPayment.id)),
                          partnerPaymentStatus === "paid" ? "Partner payment marked unpaid." : "Partner payment marked paid.",
                        )}
                        disabled={!canManageFinance || activeFinanceAction !== ""}
                      >
                        {activeFinanceAction === "mark-partner-paid" || activeFinanceAction === "mark-partner-unpaid"
                          ? "Saving..."
                          : partnerPaymentStatus === "paid" ? "Mark unpaid" : "Mark partner paid"}
                      </button>
                    ) : null}
                  </div>
                  {isReferralCase && !selectedCaseFinanceState.partnerPayment?.id ? (
                    <p className="admin-cases-page__empty-copy">{t("admin.common.noPartnerPayoutYet")}</p>
                  ) : null}
                  <div className="admin-cases-page__finance-edit-grid">
                    <label>
                      <span>Client reference</span>
                      <input
                        type="text"
                        value={clientPaymentForm.paymentReference}
                        onChange={(event) => setClientPaymentForm((current) => ({ ...current, paymentReference: event.target.value }))}
                        disabled={!canManageFinance || activeFinanceAction !== ""}
                        placeholder="Transaction or bank ref"
                      />
                    </label>
                    <label>
                      <span>Payment flow</span>
                      <select
                        value={clientPaymentForm.paymentFlowType}
                        onChange={(event) => setClientPaymentForm((current) => ({ ...current, paymentFlowType: event.target.value }))}
                        disabled={!canManageFinance || activeFinanceAction !== ""}
                      >
                        <option value="through_company">Through company</option>
                        <option value="direct_to_client">Direct to client</option>
                      </select>
                    </label>
                    <label className="admin-cases-page__finance-edit-grid--full">
                      <span>Internal note</span>
                      <textarea
                        value={clientPaymentForm.internalNote}
                        onChange={(event) => setClientPaymentForm((current) => ({ ...current, internalNote: event.target.value }))}
                        disabled={!canManageFinance || activeFinanceAction !== ""}
                        placeholder="Internal finance note"
                      />
                    </label>
                    <div className="admin-cases-page__finance-edit-actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => runFinanceAction(
                          "save-client-payment-details",
                          () => updateClientPayment(selectedCase.id, {
                            client_payment_reference: clientPaymentForm.paymentReference,
                            client_payment_flow_type: clientPaymentForm.paymentFlowType,
                            internal_note: clientPaymentForm.internalNote,
                          }),
                          "Client payment details updated.",
                        )}
                        disabled={!canManageFinance || activeFinanceAction !== ""}
                      >
                        {activeFinanceAction === "save-client-payment-details" ? "Saving..." : "Save client payment"}
                      </button>
                    </div>
                  </div>
                  {selectedCaseFinanceState.partnerPayment?.id ? (
                    <div className="admin-cases-page__finance-edit-grid">
                      <label>
                        <span>Partner reference</span>
                        <input
                          type="text"
                          value={partnerPaymentForm.paymentReference}
                          onChange={(event) => setPartnerPaymentForm((current) => ({ ...current, paymentReference: event.target.value }))}
                          disabled={!canManageFinance || activeFinanceAction !== ""}
                          placeholder="Partner payout ref"
                        />
                      </label>
                      <label className="admin-cases-page__finance-edit-grid--full">
                        <span>Partner note</span>
                        <textarea
                          value={partnerPaymentForm.internalNote}
                          onChange={(event) => setPartnerPaymentForm((current) => ({ ...current, internalNote: event.target.value }))}
                          disabled={!canManageFinance || activeFinanceAction !== ""}
                          placeholder="Internal partner payout note"
                        />
                      </label>
                      <div className="admin-cases-page__finance-edit-actions">
                        <button
                          type="button"
                          className="btn btn--secondary"
                          onClick={() => runFinanceAction(
                            "save-partner-payment-details",
                            () => updatePartnerPayment(selectedCaseFinanceState.partnerPayment.id, {
                              payment_reference: partnerPaymentForm.paymentReference,
                              note: partnerPaymentForm.internalNote,
                            }),
                            "Partner payment details updated.",
                          )}
                          disabled={!canManageFinance || activeFinanceAction !== ""}
                        >
                          {activeFinanceAction === "save-partner-payment-details" ? "Saving..." : "Save partner payment"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {selectedCase.lead ? (
                    <div className="admin-cases-page__finance-tags">
                      <AdminStatusBadge tone={getEstimateTone(selectedCase.lead.estimate_status)}>{formatEstimateStatus(selectedCase.lead.estimate_status, t)}</AdminStatusBadge>
                    </div>
                  ) : null}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.documents")}</h4>
                  </div>
                  {selectedDocuments.length ? (
                    <div className="admin-cases-page__timeline">
                      {selectedDocuments.map((item) => (
                        <article key={item.id}>
                          <div>
                            <strong>{item.file_name || item.document_type || "Case document"}</strong>
                            <p>{item.document_type || "—"} • {translateEnum(t, item.status || "uploaded")} • {formatDateTime(item.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            className="admin-link-button"
                            onClick={() => downloadDocument(item)}
                            disabled={!item.file_path || activeDownloadId === item.id}
                            title={item.file_path ? t("admin.leads.openDocumentTitle") : t("admin.leads.documentPreviewUnavailable")}
                          >
                            {activeDownloadId === item.id ? t("admin.common.opening") : t("admin.common.open")}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">{t("admin.leads.noDocuments")}</p>
                  )}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.communications")}</h4>
                  </div>
                  {selectedCommunications.length ? (
                    <div className="admin-cases-page__timeline">
                      {selectedCommunications.map((item) => (
                        <article key={item.id}>
                          <div>
                            <strong>{translateEnum(t, item.channel || "message")} • {formatDateTime(item.created_at)}</strong>
                            <p>{item.subject || item.body || t("admin.common.noData")}</p>
                          </div>
                          <span className="admin-cases-page__signature-summary">{translateEnum(t, item.direction || "internal")}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">{t("admin.revenue.noData")}</p>
                  )}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.tasks")}</h4>
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={openTaskModal}
                      disabled={!hasPermission("tasks.edit") || isCreatingTask}
                    >
                      <Plus size={14} />
                      <span>{t("admin.cases.createTask")}</span>
                    </button>
                  </div>
                  {selectedTasks.length ? (
                    <div className="admin-cases-page__timeline">
                      {selectedTasks.map((task) => {
                        const assignee = managerById.get(task.assigned_user_id);
                        return (
                          <article key={task.id}>
                            <div>
                              <strong>{task.title || t("admin.cases.createTask")}</strong>
                              <p>
                                {assignee?.full_name || assignee?.email || t("admin.common.unassigned")}
                                {" • "}
                                {task.due_date ? `${formatDate(task.due_date)}` : t("admin.common.notConfigured")}
                              </p>
                            </div>
                            <div className="admin-cases-page__task-meta">
                              <AdminStatusBadge tone={getTaskStatusTone(task.status)}>{translateEnum(t, task.status)}</AdminStatusBadge>
                              <AdminStatusBadge tone={getPriorityTone(task.priority)}>{translateEnum(t, task.priority || "medium")}</AdminStatusBadge>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">{t("admin.revenue.noData")}</p>
                  )}
                </section>

                <section className="admin-cases-page__section">
                  <div className="admin-cases-page__section-title">
                    <h4>{t("admin.cases.sections.timeline")}</h4>
                  </div>
                  {internalNotes.length || selectedStatusHistory.length ? (
                    <div className="admin-cases-page__timeline">
                      {internalNotes.map((note, index) => (
                        <article key={`note-${index}`}>
                          <div>
                            <strong>{t("admin.common.internalNote")}</strong>
                            <p>{note}</p>
                          </div>
                        </article>
                      ))}
                      {selectedStatusHistory.map((item) => (
                        <article key={item.id}>
                          <div>
                            <strong>{translateEnum(t, item.previous_status || "unknown")} → {translateEnum(t, item.next_status || "unknown")}</strong>
                            <p>{item.note || t("admin.common.noNote")} • {formatDateTime(item.created_at)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-cases-page__empty-copy">{t("admin.revenue.noData")}</p>
                  )}
                </section>
              </div>
            </div>
          )}
        </AdminSidePanel>
      </section>

      {taskModalOpen && selectedCase ? (
        <div className="admin-cases-page__task-modal-layer" role="presentation">
          <button type="button" className="admin-cases-page__task-modal-backdrop" onClick={closeTaskModal} aria-label="Close task creator" />
          <section className="admin-cases-page__task-modal" role="dialog" aria-modal="true" aria-labelledby="case-task-modal-title">
            <header className="admin-cases-page__task-modal-header">
              <div>
                <span className="admin-cases-page__eyebrow">Task</span>
                <h3 id="case-task-modal-title">{t("admin.cases.createTask")} · {formatCaseReference(selectedCase, t)}</h3>
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
                  <option value="">{t("admin.common.unassigned")}</option>
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
                      <option key={priority} value={priority}>{translateEnum(t, priority)}</option>
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
                  <span>{isCreatingTask ? t("admin.common.saving") : t("admin.cases.createTask")}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
