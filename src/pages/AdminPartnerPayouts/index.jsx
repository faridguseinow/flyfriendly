import { useEffect, useMemo, useState } from "react";
import { Download, FilterX, Plus, RefreshCw } from "lucide-react";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import {
  formatFinanceCurrency,
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
  formatFinanceRoute,
  getFinanceDisplayError,
} from "../../lib/adminFinanceFormatters.js";
import { createReferralPartnerPayout, fetchReferralPartnersModuleData } from "../../services/adminService.js";
import {
  exportPartnerPaymentsCsv,
  getPartnerPaymentById,
  getPartnerPayments,
  markPartnerPaymentPaid,
  markPartnerPaymentUnpaid,
  updatePartnerPayment,
} from "../../services/adminFinanceService.js";
import "./style.scss";

function formatCurrency(value, currency = "EUR") {
  return formatFinanceCurrency(value, currency);
}

function formatDateTime(value) {
  return formatFinanceDateParts(value);
}

function formatDateTimeLabel(value) {
  return formatFinanceDateTimeLabel(value);
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function formatStatusLabel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "paid") return "Paid";
  if (normalized === "pending") return "Pending";
  if (normalized === "processing") return "Processing";
  if (normalized === "approved") return "Approved";
  if (normalized === "failed") return "Failed";
  if (normalized === "cancelled") return "Cancelled";
  return "Unpaid";
}

function getStatusTone(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "paid") return "success";
  if (["approved", "processing"].includes(normalized)) return "info";
  if (["failed"].includes(normalized)) return "danger";
  if (["pending", "unpaid"].includes(normalized)) return "warning";
  return "neutral";
}

function buildDateFilters(dateRange) {
  return {
    dateFrom: dateRange.from ? `${dateRange.from}T00:00:00` : undefined,
    dateTo: dateRange.to ? `${dateRange.to}T23:59:59` : undefined,
  };
}

function getDisplayError(error) {
  return getFinanceDisplayError(error);
}

