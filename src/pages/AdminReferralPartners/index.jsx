import { useEffect, useMemo, useState } from "react";
import { Download, Link2, Users, Wallet } from "lucide-react";
import {
  fetchReferralPartnersModuleData,
  updatePartnerPortalStatus,
  updateReferralPartner,
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
import { useSearchParams } from "react-router-dom";
import "./style.scss";

const portalStatuses = ["approved", "suspended", "rejected"];
const legacyStatuses = ["active", "paused", "archived"];

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function normalizePartnerMatch(row, partner) {
  const label = String(row.referral_partner_label || "").toLowerCase();
  return row.referral_partner_id === partner.id
    || (label && (label === String(partner.name || "").toLowerCase()
      || label === String(partner.referral_code || "").toLowerCase()));
}

function exportPartnersCsv(rows) {
  const headers = ["Partner", "Code", "Portal Status", "Leads", "Cases", "Approved Cases", "Earned Commission", "Paid Commission"];
  const lines = rows.map((item) => [
    item.name,
    item.referral_code,
    item.portal_status,
    item.leadsGenerated,
    item.casesConverted,
    item.approvedCases,
    item.earnedCommission,
    item.paidCommission,
  ]);
  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-referral-partners-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toneForPortalStatus(status) {
  if (status === "approved") return "success";
  if (status === "suspended") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

function toneForLegacyStatus(status) {
  if (status === "active") return "success";
  if (status === "paused") return "warning";
  if (status === "archived") return "danger";
  return "neutral";
}

export default function AdminReferralPartners() {
  const { hasPermission } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [search, setSearch] = useState("");
  const [portalStatusFilter, setPortalStatusFilter] = useState("approved");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadPartners = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchReferralPartnersModuleData();
      setModuleData(next);
      if (!selectedPartnerId && next.partners[0]) {
        setSelectedPartnerId(next.partners[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load referral partners module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    const deepLinkedPartnerId = searchParams.get("partner");
    if (deepLinkedPartnerId) {
      setSelectedPartnerId(deepLinkedPartnerId);
      setDrawerOpen(true);
    }
  }, [searchParams]);

  const partnerRows = useMemo(() => {
    const cases = moduleData?.cases || [];
    const leads = moduleData?.leads || [];
    const commissions = moduleData?.commissions || [];
    const payouts = moduleData?.payouts || [];

    return (moduleData?.partners || []).map((partner) => {
      const linkedCases = cases.filter((item) => normalizePartnerMatch(item, partner));
      const linkedLeads = leads.filter((item) => item.referral_partner_id === partner.id);
      const linkedCommissions = commissions.filter((item) => item.partner_id === partner.id);
      const linkedPayouts = payouts.filter((item) => item.partner_id === partner.id);
      const earnedCommission = linkedCommissions
        .filter((item) => item.status !== "cancelled")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const paidCommission = linkedPayouts
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return {
        ...partner,
        linkedCases,
        linkedLeads,
        linkedCommissions,
        linkedPayouts,
        leadsGenerated: linkedLeads.length,
        casesConverted: linkedCases.length,
        approvedCases: linkedCommissions.filter((item) => ["approved", "paid"].includes(item.status)).length
          || linkedCases.filter((item) => ["approved", "paid", "closed"].includes(item.status)).length,
        earnedCommission,
        paidCommission,
        pendingCommission: earnedCommission - paidCommission,
      };
    });
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return partnerRows.filter((item) => {
      const matchesSearch = !query || [
        item.name,
        item.public_name,
        item.referral_code,
        item.contact_name,
        item.contact_email,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = portalStatusFilter === "all" || (item.portal_status || "approved") === portalStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [partnerRows, search, portalStatusFilter]);

  const selectedPartner = useMemo(
    () => filteredRows.find((item) => item.id === selectedPartnerId)
      || partnerRows.find((item) => item.id === selectedPartnerId)
      || filteredRows[0]
      || null,
    [filteredRows, partnerRows, selectedPartnerId],
  );

  const metrics = useMemo(() => ({
    totalPartners: partnerRows.length,
    approvedPartners: partnerRows.filter((item) => item.portal_status === "approved").length,
    suspendedPartners: partnerRows.filter((item) => item.portal_status === "suspended").length,
    earnedCommission: partnerRows.reduce((sum, item) => sum + item.earnedCommission, 0),
    paidCommission: partnerRows.reduce((sum, item) => sum + item.paidCommission, 0),
  }), [partnerRows]);

  const updatePartnerAccess = async (nextPortalStatus) => {
    if (!selectedPartner) return;
    setError("");
    setIsSaving(true);
    try {
      await updatePartnerPortalStatus(selectedPartner.id, nextPortalStatus);
      await loadPartners();
    } catch (nextError) {
      setError(nextError.message || "Could not update partner access.");
    } finally {
      setIsSaving(false);
    }
  };

  const savePartner = async (updates) => {
    if (!selectedPartner) return;
    setError("");
    setIsSaving(true);
    try {
      await updateReferralPartner(selectedPartner.id, updates);
      await loadPartners();
    } catch (nextError) {
      setError(nextError.message || "Could not update referral partner.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-partner-program-page">
      <AdminPageHeader
        title="Referral Partners"
        subtitle="Approved partner registry, portal status, referral links, and performance"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Referral Partners" },
        ]}
        secondaryActions={[
          {
            label: "Export CSV",
            icon: Download,
            onClick: () => exportPartnersCsv(filteredRows),
            disabled: !filteredRows.length,
          },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsPartnersModuleV1 ? (
        <p className="admin-message">
          Referral partners schema is not available yet. Run `008_referral_partners_module_v1.sql` in Supabase to unlock this module.
        </p>
      ) : null}

      <div className="admin-partner-program__kpis">
        <AdminKpiCard label="Approved partners" value={isLoading ? "—" : metrics.approvedPartners} icon={Users} />
        <AdminKpiCard label="Suspended" value={isLoading ? "—" : metrics.suspendedPartners} icon={Users} />
        <AdminKpiCard label="Registry total" value={isLoading ? "—" : metrics.totalPartners} icon={Link2} />
        <AdminKpiCard label="Earned commission" value={isLoading ? "—" : formatCurrency(metrics.earnedCommission)} icon={Wallet} />
        <AdminKpiCard label="Paid commission" value={isLoading ? "—" : formatCurrency(metrics.paidCommission)} icon={Wallet} />
      </div>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search partner, code, contact"
        statusFilter={portalStatusFilter}
        onStatusFilterChange={setPortalStatusFilter}
        statusOptions={[
          { value: "all", label: "All partner states" },
          ...portalStatuses.map((status) => ({ value: status, label: status[0].toUpperCase() + status.slice(1) })),
        ]}
      />

      <AdminDataTable
        title="Approved partner registry"
        description={isLoading ? "" : `${filteredRows.length} partner records match the current filters.`}
        columns={[
          { key: "partner", label: "Partner" },
          { key: "code", label: "Referral code" },
          { key: "status", label: "Portal status" },
          { key: "link", label: "Referral link" },
          { key: "rate", label: "Commission rate" },
          { key: "performance", label: "Performance" },
          { key: "action", label: "Action" },
        ]}
        rows={filteredRows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyLabel="No referral partners match the current filters."
        renderRow={(item) => (
          <tr key={item.id}>
            <td>{item.public_name || item.name}</td>
            <td>{item.referral_code}</td>
            <td><AdminStatusBadge tone={toneForPortalStatus(item.portal_status || "approved")}>{item.portal_status || "approved"}</AdminStatusBadge></td>
            <td className="admin-cell-wrap">{item.referral_link || "—"}</td>
            <td>{item.commission_rate} {item.commission_type === "percentage" ? "%" : "fixed"}</td>
            <td>{item.leadsGenerated} leads • {item.casesConverted} cases</td>
            <td>
              <button
                type="button"
                className="admin-link-button"
                onClick={() => {
                  setSelectedPartnerId(item.id);
                  setDrawerOpen(true);
                }}
              >
                Open
              </button>
            </td>
          </tr>
        )}
      />

      <AdminDetailDrawer
        open={drawerOpen}
        title={selectedPartner?.public_name || selectedPartner?.name || "Partner detail"}
        subtitle={selectedPartner?.referral_code || ""}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedPartner ? (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__summary-grid">
              <article className="admin-partner-program__info-card"><span>Referral code</span><strong>{selectedPartner.referral_code}</strong></article>
              <article className="admin-partner-program__info-card"><span>Referral link</span><strong>{selectedPartner.referral_link || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Portal status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={toneForPortalStatus(selectedPartner.portal_status || "approved")}>{selectedPartner.portal_status || "approved"}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Registry status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={toneForLegacyStatus(selectedPartner.status || "active")}>{selectedPartner.status || "active"}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Commission rate</span><strong>{selectedPartner.commission_rate} {selectedPartner.commission_type === "percentage" ? "%" : "fixed"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Approved</span><strong>{formatDate(selectedPartner.approved_at)}</strong></article>
              <article className="admin-partner-program__info-card"><span>Leads</span><strong>{selectedPartner.leadsGenerated}</strong></article>
              <article className="admin-partner-program__info-card"><span>Cases</span><strong>{selectedPartner.casesConverted}</strong></article>
              <article className="admin-partner-program__info-card"><span>Earned commission</span><strong>{formatCurrency(selectedPartner.earnedCommission)}</strong></article>
              <article className="admin-partner-program__info-card"><span>Paid commission</span><strong>{formatCurrency(selectedPartner.paidCommission)}</strong></article>
            </section>

            <section className="admin-partner-program__section">
              <h3>Profile</h3>
              <div className="admin-partner-program__meta-grid">
                <article><strong>Contact</strong><span>{selectedPartner.contact_name || selectedPartner.contact_email || "—"}</span></article>
                <article><strong>Phone</strong><span>{selectedPartner.contact_phone || "—"}</span></article>
                <article><strong>Website</strong><span>{selectedPartner.website_url || "—"}</span></article>
                <article><strong>Instagram</strong><span>{selectedPartner.instagram_url || "—"}</span></article>
                <article><strong>TikTok</strong><span>{selectedPartner.tiktok_url || "—"}</span></article>
                <article><strong>YouTube</strong><span>{selectedPartner.youtube_url || "—"}</span></article>
              </div>
            </section>

            <section className="admin-partner-program__section">
              <h3>Status & commission</h3>
              <div className="admin-partner-program__form-grid">
                <label>
                  <span>Portal status</span>
                  <select value={selectedPartner.portal_status || "approved"} onChange={(event) => updatePartnerAccess(event.target.value)} disabled={!hasPermission("partners.manage") || isSaving}>
                    {portalStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span>Registry status</span>
                  <select value={selectedPartner.status || "active"} onChange={(event) => savePartner({ status: event.target.value })} disabled={!hasPermission("partners.manage") || isSaving}>
                    {legacyStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span>Commission type</span>
                  <select value={selectedPartner.commission_type || "percentage"} onChange={(event) => savePartner({ commission_type: event.target.value })} disabled={!hasPermission("partners.manage") || isSaving}>
                    <option value="percentage">percentage</option>
                    <option value="fixed">fixed</option>
                  </select>
                </label>
                <label>
                  <span>Commission rate</span>
                  <input type="number" min="0" step="0.01" defaultValue={selectedPartner.commission_rate || 0} onBlur={(event) => savePartner({ commission_rate: Number(event.target.value || 0) })} disabled={!hasPermission("partners.manage") || isSaving} />
                </label>
              </div>
            </section>

            <section className="admin-partner-program__section">
              <h3>Performance</h3>
              <div className="admin-partner-program__meta-grid">
                <article><strong>Referred leads</strong><span>{selectedPartner.leadsGenerated}</span></article>
                <article><strong>Converted cases</strong><span>{selectedPartner.casesConverted}</span></article>
                <article><strong>Approved cases</strong><span>{selectedPartner.approvedCases}</span></article>
                <article><strong>Pending commission</strong><span>{formatCurrency(selectedPartner.pendingCommission)}</span></article>
              </div>
            </section>
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
