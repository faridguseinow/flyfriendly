import { useEffect, useMemo, useState } from "react";
import { HandCoins, Wallet } from "lucide-react";
import { fetchReferralPartnersModuleData } from "../../services/adminService.js";
import {
  AdminDataTable,
  AdminDetailDrawer,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import "../AdminReferralPartners/style.scss";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

export default function AdminPartnerCommissions() {
  const [moduleData, setModuleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCommissionId, setSelectedCommissionId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setError("");
      setIsLoading(true);
      try {
        setModuleData(await fetchReferralPartnersModuleData());
      } catch (nextError) {
        setError(nextError.message || "Could not load partner commissions.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const partnersById = useMemo(() => new Map((moduleData?.partners || []).map((item) => [item.id, item])), [moduleData?.partners]);
  const casesById = useMemo(() => new Map((moduleData?.cases || []).map((item) => [item.id, item])), [moduleData?.cases]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (moduleData?.commissions || []).filter((item) => {
      const partner = partnersById.get(item.partner_id);
      const caseRow = casesById.get(item.case_id);
      const matchesSearch = !query || [
        partner?.public_name,
        partner?.name,
        caseRow?.case_code,
        item.id,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).map((item) => {
      const partner = partnersById.get(item.partner_id);
      const caseRow = casesById.get(item.case_id);
      return {
        ...item,
        partnerLabel: partner?.public_name || partner?.name || "—",
        caseCode: caseRow?.case_code || "—",
      };
    });
  }, [casesById, moduleData?.commissions, partnersById, search, statusFilter]);

  const selectedCommission = useMemo(
    () => rows.find((item) => item.id === selectedCommissionId) || rows[0] || null,
    [rows, selectedCommissionId],
  );

  const statuses = useMemo(() => Array.from(new Set((moduleData?.commissions || []).map((item) => item.status).filter(Boolean))), [moduleData?.commissions]);
  const totalAmount = useMemo(() => rows.reduce((sum, item) => sum + Number(item.amount || 0), 0), [rows]);

  return (
    <div className="admin-page admin-partner-commissions-page">
      <AdminPageHeader
        title="Partner Commissions"
        subtitle="Commission records by partner, claim, amount, and status"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Partner Commissions" },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}

      <div className="admin-partner-program__kpis">
        <AdminKpiCard label="Commission records" value={isLoading ? "—" : rows.length} icon={HandCoins} />
        <AdminKpiCard label="Visible total" value={isLoading ? "—" : formatCurrency(totalAmount)} icon={Wallet} />
      </div>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search partner or case"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { value: "all", label: "All statuses" },
          ...statuses.map((status) => ({ value: status, label: status })),
        ]}
      />

      <AdminDataTable
        title="Partner commissions"
        description={isLoading ? "" : `${rows.length} commission records match the current filters.`}
        columns={[
          { key: "amount", label: "Commission amount" },
          { key: "status", label: "Status" },
          { key: "claim", label: "Claim" },
          { key: "partner", label: "Partner" },
          { key: "rate", label: "Rate" },
          { key: "date", label: "Created" },
          { key: "action", label: "Action" },
        ]}
        rows={rows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyLabel="No partner commissions found."
        renderRow={(row) => (
          <tr key={row.id}>
            <td>{formatCurrency(row.amount, row.currency)}</td>
            <td><AdminStatusBadge tone={row.status === "paid" ? "success" : row.status === "approved" ? "warning" : "neutral"}>{row.status}</AdminStatusBadge></td>
            <td>{row.caseCode}</td>
            <td>{row.partnerLabel}</td>
            <td>{row.commission_rate || "—"}</td>
            <td>{formatDate(row.created_at)}</td>
            <td>
              <button
                type="button"
                className="admin-link-button"
                onClick={() => {
                  setSelectedCommissionId(row.id);
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
        title={selectedCommission ? selectedCommission.partnerLabel : "Commission detail"}
        subtitle={selectedCommission ? formatCurrency(selectedCommission.amount, selectedCommission.currency) : ""}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedCommission ? (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__summary-grid">
              <article className="admin-partner-program__info-card"><span>Partner</span><strong>{selectedCommission.partnerLabel}</strong></article>
              <article className="admin-partner-program__info-card"><span>Case</span><strong>{selectedCommission.caseCode}</strong></article>
              <article className="admin-partner-program__info-card"><span>Commission amount</span><strong>{formatCurrency(selectedCommission.amount, selectedCommission.currency)}</strong></article>
              <article className="admin-partner-program__info-card"><span>Status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={selectedCommission.status === "paid" ? "success" : selectedCommission.status === "approved" ? "warning" : "neutral"}>{selectedCommission.status}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Commission rate</span><strong>{selectedCommission.commission_rate || "—"}</strong></article>
              <article className="admin-partner-program__info-card"><span>Source amount</span><strong>{selectedCommission.source_amount ? formatCurrency(selectedCommission.source_amount, selectedCommission.currency) : "—"}</strong></article>
            </section>
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
