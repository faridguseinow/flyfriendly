import { useEffect, useMemo, useState } from "react";
import { Download, FilterX, RefreshCw } from "lucide-react";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminPageHeader,
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

  const metrics = useMemo(() => ([
    { label: "Records", value: isLoading ? "—" : summary.totalRecords },
    { label: "Pending", value: isLoading ? "—" : formatCurrency(summary.pendingAmount) },
    { label: "Approved", value: isLoading ? "—" : formatCurrency(summary.approvedAmount) },
    { label: "Paid", value: isLoading ? "—" : formatCurrency(summary.paidAmount) },
    { label: "Total commission", value: isLoading ? "—" : formatCurrency(summary.pendingAmount + summary.approvedAmount + summary.paidAmount) },
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
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.partnerName || "—"}</span>,
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
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.caseCode || "—"}</span>,
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
      key: "compensation",
      label: "Compensation",
      width: 140,
      minWidth: 110,
      maxWidth: 220,
      wrap: false,
      align: "right",
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{formatCurrency(row.compensationAmount, row.currency)}</span>,
    },
    {
      key: "revenue",
      label: "Revenue",
      width: 130,
      minWidth: 110,
      maxWidth: 200,
      wrap: false,
      align: "right",
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{formatCurrency(row.companyRevenueAmount, row.currency)}</span>,
    },
    {
      key: "rate",
      label: "Rate",
      width: 100,
      minWidth: 90,
      maxWidth: 150,
      wrap: false,
      align: "right",
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{formatRate(row.partnerRate)}</span>,
    },
    {
      key: "commission",
      label: "Commission",
      width: 140,
      minWidth: 110,
      maxWidth: 220,
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
        <AdminPageHeader
          title="Partner commissions"
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
        />

        <AdminMetricsStrip items={metrics} />

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
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setPartnerFilter("all");
              setDateRange({ from: "", to: "" });
            }}
          >
            <FilterX size={14} />
            <span>Clear filters</span>
          </button>
        </AdminFilterBar>

        <AdminColumnTable
          storageKey="ff-admin-table-layout-partner-commissions"
          title="Partner commissions"
          countLabel={`${filteredRows.length} record${filteredRows.length === 1 ? "" : "s"}`}
          columns={columns}
          rows={filteredRows}
          loading={isLoading}
          error={displayError ? [displayError.title, displayError.detail].filter(Boolean).join(" ") : ""}
          emptyTitle="No partner commissions found"
          emptyDetail="Commission rows appear after referral compensation is confirmed."
          selectedRowId={selectedCommissionId || ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedCommissionId(row.id)}
        />
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
