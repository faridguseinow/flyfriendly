import { useEffect, useMemo, useState } from "react";
import { Download, Wallet } from "lucide-react";
import { createReferralPartnerPayout, fetchReferralPartnersModuleData } from "../../services/adminService.js";
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

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

export default function AdminPartnerPayouts() {
  const { hasPermission } = useAdminAuth();
  const canEditPartners = hasPermission("partners.edit");
  const [moduleData, setModuleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPayoutId, setSelectedPayoutId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [drawerMode, setDrawerMode] = useState("detail");
  const [payoutForm, setPayoutForm] = useState({
    partner_id: "",
    case_id: "",
    amount: "",
    currency: "EUR",
    status: "pending",
    payout_method: "",
    payment_reference: "",
    note: "",
  });

  const load = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchReferralPartnersModuleData();
      setModuleData(next);
      if (!selectedPayoutId && next.payouts?.[0]) {
        setSelectedPayoutId(next.payouts[0].id);
      }
      if (!payoutForm.partner_id && next.partners?.[0]) {
        setPayoutForm((current) => ({ ...current, partner_id: next.partners[0].id }));
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load partner payouts.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const partnersById = useMemo(() => new Map((moduleData?.partners || []).map((item) => [item.id, item])), [moduleData?.partners]);
  const casesById = useMemo(() => new Map((moduleData?.cases || []).map((item) => [item.id, item])), [moduleData?.cases]);
  const statuses = useMemo(() => Array.from(new Set((moduleData?.payouts || []).map((item) => item.status).filter(Boolean))), [moduleData?.payouts]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (moduleData?.payouts || []).filter((item) => {
      const partner = partnersById.get(item.partner_id);
      const caseRow = casesById.get(item.case_id);
      const matchesSearch = !query || [
        partner?.public_name,
        partner?.name,
        caseRow?.case_code,
        item.payment_reference,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).map((item) => ({
      ...item,
      partnerLabel: partnersById.get(item.partner_id)?.public_name || partnersById.get(item.partner_id)?.name || "—",
      caseCode: casesById.get(item.case_id)?.case_code || "—",
    }));
  }, [casesById, moduleData?.payouts, partnersById, search, statusFilter]);

  const selectedPayout = useMemo(
    () => rows.find((item) => item.id === selectedPayoutId) || rows[0] || null,
    [rows, selectedPayoutId],
  );

  const handleCreate = async () => {
    if (!payoutForm.partner_id || !payoutForm.amount) {
      setError("Partner and amount are required.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await createReferralPartnerPayout({
        ...payoutForm,
        amount: Number(payoutForm.amount || 0),
      });
      setDrawerOpen(false);
      setDrawerMode("detail");
      setPayoutForm((current) => ({ ...current, case_id: "", amount: "", payment_reference: "", note: "" }));
      await load();
    } catch (nextError) {
      setError(nextError.message || "Could not create referral payout.");
    } finally {
      setIsSaving(false);
    }
  };

  const totalPending = useMemo(() => rows.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount || 0), 0), [rows]);

  return (
    <div className="admin-page admin-partner-payouts-page">
      <AdminPageHeader
        title="Partner Payouts"
        subtitle="Payout records by partner, amount, status, and payment reference"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Partner Payouts" },
        ]}
        primaryAction={canEditPartners ? {
          label: "Create payout",
          onClick: () => {
            setDrawerMode("create");
            setDrawerOpen(true);
          },
        } : null}
        secondaryActions={[
          {
            label: "Export CSV",
            icon: Download,
            onClick: () => {},
            disabled: true,
          },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}

      <div className="admin-partner-program__kpis">
        <AdminKpiCard label="Payout records" value={isLoading ? "—" : rows.length} icon={Wallet} />
        <AdminKpiCard label="Pending payout value" value={isLoading ? "—" : formatCurrency(totalPending)} icon={Wallet} />
      </div>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search partner, case, payment reference"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { value: "all", label: "All statuses" },
          ...statuses.map((status) => ({ value: status, label: status })),
        ]}
      />

      <AdminDataTable
        title="Partner payouts"
        description={isLoading ? "" : `${rows.length} payout records match the current filters.`}
        columns={[
          { key: "amount", label: "Payout amount" },
          { key: "status", label: "Status" },
          { key: "partner", label: "Partner" },
          { key: "claim", label: "Claim" },
          { key: "reference", label: "Payment reference" },
          { key: "date", label: "Created" },
          { key: "action", label: "Action" },
        ]}
        rows={rows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyLabel="No partner payouts found."
        renderRow={(row) => (
          <tr key={row.id}>
            <td>{formatCurrency(row.amount, row.currency)}</td>
            <td><AdminStatusBadge tone={row.status === "paid" ? "success" : row.status === "approved" ? "warning" : "neutral"}>{row.status}</AdminStatusBadge></td>
            <td>{row.partnerLabel}</td>
            <td>{row.caseCode}</td>
            <td>{row.payment_reference || "—"}</td>
            <td>{formatDate(row.created_at)}</td>
            <td>
              <button
                type="button"
                className="admin-link-button"
                onClick={() => {
                  setSelectedPayoutId(row.id);
                  setDrawerMode("detail");
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
        title={drawerMode === "create" ? "Create payout" : "Payout detail"}
        subtitle={drawerMode === "create"
          ? "Create partner payout record"
          : selectedPayout ? `${selectedPayout.partnerLabel} • ${formatCurrency(selectedPayout.amount, selectedPayout.currency)}` : ""}
        onClose={() => setDrawerOpen(false)}
      >
        {drawerMode === "detail" && selectedPayout && !isSaving ? (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__summary-grid">
              <article className="admin-partner-program__info-card"><span>Partner</span><strong>{selectedPayout.partnerLabel}</strong></article>
              <article className="admin-partner-program__info-card"><span>Case</span><strong>{selectedPayout.caseCode}</strong></article>
              <article className="admin-partner-program__info-card"><span>Status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={selectedPayout.status === "paid" ? "success" : selectedPayout.status === "approved" ? "warning" : "neutral"}>{selectedPayout.status}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Payment reference</span><strong>{selectedPayout.payment_reference || "—"}</strong></article>
            </section>
          </div>
        ) : (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__section">
              <h3>Create payout</h3>
              <div className="admin-partner-program__form-grid">
                <label>
                  <span>Partner</span>
                  <select value={payoutForm.partner_id} onChange={(event) => setPayoutForm((current) => ({ ...current, partner_id: event.target.value }))}>
                    {(moduleData?.partners || []).map((partner) => (
                      <option key={partner.id} value={partner.id}>{partner.public_name || partner.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Case</span>
                  <select value={payoutForm.case_id} onChange={(event) => setPayoutForm((current) => ({ ...current, case_id: event.target.value }))}>
                    <option value="">No case link</option>
                    {(moduleData?.cases || []).map((caseRow) => (
                      <option key={caseRow.id} value={caseRow.id}>{caseRow.case_code}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Amount</span>
                  <input type="number" min="0" step="0.01" value={payoutForm.amount} onChange={(event) => setPayoutForm((current) => ({ ...current, amount: event.target.value }))} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={payoutForm.status} onChange={(event) => setPayoutForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="paid">paid</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>
                <label>
                  <span>Payment method</span>
                  <input value={payoutForm.payout_method} onChange={(event) => setPayoutForm((current) => ({ ...current, payout_method: event.target.value }))} />
                </label>
                <label>
                  <span>Payment reference</span>
                  <input value={payoutForm.payment_reference} onChange={(event) => setPayoutForm((current) => ({ ...current, payment_reference: event.target.value }))} />
                </label>
              </div>
              <textarea value={payoutForm.note} onChange={(event) => setPayoutForm((current) => ({ ...current, note: event.target.value }))} placeholder="Internal payout note" />
              <div className="admin-partner-program__action-row">
                <button className="btn btn--primary" type="button" disabled={!canEditPartners || isSaving} onClick={handleCreate}>
                  {isSaving ? "Saving..." : "Create payout"}
                </button>
              </div>
            </section>
          </div>
        )}
      </AdminDetailDrawer>
    </div>
  );
}
