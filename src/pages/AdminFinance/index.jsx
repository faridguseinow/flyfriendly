import { useEffect, useMemo, useState } from "react";
import { Coins, Download, HandCoins, ReceiptText, RefreshCw, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { AdminFilterBar, AdminKpiCard, AdminSidePanel, AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
import {
  formatFinanceCurrency,
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
  formatFinanceRoute,
  getFinanceDisplayError,
} from "../../lib/adminFinanceFormatters.js";
import { normalizeMoneyAmount } from "../../lib/financeCalculations.js";
import {
  exportFinanceCsv,
  getClientPaymentByCaseId,
  getFinanceRows,
  getFinanceSummary,
  getPartnerPayments,
} from "../../services/adminFinanceService.js";
import "./style.scss";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

function roundMoney(value) {
  return Number(normalizeMoneyAmount(value).toFixed(2));
}

function formatCurrency(value, currency = "EUR") {
  return formatFinanceCurrency(value, currency);
}

function formatDateTime(value) {
  return formatFinanceDateParts(value);
}

function formatDateTimeLabel(value) {
  return formatFinanceDateTimeLabel(value);
}

function formatRouteLabel(route) {
  return formatFinanceRoute(route);
}

function getStatusTone(status) {
  if (status === "paid") return "success";
  if (status === "unpaid") return "warning";
  return "neutral";
}

function formatStatusLabel(status) {
  if (status === "paid") return "Paid";
  if (status === "unpaid") return "Unpaid";
  return "—";
}

function formatFinanceStatusLabel(confirmed) {
  return confirmed ? "Confirmed" : "Pending";
}

function getFinanceStatusTone(confirmed) {
  return confirmed ? "success" : "neutral";
}

function downloadCsvFile(file) {
  if (!file?.csv) {
    return;
  }

  const blob = new Blob([file.csv], { type: file.mimeType || "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename || `finance-${new Date().toISOString().slice(0, 10)}.csv`;
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

function buildSummaryFromRows(rows = []) {
  return rows.reduce((summary, row) => {
    const compensation = normalizeMoneyAmount(row.compensationAmount);
    const revenue = normalizeMoneyAmount(row.companyRevenueAmount);
    const clientPayout = normalizeMoneyAmount(row.clientPayoutAmount);
    const partnerPayout = normalizeMoneyAmount(row.partnerCommissionAmount);
    const clientPaid = row.clientPaymentStatus === "paid";
    const partnerApplicable = Boolean(row.partnerName || row.referralCode || partnerPayout > 0 || row.partnerPaymentStatus);
    const partnerPaid = partnerApplicable && row.partnerPaymentStatus === "paid";

    return {
      totalCompensation: roundMoney(summary.totalCompensation + compensation),
      totalRevenue: roundMoney(summary.totalRevenue + revenue),
      totalClientPayouts: roundMoney(summary.totalClientPayouts + clientPayout),
      totalPartnerPayouts: roundMoney(summary.totalPartnerPayouts + partnerPayout),
      netProfit: roundMoney(summary.netProfit + normalizeMoneyAmount(row.netProfit)),
      unpaidAmount: roundMoney(
        summary.unpaidAmount
        + (clientPaid ? 0 : clientPayout)
        + (partnerApplicable && !partnerPaid ? partnerPayout : 0),
      ),
      paidClientAmount: roundMoney(summary.paidClientAmount + (clientPaid ? clientPayout : 0)),
      paidPartnerAmount: roundMoney(summary.paidPartnerAmount + (partnerPaid ? partnerPayout : 0)),
    };
  }, {
    totalCompensation: 0,
    totalRevenue: 0,
    totalClientPayouts: 0,
    totalPartnerPayouts: 0,
    netProfit: 0,
    unpaidAmount: 0,
    paidClientAmount: 0,
    paidPartnerAmount: 0,
  });
}

function buildMonthlyOverview(rows = []) {
  const buckets = new Map();

  rows.forEach((row) => {
    const sourceDate = row.updatedAt || null;
    const parsed = sourceDate ? new Date(sourceDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return;
    }

    const monthKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    const current = buckets.get(monthKey) || {
      monthKey,
      label: parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
      compensation: 0,
      revenue: 0,
      netProfit: 0,
    };

    current.compensation += normalizeMoneyAmount(row.compensationAmount);
    current.revenue += normalizeMoneyAmount(row.companyRevenueAmount);
    current.netProfit += normalizeMoneyAmount(row.netProfit);
    buckets.set(monthKey, current);
  });

  return [...buckets.values()]
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .map((item) => ({
      ...item,
      compensation: roundMoney(item.compensation),
      revenue: roundMoney(item.revenue),
      netProfit: roundMoney(item.netProfit),
    }));
}

function buildLocalFinanceCsv(rows = []) {
  const headers = [
    "Case Code",
    "Route",
    "Compensation EUR",
    "Revenue EUR",
    "Client Payout EUR",
    "Partner",
    "Referral Code",
    "Partner Commission EUR",
    "Net Profit EUR",
    "Client Payment Status",
    "Partner Payment Status",
    "Updated At",
  ];

  const csvRows = rows.map((row) => [
    row.caseCode || "",
    row.route || "",
    row.compensationAmount ?? "",
    row.companyRevenueAmount ?? "",
    row.clientPayoutAmount ?? "",
    row.partnerName || "",
    row.referralCode || "",
    row.partnerCommissionAmount ?? "",
    row.netProfit ?? "",
    row.clientPaymentStatus || "",
    row.partnerPaymentStatus || "",
    row.updatedAt || "",
  ]);

  return [headers, ...csvRows]
    .map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function AdminFinance() {
  const [rows, setRows] = useState([]);
  const [remoteSummary, setRemoteSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorState, setErrorState] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [partyFilter, setPartyFilter] = useState("");
  const [caseReferenceFilter, setCaseReferenceFilter] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [detailState, setDetailState] = useState({ clientPayment: null, partnerPayment: null });
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const baseFilters = useMemo(() => buildDateFilters(dateRange), [dateRange]);

  const loadFinance = async () => {
    setErrorState(null);
    setIsLoading(true);

    try {
      const [nextSummary, nextRows] = await Promise.all([
        getFinanceSummary(baseFilters),
        getFinanceRows(baseFilters),
      ]);

      setRemoteSummary(nextSummary);
      setRows(nextRows);
    } catch (nextError) {
      setErrorState(getFinanceDisplayError(nextError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadFinance();
  }, [baseFilters]);

  useEffect(() => {
    if (!selectedCaseId) {
      setDetailState({ clientPayment: null, partnerPayment: null });
      setDetailError("");
      setIsDetailLoading(false);
      return;
    }

    const selectedStillExists = rows.some((row) => row.caseId === selectedCaseId);
    if (!selectedStillExists) {
      setSelectedCaseId(null);
      setDetailState({ clientPayment: null, partnerPayment: null });
      setDetailError("");
    }
  }, [rows, selectedCaseId]);

  const filteredRows = useMemo(() => {
    const normalizedParty = partyFilter.trim().toLowerCase();
    const normalizedCase = caseReferenceFilter.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesParty = !normalizedParty || [
        row.clientLabel,
        row.partnerName,
        row.referralCode,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedParty));

      const matchesCase = !normalizedCase || String(row.caseCode || "").toLowerCase().includes(normalizedCase);

      if (!matchesParty || !matchesCase) {
        return false;
      }

      if (statusFilter === "all") {
        return true;
      }

      return row.clientPaymentStatus === statusFilter || row.partnerPaymentStatus === statusFilter;
    });
  }, [caseReferenceFilter, partyFilter, rows, statusFilter]);

  const hasLocalFilters = Boolean(
    partyFilter.trim()
    || caseReferenceFilter.trim()
    || statusFilter !== "all",
  );

  const localSummary = useMemo(() => buildSummaryFromRows(filteredRows), [filteredRows]);
  const summary = hasLocalFilters ? localSummary : (remoteSummary || localSummary);

  const monthlyOverview = useMemo(() => buildMonthlyOverview(filteredRows), [filteredRows]);

  const paymentStatusSummary = useMemo(() => {
    const clientPaidRows = filteredRows.filter((row) => row.clientPaymentStatus === "paid");
    const clientUnpaidRows = filteredRows.filter((row) => row.clientPaymentStatus !== "paid");
    const partnerRows = filteredRows.filter((row) => row.partnerName || row.referralCode || normalizeMoneyAmount(row.partnerCommissionAmount) > 0);
    const partnerPaidRows = partnerRows.filter((row) => row.partnerPaymentStatus === "paid");
    const partnerUnpaidRows = partnerRows.filter((row) => row.partnerPaymentStatus !== "paid");

    return {
      clientPaid: {
        count: clientPaidRows.length,
        amount: summary.paidClientAmount,
      },
      clientUnpaid: {
        count: clientUnpaidRows.length,
        amount: roundMoney(summary.totalClientPayouts - summary.paidClientAmount),
      },
      partnerPaid: {
        count: partnerPaidRows.length,
        amount: summary.paidPartnerAmount,
      },
      partnerUnpaid: {
        count: partnerUnpaidRows.length,
        amount: roundMoney(summary.totalPartnerPayouts - summary.paidPartnerAmount),
      },
    };
  }, [filteredRows, summary]);

  const referralImpact = useMemo(() => {
    const referralRows = filteredRows.filter((row) => row.partnerName || row.referralCode);

    return {
      referralCases: referralRows.length,
      partnerCommissions: roundMoney(referralRows.reduce((sum, row) => sum + normalizeMoneyAmount(row.partnerCommissionAmount), 0)),
      netAfterPartner: roundMoney(referralRows.reduce((sum, row) => sum + normalizeMoneyAmount(row.netProfit), 0)),
    };
  }, [filteredRows]);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const serviceFile = await exportFinanceCsv(baseFilters);
      const file = hasLocalFilters
        ? { ...serviceFile, csv: buildLocalFinanceCsv(filteredRows) }
        : serviceFile;
      downloadCsvFile(file);
    } catch (nextError) {
      setErrorState(getFinanceDisplayError(nextError));
    } finally {
      setIsExporting(false);
    }
  };

  const selectedFinanceRow = useMemo(
    () => rows.find((row) => row.caseId === selectedCaseId) || null,
    [rows, selectedCaseId],
  );

  const openFinanceDetail = async (caseId) => {
    setSelectedCaseId(caseId);
    setDetailError("");
    setIsDetailLoading(true);

    try {
      const [clientPayment, partnerPayments] = await Promise.all([
        getClientPaymentByCaseId(caseId),
        getPartnerPayments({ caseId, limit: 20 }),
      ]);
      setDetailState({
        clientPayment: clientPayment || null,
        partnerPayment: partnerPayments[0] || null,
      });
    } catch (nextError) {
      setDetailError(nextError.message || "Could not load finance detail.");
      setDetailState({ clientPayment: null, partnerPayment: null });
    } finally {
      setIsDetailLoading(false);
    }
  };

  const renderMainState = () => {
    if (isLoading) {
      return <div className="admin-finance__state-card">Loading finance data...</div>;
    }

    if (errorState) {
      return (
        <div className="admin-finance__state-card is-error">
          <strong>{errorState.title}</strong>
          {errorState.detail ? <span>{errorState.detail}</span> : null}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="admin-page admin-finance-page">
      <section className="admin-panel admin-finance__workspace">
        <div className="admin-finance__header">
          <div className="admin-finance__header-copy">
            <h1>Finance</h1>
          </div>
          <div className="admin-finance__header-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => void loadFinance()}
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
              <span>{isExporting ? "Exporting..." : "Export finance CSV"}</span>
            </button>
          </div>
        </div>

        <AdminFilterBar
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={STATUS_OPTIONS}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchValue={partyFilter}
          onSearchChange={setPartyFilter}
          searchPlaceholder="Partner or client"
        >
          <input
            className="admin-filter-control admin-input"
            type="search"
            value={caseReferenceFilter}
            onChange={(event) => setCaseReferenceFilter(event.target.value)}
            placeholder="Case reference"
          />
        </AdminFilterBar>

        <div className="admin-finance__kpis">
          <AdminKpiCard label="Compensation" value={isLoading ? "—" : formatCurrency(summary.totalCompensation)} icon={Coins} />
          <AdminKpiCard label="Revenue" value={isLoading ? "—" : formatCurrency(summary.totalRevenue)} icon={ReceiptText} />
          <AdminKpiCard label="Client payouts" value={isLoading ? "—" : formatCurrency(summary.totalClientPayouts)} icon={Wallet} />
          <AdminKpiCard label="Partner payouts" value={isLoading ? "—" : formatCurrency(summary.totalPartnerPayouts)} icon={HandCoins} />
          <AdminKpiCard label="Net profit" value={isLoading ? "—" : formatCurrency(summary.netProfit)} icon={Coins} />
          <AdminKpiCard label="Unpaid" value={isLoading ? "—" : formatCurrency(summary.unpaidAmount)} icon={Wallet} />
        </div>

        {renderMainState() || (
          <>
            <div className="admin-finance__insights">
              <section className="admin-finance__card">
                <div className="admin-finance__card-head">
                  <div>
                    <h2>Monthly overview</h2>
                    <p>{monthlyOverview.length} month{monthlyOverview.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                {monthlyOverview.length ? (
                  <div className="admin-finance__monthly-list">
                    {monthlyOverview.map((month) => (
                      <article key={month.monthKey} className="admin-finance__monthly-row">
                        <strong>{month.label}</strong>
                        <div>
                          <span>Compensation {formatCurrency(month.compensation)}</span>
                          <span>Revenue {formatCurrency(month.revenue)}</span>
                          <span>Net {formatCurrency(month.netProfit)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="admin-finance__mini-state">No monthly totals yet.</div>
                )}
              </section>

              <div className="admin-finance__stack">
                <section className="admin-finance__card">
                <div className="admin-finance__card-head">
                  <div>
                    <h2>Payment status summary</h2>
                  </div>
                </div>
                  <div className="admin-finance__mini-grid">
                    <article>
                      <span>Client paid</span>
                      <strong>{paymentStatusSummary.clientPaid.count}</strong>
                      <em>{formatCurrency(paymentStatusSummary.clientPaid.amount)}</em>
                    </article>
                    <article>
                      <span>Client unpaid</span>
                      <strong>{paymentStatusSummary.clientUnpaid.count}</strong>
                      <em>{formatCurrency(paymentStatusSummary.clientUnpaid.amount)}</em>
                    </article>
                    <article>
                      <span>Partner paid</span>
                      <strong>{paymentStatusSummary.partnerPaid.count}</strong>
                      <em>{formatCurrency(paymentStatusSummary.partnerPaid.amount)}</em>
                    </article>
                    <article>
                      <span>Partner unpaid</span>
                      <strong>{paymentStatusSummary.partnerUnpaid.count}</strong>
                      <em>{formatCurrency(paymentStatusSummary.partnerUnpaid.amount)}</em>
                    </article>
                  </div>
                </section>

                <section className="admin-finance__card">
                <div className="admin-finance__card-head">
                  <div>
                    <h2>Referral impact</h2>
                  </div>
                </div>
                  <div className="admin-finance__mini-grid is-compact">
                    <article>
                      <span>Referral cases</span>
                      <strong>{referralImpact.referralCases}</strong>
                    </article>
                    <article>
                      <span>Partner commissions</span>
                      <strong>{formatCurrency(referralImpact.partnerCommissions)}</strong>
                    </article>
                    <article>
                      <span>Net after partner</span>
                      <strong>{formatCurrency(referralImpact.netAfterPartner)}</strong>
                    </article>
                  </div>
                </section>
              </div>
            </div>

            <section className="admin-finance__table-card">
              <div className="admin-finance__card-head">
                <div>
                  <h2>Case finance</h2>
                  <p>{filteredRows.length} record{filteredRows.length === 1 ? "" : "s"}</p>
                </div>
              </div>

              {filteredRows.length ? (
                <div className="admin-finance__table-wrap admin-table-wrap">
                  <table className="admin-finance__table">
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Customer</th>
                        <th className="is-right">Compensation</th>
                        <th className="is-right">Revenue</th>
                        <th className="is-right">Client payout</th>
                        <th>Finance status</th>
                        <th>Client payment</th>
                        <th>Partner payment</th>
                        <th>Updated</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const updated = formatDateTime(row.updatedAt);
                        return (
                          <tr key={`${row.caseId || row.caseCode || "finance-row"}-${row.updatedAt || "row"}`} className="admin-finance__row" onClick={() => void openFinanceDetail(row.caseId)}>
                            <td>
                              <div className="admin-finance__case">
                                <strong>{row.caseCode || "—"}</strong>
                                <span>{formatRouteLabel(row.route)}</span>
                              </div>
                            </td>
                            <td>
                              <div className="admin-finance__partner-cell">
                                <strong>{row.clientLabel || "—"}</strong>
                              </div>
                            </td>
                            <td className="is-right">{formatCurrency(row.compensationAmount)}</td>
                            <td className="is-right">{formatCurrency(row.companyRevenueAmount)}</td>
                            <td className="is-right">{formatCurrency(row.clientPayoutAmount)}</td>
                            <td><AdminStatusBadge tone={getFinanceStatusTone(row.internalCompensationConfirmed)}>{formatFinanceStatusLabel(row.internalCompensationConfirmed)}</AdminStatusBadge></td>
                            <td><AdminStatusBadge tone={getStatusTone(row.clientPaymentStatus)}>{formatStatusLabel(row.clientPaymentStatus)}</AdminStatusBadge></td>
                            <td><AdminStatusBadge tone={getStatusTone(row.partnerPaymentStatus)}>{formatStatusLabel(row.partnerPaymentStatus)}</AdminStatusBadge></td>
                            <td>
                              <div className="admin-finance__date-cell">
                                <strong>{updated.date}</strong>
                                {updated.time ? <span>{updated.time}</span> : null}
                              </div>
                            </td>
                            <td>
                              <button type="button" className="admin-link-button" onClick={(event) => {
                                event.stopPropagation();
                                void openFinanceDetail(row.caseId);
                              }}>
                                Open
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-finance__mini-state">No finance records found.</div>
              )}
            </section>
          </>
        )}
      </section>

      <AdminSidePanel
        open={Boolean(selectedCaseId)}
        withOverlay
        eyebrow="Finance detail"
        title={selectedFinanceRow?.caseCode || "Case finance"}
        subtitle={selectedFinanceRow?.clientLabel || ""}
        onClose={() => {
          setSelectedCaseId(null);
          setDetailState({ clientPayment: null, partnerPayment: null });
          setDetailError("");
        }}
      >
        {detailError ? <p className="admin-message is-error">{detailError}</p> : null}

        {isDetailLoading ? (
          <div className="admin-finance__drawer-state">Loading finance detail...</div>
        ) : selectedFinanceRow ? (
          <div className="admin-finance__drawer">
            <section className="admin-finance__section">
              <h3>Case</h3>
              <div className="admin-finance__detail-grid">
                <article><span>Case code</span><strong>{selectedFinanceRow.caseCode || "—"}</strong></article>
                <article><span>Customer</span><strong>{selectedFinanceRow.clientLabel || "—"}</strong></article>
                <article><span>Route</span><strong>{formatRouteLabel(selectedFinanceRow.route)}</strong></article>
              </div>
            </section>

            <section className="admin-finance__section">
              <h3>Finance</h3>
              <div className="admin-finance__detail-grid">
                <article><span>Compensation</span><strong>{formatCurrency(selectedFinanceRow.compensationAmount)}</strong></article>
                <article><span>Revenue</span><strong>{formatCurrency(selectedFinanceRow.companyRevenueAmount)}</strong></article>
                <article><span>Client payout</span><strong>{formatCurrency(selectedFinanceRow.clientPayoutAmount)}</strong></article>
                <article><span>Net profit</span><strong>{formatCurrency(selectedFinanceRow.netProfit)}</strong></article>
              </div>
            </section>

            <section className="admin-finance__section">
              <h3>Client payment</h3>
              <div className="admin-finance__detail-grid">
                <article><span>Status</span><div><AdminStatusBadge tone={getStatusTone(selectedFinanceRow.clientPaymentStatus)}>{formatStatusLabel(selectedFinanceRow.clientPaymentStatus)}</AdminStatusBadge></div></article>
                <article><span>Visible to client</span><strong>{selectedFinanceRow.clientVisibleApproval ? "Yes" : "No"}</strong></article>
                <article><span>Paid at</span><strong>{formatDateTimeLabel(detailState.clientPayment?.clientPaidAt)}</strong></article>
              </div>
            </section>

            <section className="admin-finance__section">
              <h3>Partner</h3>
              <div className="admin-finance__detail-grid">
                <article><span>Partner</span><strong>{selectedFinanceRow.partnerName || "—"}</strong></article>
                <article><span>Referral code</span><strong>{selectedFinanceRow.referralCode || "—"}</strong></article>
                <article><span>Commission</span><strong>{selectedFinanceRow.partnerName ? formatCurrency(selectedFinanceRow.partnerCommissionAmount) : "—"}</strong></article>
                <article><span>Payout status</span><div><AdminStatusBadge tone={getStatusTone(selectedFinanceRow.partnerPaymentStatus)}>{formatStatusLabel(selectedFinanceRow.partnerPaymentStatus)}</AdminStatusBadge></div></article>
              </div>
            </section>

            <section className="admin-finance__section">
              <h3>Actions</h3>
              <div className="admin-finance__action-row">
                <Link className="admin-btn admin-btn-secondary admin-link-button" to={`/admin/operations/cases?case=${selectedFinanceRow.caseId}`}>
                  <span>Open case</span>
                </Link>
              </div>
            </section>
          </div>
        ) : (
          <div className="admin-finance__drawer-state">Finance detail not found.</div>
        )}
      </AdminSidePanel>
    </div>
  );
}
