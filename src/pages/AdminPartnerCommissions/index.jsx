import { useEffect, useMemo, useState } from "react";
import { Download, HandCoins, RefreshCw, Wallet } from "lucide-react";
import { AdminFilterBar, AdminKpiCard, AdminSidePanel, AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
import {
  formatFinanceCurrency,
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
  formatFinanceRoute,
  getFinanceDisplayError,
} from "../../lib/adminFinanceFormatters.js";
import { exportPartnerCommissionsCsv, getPartnerCommissions } from "../../services/adminFinanceService.js";
import "./style.scss";

function formatCurrency(value, currency = "EUR") {
  return formatFinanceCurrency(value, currency);
}

function formatRate(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) {
    return "—";
  }

  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
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

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function formatStatusLabel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "paid") return "Paid";
  if (normalized === "approved") return "Approved";
  if (normalized === "cancelled") return "Cancelled";
  return "Pending";
}

function getStatusTone(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "paid") return "success";
  if (normalized === "approved") return "info";
  if (normalized === "cancelled") return "neutral";
  return "warning";
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
  link.download = file.filename || `partner-commissions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildLocalCsv(rows) {
  const headers = ["Partner", "Referral Code", "Case", "Compensation EUR", "Revenue EUR", "Rate", "Commission EUR", "Status", "Updated At"];
  const csvRows = rows.map((row) => [
    row.partnerName || "",
    row.referralCode || "",
    row.caseCode || "",
    row.compensationAmount || "",
    row.companyRevenueAmount || "",
    formatRate(row.partnerRate),
    row.partnerCommissionAmount || "",
    row.rawStatus || "",
    row.updatedAt || "",
  ]);

  return [headers, ...csvRows]
    .map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function AdminPartnerCommissions() {
  const [rows, setRows] = useState([]);
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedCommissionId, setSelectedCommissionId] = useState(null);

  const baseFilters = useMemo(() => buildDateFilters(dateRange), [dateRange]);

  const loadData = async () => {
    setError("");
    setIsLoading(true);

    try {
      setRows(await getPartnerCommissions(baseFilters));
    } catch (nextError) {
      setError(nextError.message || "Could not load partner commissions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [baseFilters]);

  const partnerOptions = useMemo(() => (
    Array.from(new Set(rows.map((row) => row.partnerName).filter(Boolean))).sort((left, right) => String(left).localeCompare(String(right)))
  ), [rows]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(rows.map((row) => normalizeStatus(row.rawStatus)).filter(Boolean)));
    return [
      { value: "all", label: "All statuses" },
      ...statuses.map((status) => ({ value: status, label: formatStatusLabel(status) })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !query || [
        row.partnerName,
        row.caseCode,
        row.referralCode,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || normalizeStatus(row.rawStatus) === statusFilter;
      const matchesPartner = partnerFilter === "all" || row.partnerName === partnerFilter;
      return matchesSearch && matchesStatus && matchesPartner;
    });
  }, [partnerFilter, rows, search, statusFilter]);

  const summary = useMemo(() => ({
    totalRecords: filteredRows.length,
    pendingAmount: filteredRows.filter((row) => normalizeStatus(row.rawStatus) === "pending").reduce((sum, row) => sum + Number(row.partnerCommissionAmount || 0), 0),
    approvedAmount: filteredRows.filter((row) => normalizeStatus(row.rawStatus) === "approved").reduce((sum, row) => sum + Number(row.partnerCommissionAmount || 0), 0),
    paidAmount: filteredRows.filter((row) => normalizeStatus(row.rawStatus) === "paid").reduce((sum, row) => sum + Number(row.partnerCommissionAmount || 0), 0),
  }), [filteredRows]);

  const selectedCommission = useMemo(
    () => rows.find((row) => row.id === selectedCommissionId) || null,
    [rows, selectedCommissionId],
  );

  const handleExport = async () => {
    setIsExporting(true);
    setError("");

    try {
      const serviceFile = await exportPartnerCommissionsCsv(baseFilters);
      const hasLocalFilters = Boolean(search.trim() || statusFilter !== "all" || partnerFilter !== "all");
      const file = hasLocalFilters
        ? { ...serviceFile, csv: buildLocalCsv(filteredRows) }
        : serviceFile;
      downloadCsvFile(file);
    } catch (nextError) {
      setError(nextError.message || "Could not export partner commissions.");
    } finally {
      setIsExporting(false);
    }
  };

  const displayError = error ? getDisplayError(error) : null;

  return (
    <div className="admin-page admin-partner-commissions-page">
      <section className="admin-panel admin-partner-commissions__workspace">
        <div className="admin-partner-commissions__header">
          <div className="admin-partner-commissions__header-copy">
            <h1>Partner commissions</h1>
            <p>Referral commission records.</p>
          </div>
          <div className="admin-partner-commissions__header-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => void loadData()} disabled={isLoading || isExporting}>
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={handleExport} disabled={isLoading || isExporting}>
              <Download size={14} />
              <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
            </button>
          </div>
        </div>

        <div className="admin-partner-commissions__kpis">
          <AdminKpiCard label="Commission records" value={isLoading ? "—" : summary.totalRecords} icon={HandCoins} />
          <AdminKpiCard label="Pending amount" value={isLoading ? "—" : formatCurrency(summary.pendingAmount)} icon={Wallet} />
          <AdminKpiCard label="Approved amount" value={isLoading ? "—" : formatCurrency(summary.approvedAmount)} icon={Wallet} />
          <AdminKpiCard label="Paid amount" value={isLoading ? "—" : formatCurrency(summary.paidAmount)} icon={Wallet} />
        </div>

        <AdminFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search partner or case"
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={statusOptions}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        >
          <select className="admin-filter-control admin-select" value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)}>
            <option value="all">All partners</option>
            {partnerOptions.map((partner) => (
              <option key={partner} value={partner}>{partner}</option>
            ))}
          </select>
        </AdminFilterBar>

        <section className="admin-partner-commissions__table-card">
          <div className="admin-partner-commissions__table-head">
            <div>
              <h2>Partner commissions</h2>
              <p>{filteredRows.length} record{filteredRows.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="admin-partner-commissions__state">Loading commissions...</div>
          ) : displayError ? (
            <div className="admin-partner-commissions__state is-error">
              <strong>{displayError.title}</strong>
              {displayError.detail ? <span>{displayError.detail}</span> : null}
            </div>
          ) : !filteredRows.length ? (
            <div className="admin-partner-commissions__state">
              <strong>No partner commissions found</strong>
              <span>Commission rows appear after referral compensation is confirmed.</span>
            </div>
          ) : (
            <div className="admin-partner-commissions__table-wrap admin-table-wrap">
              <table className="admin-partner-commissions__table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Case</th>
                    <th>Referral code</th>
                    <th className="is-right">Compensation</th>
                    <th className="is-right">Revenue</th>
                    <th className="is-right">Rate</th>
                    <th className="is-right">Commission</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const updatedAt = formatDateTime(row.updatedAt);
                    return (
                      <tr key={row.id} className="admin-partner-commissions__row" onClick={() => setSelectedCommissionId(row.id)}>
                        <td>
                          <div className="admin-partner-commissions__primary">
                            <strong>{row.partnerName || "—"}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="admin-partner-commissions__case">
                            <strong>{row.caseCode || "—"}</strong>
                          </div>
                        </td>
                        <td>{row.referralCode || "—"}</td>
                        <td className="is-right">{formatCurrency(row.compensationAmount, row.currency)}</td>
                        <td className="is-right">{formatCurrency(row.companyRevenueAmount, row.currency)}</td>
                        <td className="is-right">{formatRate(row.partnerRate)}</td>
                        <td className="is-right">{formatCurrency(row.partnerCommissionAmount, row.currency)}</td>
                        <td><AdminStatusBadge tone={getStatusTone(row.rawStatus)}>{formatStatusLabel(row.rawStatus)}</AdminStatusBadge></td>
                        <td>
                          <div className="admin-partner-commissions__date">
                            <strong>{updatedAt.date}</strong>
                            {updatedAt.time ? <span>{updatedAt.time}</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <AdminSidePanel
        open={Boolean(selectedCommissionId)}
        withOverlay
        eyebrow="Commission detail"
        title={selectedCommission?.partnerName || "Partner commission"}
        subtitle={selectedCommission?.caseCode || ""}
        onClose={() => setSelectedCommissionId(null)}
      >
        {selectedCommission ? (
          <div className="admin-partner-commissions__drawer">
            <section className="admin-partner-commissions__section">
              <h3>Partner</h3>
              <div className="admin-partner-commissions__detail-grid">
                <article><span>Name</span><strong>{selectedCommission.partnerName || "—"}</strong></article>
                <article><span>Referral code</span><strong>{selectedCommission.referralCode || "—"}</strong></article>
                <article><span>Tier / rate</span><strong>{formatRate(selectedCommission.partnerRate)}</strong></article>
              </div>
            </section>

            <section className="admin-partner-commissions__section">
              <h3>Case</h3>
              <div className="admin-partner-commissions__detail-grid">
                <article><span>Case code</span><strong>{selectedCommission.caseCode || "—"}</strong></article>
                <article><span>Route</span><strong>{formatRouteLabel(selectedCommission.route)}</strong></article>
              </div>
            </section>

            <section className="admin-partner-commissions__section">
              <h3>Calculation</h3>
              <div className="admin-partner-commissions__detail-grid">
                <article><span>Compensation</span><strong>{formatCurrency(selectedCommission.compensationAmount, selectedCommission.currency)}</strong></article>
                <article><span>Fly Friendly revenue</span><strong>{formatCurrency(selectedCommission.companyRevenueAmount, selectedCommission.currency)}</strong></article>
                <article><span>Partner rate</span><strong>{formatRate(selectedCommission.partnerRate)}</strong></article>
                <article><span>Partner commission</span><strong>{formatCurrency(selectedCommission.partnerCommissionAmount, selectedCommission.currency)}</strong></article>
              </div>
              <p className="admin-partner-commissions__formula">
                {formatCurrency(selectedCommission.compensationAmount, selectedCommission.currency)} × 30% × {formatRate(selectedCommission.partnerRate)}
              </p>
            </section>

            <section className="admin-partner-commissions__section">
              <h3>Status</h3>
              <div className="admin-partner-commissions__detail-grid">
                <article><span>Commission status</span><div><AdminStatusBadge tone={getStatusTone(selectedCommission.rawStatus)}>{formatStatusLabel(selectedCommission.rawStatus)}</AdminStatusBadge></div></article>
                <article><span>Created</span><strong>{formatDateTimeLabel(selectedCommission.createdAt)}</strong></article>
                <article><span>Approved</span><strong>{formatDateTimeLabel(selectedCommission.approvedAt)}</strong></article>
                <article><span>Paid</span><strong>{formatDateTimeLabel(selectedCommission.paidAt)}</strong></article>
              </div>
            </section>
          </div>
        ) : (
          <div className="admin-partner-commissions__drawer-state">Commission detail not found.</div>
        )}
      </AdminSidePanel>
    </div>
  );
}