function downloadCsvFile(file) {
  if (!file?.csv) {
    return;
  }

  const blob = new Blob([file.csv], { type: file.mimeType || "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename || `partner-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildLocalCsv(rows) {
  const headers = ["Partner", "Case", "Referral Code", "Amount EUR", "Status", "Reference", "Paid At", "Updated At"];
  const csvRows = rows.map((row) => [
    row.partnerName || "",
    row.caseCode || "",
    row.referralCode || "",
    row.partnerCommissionAmount || row.amount || "",
    row.rawStatus || row.status || "",
    row.paymentReference || "",
    row.paidAt || "",
    row.updatedAt || "",
  ]);

  return [headers, ...csvRows]
    .map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function AdminPartnerPayouts() {
  const { hasPermission } = useAdminAuth();
  const canEditPartners = hasPermission("partners.edit") || hasPermission("finance.edit");
  const [rows, setRows] = useState([]);
  const [supportData, setSupportData] = useState({ partners: [], cases: [] });
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedPayoutId, setSelectedPayoutId] = useState(null);
  const [drawerMode, setDrawerMode] = useState("detail");
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [panelNotice, setPanelNotice] = useState("");
  const [activeAction, setActiveAction] = useState("");
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [detailForm, setDetailForm] = useState({ paymentReference: "", note: "" });
  const [createForm, setCreateForm] = useState({
    partner_id: "",
    case_id: "",
    amount: "",
    currency: "EUR",
    status: "pending",
    payout_method: "",
    payment_reference: "",
    note: "",
  });

  const baseFilters = useMemo(() => buildDateFilters(dateRange), [dateRange]);

  const loadData = async () => {
    setError("");
    setIsLoading(true);

    try {
      const [nextRows, moduleData] = await Promise.all([
        getPartnerPayments(baseFilters),
        fetchReferralPartnersModuleData(),
      ]);
      setRows(nextRows);
      setSupportData({
        partners: moduleData?.partners || [],
        cases: moduleData?.cases || [],
      });
      if (!createForm.partner_id && moduleData?.partners?.[0]?.id) {
        setCreateForm((current) => ({ ...current, partner_id: moduleData.partners[0].id }));
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load partner payouts.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [baseFilters]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !query || [
        row.partnerName,
        row.caseCode,
        row.referralCode,
        row.paymentReference,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || normalizeStatus(row.rawStatus) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => {
    const paidRows = filteredRows.filter((row) => normalizeStatus(row.rawStatus) === "paid");
    const activeRows = filteredRows.filter((row) => !["paid", "failed", "cancelled"].includes(normalizeStatus(row.rawStatus)));

    return {
      totalRecords: filteredRows.length,
      pendingAmount: activeRows.reduce((sum, row) => sum + Number(row.partnerCommissionAmount || 0), 0),
      paidAmount: paidRows.reduce((sum, row) => sum + Number(row.partnerCommissionAmount || 0), 0),
      unpaidRecords: activeRows.length,
    };
  }, [filteredRows]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(rows.map((row) => normalizeStatus(row.rawStatus)).filter(Boolean)));
    return [
      { value: "all", label: "All statuses" },
      ...statuses.map((status) => ({ value: status, label: formatStatusLabel(status) })),
    ];
  }, [rows]);

  const metrics = useMemo(() => ([
    { label: "Records", value: isLoading ? "—" : summary.totalRecords },
    { label: "Pending", value: isLoading ? "—" : formatCurrency(summary.pendingAmount) },
    { label: "Paid", value: isLoading ? "—" : formatCurrency(summary.paidAmount) },
    { label: "Unpaid", value: isLoading ? "—" : summary.unpaidRecords },
    { label: "Total amount", value: isLoading ? "—" : formatCurrency(summary.pendingAmount + summary.paidAmount) },
  ]), [isLoading, summary]);

  const columns = useMemo(() => ([
    {
      key: "partner",
      label: "Partner",
      width: 180,
      minWidth: 140,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.partnerName || "—"}</span>
        </div>
      ),
      getCellTitle: (row) => row.partnerName || "—",
    },
    {
      key: "case",
      label: "Case",
      width: 150,
      minWidth: 120,
      maxWidth: 260,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.caseCode || "—"}</span>
        </div>
      ),
      getCellTitle: (row) => row.caseCode || "—",
    },
    {
      key: "referralCode",
      label: "Referral code",
      width: 140,
      minWidth: 110,
      maxWidth: 220,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.referralCode || "—"}</span>,
      getCellTitle: (row) => row.referralCode || "—",
    },
    {
      key: "amount",
      label: "Amount",
      width: 130,
      minWidth: 110,
      maxWidth: 200,
      wrap: false,
      align: "right",
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{formatCurrency(row.partnerCommissionAmount, row.currency)}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      minWidth: 110,
      maxWidth: 220,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <AdminStatusBadge tone={getStatusTone(row.rawStatus)}>{formatStatusLabel(row.rawStatus)}</AdminStatusBadge>,
    },
    {
      key: "reference",
      label: "Reference",
      width: 180,
      minWidth: 140,
      maxWidth: 320,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.paymentReference || "—"}</span>,
      getCellTitle: (row) => row.paymentReference || "—",
    },
    {
      key: "paidAt",
      label: "Paid at",
      width: 140,
      minWidth: 110,
      maxWidth: 200,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => {
        const paidAt = formatDateTime(row.paidAt);
        return (
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{paidAt.date}</span>
            {paidAt.time ? <span className="admin-crm-table__cell-sub">{paidAt.time}</span> : null}
          </div>
        );
      },
      getCellTitle: (row) => formatDateTimeLabel(row.paidAt),
    },
    {
      key: "updated",
      label: "Updated",
      width: 140,
      minWidth: 110,
      maxWidth: 200,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => {
        const updatedAt = formatDateTime(row.updatedAt);
        return (
          <div className="admin-crm-table__stack">
            <span className="admin-crm-table__cell-main">{updatedAt.date}</span>
            {updatedAt.time ? <span className="admin-crm-table__cell-sub">{updatedAt.time}</span> : null}
          </div>
        );
      },
      getCellTitle: (row) => formatDateTimeLabel(row.updatedAt),
    },
  ]), []);

  const openDetail = async (payoutId) => {
    setDrawerMode("detail");
    setSelectedPayoutId(payoutId);
    setPanelError("");
    setPanelNotice("");
    setIsPanelLoading(true);

    try {
      const detail = await getPartnerPaymentById(payoutId);
      setSelectedPayout(detail);
      setDetailForm({
        paymentReference: detail?.paymentReference || "",
        note: detail?.internalNote || "",
      });
    } catch (nextError) {
      setPanelError(nextError.message || "Could not load payout detail.");
      setSelectedPayout(null);
    } finally {
      setIsPanelLoading(false);
    }
  };

  const refreshSelectedPayout = async (payoutId) => {
    const detail = await getPartnerPaymentById(payoutId);
    setSelectedPayout(detail);
    setDetailForm({
      paymentReference: detail?.paymentReference || "",
      note: detail?.internalNote || "",
    });
  };

  const runPanelAction = async (actionKey, action, successMessage) => {
    if (!selectedPayoutId) return;
    setPanelError("");
    setPanelNotice("");
    setActiveAction(actionKey);

    try {
      await action();
      await Promise.all([loadData(), refreshSelectedPayout(selectedPayoutId)]);
      setPanelNotice(successMessage);
    } catch (nextError) {
      setPanelError(nextError.message || "Could not update payout.");
    } finally {
      setActiveAction("");
    }
  };

  const handleCreate = async () => {
    if (!createForm.partner_id || !createForm.amount) {
      setPanelError("Partner and amount are required.");
      return;
    }

    setPanelError("");
    setPanelNotice("");
    setActiveAction("create-payout");

    try {
      await createReferralPartnerPayout({
        ...createForm,
        amount: Number(createForm.amount || 0),
      });
      await loadData();
      setDrawerMode("detail");
      setSelectedPayoutId(null);
      setSelectedPayout(null);
      setPanelNotice("Partner payout created.");
      setCreateForm((current) => ({
        ...current,
        case_id: "",
        amount: "",
        payment_reference: "",
        note: "",
      }));
    } catch (nextError) {
      setPanelError(nextError.message || "Could not create payout.");
    } finally {
      setActiveAction("");
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError("");

    try {
      const serviceFile = await exportPartnerPaymentsCsv(baseFilters);
      const hasLocalFilters = Boolean(search.trim() || statusFilter !== "all");
      const file = hasLocalFilters
        ? { ...serviceFile, csv: buildLocalCsv(filteredRows) }
        : serviceFile;
      downloadCsvFile(file);
    } catch (nextError) {
      setError(nextError.message || "Could not export partner payouts.");
    } finally {
      setIsExporting(false);
    }
  };

  const displayError = error ? getDisplayError(error) : null;

  return (
    <div className="admin-page admin-partner-payouts-page">
      <section className="admin-panel admin-partner-payouts__workspace">
        <AdminPageHeader
          title="Partner payouts"
          secondaryActions={[
            {
              label: "Refresh",
              icon: RefreshCw,
              onClick: () => void loadData(),
              disabled: isLoading || isExporting,
            },
            {
              label: isExporting ? "Exporting..." : "Export CSV",
              icon: Download,
              onClick: handleExport,
              disabled: isLoading || isExporting,
            },
          ]}
          primaryAction={canEditPartners ? {
            label: "Create payout",
            icon: Plus,
            onClick: () => {
              setDrawerMode("create");
              setSelectedPayoutId(null);
              setSelectedPayout(null);
              setPanelError("");
              setPanelNotice("");
            },
          } : null}
        />

        <AdminMetricsStrip items={metrics} />

        <AdminFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search partner, case, reference"
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={statusOptions}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        >
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setDateRange({ from: "", to: "" });
            }}
          >
            <FilterX size={14} />
            <span>Clear filters</span>
          </button>
        </AdminFilterBar>

        <AdminColumnTable
          storageKey="ff-admin-table-layout-partner-payouts"
          title="Partner payouts"
          countLabel={`${filteredRows.length} record${filteredRows.length === 1 ? "" : "s"}`}
          columns={columns}
          rows={filteredRows}
          loading={isLoading}
          error={displayError ? [displayError.title, displayError.detail].filter(Boolean).join(" ") : ""}
          emptyTitle="No partner payouts found"
          emptyDetail="Partner payouts appear after referral compensation is confirmed."
          selectedRowId={selectedPayoutId || ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => void openDetail(row.id)}
        />
      </section>

      <AdminSidePanel
        open={drawerMode === "create" || Boolean(selectedPayoutId)}
        withOverlay
        eyebrow={drawerMode === "create" ? "Partner payout" : "Payout detail"}
        title={drawerMode === "create" ? "Create payout" : selectedPayout?.partnerName || "Partner payout"}
        subtitle={drawerMode === "create" ? "Create partner payout record" : selectedPayout?.caseCode || ""}
        onClose={() => {
          setSelectedPayoutId(null);
          setSelectedPayout(null);
          setDrawerMode("detail");
          setPanelError("");
          setPanelNotice("");
        }}
      >
        {panelError ? <p className="admin-message is-error">{panelError}</p> : null}
        {panelNotice ? <p className="admin-message is-success">{panelNotice}</p> : null}

        {drawerMode === "create" ? (
          <div className="admin-partner-payouts__drawer">
            <section className="admin-partner-payouts__section">
              <h3>Create payout</h3>
              <div className="admin-partner-payouts__form-grid">
                <label>
                  <span>Partner</span>
                  <select
                    className="admin-select"
                    value={createForm.partner_id}
                    onChange={(event) => setCreateForm((current) => ({ ...current, partner_id: event.target.value }))}
                    disabled={!canEditPartners || activeAction !== ""}
                  >
                    {supportData.partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>{partner.public_name || partner.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Case</span>
                  <select
                    className="admin-select"
                    value={createForm.case_id}
                    onChange={(event) => setCreateForm((current) => ({ ...current, case_id: event.target.value }))}
                    disabled={!canEditPartners || activeAction !== ""}
                  >
                    <option value="">No case link</option>
                    {supportData.cases.map((caseRow) => (
                      <option key={caseRow.id} value={caseRow.id}>{caseRow.case_code}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Amount</span>
                  <input className="admin-input" type="number" min="0" step="0.01" value={createForm.amount} onChange={(event) => setCreateForm((current) => ({ ...current, amount: event.target.value }))} disabled={!canEditPartners || activeAction !== ""} />
                </label>
                <label>
                  <span>Status</span>
                  <select className="admin-select" value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))} disabled={!canEditPartners || activeAction !== ""}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <span>Payment method</span>
                  <input className="admin-input" value={createForm.payout_method} onChange={(event) => setCreateForm((current) => ({ ...current, payout_method: event.target.value }))} disabled={!canEditPartners || activeAction !== ""} />
                </label>
                <label>
                  <span>Payment reference</span>
                  <input className="admin-input" value={createForm.payment_reference} onChange={(event) => setCreateForm((current) => ({ ...current, payment_reference: event.target.value }))} disabled={!canEditPartners || activeAction !== ""} />
                </label>
                <label className="is-wide">
                  <span>Note</span>
                  <textarea className="admin-input admin-partner-payouts__textarea" value={createForm.note} onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))} disabled={!canEditPartners || activeAction !== ""} />
                </label>
              </div>
              <div className="admin-partner-payouts__action-row">
                <button type="button" className="admin-btn admin-btn-primary btn btn--primary" disabled={!canEditPartners || activeAction !== ""} onClick={handleCreate}>
                  {activeAction === "create-payout" ? "Saving..." : "Create payout"}
                </button>
              </div>
            </section>
          </div>
        ) : isPanelLoading ? (
          <div className="admin-partner-payouts__drawer-state">Loading payout detail...</div>
        ) : selectedPayout ? (
          <div className="admin-partner-payouts__drawer">
            <section className="admin-partner-payouts__section">
              <h3>Partner</h3>
              <div className="admin-partner-payouts__detail-grid">
                <article><span>Partner name</span><strong>{selectedPayout.partnerName || "—"}</strong></article>
                <article><span>Referral code</span><strong>{selectedPayout.referralCode || "—"}</strong></article>
              </div>
            </section>

            <section className="admin-partner-payouts__section">
              <h3>Case</h3>
              <div className="admin-partner-payouts__detail-grid">
                <article><span>Case code</span><strong>{selectedPayout.caseCode || "—"}</strong></article>
                <article><span>Route</span><strong>{formatFinanceRoute(selectedPayout.route)}</strong></article>
              </div>
            </section>

            <section className="admin-partner-payouts__section">
              <h3>Amount</h3>
              <div className="admin-partner-payouts__detail-grid">
                <article><span>Amount</span><strong>{formatCurrency(selectedPayout.partnerCommissionAmount, selectedPayout.currency)}</strong></article>
                <article><span>Currency</span><strong>{selectedPayout.currency || "EUR"}</strong></article>
                <article><span>Status</span><div><AdminStatusBadge tone={getStatusTone(selectedPayout.rawStatus)}>{formatStatusLabel(selectedPayout.rawStatus)}</AdminStatusBadge></div></article>
              </div>
            </section>

            <section className="admin-partner-payouts__section">
              <h3>Payment</h3>
              <div className="admin-partner-payouts__detail-grid">
                <article><span>Paid at</span><strong>{formatDateTimeLabel(selectedPayout.paidAt)}</strong></article>
                <article><span>Updated at</span><strong>{formatDateTimeLabel(selectedPayout.updatedAt)}</strong></article>
              </div>
              <div className="admin-partner-payouts__form-grid">
                <label>
                  <span>Payment reference</span>
                  <input className="admin-input" value={detailForm.paymentReference} onChange={(event) => setDetailForm((current) => ({ ...current, paymentReference: event.target.value }))} disabled={!canEditPartners || activeAction !== ""} />
                </label>
                <label className="is-wide">
                  <span>Note</span>
                  <textarea className="admin-input admin-partner-payouts__textarea" value={detailForm.note} onChange={(event) => setDetailForm((current) => ({ ...current, note: event.target.value }))} disabled={!canEditPartners || activeAction !== ""} />
                </label>
              </div>
            </section>

            <section className="admin-partner-payouts__section">
              <h3>Actions</h3>
              <div className="admin-partner-payouts__action-row">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => runPanelAction(
                    "save",
                    () => updatePartnerPayment(selectedPayout.id, {
                      payment_reference: detailForm.paymentReference,
                      note: detailForm.note,
                    }),
                    "Partner payout updated.",
                  )}
                  disabled={!canEditPartners || activeAction !== ""}
                >
                  {activeAction === "save" ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary btn btn--primary"
                  onClick={() => runPanelAction("paid", () => markPartnerPaymentPaid(selectedPayout.id), "Partner payout marked paid.")}
                  disabled={!canEditPartners || normalizeStatus(selectedPayout.rawStatus) === "paid" || activeAction !== ""}
                >
                  {activeAction === "paid" ? "Saving..." : "Mark paid"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-partner-payouts__button-subtle"
                  onClick={() => runPanelAction("unpaid", () => markPartnerPaymentUnpaid(selectedPayout.id), "Partner payout marked unpaid.")}
                  disabled={!canEditPartners || normalizeStatus(selectedPayout.rawStatus) !== "paid" || activeAction !== ""}
                >
                  {activeAction === "unpaid" ? "Saving..." : "Mark unpaid"}
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="admin-partner-payouts__drawer-state">Payout detail not found.</div>
        )}
      </AdminSidePanel>
    </div>
  );
}
