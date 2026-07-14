import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HandCoins, RefreshCw, XCircle } from "lucide-react";
import {
  approvePartnerApplication,
  fetchPartnerApplicationsModuleData,
  rejectPartnerApplication,
} from "../../services/adminService.js";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "../AdminReferralPartners/style.scss";

const statusFilters = ["pending", "approved", "rejected", "all"];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function toneForStatus(status) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

export default function AdminPartnerApplications() {
  const { hasPermission } = useAdminAuth();
  const canManageApplications = hasPermission("partner_applications.manage");
  const [moduleData, setModuleData] = useState({ applications: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [toast, setToast] = useState(null);

  const loadApplications = async (options = {}) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchPartnerApplicationsModuleData({ force: options.force });
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
    void loadApplications();
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
      await loadApplications({ force: true });
      setToast({ type: "success", message: "Partner application approved." });
      setPanelOpen(false);
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
      await loadApplications({ force: true });
      setToast({ type: "success", message: "Partner application rejected." });
      setPanelOpen(false);
    } catch (nextError) {
      const message = nextError.message || "Could not reject partner application.";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsSaving(false);
      setActiveAction("");
    }
  };

  const columns = useMemo(() => ([
    {
      key: "applicant",
      label: "Applicant",
      width: 220,
      minWidth: 180,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{item.full_name || "—"}</span>
          <span className="admin-crm-table__cell-sub">{item.email || "—"}</span>
        </div>
      ),
      getCellTitle: (item) => item.full_name || item.email || "Applicant",
    },
    {
      key: "profile",
      label: "Profile",
      width: 220,
      minWidth: 170,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{item.primary_platform || "—"}</span>
          <span className="admin-crm-table__cell-sub">{item.country || item.niche || "—"}</span>
        </div>
      ),
      getCellTitle: (item) => `${item.primary_platform || "—"} • ${item.country || item.niche || "—"}`,
    },
    {
      key: "audience",
      label: "Audience",
      width: 120,
      minWidth: 110,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      align: "right",
      renderCell: (item) => <span className="admin-crm-table__cell-main">{item.audience_size || "—"}</span>,
      getCellTitle: (item) => String(item.audience_size || "—"),
    },
    {
      key: "created",
      label: "Submitted",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (item) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{formatDate(item.created_at)}</span>
          <span className="admin-crm-table__cell-sub">{item.reviewed_at ? `Reviewed ${formatDate(item.reviewed_at)}` : "Not reviewed"}</span>
        </div>
      ),
      getCellTitle: (item) => formatDate(item.created_at),
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (item) => <AdminStatusBadge tone={toneForStatus(item.status)}>{item.status}</AdminStatusBadge>,
      getCellTitle: (item) => item.status,
    },
    {
      key: "action",
      label: "Action",
      width: 140,
      minWidth: 120,
      maxWidth: 180,
      wrap: false,
      resizable: true,
      reorderable: true,
      hideable: false,
      renderCell: (item) => (
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedApplicationId(item.id);
            setPanelOpen(true);
          }}
        >
          Review
        </button>
      ),
    },
  ]), []);

  return (
    <div className="admin-page admin-partner-applications-page">
      <AdminPageHeader
        title="Partner Applications"
        subtitle="Review inbound partner requests before creating approved partner accounts"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Partner Applications" },
        ]}
        secondaryActions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onClick: () => void loadApplications({ force: true }),
            disabled: isLoading || isSaving,
          },
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

      <AdminColumnTable
        storageKey="ff-admin-table-layout-partner-applications"
        title="Review queue"
        countLabel={isLoading ? "" : `${filteredRows.length} application${filteredRows.length === 1 ? "" : "s"}`}
        columns={columns}
        rows={filteredRows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyTitle="No partner applications match the current filters."
        emptyDetail="Try adjusting the current filters."
        selectedRowId={panelOpen ? selectedApplication?.id || "" : ""}
        getRowKey={(item) => item.id}
        onRowClick={(item) => {
          setSelectedApplicationId(item.id);
          setPanelOpen(true);
        }}
      />

      <AdminSidePanel
        open={panelOpen}
        title={selectedApplication?.full_name || "Application detail"}
        subtitle={selectedApplication?.email || ""}
        eyebrow="Partner application"
        onClose={() => setPanelOpen(false)}
        className="admin-partner-program__drawer-panel"
        withOverlay
      >
        {selectedApplication ? (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__summary-grid">
              <article className="admin-partner-program__info-card"><span>Applicant</span><strong>{selectedApplication.full_name}</strong></article>
              <article className="admin-partner-program__info-card"><span>Public name</span><strong>{selectedApplication.public_name || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Email</span><strong>{selectedApplication.email}</strong></article>
              <article className="admin-partner-program__info-card"><span>Phone</span><strong>{selectedApplication.phone || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Country</span><strong>{selectedApplication.country || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Primary platform</span><strong>{selectedApplication.primary_platform || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Audience size</span><strong>{selectedApplication.audience_size || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={toneForStatus(selectedApplication.status)}>{selectedApplication.status}</AdminStatusBadge></div></article>
            </section>

            <section className="admin-partner-program__section">
              <h3>Motivation</h3>
              <p>{selectedApplication.motivation || "No motivation provided."}</p>
            </section>

            <section className="admin-partner-program__section">
              <h3>Rejection reason</h3>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Required when rejecting an application"
                disabled={!canManageApplications || isSaving}
              />
              {selectedApplication.rejection_reason ? (
                <p className="admin-partner-program__subnote">Current reason: {selectedApplication.rejection_reason}</p>
              ) : null}
            </section>

            <div className="admin-partner-program__action-row">
              <button className="btn btn--primary" type="button" disabled={!canManageApplications || isSaving || selectedApplication.status !== "pending"} onClick={handleApprove}>
                {activeAction === "approve" ? "Approving..." : "Approve"}
              </button>
              <button className="admin-link-button" type="button" disabled={!canManageApplications || isSaving || selectedApplication.status !== "pending"} onClick={handleReject}>
                {activeAction === "reject" ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminSidePanel>
    </div>
  );
}
