import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, FilterX, LoaderCircle, Minus, Plus, RefreshCw, RotateCcw, UserRoundPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  assignLeadOwner,
  convertLeadToCase,
  createLeadNote,
  fetchLeadsModuleData,
  getDocumentDownloadUrl,
  logAdminActivity,
  updateLeadStatus,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AdminFilterBar,
  AdminColumnTable,
  AdminMetricsStrip,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import {
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
  formatFinanceRoute,
} from "../../lib/adminFinanceFormatters.js";
import "./style.scss";

const leadStatuses = ["new", "submitted", "not_eligible", "converted", "archived"];
const MIN_DOCUMENT_ZOOM = 0.5;
const MAX_DOCUMENT_ZOOM = 3;
const DOCUMENT_ZOOM_STEP = 0.25;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDateTime(value) {
  return formatFinanceDateTimeLabel(value);
}

function formatDate(value) {
  return formatFinanceDateParts(value).date;
}

function formatLeadReference(lead) {
  if (lead?.lead_code) return lead.lead_code;
  if (lead?.payload?.claimCode) return lead.payload.claimCode;
  if (lead?.id) return `Lead ${String(lead.id).slice(0, 8)}`;
  return "Lead";
}

function getFileExtension(name) {
  const value = String(name || "").toLowerCase();
  const parts = value.split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function isImageDocument(item) {
  if (!item) return false;
  const mime = String(item.mime_type || "").toLowerCase();
  const ext = getFileExtension(item.file_name);
  return mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
}

function isPdfDocument(item) {
  if (!item) return false;
  const mime = String(item.mime_type || "").toLowerCase();
  const ext = getFileExtension(item.file_name);
  return mime.includes("pdf") || ext === "pdf";
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

function formatCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "—";
  return `Up to €${Number(value || 0).toFixed(0)}${currency && currency !== "EUR" ? ` ${currency}` : ""}`;
}

function extractReasonCodes(explanation) {
  if (!explanation || typeof explanation !== "object") return [];
  return Array.isArray(explanation.reason_codes) ? explanation.reason_codes.filter(Boolean) : [];
}

function formatDisruption(lead) {
  return lead.disruption_type || lead.issue_type || "—";
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

function getEstimateTone(status) {
  if (status === "calculated") return "success";
  if (status === "pending_review") return "warning";
  if (status === "manual_override") return "warning";
  return "neutral";
}

function getLeadStatusTone(status) {
  if (status === "converted") return "success";
  if (status === "not_eligible" || status === "archived") return "danger";
  if (status === "submitted") return "info";
  return "neutral";
}

function getStageTone(stage) {
  if (stage === "approved") return "success";
  if (stage === "denied") return "danger";
  if (stage === "documents" || stage === "finish") return "warning";
  if (stage === "submitted") return "info";
  return "neutral";
}

function formatRouteLabel(lead) {
  return formatFinanceRoute(`${lead?.departure_airport || "—"} → ${lead?.arrival_airport || "—"}`);
}

function formatOwnerLabel(lead, users = []) {
  return users.find((user) => user.id === lead?.assigned_user_id)?.full_name || users.find((user) => user.id === lead?.assigned_user_id)?.email || "Unassigned";
}

function formatDirectLabel(value, t = null) {
  if (value === true) return t ? t("admin.leads.routeType.direct") : "Direct flight";
  if (value === false) return t ? t("admin.leads.routeType.connecting") : "Connecting flight";
  return "—";
}

function getReferralBadgeLabel(lead) {
  const referralCode = String(lead?.source_details?.referral_code || "").trim();
  const partnerLabel = String(lead?.source_details?.referral_partner || "").trim();

  if (!lead?.referral_partner_id && !referralCode && !partnerLabel) {
    return "";
  }

  return `Referral${partnerLabel || referralCode ? ` · ${partnerLabel || referralCode}` : ""}`;
}

function downloadCsv(rows) {
  const headers = [
    "Lead Code",
    "Status",
    "Stage",
    "Source",
    "Name",
    "Email",
    "Phone",
    "Airline",
    "Route From",
    "Route To",
    "Created At",
  ];
  const lines = rows.map((lead) => [
    lead.lead_code,
    lead.status,
    lead.stage,
    lead.source,
    lead.full_name,
    lead.email,
    lead.phone,
    lead.airline,
    lead.departure_airport,
    lead.arrival_airport,
    lead.created_at,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminLeads() {
  const { t } = useTranslation();
  const { hasPermission, hasAnyPermission } = useAdminAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [disruptionFilter, setDisruptionFilter] = useState("all");
  const [estimateStatusFilter, setEstimateStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeDownloadId, setActiveDownloadId] = useState("");
  const [documentPreview, setDocumentPreview] = useState({
    item: null,
    url: "",
    isLoading: false,
    error: "",
    zoom: 1,
  });
  const lastViewedLeadIdRef = useRef("");

  const loadLeads = async (options = {}) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchLeadsModuleData({ force: options.force });
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || t("admin.leads.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
  }, [t]);

  useEffect(() => {
    const deepLinkedLeadId = searchParams.get("lead");
    if (deepLinkedLeadId) {
      setSelectedLeadId(deepLinkedLeadId);
      setPreviewOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!documentPreview.item) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDocumentPreview({ item: null, url: "", isLoading: false, error: "", zoom: 1 });
      }
    };

    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [documentPreview.item]);

  const disruptionOptions = useMemo(() => {
    const values = Array.from(new Set((moduleData?.leads || []).map((lead) => formatDisruption(lead)).filter(Boolean)));
    return values.sort((left, right) => String(left).localeCompare(String(right)));
  }, [moduleData?.leads]);

  const filteredLeads = useMemo(() => {
    const leads = moduleData?.leads || [];
    const query = search.trim().toLowerCase();
    const fromMs = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
    const toMs = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : null;

    return leads.filter((lead) => {
      const matchesSearch = !query || [
        lead.lead_code,
        lead.full_name,
        lead.email,
        lead.phone,
        lead.airline,
        lead.departure_airport,
        lead.arrival_airport,
        formatRouteLabel(lead),
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesDisruption = disruptionFilter === "all" || formatDisruption(lead) === disruptionFilter;
      const matchesEstimate = estimateStatusFilter === "all" || (lead.estimate_status || "pending_review") === estimateStatusFilter;
      const createdAtMs = lead.created_at ? new Date(lead.created_at).getTime() : null;
      const matchesDateFrom = !fromMs || (createdAtMs && createdAtMs >= fromMs);
      const matchesDateTo = !toMs || (createdAtMs && createdAtMs <= toMs);

      return matchesSearch && matchesStatus && matchesDisruption && matchesEstimate && matchesDateFrom && matchesDateTo;
    }).sort((left, right) => {
      const leftTs = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTs = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightTs - leftTs;
    });
  }, [dateRange.from, dateRange.to, disruptionFilter, estimateStatusFilter, moduleData?.leads, search, statusFilter]);

  const metrics = useMemo(() => {
    const total = filteredLeads.length;
    const nextLeads = filteredLeads.filter((lead) => lead.status === "new").length;
    const submittedLeads = filteredLeads.filter((lead) => lead.status === "submitted").length;
    const convertedLeads = filteredLeads.filter((lead) => lead.status === "converted").length;
    const pendingEstimate = filteredLeads.filter((lead) => (lead.estimate_status || "pending_review") === "pending_review").length;

    return [
      { label: t("admin.leads.metrics.total"), value: total },
      { label: t("admin.leads.metrics.new"), value: nextLeads },
      { label: t("admin.leads.metrics.submitted"), value: submittedLeads },
      { label: t("admin.leads.metrics.converted"), value: convertedLeads },
      { label: t("admin.leads.metrics.estimatePending"), value: pendingEstimate },
    ];
  }, [filteredLeads, t]);

  const leadColumns = useMemo(() => ([
    {
      key: "lead",
      label: t("admin.common.lead"),
      width: 140,
      minWidth: 110,
      maxWidth: 240,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (lead) => {
        const referralBadgeLabel = getReferralBadgeLabel(lead);

        return (
          <div className="admin-crm-page__primary" title={formatLeadReference(lead)}>
            <strong className="admin-crm-page__code admin-crm-table__cell-main">{formatLeadReference(lead)}</strong>
            {referralBadgeLabel ? (
              <AdminStatusBadge tone="info">{referralBadgeLabel}</AdminStatusBadge>
            ) : (
              <span className="admin-crm-table__cell-sub">{translateEnum(t, lead.source || "direct")}</span>
            )}
          </div>
        );
      },
      getCellTitle: (lead) => formatLeadReference(lead),
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
      renderCell: (lead) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={lead.full_name || "Unknown customer"}>{lead.full_name || "Unknown customer"}</strong>
          <span className="admin-crm-table__cell-sub" title={lead.email || lead.phone || "No contact"}>{lead.email || lead.phone || "No contact"}</span>
        </div>
      ),
      getCellTitle: (lead) => `${lead.full_name || "Unknown customer"}${lead.email ? ` · ${lead.email}` : ""}`,
    },
    {
      key: "route",
      label: t("admin.common.route"),
      width: 280,
      minWidth: 180,
      maxWidth: 480,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (lead) => (
        <div className="admin-crm-page__route">
          <strong className="admin-crm-table__cell-main" title={formatRouteLabel(lead)}>{formatRouteLabel(lead)}</strong>
          <span className="admin-crm-table__cell-sub">{translateEnum(t, formatDisruption(lead))}</span>
        </div>
      ),
      getCellTitle: (lead) => formatRouteLabel(lead),
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
      renderCell: (lead) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={lead.airline || "—"}>{lead.airline || "—"}</strong>
          <span className="admin-crm-table__cell-sub">{formatDate(lead.scheduled_departure_date)}</span>
        </div>
      ),
      getCellTitle: (lead) => `${lead.airline || "—"}${lead.scheduled_departure_date ? ` · ${formatDate(lead.scheduled_departure_date)}` : ""}`,
    },
    {
      key: "status",
      label: t("admin.common.status"),
      width: 160,
      minWidth: 130,
      maxWidth: 260,
      resizable: true,
      reorderable: true,
      wrap: false,
      renderCell: (lead) => (
        <div className="admin-leads-page__table-badges">
          <AdminStatusBadge tone={getLeadStatusTone(lead.status)}>{translateEnum(t, lead.status || "new")}</AdminStatusBadge>
          {lead.stage ? <AdminStatusBadge tone={getStageTone(lead.stage)}>{translateEnum(t, lead.stage)}</AdminStatusBadge> : null}
        </div>
      ),
    },
    {
      key: "estimate",
      label: t("admin.common.estimate"),
      width: 190,
      minWidth: 150,
      maxWidth: 300,
      resizable: true,
      reorderable: true,
      wrap: false,
      renderCell: (lead) => (
        <div className="admin-leads-page__estimate-cell">
          <strong className="admin-crm-table__cell-main">{formatCurrency(lead.estimated_compensation_eur, lead.compensation_currency)}</strong>
          <AdminStatusBadge tone={getEstimateTone(lead.estimate_status)}>{formatEstimateStatus(lead.estimate_status, t)}</AdminStatusBadge>
        </div>
      ),
    },
    {
      key: "created",
      label: t("admin.common.created"),
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (lead) => {
        const created = formatFinanceDateParts(lead.created_at);
        return (
          <div className="admin-crm-page__date">
            <strong className="admin-crm-table__cell-main">{created.date}</strong>
            {created.time ? <span className="admin-crm-table__cell-sub">{created.time}</span> : null}
          </div>
        );
      },
      getCellTitle: (lead) => formatDateTime(lead.created_at),
    },
  ]), [t]);

  const selectedLead = useMemo(
    () => filteredLeads.find((lead) => lead.id === selectedLeadId)
      || moduleData?.leads?.find((lead) => lead.id === selectedLeadId)
      || null,
    [filteredLeads, moduleData?.leads, selectedLeadId],
  );

  const selectedNotes = useMemo(
    () => (moduleData?.notes || []).filter((note) => note.lead_id === selectedLead?.id),
    [moduleData?.notes, selectedLead?.id],
  );

  const selectedHistory = useMemo(
    () => (moduleData?.statusHistory || []).filter((entry) => entry.lead_id === selectedLead?.id),
    [moduleData?.statusHistory, selectedLead?.id],
  );

  const selectedDocuments = useMemo(
    () => (moduleData?.documents || []).filter((entry) => entry.lead_id === selectedLead?.id),
    [moduleData?.documents, selectedLead?.id],
  );

  const selectedSignatures = useMemo(
    () => (moduleData?.signatures || []).filter((entry) => entry.lead_id === selectedLead?.id),
    [moduleData?.signatures, selectedLead?.id],
  );
  const canConvertLeadToCase = hasAnyPermission(["leads.edit", "cases.edit"]);
  const canManageLeadStatus = hasPermission("leads.edit");
  const canAssignLeadOwner = hasPermission("leads.assign");

  useEffect(() => {
    if (!selectedLead?.id || isLoading || lastViewedLeadIdRef.current === selectedLead.id) return;
    lastViewedLeadIdRef.current = selectedLead.id;
    void logAdminActivity("view_lead", "lead", selectedLead.id, {
      module: "leads",
      lead_code: selectedLead.lead_code || null,
      status: selectedLead.status || null,
      stage: selectedLead.stage || null,
    });
  }, [isLoading, selectedLead]);

  const saveStatus = async (leadId, status) => {
    setIsSaving(true);
    setError("");
    try {
      await updateLeadStatus(leadId, status);
      await loadLeads({ force: true });
    } catch (nextError) {
      setError(nextError.message || t("admin.leads.statusSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const saveOwner = async (leadId, assignedUserId) => {
    setIsSaving(true);
    setError("");
    try {
      await assignLeadOwner(leadId, assignedUserId);
      await loadLeads({ force: true });
    } catch (nextError) {
      setError(nextError.message || t("admin.leads.ownerSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const submitNote = async () => {
    if (!selectedLead || !noteDraft.trim()) return;
    setIsSaving(true);
    setError("");
    try {
      await createLeadNote(selectedLead.id, noteDraft.trim());
      setNoteDraft("");
      await loadLeads({ force: true });
    } catch (nextError) {
      setError(nextError.message || t("admin.leads.noteSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvertToCase = async () => {
    if (!selectedLead) return;
    if (selectedLead.status === "converted") {
      navigate(`/admin/cases?lead=${selectedLead.id}`);
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const result = await convertLeadToCase(selectedLead.id);
      await loadLeads({ force: true });
      setPreviewOpen(false);
      navigate(`/admin/cases?case=${result.caseId}`);
    } catch (nextError) {
      setError(nextError.message || t("admin.leads.convertError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenLead = (leadId) => {
    setDocumentPreview({ item: null, url: "", isLoading: false, error: "", zoom: 1 });
    setSelectedLeadId(leadId);
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setDocumentPreview({ item: null, url: "", isLoading: false, error: "", zoom: 1 });
    setPreviewOpen(false);
    setSelectedLeadId(null);
  };

  const handleCloseDocumentPreview = () => {
    setDocumentPreview({ item: null, url: "", isLoading: false, error: "", zoom: 1 });
  };

  const downloadDocumentFile = async (item, sourceUrl = "") => {
    const signedUrl = sourceUrl || await getDocumentDownloadUrl(item);
    try {
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(t("admin.leads.documentOpenError"));
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = item.file_name || "document";
      link.rel = "noopener";
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = window.document.createElement("a");
      link.href = signedUrl;
      link.download = item.file_name || "document";
      link.rel = "noopener";
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    }

    return signedUrl;
  };

  const handleOpenDocumentPreview = async (item) => {
    if (!item?.file_path) return;
    setError("");
    setDocumentPreview({
      item,
      url: "",
      isLoading: true,
      error: "",
      zoom: 1,
    });

    try {
      const url = await getDocumentDownloadUrl(item);
      setDocumentPreview((current) => (
        current.item?.id === item.id
          ? { ...current, url, isLoading: false, error: "" }
          : current
      ));
    } catch (nextError) {
      const message = nextError.message || t("admin.leads.documentOpenError");
      setDocumentPreview((current) => (
        current.item?.id === item.id
          ? { ...current, isLoading: false, error: message }
          : current
      ));
      setError(message);
    }
  };

  const handleSaveDocument = async (item, sourceUrl = "") => {
    if (!item?.file_path) return;
    setError("");
    setActiveDownloadId(item.id);

    try {
      const resolvedUrl = await downloadDocumentFile(item, sourceUrl);
      setDocumentPreview((current) => (
        current.item?.id === item.id && !current.url
          ? { ...current, url: resolvedUrl }
          : current
      ));
    } catch (nextError) {
      setError(nextError.message || t("admin.leads.documentOpenError"));
    } finally {
      setActiveDownloadId("");
    }
  };

  const handleOpenDocumentInNewTab = () => {
    if (!documentPreview.url) return;
    window.open(documentPreview.url, "_blank", "noopener,noreferrer");
  };

  const handleDocumentZoomIn = () => {
    setDocumentPreview((current) => ({ ...current, zoom: clamp(current.zoom + DOCUMENT_ZOOM_STEP, MIN_DOCUMENT_ZOOM, MAX_DOCUMENT_ZOOM) }));
  };

  const handleDocumentZoomOut = () => {
    setDocumentPreview((current) => ({ ...current, zoom: clamp(current.zoom - DOCUMENT_ZOOM_STEP, MIN_DOCUMENT_ZOOM, MAX_DOCUMENT_ZOOM) }));
  };

  const handleDocumentZoomReset = () => {
    setDocumentPreview((current) => ({ ...current, zoom: 1 }));
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDisruptionFilter("all");
    setEstimateStatusFilter("all");
    setDateRange({ from: "", to: "" });
  };

  const countLabel = t("admin.leads.countLabel", { count: filteredLeads.length });
  const previewedDocument = documentPreview.item;
  const previewIsImage = isImageDocument(previewedDocument);
  const previewIsPdf = isPdfDocument(previewedDocument);
  const previewZoomLabel = `${Math.round(documentPreview.zoom * 100)}%`;

  return (
    <div className="admin-page admin-leads-page admin-crm-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsCoreSchemaV1 ? (
        <p className="admin-message">
          Core Operations schema V1 is not fully applied yet. Lead assignment and extended fields will unlock after running
          `006_core_operations_schema_v1.sql`.
        </p>
      ) : null}

      <AdminPageHeader
        title={t("admin.nav.pages.operationsLeads")}
        secondaryActions={[
          {
            label: t("admin.common.refresh"),
            icon: RefreshCw,
            onClick: () => void loadLeads({ force: true }),
            disabled: isLoading || isSaving,
          },
          {
            label: t("admin.common.exportCsv"),
            icon: Download,
            onClick: () => downloadCsv(filteredLeads),
            disabled: !filteredLeads.length,
          },
        ]}
      />

      <section className="admin-crm-page__workspace">
        <AdminMetricsStrip items={metrics} />

        <AdminFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("admin.leads.searchPlaceholder")}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={[
            { value: "all", label: t("admin.leads.filters.allStatuses") },
            ...leadStatuses.map((status) => ({ value: status, label: translateEnum(t, status) })),
          ]}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        >
          <select className="admin-filter-control admin-select" value={disruptionFilter} onChange={(event) => setDisruptionFilter(event.target.value)}>
            <option value="all">{t("admin.leads.filters.allDisruptionTypes")}</option>
            {disruptionOptions.map((value) => (
              <option key={value} value={value}>{translateEnum(t, value)}</option>
            ))}
          </select>

          <select className="admin-filter-control admin-select" value={estimateStatusFilter} onChange={(event) => setEstimateStatusFilter(event.target.value)}>
            <option value="all">{t("admin.leads.filters.allEstimateStates")}</option>
            <option value="calculated">{t("admin.leads.estimate.calculated")}</option>
            <option value="pending_review">{t("admin.leads.estimate.pendingReview")}</option>
            <option value="manual_override">{t("admin.leads.estimate.manualOverride")}</option>
          </select>

          <button type="button" className="admin-btn admin-btn-secondary admin-crm-page__clear" onClick={clearFilters}>
            <FilterX size={15} />
            <span>{t("admin.common.clearFilters")}</span>
          </button>
        </AdminFilterBar>

        <AdminColumnTable
          storageKey="ff-admin-table-layout-leads"
          title={t("admin.nav.pages.operationsLeads")}
          countLabel={countLabel}
          columns={leadColumns}
          rows={filteredLeads}
          loading={isLoading}
          error={error}
          emptyTitle={t("admin.leads.emptyTitle")}
          emptyDetail={t("admin.leads.emptyDetail")}
          selectedRowId={selectedLead?.id || ""}
          getRowKey={(lead) => lead.id}
          onRowClick={(lead) => handleOpenLead(lead.id)}
        />

        <AdminSidePanel
          open={Boolean(selectedLead && previewOpen)}
          eyebrow={t("admin.leads.previewEyebrow")}
          title={selectedLead ? formatLeadReference(selectedLead) : t("admin.leads.previewTitle")}
          subtitle={selectedLead ? `${selectedLead.full_name || t("admin.common.unknownCustomer")} • ${formatDateTime(selectedLead.created_at)}` : ""}
          onClose={handleClosePreview}
          className="admin-leads-page__preview"
          withOverlay
          overlayClassName="admin-leads-page__overlay"
          overlayLabel={t("admin.leads.closePreview")}
        >
          {!selectedLead ? (
            <div className="admin-leads-page__empty-preview">
              <strong>{t("admin.leads.selectLeadTitle")}</strong>
              <p>{t("admin.leads.selectLeadDescription")}</p>
            </div>
          ) : (
            <div className="admin-leads-page__preview-inner">
              <div className="admin-leads-page__preview-actions admin-leads-page__preview-actions--body">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={handleConvertToCase}
                  disabled={!canConvertLeadToCase || isSaving}
                >
                  <UserRoundPlus size={15} />
                  <span>{selectedLead.status === "converted" ? t("admin.leads.openCase") : t("admin.leads.convertToCase")}</span>
                </button>
              </div>
              <div className="admin-leads-page__preview-scroll">
                <section className="admin-leads-page__identity">
                  <div>
                    <h4>{selectedLead.full_name || t("admin.common.unknownCustomer")}</h4>
                    <p>{selectedLead.email || t("admin.common.noEmail")}{selectedLead.phone ? ` • ${selectedLead.phone}` : ""}</p>
                  </div>
                  <div className="admin-leads-page__claim-state">
                    <AdminStatusBadge tone={getLeadStatusTone(selectedLead.status)}>{translateEnum(t, selectedLead.status || "new")}</AdminStatusBadge>
                    {selectedLead.stage ? <AdminStatusBadge tone={getStageTone(selectedLead.stage)}>{translateEnum(t, selectedLead.stage)}</AdminStatusBadge> : null}
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.customer")}</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>{t("admin.preferences.fullName")}</strong><span>{selectedLead.full_name || "—"}</span></article>
                    <article><strong>{t("admin.common.email")}</strong><span>{selectedLead.email || "—"}</span></article>
                    <article><strong>{t("admin.common.phone")}</strong><span>{selectedLead.phone || "—"}</span></article>
                    <article><strong>{t("admin.common.preferredLanguage")}</strong><span>{selectedLead.preferred_language || "—"}</span></article>
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.routeFlight")}</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>{t("admin.common.departureAirport")}</strong><span>{selectedLead.departure_airport || "—"}</span></article>
                    <article><strong>{t("admin.common.arrivalAirport")}</strong><span>{selectedLead.arrival_airport || "—"}</span></article>
                    <article><strong>{t("admin.common.flightDate")}</strong><span>{formatDate(selectedLead.scheduled_departure_date)}</span></article>
                    <article><strong>{t("admin.common.airline")}</strong><span>{selectedLead.airline || "—"}</span></article>
                    <article><strong>{t("admin.common.connectionAirport")}</strong><span>{selectedLead.payload?.connectionCity || selectedLead.flight_number || "—"}</span></article>
                    <article><strong>{t("admin.common.routeType")}</strong><span>{formatDirectLabel(selectedLead.is_direct, t)}</span></article>
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.disruption")}</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>{t("admin.common.disruptionType")}</strong><span>{translateEnum(t, formatDisruption(selectedLead))}</span></article>
                    <article><strong>{t("admin.common.delayDuration")}</strong><span>{selectedLead.delay_duration || "—"}</span></article>
                    <article><strong>{t("admin.common.cancellationDenied")}</strong><span>{selectedLead.reason || selectedLead.payload?.denialReason || "—"}</span></article>
                    <article><strong>{t("admin.common.notes")}</strong><span>{selectedLead.payload?.notes || selectedLead.payload?.description || "—"}</span></article>
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.compensationEstimate")}</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>{t("admin.common.estimatedCompensation")}</strong><span>{formatCurrency(selectedLead.estimated_compensation_eur, selectedLead.compensation_currency)}</span></article>
                    <article><strong>{t("admin.common.distance")}</strong><span>{selectedLead.distance_km ? `${Math.round(Number(selectedLead.distance_km))} km` : "—"}</span></article>
                    <article><strong>{t("admin.common.distanceBand")}</strong><span>{formatDistanceBand(selectedLead.distance_band, t)}</span></article>
                    <article><strong>{t("admin.common.estimateStatus")}</strong><span>{formatEstimateStatus(selectedLead.estimate_status, t)}</span></article>
                  </div>
                  {extractReasonCodes(selectedLead.estimate_explanation).length ? (
                    <div className="admin-leads__reason-codes">
                      {extractReasonCodes(selectedLead.estimate_explanation).map((code) => (
                        <span key={code}>{code}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-leads-page__empty-copy">{t("admin.leads.estimate.pendingReview")}</p>
                  )}
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.documents")}</h4>
                  </div>
                  {selectedDocuments.length ? (
                    <div className="admin-leads-page__timeline">
                      {selectedDocuments.map((document) => (
                        <article key={document.id}>
                          <div>
                            <strong>{document.file_name || document.document_type || "Lead document"}</strong>
                            <p>{document.document_type || "—"} • {formatDateTime(document.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            className="admin-link-button"
                            onClick={() => handleOpenDocumentPreview(document)}
                            disabled={!document.file_path}
                            title={document.file_path ? t("admin.leads.openDocumentTitle") : t("admin.leads.documentPreviewUnavailable")}
                          >
                            {t("admin.common.open")}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-leads-page__empty-copy">{t("admin.leads.noDocuments")}</p>
                  )}
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.signatureConsent")}</h4>
                  </div>
                  {selectedSignatures.length ? (
                    <div className="admin-leads-page__timeline">
                      {selectedSignatures.map((signature) => (
                        <article key={signature.id}>
                          <div>
                            <strong>{signature.signer_name || signature.signer_email || t("admin.common.signature")}</strong>
                            <p>{signature.terms_accepted ? t("admin.common.signed") : t("admin.common.pending")} • {formatDateTime(signature.signed_at || signature.created_at)}</p>
                          </div>
                          <span className="admin-leads-page__signature-summary">{signature.terms_accepted ? t("admin.common.consentRecorded") : t("admin.common.awaitingSignature")}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-leads-page__empty-copy">{t("admin.leads.noSignatures")}</p>
                  )}
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>{t("admin.leads.sections.internalWorkflow")}</h4>
                  </div>
                  <div className="admin-leads-page__workflow-grid">
                    <label>
                      <span>{t("admin.common.status")}</span>
                      <select
                        value={selectedLead.status || "new"}
                        onChange={(event) => saveStatus(selectedLead.id, event.target.value)}
                        disabled={!canManageLeadStatus || isSaving}
                      >
                        {leadStatuses.map((status) => <option key={status} value={status}>{translateEnum(t, status)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>{t("admin.common.owner")}</span>
                      <select
                        value={selectedLead.assigned_user_id || ""}
                        onChange={(event) => saveOwner(selectedLead.id, event.target.value)}
                        disabled={!canAssignLeadOwner || !moduleData?.supportsCoreSchemaV1 || isSaving}
                      >
                        <option value="">{t("admin.common.unassigned")}</option>
                        {(moduleData?.assignableUsers || []).map((user) => (
                          <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="admin-leads-page__workflow-actions">
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled={!moduleData?.supportsCoreSchemaV1}
                      title={t("admin.leads.ownerAssignUnavailable")}
                    >
                      {t("admin.leads.assignOwner")}
                    </button>
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled
                      title={t("admin.leads.markNeedsDocumentsUnavailable")}
                    >
                      {t("admin.leads.markNeedsDocuments")}
                    </button>
                  </div>

                  <div className="admin-leads-page__notes">
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder={t("admin.leads.addInternalNote")}
                      disabled={!moduleData?.supportsNotes}
                    />
                    <div className="admin-leads-page__note-actions">
                      <button className="admin-link-button" type="button" onClick={submitNote} disabled={!moduleData?.supportsNotes || !noteDraft.trim() || isSaving}>
                        {t("admin.leads.saveNote")}
                      </button>
                    </div>
                    {!moduleData?.supportsNotes ? <small>{t("admin.leads.notesUnavailable")}</small> : null}
                  </div>

                  {selectedNotes.length ? (
                    <div className="admin-leads-page__timeline">
                      {selectedNotes.map((note) => (
                        <article key={note.id}>
                          <div>
                            <strong>{formatDateTime(note.created_at)}</strong>
                            <p>{note.body}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {selectedHistory.length ? (
                    <div className="admin-leads-page__timeline">
                      {selectedHistory.map((entry) => (
                        <article key={entry.id}>
                          <div>
                            <strong>{translateEnum(t, entry.previous_status || "unknown")} → {translateEnum(t, entry.next_status || "unknown")}</strong>
                            <p>{entry.note || t("admin.common.noNote")} • {formatDateTime(entry.created_at)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          )}
        </AdminSidePanel>
      </section>

      {previewedDocument ? (
        <div className="admin-leads-page__document-modal-layer" role="presentation">
          <button
            type="button"
            className="admin-leads-page__document-modal-backdrop"
            onClick={handleCloseDocumentPreview}
            aria-label={t("admin.common.close")}
          />
          <section
            className="admin-leads-page__document-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-document-modal-title"
          >
            <header className="admin-leads-page__document-modal-header">
              <div className="admin-leads-page__document-modal-title">
                <h3 id="lead-document-modal-title">{previewedDocument.file_name || previewedDocument.document_type || "Document"}</h3>
                <p>{previewedDocument.document_type || "—"} • {formatDateTime(previewedDocument.created_at)}</p>
              </div>

              <div className="admin-leads-page__document-modal-tools">
                {previewIsImage ? (
                  <>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary admin-link-button"
                      onClick={handleDocumentZoomOut}
                      disabled={documentPreview.isLoading || documentPreview.zoom <= MIN_DOCUMENT_ZOOM}
                      aria-label="Zoom out"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="admin-leads-page__document-modal-zoom">{previewZoomLabel}</span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary admin-link-button"
                      onClick={handleDocumentZoomIn}
                      disabled={documentPreview.isLoading || documentPreview.zoom >= MAX_DOCUMENT_ZOOM}
                      aria-label="Zoom in"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary admin-link-button"
                      onClick={handleDocumentZoomReset}
                      disabled={documentPreview.isLoading || documentPreview.zoom === 1}
                    >
                      <RotateCcw size={14} />
                      <span>{t("common.reset", { defaultValue: "Reset" })}</span>
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-link-button"
                  onClick={() => void handleSaveDocument(previewedDocument, documentPreview.url)}
                  disabled={activeDownloadId === previewedDocument.id || documentPreview.isLoading}
                >
                  {activeDownloadId === previewedDocument.id ? <LoaderCircle size={14} className="is-spinning" /> : <Download size={14} />}
                  <span>{activeDownloadId === previewedDocument.id ? t("admin.common.saving") : "Save"}</span>
                </button>

                {documentPreview.url ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary admin-link-button"
                    onClick={handleOpenDocumentInNewTab}
                  >
                    <ExternalLink size={14} />
                    <span>Open in new tab</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-link-button"
                  onClick={handleCloseDocumentPreview}
                  aria-label={t("admin.common.close")}
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            <div className="admin-leads-page__document-modal-body">
              {documentPreview.isLoading ? (
                <div className="admin-leads-page__document-modal-placeholder">
                  <LoaderCircle size={24} className="is-spinning" />
                  <span>{t("admin.common.loading")}</span>
                </div>
              ) : documentPreview.error ? (
                <div className="admin-leads-page__document-modal-placeholder is-error">
                  <FileText size={24} />
                  <span>{documentPreview.error}</span>
                </div>
              ) : previewIsImage && documentPreview.url ? (
                <div className="admin-leads-page__document-modal-image">
                  <img
                    src={documentPreview.url}
                    alt={previewedDocument.file_name || previewedDocument.document_type || "Document preview"}
                    style={{ transform: `scale(${documentPreview.zoom})` }}
                  />
                </div>
              ) : previewIsPdf && documentPreview.url ? (
                <iframe
                  title={previewedDocument.file_name || previewedDocument.document_type || "Document preview"}
                  src={documentPreview.url}
                  className="admin-leads-page__document-modal-frame"
                />
              ) : documentPreview.url ? (
                <iframe
                  title={previewedDocument.file_name || previewedDocument.document_type || "Document preview"}
                  src={documentPreview.url}
                  className="admin-leads-page__document-modal-frame"
                />
              ) : (
                <div className="admin-leads-page__document-modal-placeholder">
                  <FileText size={24} />
                  <span>{t("admin.leads.documentPreviewUnavailable")}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
