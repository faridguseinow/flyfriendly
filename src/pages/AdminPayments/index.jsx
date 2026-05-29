import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import {
  AdminFilterBar,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import {
  formatFinanceCurrency,
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
  formatFinanceRoute,
  getFinanceDisplayError,
} from "../../lib/adminFinanceFormatters.js";
import {
  exportClientPaymentsCsv,
  exportPartnerPaymentsCsv,
  getClientPayments,
  getPartnerPayments,
  markClientPaymentPaid,
  markClientPaymentUnpaid,
  markPartnerPaymentPaid,
  markPartnerPaymentUnpaid,
  updateClientPayment,
  updatePartnerPayment,
} from "../../services/adminFinanceService.js";
import "./style.scss";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

const FLOW_OPTIONS = [
  { value: "all", label: "All flows" },
  { value: "through_company", label: "Through company" },
  { value: "direct_to_client", label: "Direct to client" },
];

function formatCurrency(value, currency = "EUR") {
  return formatFinanceCurrency(value, currency);
}

function formatDateTime(value) {
  return formatFinanceDateParts(value);
}

function formatDateTimeLabel(value) {
  return formatFinanceDateTimeLabel(value);
}

function formatRate(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  return `${Math.round(numeric <= 1 ? numeric * 100 : numeric)}%`;
}

function getStatusTone(status) {
  return status === "paid" ? "success" : status === "unpaid" ? "warning" : "neutral";
}

function formatStatusLabel(status) {
  return status === "paid" ? "Paid" : "Unpaid";
}

function formatFlowLabel(flow) {
  return flow === "direct_to_client" ? "Direct" : "Through us";
}

function formatRouteLabel(route) {
  return formatFinanceRoute(route);
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
  link.download = file.filename || `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildDateFilters(dateRange) {
  return {
    dateFrom: dateRange.from ? `${dateRange.from}T00:00:00` : undefined,
    dateTo: dateRange.to ? `${dateRange.to}T23:59:59` : undefined,
  };
}

export default function AdminPayments() {
  const { hasPermission } = useAdminAuth();
  const canEditFinance = hasPermission("finance.edit");
  const [activeTab, setActiveTab] = useState("client");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [clientRows, setClientRows] = useState([]);
  const [partnerRows, setPartnerRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [drawerNotice, setDrawerNotice] = useState("");
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [clientForm, setClientForm] = useState({
    paymentReference: "",
    paymentFlowType: "through_company",
    internalNote: "",
  });
  const [partnerForm, setPartnerForm] = useState({
    paymentReference: "",
    internalNote: "",
  });

  const clientFilters = useMemo(() => ({
    search: search.trim() || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    paymentFlowType: flowFilter !== "all" ? flowFilter : undefined,
    ...buildDateFilters(dateRange),
  }), [dateRange, flowFilter, search, statusFilter]);

  const partnerFilters = useMemo(() => ({
    search: search.trim() || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    ...buildDateFilters(dateRange),
  }), [dateRange, search, statusFilter]);

  const loadPayments = async (options = {}) => {
    const preserveSelection = options.preserveSelection !== false;
    setError("");
    setIsLoading(true);

    try {
      const [nextClientRows, nextPartnerRows] = await Promise.all([
        getClientPayments(clientFilters),
        getPartnerPayments(partnerFilters),
      ]);

      setClientRows(nextClientRows);
      setPartnerRows(nextPartnerRows);

      if (!preserveSelection || !selectedPanel?.id) {
        return;
      }

      const nextRows = selectedPanel.type === "partner" ? nextPartnerRows : nextClientRows;
      const stillExists = nextRows.some((row) => row.id === selectedPanel.id);
      if (!stillExists) {
        setSelectedPanel(null);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load payments.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, [clientFilters, partnerFilters]);

  useEffect(() => {
    setSelectedPanel(null);
    setDrawerError("");
    setDrawerNotice("");
  }, [activeTab]);

  const selectedClientPayment = useMemo(
    () => (selectedPanel?.type === "client"
      ? clientRows.find((row) => row.id === selectedPanel.id) || null
      : null),
    [clientRows, selectedPanel],
  );

  const selectedPartnerPayment = useMemo(
    () => (selectedPanel?.type === "partner"
      ? partnerRows.find((row) => row.id === selectedPanel.id) || null
      : null),
    [partnerRows, selectedPanel],
  );

  useEffect(() => {
    setClientForm({
      paymentReference: selectedClientPayment?.paymentReference || "",
      paymentFlowType: selectedClientPayment?.paymentFlowType || "through_company",
      internalNote: selectedClientPayment?.internalNote || "",
    });
  }, [selectedClientPayment?.id, selectedClientPayment?.internalNote, selectedClientPayment?.paymentFlowType, selectedClientPayment?.paymentReference]);

  useEffect(() => {
    setPartnerForm({
      paymentReference: selectedPartnerPayment?.paymentReference || "",
      internalNote: selectedPartnerPayment?.internalNote || "",
    });
  }, [selectedPartnerPayment?.id, selectedPartnerPayment?.internalNote, selectedPartnerPayment?.paymentReference]);

  const runDrawerAction = async (actionKey, action, successMessage) => {
    setDrawerError("");
    setDrawerNotice("");
    setActiveAction(actionKey);

    try {
      await action();
      await loadPayments({ preserveSelection: true });
      setDrawerNotice(successMessage);
    } catch (nextError) {
      setDrawerError(nextError.message || "Could not update payment.");
    } finally {
      setActiveAction("");
    }
  };

  const handleRefresh = async () => {
    await loadPayments({ preserveSelection: true });
  };

  const handleExport = async () => {
    setError("");
    setIsExporting(true);

    try {
      const file = activeTab === "partner"
        ? await exportPartnerPaymentsCsv(partnerFilters)
        : await exportClientPaymentsCsv(clientFilters);
      downloadCsvFile(file);
    } catch (nextError) {
      setError(nextError.message || "Could not export CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  const clientCountLabel = `${clientRows.length} payment${clientRows.length === 1 ? "" : "s"}`;
  const partnerCountLabel = `${partnerRows.length} payment${partnerRows.length === 1 ? "" : "s"}`;
  const displayError = error ? getDisplayError(error) : null;
  const activeRows = activeTab === "partner" ? partnerRows : clientRows;

  const renderState = () => {
    if (isLoading) {
      return <div className="admin-payments__table-state">Loading payments...</div>;
    }

    if (displayError) {
      return (
        <div className="admin-payments__table-state is-error">
          <strong>{displayError.title}</strong>
          {displayError.detail ? <span>{displayError.detail}</span> : null}
        </div>
      );
    }

    if (!activeRows.length) {
      return (
        <div className="admin-payments__table-state">
          <strong>{activeTab === "partner" ? "No partner payments found" : "No payments found"}</strong>
          <span>
            {activeTab === "partner"
              ? "Partner payouts appear after referral compensation is confirmed."
              : "Payments will appear after compensation is confirmed."}
          </span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="admin-page admin-payments-page">
      <section className="admin-panel admin-payments__workspace">
        <div className="admin-payments__header">
          <div className="admin-payments__header-copy">
            <h1>Payments</h1>
            <p>Client and partner payout operations</p>
          </div>
          <div className="admin-payments__header-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleRefresh}
              disabled={isLoading || isExporting}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleExport}
              disabled={isLoading || isExporting}
            >
              <Download size={14} />
              <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
            </button>
          </div>
        </div>

        <div className="admin-payments__tabs">
          <button
            type="button"
            className={`admin-payments__tab${activeTab === "client" ? " is-active" : ""}`}
            onClick={() => setActiveTab("client")}
          >
            <span>Client payments</span>
            <strong>{clientRows.length}</strong>
          </button>
          <button
            type="button"
            className={`admin-payments__tab${activeTab === "partner" ? " is-active" : ""}`}
            onClick={() => setActiveTab("partner")}
          >
            <span>Partner payments</span>
            <strong>{partnerRows.length}</strong>
          </button>
        </div>

        <AdminFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={activeTab === "partner"
            ? "Search case, partner, referral code"
            : "Search case, client, route"}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={STATUS_OPTIONS}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        >
          {activeTab === "client" ? (
            <select
              className="admin-filter-control admin-select"
              value={flowFilter}
              onChange={(event) => setFlowFilter(event.target.value)}
            >
              {FLOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : null}
        </AdminFilterBar>

        <section className="admin-payments__table-card">
          <div className="admin-payments__table-head">
            <div>
              <h2>{activeTab === "partner" ? "Partner payments" : "Client payments"}</h2>
              <p>{activeTab === "partner" ? partnerCountLabel : clientCountLabel}</p>
            </div>
          </div>

          {renderState() || (
            <div className="admin-payments__table-wrap admin-table-wrap">
              {activeTab === "partner" ? (
                <table className="admin-payments__table">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Partner</th>
                      <th>Referral</th>
                      <th className="is-right">Rate</th>
                      <th className="is-right">Commission</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerRows.map((row) => {
                      const updated = formatDateTime(row.updatedAt);
                      return (
                        <tr
                          key={row.id}
                          className="admin-payments__row"
                          onClick={() => {
                            setSelectedPanel({ type: "partner", id: row.id });
                            setDrawerError("");
                            setDrawerNotice("");
                          }}
                        >
                          <td>
                            <div className="admin-payments__case">
                              <strong>{row.caseCode || "—"}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="admin-payments__primary-cell">
                              <strong>{row.partnerName || "—"}</strong>
                            </div>
                          </td>
                          <td>{row.referralCode || "—"}</td>
                          <td className="is-right">{formatRate(row.partnerRate)}</td>
                          <td className="is-right">{formatCurrency(row.partnerCommissionAmount, row.currency)}</td>
                          <td><AdminStatusBadge tone={getStatusTone(row.status)}>{formatStatusLabel(row.status)}</AdminStatusBadge></td>
                          <td>
                            <div className="admin-payments__date-cell">
                              <strong>{updated.date}</strong>
                              {updated.time ? <span>{updated.time}</span> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="admin-payments__table">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Client</th>
                      <th>Route</th>
                      <th className="is-right">Compensation</th>
                      <th className="is-right">Payout</th>
                      <th>Status</th>
                      <th>Flow</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map((row) => {
                      const updated = formatDateTime(row.updatedAt);
                      return (
                        <tr
                          key={row.id}
                          className="admin-payments__row"
                          onClick={() => {
                            setSelectedPanel({ type: "client", id: row.id });
                            setDrawerError("");
                            setDrawerNotice("");
                          }}
                        >
                          <td>
                            <div className="admin-payments__case">
                              <strong>{row.caseCode || "—"}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="admin-payments__primary-cell">
                              <strong>{row.clientLabel || "—"}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="admin-payments__route">
                              <strong>{formatRouteLabel(row.route)}</strong>
                            </div>
                          </td>
                          <td className="is-right">{formatCurrency(row.compensationAmount, row.currency)}</td>
                          <td className="is-right">{formatCurrency(row.finalClientPayoutAmount, row.currency)}</td>
                          <td><AdminStatusBadge tone={getStatusTone(row.status)}>{formatStatusLabel(row.status)}</AdminStatusBadge></td>
                          <td><AdminStatusBadge tone={row.paymentFlowType === "direct_to_client" ? "neutral" : "info"}>{formatFlowLabel(row.paymentFlowType)}</AdminStatusBadge></td>
                          <td>
                            <div className="admin-payments__date-cell">
                              <strong>{updated.date}</strong>
                              {updated.time ? <span>{updated.time}</span> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </section>

      <AdminSidePanel
        open={Boolean(selectedPanel)}
        withOverlay
        eyebrow={selectedPanel?.type === "partner" ? "Partner payment" : "Client payment"}
        title={selectedPanel?.type === "partner"
          ? selectedPartnerPayment?.partnerName || "Payment detail"
          : selectedClientPayment?.caseCode || "Payment detail"}
        subtitle={selectedPanel?.type === "partner"
          ? selectedPartnerPayment?.caseCode || ""
          : selectedClientPayment?.clientLabel || ""}
        onClose={() => {
          setSelectedPanel(null);
          setDrawerError("");
          setDrawerNotice("");
        }}
      >
        {drawerError ? <p className="admin-message is-error">{drawerError}</p> : null}
        {drawerNotice ? <p className="admin-message is-success">{drawerNotice}</p> : null}

        {selectedPanel?.type === "partner" && selectedPartnerPayment ? (
          <div className="admin-payments__drawer">
            <section className="admin-payments__section">
              <h3>Partner</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Partner name</span><strong>{selectedPartnerPayment.partnerName || "—"}</strong></article>
                <article><span>Referral code</span><strong>{selectedPartnerPayment.referralCode || "—"}</strong></article>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Case</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Case code</span><strong>{selectedPartnerPayment.caseCode || "—"}</strong></article>
                <article><span>Route</span><strong>{formatRouteLabel(selectedPartnerPayment.route)}</strong></article>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Amounts</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Compensation</span><strong>{formatCurrency(selectedPartnerPayment.compensationAmount, selectedPartnerPayment.currency)}</strong></article>
                <article><span>Fly Friendly revenue</span><strong>{formatCurrency(selectedPartnerPayment.companyRevenueAmount, selectedPartnerPayment.currency)}</strong></article>
                <article><span>Partner rate</span><strong>{formatRate(selectedPartnerPayment.partnerRate)}</strong></article>
                <article><span>Partner commission</span><strong>{formatCurrency(selectedPartnerPayment.partnerCommissionAmount, selectedPartnerPayment.currency)}</strong></article>
                <article><span>Currency</span><strong>{selectedPartnerPayment.currency || "EUR"}</strong></article>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Payment</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Status</span><div><AdminStatusBadge tone={getStatusTone(selectedPartnerPayment.status)}>{formatStatusLabel(selectedPartnerPayment.status)}</AdminStatusBadge></div></article>
                <article><span>Paid at</span><strong>{formatDateTimeLabel(selectedPartnerPayment.paidAt)}</strong></article>
                <article><span>Updated at</span><strong>{formatDateTimeLabel(selectedPartnerPayment.updatedAt)}</strong></article>
              </div>
              <div className="admin-payments__form-grid">
                <label>
                  <span>Reference</span>
                  <input
                    className="admin-input"
                    value={partnerForm.paymentReference}
                    onChange={(event) => setPartnerForm((current) => ({ ...current, paymentReference: event.target.value }))}
                    placeholder="Payment reference"
                    disabled={!canEditFinance || activeAction !== ""}
                  />
                </label>
                <label className="is-wide">
                  <span>Note</span>
                  <textarea
                    className="admin-input admin-payments__textarea"
                    value={partnerForm.internalNote}
                    onChange={(event) => setPartnerForm((current) => ({ ...current, internalNote: event.target.value }))}
                    placeholder="Internal note"
                    disabled={!canEditFinance || activeAction !== ""}
                  />
                </label>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Actions</h3>
              <div className="admin-payments__action-row">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => runDrawerAction(
                    "partner-save",
                    () => updatePartnerPayment(selectedPartnerPayment.id, {
                      payment_reference: partnerForm.paymentReference,
                      note: partnerForm.internalNote,
                    }),
                    "Partner payment updated.",
                  )}
                  disabled={!canEditFinance || activeAction !== ""}
                >
                  {activeAction === "partner-save" ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary btn btn--primary"
                  onClick={() => runDrawerAction(
                    "partner-paid",
                    () => markPartnerPaymentPaid(selectedPartnerPayment.id),
                    "Partner payment marked paid.",
                  )}
                  disabled={!canEditFinance || selectedPartnerPayment.status === "paid" || activeAction !== ""}
                >
                  {activeAction === "partner-paid" ? "Saving..." : "Mark paid"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-payments__button-subtle"
                  onClick={() => runDrawerAction(
                    "partner-unpaid",
                    () => markPartnerPaymentUnpaid(selectedPartnerPayment.id),
                    "Partner payment marked unpaid.",
                  )}
                  disabled={!canEditFinance || selectedPartnerPayment.status !== "paid" || activeAction !== ""}
                >
                  {activeAction === "partner-unpaid" ? "Saving..." : "Mark unpaid"}
                </button>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Audit</h3>
              <p className="admin-payments__audit-placeholder">Audit log will appear here after changes.</p>
            </section>
          </div>
        ) : selectedClientPayment ? (
          <div className="admin-payments__drawer">
            <section className="admin-payments__section">
              <h3>Case</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Case code</span><strong>{selectedClientPayment.caseCode || "—"}</strong></article>
                <article><span>Client label</span><strong>{selectedClientPayment.clientLabel || "—"}</strong></article>
                <article><span>Route</span><strong>{formatRouteLabel(selectedClientPayment.route)}</strong></article>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Amounts</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Compensation</span><strong>{formatCurrency(selectedClientPayment.compensationAmount, selectedClientPayment.currency)}</strong></article>
                <article><span>Fly Friendly revenue</span><strong>{formatCurrency(selectedClientPayment.companyRevenueAmount, selectedClientPayment.currency)}</strong></article>
                <article><span>Calculated client payout</span><strong>{formatCurrency(selectedClientPayment.calculatedClientPayoutAmount, selectedClientPayment.currency)}</strong></article>
                <article><span>Final client payout</span><strong>{formatCurrency(selectedClientPayment.finalClientPayoutAmount, selectedClientPayment.currency)}</strong></article>
                <article><span>Currency</span><strong>{selectedClientPayment.currency || "EUR"}</strong></article>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Payment</h3>
              <div className="admin-payments__detail-grid">
                <article><span>Status</span><div><AdminStatusBadge tone={getStatusTone(selectedClientPayment.status)}>{formatStatusLabel(selectedClientPayment.status)}</AdminStatusBadge></div></article>
                <article><span>Paid at</span><strong>{formatDateTimeLabel(selectedClientPayment.clientPaidAt)}</strong></article>
                <article><span>Updated at</span><strong>{formatDateTimeLabel(selectedClientPayment.updatedAt)}</strong></article>
              </div>
              <div className="admin-payments__form-grid">
                <label>
                  <span>Flow</span>
                  <select
                    className="admin-select"
                    value={clientForm.paymentFlowType}
                    onChange={(event) => setClientForm((current) => ({ ...current, paymentFlowType: event.target.value }))}
                    disabled={!canEditFinance || activeAction !== ""}
                  >
                    {FLOW_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Reference</span>
                  <input
                    className="admin-input"
                    value={clientForm.paymentReference}
                    onChange={(event) => setClientForm((current) => ({ ...current, paymentReference: event.target.value }))}
                    placeholder="Payment reference"
                    disabled={!canEditFinance || activeAction !== ""}
                  />
                </label>
                <label className="is-wide">
                  <span>Internal note</span>
                  <textarea
                    className="admin-input admin-payments__textarea"
                    value={clientForm.internalNote}
                    onChange={(event) => setClientForm((current) => ({ ...current, internalNote: event.target.value }))}
                    placeholder="Internal note"
                    disabled={!canEditFinance || activeAction !== ""}
                  />
                </label>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Actions</h3>
              <div className="admin-payments__action-row">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => runDrawerAction(
                    "client-save",
                    () => updateClientPayment(selectedClientPayment.caseId, {
                      client_payment_reference: clientForm.paymentReference,
                      client_payment_flow_type: clientForm.paymentFlowType,
                      internal_note: clientForm.internalNote,
                    }),
                    "Client payment updated.",
                  )}
                  disabled={!canEditFinance || activeAction !== ""}
                >
                  {activeAction === "client-save" ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary btn btn--primary"
                  onClick={() => runDrawerAction(
                    "client-paid",
                    () => markClientPaymentPaid(selectedClientPayment.caseId),
                    "Client payment marked paid.",
                  )}
                  disabled={!canEditFinance || selectedClientPayment.status === "paid" || activeAction !== ""}
                >
                  {activeAction === "client-paid" ? "Saving..." : "Mark paid"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-payments__button-subtle"
                  onClick={() => runDrawerAction(
                    "client-unpaid",
                    () => markClientPaymentUnpaid(selectedClientPayment.caseId),
                    "Client payment marked unpaid.",
                  )}
                  disabled={!canEditFinance || selectedClientPayment.status !== "paid" || activeAction !== ""}
                >
                  {activeAction === "client-unpaid" ? "Saving..." : "Mark unpaid"}
                </button>
              </div>
            </section>

            <section className="admin-payments__section">
              <h3>Audit</h3>
              <p className="admin-payments__audit-placeholder">Audit log will appear here after changes.</p>
            </section>
          </div>
        ) : (
          <div className="admin-payments__drawer-state">Payment detail not found.</div>
        )}
      </AdminSidePanel>
    </div>
  );
}
