import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FilterX, Search, UserRoundPlus, X } from "lucide-react";
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
import { AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
import "./style.scss";

const leadStatuses = ["new", "submitted", "not_eligible", "converted", "archived"];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatLeadReference(lead) {
  if (lead?.lead_code) return lead.lead_code;
  if (lead?.payload?.claimCode) return lead.payload.claimCode;
  if (lead?.id) return `Lead ${String(lead.id).slice(0, 8)}`;
  return "Lead";
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

function getEstimateTone(status) {
  if (status === "calculated") return "success";
  if (status === "manual_override") return "warning";
  return "neutral";
}

function getLeadStatusTone(status) {
  if (status === "converted") return "success";
  if (status === "not_eligible" || status === "archived") return "danger";
  if (status === "submitted") return "warning";
  return "neutral";
}

function getStageTone(stage) {
  if (stage === "approved") return "success";
  if (stage === "denied") return "danger";
  if (stage === "documents" || stage === "finish") return "warning";
  return "neutral";
}

function formatRouteLabel(lead) {
  return `${lead?.departure_airport || "—"} → ${lead?.arrival_airport || "—"}`;
}

function formatOwnerLabel(lead, users = []) {
  return users.find((user) => user.id === lead?.assigned_user_id)?.full_name || users.find((user) => user.id === lead?.assigned_user_id)?.email || "Unassigned";
}

function formatDirectLabel(value) {
  if (value === true) return "Direct flight";
  if (value === false) return "Connecting flight";
  return "—";
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
  const { hasPermission } = useAdminAuth();
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
  const lastViewedLeadIdRef = useRef("");

  const loadLeads = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchLeadsModuleData();
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load leads module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    const deepLinkedLeadId = searchParams.get("lead");
    if (deepLinkedLeadId) {
      setSelectedLeadId(deepLinkedLeadId);
      setPreviewOpen(true);
    }
  }, [searchParams]);

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
      await loadLeads();
    } catch (nextError) {
      setError(nextError.message || "Could not update lead status.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveOwner = async (leadId, assignedUserId) => {
    setIsSaving(true);
    setError("");
    try {
      await assignLeadOwner(leadId, assignedUserId);
      await loadLeads();
    } catch (nextError) {
      setError(nextError.message || "Could not assign lead owner.");
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
      await loadLeads();
    } catch (nextError) {
      setError(nextError.message || "Could not save lead note.");
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
      await loadLeads();
      setPreviewOpen(false);
      navigate(`/admin/cases?case=${result.caseId}`);
    } catch (nextError) {
      setError(nextError.message || "Could not convert lead to case.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenLead = (leadId) => {
    setSelectedLeadId(leadId);
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setSelectedLeadId(null);
  };

  const handleDownloadDocument = async (document) => {
    if (!document?.file_path) return;
    setError("");
    setActiveDownloadId(document.id);

    try {
      const url = await getDocumentDownloadUrl(document);
      const link = document.createElement("a");
      link.href = url;
      link.download = document.file_name || "document";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (nextError) {
      setError(nextError.message || "Could not open this document.");
    } finally {
      setActiveDownloadId("");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDisruptionFilter("all");
    setEstimateStatusFilter("all");
    setDateRange({ from: "", to: "" });
  };

  const countLabel = `${filteredLeads.length} lead${filteredLeads.length === 1 ? "" : "s"}`;

  return (
    <div className="admin-page admin-leads-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsCoreSchemaV1 ? (
        <p className="admin-message">
          Core Operations schema V1 is not fully applied yet. Lead assignment and extended fields will unlock after running
          `006_core_operations_schema_v1.sql`.
        </p>
      ) : null}

      <section className="admin-leads-page__toolbar">
        <label className="admin-leads-page__search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, email, lead ref, route, airline"
          />
        </label>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {leadStatuses.map((status) => (
            <option key={status} value={status}>{normalizeLabel(status)}</option>
          ))}
        </select>

        <select value={disruptionFilter} onChange={(event) => setDisruptionFilter(event.target.value)}>
          <option value="all">All disruption types</option>
          {disruptionOptions.map((value) => (
            <option key={value} value={value}>{normalizeLabel(value)}</option>
          ))}
        </select>

        <select value={estimateStatusFilter} onChange={(event) => setEstimateStatusFilter(event.target.value)}>
          <option value="all">All estimate states</option>
          <option value="calculated">Calculated</option>
          <option value="pending_review">Pending review</option>
          <option value="manual_override">Manual override</option>
        </select>

        <label className="admin-leads-page__date-field">
          <span>From</span>
          <input type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} />
        </label>

        <label className="admin-leads-page__date-field">
          <span>To</span>
          <input type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} />
        </label>

        <button type="button" className="admin-leads-page__clear" onClick={clearFilters}>
          <FilterX size={15} />
          <span>Clear filters</span>
        </button>

        <button
          type="button"
          className="admin-leads-page__export"
          onClick={() => downloadCsv(filteredLeads)}
          disabled={!filteredLeads.length}
        >
          <Download size={15} />
          <span>Export CSV</span>
        </button>
      </section>

      <section className={`admin-leads-page__workspace${selectedLead ? " has-selection" : ""}${previewOpen ? " is-preview-open" : ""}`}>
        <div className="admin-leads-page__list-pane">
          <header className="admin-leads-page__list-header">
            <div>
              <span className="admin-leads-page__eyebrow">Lead inbox</span>
              <h2>{countLabel}</h2>
            </div>
            <p>Newest leads first.</p>
          </header>

          <div className="admin-leads-page__list-scroll">
            {isLoading ? (
              <div className="admin-leads-page__state">Loading leads...</div>
            ) : !filteredLeads.length ? (
              <div className="admin-leads-page__state">No leads yet</div>
            ) : (
              filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className={`admin-leads-page__lead-row${selectedLead?.id === lead.id ? " is-active" : ""}`}
                  onClick={() => handleOpenLead(lead.id)}
                >
                  <div className="admin-leads-page__lead-main">
                    <div className="admin-leads-page__lead-topline">
                      <strong>{formatLeadReference(lead)}</strong>
                      <span>{formatDateTime(lead.created_at)}</span>
                    </div>

                    <div className="admin-leads-page__lead-customer">
                      <span>{lead.full_name || "Unknown customer"}</span>
                      <small>{lead.email || "No email"}</small>
                    </div>

                    <div className="admin-leads-page__lead-route">
                      <span>{formatRouteLabel(lead)}</span>
                      <small>{lead.airline || "No airline"}{lead.scheduled_departure_date ? ` • ${formatDate(lead.scheduled_departure_date)}` : ""}</small>
                    </div>
                  </div>

                  <div className="admin-leads-page__lead-side">
                    <div className="admin-leads-page__lead-badges">
                      <AdminStatusBadge tone={getLeadStatusTone(lead.status)}>{normalizeLabel(lead.status || "new")}</AdminStatusBadge>
                      {lead.stage ? <AdminStatusBadge tone={getStageTone(lead.stage)}>{normalizeLabel(lead.stage)}</AdminStatusBadge> : null}
                    </div>

                    <div className="admin-leads-page__lead-meta">
                      <span>{normalizeLabel(formatDisruption(lead))}</span>
                      <span>{formatCurrency(lead.estimated_compensation_eur, lead.compensation_currency)}</span>
                      <AdminStatusBadge tone={getEstimateTone(lead.estimate_status)}>{formatEstimateStatus(lead.estimate_status)}</AdminStatusBadge>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {selectedLead && previewOpen ? <button type="button" className="admin-leads-page__overlay" onClick={handleClosePreview} aria-label="Close lead preview" /> : null}

        <aside className={`admin-leads-page__preview${selectedLead && previewOpen ? " is-open" : ""}`}>
          {!selectedLead ? (
            <div className="admin-leads-page__empty-preview">
              <strong>Select a lead to preview details</strong>
              <p>Choose a lead from the list to inspect customer, flight, disruption, documents, signature, and workflow details.</p>
            </div>
          ) : (
            <div className="admin-leads-page__preview-inner">
              <header className="admin-leads-page__preview-header">
                <div>
                  <span className="admin-leads-page__eyebrow">Lead preview</span>
                  <h3>{formatLeadReference(selectedLead)}</h3>
                  <p>{selectedLead.full_name || "Unknown customer"} • {formatDateTime(selectedLead.created_at)}</p>
                </div>
                <div className="admin-leads-page__preview-actions">
                  <button
                    className="btn btn--primary"
                    type="button"
                    onClick={handleConvertToCase}
                    disabled={!hasPermission("cases.update") || isSaving}
                  >
                    <UserRoundPlus size={15} />
                    <span>{selectedLead.status === "converted" ? "Open case" : "Convert to case"}</span>
                  </button>
                  <button type="button" className="admin-leads-page__close" onClick={handleClosePreview} aria-label="Close preview">
                    <X size={16} />
                  </button>
                </div>
              </header>

              <div className="admin-leads-page__preview-scroll">
                <section className="admin-leads-page__identity">
                  <div>
                    <h4>{selectedLead.full_name || "Unknown customer"}</h4>
                    <p>{selectedLead.email || "No email"}{selectedLead.phone ? ` • ${selectedLead.phone}` : ""}</p>
                  </div>
                  <div className="admin-leads-page__claim-state">
                    <AdminStatusBadge tone={getLeadStatusTone(selectedLead.status)}>{normalizeLabel(selectedLead.status || "new")}</AdminStatusBadge>
                    {selectedLead.stage ? <AdminStatusBadge tone={getStageTone(selectedLead.stage)}>{normalizeLabel(selectedLead.stage)}</AdminStatusBadge> : null}
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Customer</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>Full name</strong><span>{selectedLead.full_name || "—"}</span></article>
                    <article><strong>Email</strong><span>{selectedLead.email || "—"}</span></article>
                    <article><strong>Phone</strong><span>{selectedLead.phone || "—"}</span></article>
                    <article><strong>Preferred language</strong><span>{selectedLead.preferred_language || "—"}</span></article>
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Route / Flight</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>Departure airport</strong><span>{selectedLead.departure_airport || "—"}</span></article>
                    <article><strong>Arrival airport</strong><span>{selectedLead.arrival_airport || "—"}</span></article>
                    <article><strong>Flight date</strong><span>{formatDate(selectedLead.scheduled_departure_date)}</span></article>
                    <article><strong>Airline</strong><span>{selectedLead.airline || "—"}</span></article>
                    <article><strong>Flight number</strong><span>{selectedLead.payload?.flightNumber || selectedLead.payload?.flight_number || "—"}</span></article>
                    <article><strong>Route type</strong><span>{formatDirectLabel(selectedLead.is_direct)}</span></article>
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Disruption</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>Disruption type</strong><span>{normalizeLabel(formatDisruption(selectedLead))}</span></article>
                    <article><strong>Delay duration</strong><span>{selectedLead.delay_duration || "—"}</span></article>
                    <article><strong>Cancellation / denied boarding</strong><span>{selectedLead.reason || selectedLead.payload?.denialReason || "—"}</span></article>
                    <article><strong>Notes</strong><span>{selectedLead.payload?.notes || selectedLead.payload?.description || "—"}</span></article>
                  </div>
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Compensation estimate</h4>
                  </div>
                  <div className="admin-leads-page__meta-grid">
                    <article><strong>Estimated compensation</strong><span>{formatCurrency(selectedLead.estimated_compensation_eur, selectedLead.compensation_currency)}</span></article>
                    <article><strong>Distance</strong><span>{selectedLead.distance_km ? `${Math.round(Number(selectedLead.distance_km))} km` : "—"}</span></article>
                    <article><strong>Distance band</strong><span>{formatDistanceBand(selectedLead.distance_band)}</span></article>
                    <article><strong>Estimate status</strong><span>{formatEstimateStatus(selectedLead.estimate_status)}</span></article>
                  </div>
                  {extractReasonCodes(selectedLead.estimate_explanation).length ? (
                    <div className="admin-leads__reason-codes">
                      {extractReasonCodes(selectedLead.estimate_explanation).map((code) => (
                        <span key={code}>{code}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-leads-page__empty-copy">Estimate pending review</p>
                  )}
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Documents</h4>
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
                            onClick={() => handleDownloadDocument(document)}
                            disabled={!document.file_path || activeDownloadId === document.id}
                            title={document.file_path ? "Open document" : "Document preview is not available with the current record payload."}
                          >
                            {activeDownloadId === document.id ? "Opening..." : "Open"}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-leads-page__empty-copy">No documents uploaded yet</p>
                  )}
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Signature / Consent</h4>
                  </div>
                  {selectedSignatures.length ? (
                    <div className="admin-leads-page__timeline">
                      {selectedSignatures.map((signature) => (
                        <article key={signature.id}>
                          <div>
                            <strong>{signature.signer_name || signature.signer_email || "Signature"}</strong>
                            <p>{signature.terms_accepted ? "Signed" : "Pending"} • {formatDateTime(signature.signed_at || signature.created_at)}</p>
                          </div>
                          <span className="admin-leads-page__signature-summary">{signature.terms_accepted ? "Consent recorded" : "Awaiting signature"}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-leads-page__empty-copy">No signatures saved yet</p>
                  )}
                </section>

                <section className="admin-leads-page__section">
                  <div className="admin-leads-page__section-title">
                    <h4>Internal workflow</h4>
                  </div>
                  <div className="admin-leads-page__workflow-grid">
                    <label>
                      <span>Status</span>
                      <select
                        value={selectedLead.status || "new"}
                        onChange={(event) => saveStatus(selectedLead.id, event.target.value)}
                        disabled={!hasPermission("leads.update") || isSaving}
                      >
                        {leadStatuses.map((status) => <option key={status} value={status}>{normalizeLabel(status)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Owner</span>
                      <select
                        value={selectedLead.assigned_user_id || ""}
                        onChange={(event) => saveOwner(selectedLead.id, event.target.value)}
                        disabled={!hasPermission("leads.update") || !moduleData?.supportsCoreSchemaV1 || isSaving}
                      >
                        <option value="">Unassigned</option>
                        {(moduleData?.assignableUsers || []).map((user) => (
                          <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="admin-leads-page__workflow-actions">
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={handleConvertToCase}
                      disabled={!hasPermission("cases.update") || isSaving}
                    >
                      {selectedLead.status === "converted" ? "Open case" : "Convert to case"}
                    </button>
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled={!moduleData?.supportsCoreSchemaV1}
                      title="Owner assignment is available only when Core Operations schema V1 is enabled."
                    >
                      Assign owner
                    </button>
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled
                      title="A dedicated 'needs documents' action is not available in the current leads workflow service yet."
                    >
                      Mark needs documents
                    </button>
                  </div>

                  <div className="admin-leads-page__notes">
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Add an internal note for this lead"
                      disabled={!moduleData?.supportsNotes}
                    />
                    <div className="admin-leads-page__note-actions">
                      <button className="admin-link-button" type="button" onClick={submitNote} disabled={!moduleData?.supportsNotes || !noteDraft.trim() || isSaving}>
                        Save note
                      </button>
                    </div>
                    {!moduleData?.supportsNotes ? <small>Apply Core Operations schema V1 to enable internal notes.</small> : null}
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
                            <strong>{normalizeLabel(entry.previous_status || "unknown")} → {normalizeLabel(entry.next_status || "unknown")}</strong>
                            <p>{entry.note || "No note"} • {formatDateTime(entry.created_at)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
