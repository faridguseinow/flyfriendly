import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleAlert, Download, Filter, MessageSquareText, Search, UserRoundPlus } from "lucide-react";
import {
  assignLeadOwner,
  convertLeadToCase,
  createLeadNote,
  fetchLeadsModuleData,
  updateLeadStatus,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./style.scss";

const leadStatuses = ["new", "submitted", "not_eligible", "converted", "archived"];
const leadStages = ["eligibility", "contact", "documents", "finish", "approved", "denied"];

function StatCard({ icon: Icon, label, value }) {
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

function formatCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function extractReasonCodes(explanation) {
  if (!explanation || typeof explanation !== "object") {
    return [];
  }

  return Array.isArray(explanation.reason_codes) ? explanation.reason_codes.filter(Boolean) : [];
}

function downloadCsv(rows) {
  const headers = ["Lead Code", "Status", "Stage", "Source", "Name", "Email", "Phone", "Airline", "Route From", "Route To", "Created At"];
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

function AdminLeads() {
  const { hasPermission } = useAdminAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadLeads = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchLeadsModuleData();
      setModuleData(next);
      if (!selectedLeadId && next.leads[0]) {
        setSelectedLeadId(next.leads[0].id);
      }
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
    }
  }, [searchParams]);

  const filteredLeads = useMemo(() => {
    const leads = moduleData?.leads || [];
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesSearch = !query || [
        lead.lead_code,
        lead.full_name,
        lead.email,
        lead.phone,
        lead.airline,
        lead.departure_airport,
        lead.arrival_airport,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesStage = stageFilter === "all" || lead.stage === stageFilter;
      const matchesOwner = ownerFilter === "all" || String(lead.assigned_user_id || "") === ownerFilter;

      return matchesSearch && matchesStatus && matchesStage && matchesOwner;
    });
  }, [moduleData, ownerFilter, search, stageFilter, statusFilter]);

  const selectedLead = useMemo(
    () => filteredLeads.find((lead) => lead.id === selectedLeadId) || moduleData?.leads?.find((lead) => lead.id === selectedLeadId) || filteredLeads[0] || null,
    [filteredLeads, moduleData, selectedLeadId],
  );

  const selectedNotes = useMemo(
    () => (moduleData?.notes || []).filter((note) => note.lead_id === selectedLead?.id),
    [moduleData, selectedLead],
  );

  const selectedHistory = useMemo(
    () => (moduleData?.statusHistory || []).filter((entry) => entry.lead_id === selectedLead?.id),
    [moduleData, selectedLead],
  );

  const selectedDocuments = useMemo(
    () => (moduleData?.documents || []).filter((entry) => entry.lead_id === selectedLead?.id),
    [moduleData, selectedLead],
  );

  const selectedSignatures = useMemo(
    () => (moduleData?.signatures || []).filter((entry) => entry.lead_id === selectedLead?.id),
    [moduleData, selectedLead],
  );

  const stats = useMemo(() => {
    const leads = moduleData?.leads || [];
    return {
      total: leads.length,
      new: leads.filter((lead) => lead.status === "new").length,
      submitted: leads.filter((lead) => lead.status === "submitted").length,
      converted: leads.filter((lead) => lead.status === "converted").length,
      notEligible: leads.filter((lead) => lead.status === "not_eligible").length,
    };
  }, [moduleData]);

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
    if (!selectedLead || !noteDraft.trim()) {
      return;
    }

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

    setIsSaving(true);
    setError("");
    try {
      const result = await convertLeadToCase(selectedLead.id);
      await loadLeads();
      navigate(`/admin/cases?case=${result.caseId}`);
    } catch (nextError) {
      setError(nextError.message || "Could not convert lead to case.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-leads-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Filter size={16} /> Core Operations</span>
          <h1>Leads</h1>
          <p>
            Review incoming compensation requests, update statuses, assign owners, and inspect customer-submitted data
            before conversion into formal cases.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsCoreSchemaV1 && (
        <p className="admin-message">
          Core Operations schema V1 is not fully applied yet. Lead assignment and extended fields will unlock after running
          `006_core_operations_schema_v1.sql`.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading leads...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <StatCard icon={BadgeCheck} label="Total leads" value={stats.total} />
            <StatCard icon={CircleAlert} label="New" value={stats.new} />
            <StatCard icon={UserRoundPlus} label="Submitted" value={stats.submitted} />
            <StatCard icon={BadgeCheck} label="Converted" value={stats.converted} />
            <StatCard icon={CircleAlert} label="Not eligible" value={stats.notEligible} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Lead pipeline</h2>
                <p>Filter and inspect all inbound requests from the public website.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => downloadCsv(filteredLeads)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="admin-leads__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search lead, customer, airline, route" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                <option value="all">All stages</option>
                {leadStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} disabled={!moduleData?.supportsCoreSchemaV1}>
                <option value="all">All owners</option>
                {(moduleData?.assignableUsers || []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
              </select>
            </div>
          </section>

          <section className="admin-leads__grid">
            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>Lead list</h2>
                  <p>{filteredLeads.length} records match the current filters.</p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Status</th>
                      <th>Stage</th>
                      <th>Airline</th>
                      <th>Contact</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={selectedLead?.id === lead.id ? "is-selected" : ""}
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <td>{lead.lead_code || lead.id.slice(0, 8)}</td>
                        <td>{lead.status || "-"}</td>
                        <td>{lead.stage || "-"}</td>
                        <td>{lead.airline || "-"}</td>
                        <td>{lead.full_name || lead.email || lead.phone || "-"}</td>
                        <td>{lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-panel admin-leads__detail">
              <div className="admin-panel__head">
                <div>
                  <h2>Lead detail</h2>
                  <p>{selectedLead ? `Lead ${selectedLead.lead_code || selectedLead.id.slice(0, 8)}` : "Select a lead to inspect."}</p>
                </div>
              </div>

              {selectedLead ? (
                <div className="admin-leads__detail-body">
                  <div className="admin-leads__summary">
                    <article>
                      <strong>Route</strong>
                      <span>{selectedLead.departure_airport || "-"} → {selectedLead.arrival_airport || "-"}</span>
                    </article>
                    <article>
                      <strong>Airline</strong>
                      <span>{selectedLead.airline || "-"}</span>
                    </article>
                    <article>
                      <strong>Contact</strong>
                      <span>{selectedLead.full_name || "-"} · {selectedLead.email || "-"} · {selectedLead.phone || "-"}</span>
                    </article>
                    <article>
                      <strong>Timing</strong>
                      <span>{selectedLead.scheduled_departure_date || "-"} · {selectedLead.delay_duration || selectedLead.payload?.delayDuration || "-"}</span>
                    </article>
                    <article>
                      <strong>Estimate status</strong>
                      <span className={selectedLead.estimate_status === "pending_review" ? "admin-estimate-status is-pending" : "admin-estimate-status"}>
                        {formatEstimateStatus(selectedLead.estimate_status)}
                      </span>
                    </article>
                  </div>

                  <div className="admin-leads__actions">
                    <label>
                      <span>Status</span>
                      <select value={selectedLead.status || "new"} onChange={(event) => saveStatus(selectedLead.id, event.target.value)} disabled={!hasPermission("leads.edit") || isSaving}>
                        {leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Assigned owner</span>
                      <select
                        value={selectedLead.assigned_user_id || ""}
                        onChange={(event) => saveOwner(selectedLead.id, event.target.value)}
                        disabled={!hasPermission("leads.assign") || !moduleData.supportsCoreSchemaV1 || isSaving}
                      >
                        <option value="">Unassigned</option>
                        {(moduleData.assignableUsers || []).map((user) => (
                          <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <section className="admin-leads__section">
                    <h3>Compensation estimate</h3>
                    <div className="admin-documents__meta">
                      <article><strong>Calculated distance</strong><span>{selectedLead.distance_km ? `${Math.round(Number(selectedLead.distance_km))} km` : "-"}</span></article>
                      <article><strong>Distance band</strong><span>{formatDistanceBand(selectedLead.distance_band)}</span></article>
                      <article><strong>Estimated compensation</strong><span>{formatCurrency(selectedLead.estimated_compensation_eur, selectedLead.compensation_currency)}</span></article>
                      <article><strong>Estimate status</strong><span className={selectedLead.estimate_status === "pending_review" ? "admin-estimate-status is-pending" : "admin-estimate-status"}>{formatEstimateStatus(selectedLead.estimate_status)}</span></article>
                    </div>
                    {extractReasonCodes(selectedLead.estimate_explanation).length ? (
                      <div className="admin-leads__reason-codes">
                        {extractReasonCodes(selectedLead.estimate_explanation).map((code) => (
                          <span key={code}>{code}</span>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="admin-leads__section">
                    <h3>Customer details</h3>
                    <div className="admin-documents__meta">
                      <article><strong>Full name</strong><span>{selectedLead.full_name || "-"}</span></article>
                      <article><strong>Email</strong><span>{selectedLead.email || "-"}</span></article>
                      <article><strong>Phone</strong><span>{selectedLead.phone || "-"}</span></article>
                      <article><strong>City / Country</strong><span>{[selectedLead.city, selectedLead.country].filter(Boolean).join(", ") || "-"}</span></article>
                      <article><strong>Language</strong><span>{selectedLead.preferred_language || selectedLead.payload?.preferredLanguage || "-"}</span></article>
                      <article><strong>WhatsApp</strong><span>{selectedLead.has_whatsapp ? "Yes" : "No"}</span></article>
                    </div>
                  </section>

                  <section className="admin-leads__section">
                    <h3>Lead linkage</h3>
                    <div className="admin-documents__meta">
                      <article><strong>Profile ID</strong><span>{selectedLead.profile_id || "-"}</span></article>
                      <article><strong>Customer ID</strong><span>{selectedLead.customer_id || "-"}</span></article>
                      <article><strong>Referral</strong><span>{selectedLead.source_details?.referral_code || selectedLead.referral_partner_id || "-"}</span></article>
                      <article><strong>Source</strong><span>{selectedLead.source || "-"}</span></article>
                    </div>
                  </section>

                  <div className="admin-leads__note-actions">
                    <button
                      className="admin-link-button"
                      type="button"
                      onClick={handleConvertToCase}
                      disabled={!hasPermission("cases.edit") || isSaving || selectedLead.status === "converted"}
                    >
                      <UserRoundPlus size={14} />
                      <span>{selectedLead.status === "converted" ? "Already converted" : "Convert to case"}</span>
                    </button>
                  </div>

                  <section className="admin-leads__section">
                    <h3>Customer note</h3>
                    <p>{selectedLead.reason || selectedLead.payload?.reason || "No reason submitted."}</p>
                  </section>

                  <section className="admin-leads__section">
                    <h3>Uploaded documents</h3>
                    <div className="admin-leads__timeline">
                      {selectedDocuments.length ? selectedDocuments.map((document) => (
                        <article key={document.id}>
                          <strong>{document.file_name || document.document_type || document.id}</strong>
                          <p>{document.document_type || "-"} · {document.status || "-"} · {formatDate(document.created_at)}</p>
                        </article>
                      )) : <p>No lead documents uploaded yet.</p>}
                    </div>
                  </section>

                  <section className="admin-leads__section">
                    <h3>Signatures</h3>
                    <div className="admin-leads__timeline">
                      {selectedSignatures.length ? selectedSignatures.map((signature) => (
                        <article key={signature.id}>
                          <strong>{signature.signer_name || signature.signer_email || "Signature"}</strong>
                          <p>{signature.terms_accepted ? "Signed" : "Pending"} · {formatDate(signature.signed_at || signature.created_at)}</p>
                        </article>
                      )) : <p>No signatures saved yet.</p>}
                    </div>
                  </section>

                  <section className="admin-leads__section">
                    <h3>Operational note</h3>
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Add an internal note for this lead"
                      disabled={!moduleData.supportsNotes}
                    />
                    <div className="admin-leads__note-actions">
                      <button className="admin-link-button" type="button" onClick={submitNote} disabled={!moduleData.supportsNotes || !noteDraft.trim() || isSaving}>
                        <MessageSquareText size={14} />
                        <span>Save note</span>
                      </button>
                    </div>
                    {!moduleData.supportsNotes && <small>Apply Core Operations schema V1 to enable internal notes.</small>}
                  </section>

                  <section className="admin-leads__section">
                    <h3>Internal notes</h3>
                    <div className="admin-leads__timeline">
                      {selectedNotes.length ? selectedNotes.map((note) => (
                        <article key={note.id}>
                          <strong>{formatDate(note.created_at)}</strong>
                          <p>{note.body}</p>
                        </article>
                      )) : <p>No internal notes yet.</p>}
                    </div>
                  </section>

                  <section className="admin-leads__section">
                    <h3>Status history</h3>
                    <div className="admin-leads__timeline">
                      {selectedHistory.length ? selectedHistory.map((entry) => (
                        <article key={entry.id}>
                          <strong>{formatDate(entry.created_at)}</strong>
                          <p>{entry.previous_status || "unknown"} → {entry.next_status}</p>
                        </article>
                      )) : <p>No status changes recorded yet.</p>}
                    </div>
                  </section>

                  <section className="admin-leads__section">
                    <h3>Submitted payload</h3>
                    <pre className="admin-code-block">{JSON.stringify(selectedLead.payload || {}, null, 2)}</pre>
                  </section>
                </div>
              ) : (
                <div className="admin-empty admin-empty--module">
                  <h2>No lead selected</h2>
                  <p>Choose a lead from the list to review its details.</p>
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminLeads;
