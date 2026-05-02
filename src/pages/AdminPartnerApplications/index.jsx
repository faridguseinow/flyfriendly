import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HandCoins, Search, XCircle } from "lucide-react";
import {
  approvePartnerApplication,
  fetchPartnerApplicationsModuleData,
  rejectPartnerApplication,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const statusFilters = ["pending", "approved", "rejected", "all"];

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function toDisplayList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return String(value || "").trim() || "-";
}

function toReviewerLabel(item) {
  if (item.reviewer?.full_name) {
    return item.reviewer.email ? `${item.reviewer.full_name} (${item.reviewer.email})` : item.reviewer.full_name;
  }

  return item.reviewer?.email || item.reviewed_by || "-";
}

function AdminPartnerApplications() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState({ applications: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [toast, setToast] = useState(null);

  const loadApplications = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchPartnerApplicationsModuleData();
      setModuleData(next);
      if (!selectedApplicationId && next.applications[0]) {
        const pending = next.applications.find((item) => item.status === "pending");
        setSelectedApplicationId((pending || next.applications[0]).id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load partner applications.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (moduleData.applications || []).filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesSearch = !query || [
        item.full_name,
        item.email,
        item.country,
        item.primary_platform,
        item.niche,
        item.public_name,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [moduleData.applications, search, statusFilter]);

  const selectedApplication = useMemo(
    () => filteredRows.find((item) => item.id === selectedApplicationId)
      || moduleData.applications.find((item) => item.id === selectedApplicationId)
      || filteredRows[0]
      || null,
    [filteredRows, moduleData.applications, selectedApplicationId],
  );

  useEffect(() => {
    setRejectionReason(selectedApplication?.rejection_reason || "");
  }, [selectedApplication?.id]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const metrics = useMemo(() => ({
    total: moduleData.applications.length,
    pending: moduleData.applications.filter((item) => item.status === "pending").length,
    approved: moduleData.applications.filter((item) => item.status === "approved").length,
    rejected: moduleData.applications.filter((item) => item.status === "rejected").length,
  }), [moduleData.applications]);

  const handleApprove = async () => {
    if (!selectedApplication) return;
    if (!window.confirm(`Approve partner application for ${selectedApplication.full_name}?`)) {
      return;
    }

    setError("");
    setIsSaving(true);
    setActiveAction("approve");
    try {
      await approvePartnerApplication(selectedApplication.id);
      await loadApplications();
      setToast({ type: "success", message: "Partner application approved." });
    } catch (nextError) {
      const message = nextError.message || "Could not approve partner application.";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsSaving(false);
      setActiveAction("");
    }
  };

  const handleReject = async () => {
    if (!selectedApplication) return;
    if (!String(rejectionReason || "").trim()) {
      const message = "Rejection reason is required.";
      setError(message);
      setToast({ type: "error", message });
      return;
    }
    if (!window.confirm(`Reject partner application for ${selectedApplication.full_name}?`)) {
      return;
    }

    setError("");
    setIsSaving(true);
    setActiveAction("reject");
    try {
      await rejectPartnerApplication(selectedApplication.id, rejectionReason);
      await loadApplications();
      setToast({ type: "success", message: "Partner application rejected." });
    } catch (nextError) {
      const message = nextError.message || "Could not reject partner application.";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsSaving(false);
      setActiveAction("");
    }
  };

  return (
    <div className="admin-page admin-partner-applications-page">
      {toast ? (
        <div className={`admin-partner-applications__toast is-${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}

      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><HandCoins size={16} /> Business Modules</span>
          <h1>Partner Applications</h1>
          <p>
            Review inbound partner requests before any partner profile, portal access, or referral code is created.
          </p>
        </div>
      </header>

      {error ? <p className="admin-message is-error">{error}</p> : null}

      {isLoading ? (
        <p className="admin-message">Loading partner applications...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <article className="admin-metric"><span><HandCoins size={22} strokeWidth={1.8} /></span><div><strong>{metrics.total}</strong><small>Total applications</small></div></article>
            <article className="admin-metric"><span><HandCoins size={22} strokeWidth={1.8} /></span><div><strong>{metrics.pending}</strong><small>Pending review</small></div></article>
            <article className="admin-metric"><span><CheckCircle2 size={22} strokeWidth={1.8} /></span><div><strong>{metrics.approved}</strong><small>Approved</small></div></article>
            <article className="admin-metric"><span><XCircle size={22} strokeWidth={1.8} /></span><div><strong>{metrics.rejected}</strong><small>Rejected</small></div></article>
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Application queue</h2>
                <p>Pending applications are shown by default. Review records here before creating approved partner accounts.</p>
              </div>
            </div>

            <div className="admin-referral__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search applicant, email, country, niche" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                {statusFilters.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
              </select>
            </div>

            <div className="admin-partner-applications__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Full name</th>
                        <th>Email</th>
                        <th>Country</th>
                        <th>Primary platform</th>
                        <th>Audience size</th>
                        <th>Niche</th>
                        <th>Created</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((item) => (
                        <tr key={item.id} className={selectedApplication?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedApplicationId(item.id)}>
                          <td>{item.full_name}</td>
                          <td>{item.email}</td>
                          <td>{item.country || "-"}</td>
                          <td>{item.primary_platform || "-"}</td>
                          <td>{item.audience_size || "-"}</td>
                          <td>{item.niche || "-"}</td>
                          <td>{formatDate(item.created_at)}</td>
                          <td>{item.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-referral__detail admin-partner-applications__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Application detail</h2>
                    <p>{selectedApplication ? selectedApplication.full_name : "Select an application to review."}</p>
                  </div>
                </div>

                {selectedApplication ? (
                  <div className="admin-referral__detail-body">
                    <div className="admin-referral__summary">
                      <article><strong>Applicant</strong><span>{selectedApplication.full_name}</span></article>
                      <article><strong>Email</strong><span>{selectedApplication.email}</span></article>
                      <article><strong>Country</strong><span>{selectedApplication.country || "-"}</span></article>
                      <article><strong>Preferred language</strong><span>{selectedApplication.preferred_language || "-"}</span></article>
                      <article><strong>Public name</strong><span>{selectedApplication.public_name || "-"}</span></article>
                      <article><strong>Primary platform</strong><span>{selectedApplication.primary_platform || "-"}</span></article>
                      <article><strong>Audience size</strong><span>{selectedApplication.audience_size || "-"}</span></article>
                      <article><strong>Niche</strong><span>{selectedApplication.niche || "-"}</span></article>
                      <article><strong>Consent</strong><span>{selectedApplication.consent_accepted ? "Accepted" : "Not accepted"}</span></article>
                      <article><strong>Reviewed by</strong><span>{toReviewerLabel(selectedApplication)}</span></article>
                      <article><strong>Reviewed at</strong><span>{formatDate(selectedApplication.reviewed_at)}</span></article>
                      <article><strong>Status</strong><span>{selectedApplication.status}</span></article>
                    </div>

                    <section className="admin-referral__section">
                      <h3>Motivation</h3>
                      <p>{selectedApplication.motivation || "No motivation provided."}</p>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Social links</h3>
                      <div className="admin-partner-applications__links">
                        <article><strong>Website</strong><span>{selectedApplication.website_url || "-"}</span></article>
                        <article><strong>Instagram</strong><span>{selectedApplication.instagram_url || "-"}</span></article>
                        <article><strong>TikTok</strong><span>{selectedApplication.tiktok_url || "-"}</span></article>
                        <article><strong>YouTube</strong><span>{selectedApplication.youtube_url || "-"}</span></article>
                      </div>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Content links</h3>
                      <p>{toDisplayList(selectedApplication.content_links)}</p>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Audience countries</h3>
                      <p>{toDisplayList(selectedApplication.audience_countries)}</p>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Rejection reason</h3>
                      <textarea
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        placeholder="Required when rejecting an application"
                        disabled={!hasPermission("partners.edit") || isSaving}
                      />
                      {selectedApplication.rejection_reason ? (
                        <p className="admin-partner-applications__subnote">Current reason: {selectedApplication.rejection_reason}</p>
                      ) : null}
                    </section>

                    <div className="admin-access__actions">
                      <button className="btn btn--primary" type="button" disabled={!hasPermission("partners.edit") || isSaving || selectedApplication.status === "approved"} onClick={handleApprove}>
                        {activeAction === "approve" ? "Approving..." : "Approve"}
                      </button>
                      <button className="admin-link-button" type="button" disabled={!hasPermission("partners.edit") || isSaving} onClick={handleReject}>
                        {activeAction === "reject" ? "Rejecting..." : "Reject"}
                      </button>
                    </div>

                    <p className="admin-partner-applications__subnote">
                      This queue only updates application review status. Partner profile creation, referral code generation, and portal access should be handled separately in backend review logic.
                    </p>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No application selected</h2>
                    <p>Select an application to review its details and update status.</p>
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

export default AdminPartnerApplications;
