import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HandCoins, XCircle } from "lucide-react";
import {
  approvePartnerApplication,
  fetchPartnerApplicationsModuleData,
  rejectPartnerApplication,
} from "../../services/adminService.js";
import {
  AdminDataTable,
  AdminDetailDrawer,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "../AdminReferralPartners/style.scss";

const statusFilters = ["pending", "approved", "rejected", "all"];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function toDisplayList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value || "").trim() || "—";
}

function toReviewerLabel(item) {
  if (item.reviewer?.full_name) {
    return item.reviewer.email ? `${item.reviewer.full_name} (${item.reviewer.email})` : item.reviewer.full_name;
  }
  return item.reviewer?.email || item.reviewed_by || "—";
}

function toneForStatus(status) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

export default function AdminPartnerApplications() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState({ applications: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

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

  const metrics = useMemo(() => ({
    total: moduleData.applications.length,
    pending: moduleData.applications.filter((item) => item.status === "pending").length,
    approved: moduleData.applications.filter((item) => item.status === "approved").length,
    rejected: moduleData.applications.filter((item) => item.status === "rejected").length,
  }), [moduleData.applications]);

  const handleApprove = async () => {
    if (!selectedApplication) return;
    if (!window.confirm(`Approve partner application for ${selectedApplication.full_name}?`)) return;
    setError("");
    setIsSaving(true);
    setActiveAction("approve");
    try {
      await approvePartnerApplication(selectedApplication.id);
      await loadApplications();
      setToast({ type: "success", message: "Partner application approved." });
      setDrawerOpen(false);
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
    if (!window.confirm(`Reject partner application for ${selectedApplication.full_name}?`)) return;
    setError("");
    setIsSaving(true);
    setActiveAction("reject");
    try {
      await rejectPartnerApplication(selectedApplication.id, rejectionReason);
      await loadApplications();
      setToast({ type: "success", message: "Partner application rejected." });
      setDrawerOpen(false);
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
      <AdminPageHeader
        title="Partner Applications"
        subtitle="Review inbound partner requests before creating approved partner accounts"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Partner Applications" },
        ]}
      />

      {toast ? (
        <div className={`admin-partner-program__toast is-${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
      {error ? <p className="admin-message is-error">{error}</p> : null}

      <div className="admin-partner-program__kpis">
        <AdminKpiCard label="Total applications" value={isLoading ? "—" : metrics.total} icon={HandCoins} />
        <AdminKpiCard label="Pending review" value={isLoading ? "—" : metrics.pending} icon={HandCoins} />
        <AdminKpiCard label="Approved" value={isLoading ? "—" : metrics.approved} icon={CheckCircle2} />
        <AdminKpiCard label="Rejected" value={isLoading ? "—" : metrics.rejected} icon={XCircle} />
      </div>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search applicant, email, country, niche"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={statusFilters.map((item) => ({ value: item, label: item[0].toUpperCase() + item.slice(1) }))}
      />

      <AdminDataTable
        title="Review queue"
        description={isLoading ? "" : `${filteredRows.length} applications match the current filters.`}
        columns={[
          { key: "name", label: "Applicant" },
          { key: "email", label: "Email" },
          { key: "country", label: "Country" },
          { key: "platform", label: "Primary platform" },
          { key: "audience", label: "Audience size" },
          { key: "niche", label: "Niche" },
          { key: "created", label: "Created" },
          { key: "status", label: "Status" },
          { key: "action", label: "Action" },
        ]}
        rows={filteredRows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyLabel="No partner applications match the current filters."
        renderRow={(item) => (
          <tr key={item.id}>
            <td>{item.full_name}</td>
            <td>{item.email}</td>
            <td>{item.country || "—"}</td>
            <td>{item.primary_platform || "—"}</td>
            <td>{item.audience_size || "—"}</td>
            <td>{item.niche || "—"}</td>
            <td>{formatDate(item.created_at)}</td>
            <td><AdminStatusBadge tone={toneForStatus(item.status)}>{item.status}</AdminStatusBadge></td>
            <td>
              <button
                type="button"
                className="admin-link-button"
                onClick={() => {
                  setSelectedApplicationId(item.id);
                  setDrawerOpen(true);
                }}
              >
                Review
              </button>
            </td>
          </tr>
        )}
      />

      <AdminDetailDrawer
        open={drawerOpen}
        title={selectedApplication?.full_name || "Application detail"}
        subtitle={selectedApplication?.email || ""}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedApplication ? (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__summary-grid">
              <article className="admin-partner-program__info-card"><span>Applicant</span><strong>{selectedApplication.full_name}</strong></article>
              <article className="admin-partner-program__info-card"><span>Email</span><strong>{selectedApplication.email}</strong></article>
              <article className="admin-partner-program__info-card"><span>Country</span><strong>{selectedApplication.country || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Preferred language</span><strong>{selectedApplication.preferred_language || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Public name</span><strong>{selectedApplication.public_name || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Primary platform</span><strong>{selectedApplication.primary_platform || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Audience size</span><strong>{selectedApplication.audience_size || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={toneForStatus(selectedApplication.status)}>{selectedApplication.status}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Consent</span><strong>{selectedApplication.consent_accepted ? "Accepted" : "Not accepted"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Reviewed by</span><strong>{toReviewerLabel(selectedApplication)}</strong></article>
              <article className="admin-partner-program__info-card"><span>Reviewed at</span><strong>{formatDate(selectedApplication.reviewed_at)}</strong></article>
              <article className="admin-partner-program__info-card"><span>Niche</span><strong>{selectedApplication.niche || "—"}</strong></article>
            </section>

            <section className="admin-partner-program__section">
              <h3>Motivation</h3>
              <p>{selectedApplication.motivation || "No motivation provided."}</p>
            </section>

            <section className="admin-partner-program__section">
              <h3>Social links</h3>
              <div className="admin-partner-program__meta-grid">
                <article><strong>Website</strong><span>{selectedApplication.website_url || "—"}</span></article>
                <article><strong>Instagram</strong><span>{selectedApplication.instagram_url || "—"}</span></article>
                <article><strong>TikTok</strong><span>{selectedApplication.tiktok_url || "—"}</span></article>
                <article><strong>YouTube</strong><span>{selectedApplication.youtube_url || "—"}</span></article>
              </div>
            </section>

            <section className="admin-partner-program__section">
              <h3>Content links</h3>
              <p>{toDisplayList(selectedApplication.content_links)}</p>
            </section>

            <section className="admin-partner-program__section">
              <h3>Audience countries</h3>
              <p>{toDisplayList(selectedApplication.audience_countries)}</p>
            </section>

            <section className="admin-partner-program__section">
              <h3>Rejection reason</h3>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Required when rejecting an application"
                disabled={!hasPermission("partners.manage") || isSaving}
              />
              {selectedApplication.rejection_reason ? (
                <p className="admin-partner-program__subnote">Current reason: {selectedApplication.rejection_reason}</p>
              ) : null}
            </section>

            <div className="admin-partner-program__action-row">
              <button className="btn btn--primary" type="button" disabled={!hasPermission("partners.manage") || isSaving || selectedApplication.status === "approved"} onClick={handleApprove}>
                {activeAction === "approve" ? "Approving..." : "Approve"}
              </button>
              <button className="admin-link-button" type="button" disabled={!hasPermission("partners.manage") || isSaving} onClick={handleReject}>
                {activeAction === "reject" ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
