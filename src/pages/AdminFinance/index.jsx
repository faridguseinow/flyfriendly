import { useEffect, useMemo, useState } from "react";
import { Coins, Download, HandCoins, ReceiptText, Wallet } from "lucide-react";
import { fetchFinanceModuleData, fetchReferralPartnersModuleData, updateCaseFinance } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import {
  AdminActionQueue,
  AdminDataTable,
  AdminDetailDrawer,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import "./style.scss";

const paymentStatuses = [
  "not_started",
  "awaiting_payment",
  "payment_received",
  "customer_paid",
  "company_fee_collected",
  "referral_paid",
  "completed",
];

const dateRangeDefault = { from: "", to: "" };

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function statusTone(status) {
  if (["completed", "customer_paid", "referral_paid", "paid", "closed"].includes(String(status || "").toLowerCase())) return "success";
  if (["awaiting_payment", "payment_received", "approved", "company_fee_collected"].includes(String(status || "").toLowerCase())) return "warning";
  if (["cancelled", "rejected"].includes(String(status || "").toLowerCase())) return "danger";
  return "neutral";
}

function isWithinDateRange(value, range) {
  if (!value) return false;
  const current = new Date(value).getTime();
  if (Number.isNaN(current)) return false;
  const from = range?.from ? new Date(`${range.from}T00:00:00`).getTime() : null;
  const to = range?.to ? new Date(`${range.to}T23:59:59`).getTime() : null;
  if (from && current < from) return false;
  if (to && current > to) return false;
  return true;
}

function isWonCase(caseRow) {
  return ["approved", "paid", "closed"].includes(String(caseRow?.status || "").toLowerCase());
}

function isUnpaidFinance(financeRow, caseRow) {
  const paymentStatus = String(financeRow?.payment_status || "").toLowerCase();
  const payoutStatus = String(caseRow?.payout_status || "").toLowerCase();
  return !["customer_paid", "referral_paid", "completed"].includes(paymentStatus)
    && !["customer_paid", "referral_paid", "completed"].includes(payoutStatus);
}

function isPaidButNotClosed(financeRow, caseRow) {
  const paymentStatus = String(financeRow?.payment_status || "").toLowerCase();
  const payoutStatus = String(caseRow?.payout_status || "").toLowerCase();
  const caseStatus = String(caseRow?.status || "").toLowerCase();
  const paid = ["customer_paid", "referral_paid", "completed"].includes(paymentStatus)
    || ["customer_paid", "referral_paid", "completed"].includes(payoutStatus)
    || Boolean(financeRow?.customer_paid_at);
  return paid && caseStatus !== "closed";
}

function exportFinanceCsv(rows) {
  const headers = ["Case", "Customer", "Payment Status", "Compensation", "Company Fee", "Customer Payout", "Referral Commission", "Updated At"];
  const lines = rows.map((item) => [
    item.caseCode,
    item.customerLabel,
    item.payment_status,
    item.compensation_amount,
    item.company_fee,
    item.customer_payout,
    item.referral_commission,
    item.updated_at,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-finance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminFinance() {
  const { hasPermission } = useAdminAuth();
  const [financeData, setFinanceData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dateRange, setDateRange] = useState(dateRangeDefault);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("");
  const [caseReferenceFilter, setCaseReferenceFilter] = useState("");

  const loadFinance = async () => {
    setError("");
    setIsLoading(true);
    try {
      const [nextFinance, nextPartner] = await Promise.all([
        fetchFinanceModuleData(),
        fetchReferralPartnersModuleData().catch(() => ({
          partners: [],
          payouts: [],
          commissions: [],
          supportsPartnersModuleV1: false,
        })),
      ]);
      setFinanceData(nextFinance);
      setPartnerData(nextPartner);
    } catch (nextError) {
      setError(nextError.message || "Could not load finance module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, []);

  const financeRows = useMemo(() => {
    const cases = new Map((financeData?.cases || []).map((item) => [item.id, item]));
    const customers = new Map((financeData?.customers || []).map((item) => [item.id, item]));
    const profiles = new Map((financeData?.profiles || []).map((item) => [item.id, item]));

    return (financeData?.finance || []).map((item) => {
      const linkedCase = cases.get(item.case_id);
      const linkedCustomer = linkedCase?.customer_id ? customers.get(linkedCase.customer_id) : null;
      const linkedManager = linkedCase?.assigned_manager_id ? profiles.get(linkedCase.assigned_manager_id) : null;

      return {
        ...item,
        linkedCase,
        linkedCustomer,
        linkedManager,
        caseCode: linkedCase?.case_code || item.case_id,
        customerLabel: linkedCustomer?.full_name || linkedCustomer?.email || "—",
        routeLabel: linkedCase?.route_from && linkedCase?.route_to ? `${linkedCase.route_from} → ${linkedCase.route_to}` : "—",
        currencyLabel: item.currency || "EUR",
        partnerLabel: linkedCase?.referral_partner_label || "—",
      };
    });
  }, [financeData]);

  const commissionRows = useMemo(() => {
    const partners = new Map((partnerData?.partners || []).map((item) => [item.id, item]));
    const cases = new Map((financeData?.cases || []).map((item) => [item.id, item]));
    return (partnerData?.commissions || []).map((item) => {
      const linkedCase = cases.get(item.case_id);
      const partner = partners.get(item.partner_id);
      return {
        ...item,
        caseCode: linkedCase?.case_code || "—",
        partnerLabel: partner?.public_name || partner?.name || "—",
        currencyLabel: item.currency || "EUR",
      };
    });
  }, [financeData?.cases, partnerData?.commissions, partnerData?.partners]);

  const partnerPayoutRows = useMemo(() => {
    const partners = new Map((partnerData?.partners || []).map((item) => [item.id, item]));
    const cases = new Map((financeData?.cases || []).map((item) => [item.id, item]));
    return (partnerData?.payouts || []).map((item) => {
      const linkedCase = cases.get(item.case_id);
      const partner = partners.get(item.partner_id);
      return {
        ...item,
        caseCode: linkedCase?.case_code || "—",
        partnerLabel: partner?.public_name || partner?.name || "—",
        currencyLabel: item.currency || "EUR",
      };
    });
  }, [financeData?.cases, partnerData?.partners, partnerData?.payouts]);

  const clientPayoutRows = useMemo(
    () => financeRows.filter((item) => Number(item.customer_payout || 0) > 0),
    [financeRows],
  );

  const matchesCommonFilters = (row, statusValue, currencyValue, partyValue, caseValue, dateValue) => {
    const normalizedParty = partyFilter.trim().toLowerCase();
    const normalizedCase = caseReferenceFilter.trim().toLowerCase();
    const matchesStatus = statusFilter === "all" || String(statusValue || "").toLowerCase() === statusFilter;
    const matchesCurrency = currencyFilter === "all" || String(currencyValue || "").toUpperCase() === currencyFilter;
    const matchesParty = !normalizedParty || [partyValue].flat().some((value) => String(value || "").toLowerCase().includes(normalizedParty));
    const matchesCase = !normalizedCase || String(caseValue || "").toLowerCase().includes(normalizedCase);
    const matchesDate = (!dateRange.from && !dateRange.to) || isWithinDateRange(dateValue, dateRange);
    return matchesStatus && matchesCurrency && matchesParty && matchesCase && matchesDate;
  };

  const filteredFinanceRows = useMemo(
    () => financeRows.filter((row) => matchesCommonFilters(
      row,
      row.payment_status,
      row.currencyLabel,
      [row.customerLabel, row.partnerLabel],
      row.caseCode,
      row.updated_at || row.created_at,
    )),
    [financeRows, statusFilter, currencyFilter, partyFilter, caseReferenceFilter, dateRange],
  );

  const filteredClientPayouts = useMemo(
    () => clientPayoutRows.filter((row) => matchesCommonFilters(
      row,
      row.payment_status,
      row.currencyLabel,
      [row.customerLabel],
      row.caseCode,
      row.updated_at || row.created_at,
    )),
    [clientPayoutRows, statusFilter, currencyFilter, partyFilter, caseReferenceFilter, dateRange],
  );

  const filteredCommissions = useMemo(
    () => commissionRows.filter((row) => matchesCommonFilters(
      row,
      row.status,
      row.currencyLabel,
      [row.partnerLabel],
      row.caseCode,
      row.paid_at || row.approved_at || row.created_at,
    )),
    [commissionRows, statusFilter, currencyFilter, partyFilter, caseReferenceFilter, dateRange],
  );

  const filteredPartnerPayouts = useMemo(
    () => partnerPayoutRows.filter((row) => matchesCommonFilters(
      row,
      row.status,
      row.currencyLabel,
      [row.partnerLabel],
      row.caseCode,
      row.paid_at || row.created_at,
    )),
    [partnerPayoutRows, statusFilter, currencyFilter, partyFilter, caseReferenceFilter, dateRange],
  );

  const allCurrencies = useMemo(() => {
    const currencies = new Set();
    financeRows.forEach((row) => currencies.add(row.currencyLabel));
    commissionRows.forEach((row) => currencies.add(row.currencyLabel));
    partnerPayoutRows.forEach((row) => currencies.add(row.currencyLabel));
    return Array.from(currencies).filter(Boolean).sort();
  }, [commissionRows, financeRows, partnerPayoutRows]);

  const statusOptions = useMemo(() => {
    const statuses = new Set();
    financeRows.forEach((row) => statuses.add(row.payment_status));
    commissionRows.forEach((row) => statuses.add(row.status));
    partnerPayoutRows.forEach((row) => statuses.add(row.status));
    return [{ value: "all", label: "All statuses" }, ...Array.from(statuses).filter(Boolean).sort().map((item) => ({ value: item, label: item }))];
  }, [commissionRows, financeRows, partnerPayoutRows]);

  const metrics = useMemo(() => {
    const totalEstimated = financeData?.cases
      ? financeData.cases.reduce((sum, item) => sum + Number(item.estimated_compensation || 0), 0)
      : null;
    const pendingClientPayouts = financeRows
      .filter((row) => Number(row.customer_payout || 0) > 0 && !["customer_paid", "completed"].includes(String(row.payment_status || "").toLowerCase()))
      .reduce((sum, row) => sum + Number(row.customer_payout || 0), 0);
    const partnerCommissionsPending = commissionRows
      .filter((row) => row.status === "pending")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const partnerPayoutsPending = partnerPayoutRows
      .filter((row) => row.status === "pending")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const recoveredAmount = financeRows
      .filter((row) => row.payment_received_at || ["payment_received", "customer_paid", "company_fee_collected", "referral_paid", "completed"].includes(String(row.payment_status || "").toLowerCase()))
      .reduce((sum, row) => sum + Number(row.compensation_amount || 0), 0);
    const companyRevenue = financeRows.length
      ? financeRows.reduce((sum, row) => sum + Number(row.company_fee || 0), 0)
      : null;

    return {
      totalEstimated,
      pendingClientPayouts,
      partnerCommissionsPending,
      partnerPayoutsPending,
      recoveredAmount,
      companyRevenue,
    };
  }, [commissionRows, financeData?.cases, financeRows, partnerPayoutRows]);

  const actionQueues = useMemo(() => ({
    payoutsNeedingApproval: filteredPartnerPayouts.filter((row) => row.status === "pending").slice(0, 6),
    commissionsPendingApproval: filteredCommissions.filter((row) => row.status === "pending").slice(0, 6),
    casesWonButUnpaid: filteredFinanceRows.filter((row) => isWonCase(row.linkedCase) && isUnpaidFinance(row, row.linkedCase)).slice(0, 6),
    casesPaidButNotClosed: filteredFinanceRows.filter((row) => isPaidButNotClosed(row, row.linkedCase)).slice(0, 6),
  }), [filteredCommissions, filteredFinanceRows, filteredPartnerPayouts]);

  const openRecord = (kind, row) => {
    setSelectedRecord({ kind, row });
    setDrawerOpen(true);
  };

  const saveFinance = async (updates) => {
    if (!selectedRecord || selectedRecord.kind !== "case-finance") return;
    setError("");
    setIsSaving(true);
    try {
      await updateCaseFinance(selectedRecord.row.id, updates);
      await loadFinance();
    } catch (nextError) {
      setError(nextError.message || "Could not update finance record.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-finance-page">
      <AdminPageHeader
        title="Finance"
        subtitle="Money movement across client payouts, partner payouts, commissions, and case finance"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Finance" },
        ]}
        secondaryActions={[
          {
            label: "Export finance CSV",
            icon: Download,
            onClick: () => exportFinanceCsv(filteredFinanceRows),
            disabled: !filteredFinanceRows.length,
          },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}
      {financeData && !financeData.supportsFinanceModuleV1 ? (
        <p className="admin-message">
          Finance schema is not available yet. Run `007_cases_module_v1.sql` in Supabase to unlock the finance module.
        </p>
      ) : null}

      <div className="admin-finance__kpis">
        <AdminKpiCard label="Total estimated compensation" value={isLoading ? "—" : metrics.totalEstimated !== null ? formatCurrency(metrics.totalEstimated) : "Not configured"} icon={Coins} />
        <AdminKpiCard label="Pending client payouts" value={isLoading ? "—" : formatCurrency(metrics.pendingClientPayouts)} icon={Wallet} />
        <AdminKpiCard label="Partner commissions pending" value={isLoading ? "—" : formatCurrency(metrics.partnerCommissionsPending)} icon={HandCoins} />
        <AdminKpiCard label="Partner payouts pending" value={isLoading ? "—" : formatCurrency(metrics.partnerPayoutsPending)} icon={Wallet} />
        <AdminKpiCard label="Recovered amount" value={isLoading ? "—" : formatCurrency(metrics.recoveredAmount)} icon={ReceiptText} />
        <AdminKpiCard label="Company revenue" value={isLoading ? "—" : metrics.companyRevenue !== null ? formatCurrency(metrics.companyRevenue) : "Not configured"} icon={Coins} />
      </div>

      <AdminFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={statusOptions}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}>
          <option value="all">All currencies</option>
          {allCurrencies.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input
          type="search"
          value={partyFilter}
          onChange={(event) => setPartyFilter(event.target.value)}
          placeholder="Partner or client"
        />
        <input
          type="search"
          value={caseReferenceFilter}
          onChange={(event) => setCaseReferenceFilter(event.target.value)}
          placeholder="Case reference"
        />
      </AdminFilterBar>

      <div className="admin-finance__queues">
        <AdminActionQueue
          title="Payouts needing approval"
          count={actionQueues.payoutsNeedingApproval.length}
          rows={actionQueues.payoutsNeedingApproval}
          emptyLabel="No partner payouts need approval."
          actionPath="/admin/partner-payouts"
          actionLabel="Open payouts"
          renderRow={(row) => (
            <button key={row.id} type="button" className="admin-finance__queue-row" onClick={() => openRecord("partner-payout", row)}>
              <strong>{row.partnerLabel}</strong>
              <span>{row.caseCode} • {formatCurrency(row.amount, row.currencyLabel)}</span>
            </button>
          )}
        />
        <AdminActionQueue
          title="Commissions pending approval"
          count={actionQueues.commissionsPendingApproval.length}
          rows={actionQueues.commissionsPendingApproval}
          emptyLabel="No commissions are pending approval."
          actionPath="/admin/partner-commissions"
          actionLabel="Open commissions"
          renderRow={(row) => (
            <button key={row.id} type="button" className="admin-finance__queue-row" onClick={() => openRecord("commission", row)}>
              <strong>{row.partnerLabel}</strong>
              <span>{row.caseCode} • {formatCurrency(row.amount, row.currencyLabel)}</span>
            </button>
          )}
        />
        <AdminActionQueue
          title="Cases won but unpaid"
          count={actionQueues.casesWonButUnpaid.length}
          rows={actionQueues.casesWonButUnpaid}
          emptyLabel="No won cases are waiting for payout."
          actionPath="/admin/cases"
          actionLabel="Open cases"
          renderRow={(row) => (
            <button key={row.id} type="button" className="admin-finance__queue-row" onClick={() => openRecord("case-finance", row)}>
              <strong>{row.caseCode}</strong>
              <span>{row.customerLabel} • {formatCurrency(row.customer_payout, row.currencyLabel)}</span>
            </button>
          )}
        />
        <AdminActionQueue
          title="Cases paid but not closed"
          count={actionQueues.casesPaidButNotClosed.length}
          rows={actionQueues.casesPaidButNotClosed}
          emptyLabel="No cases are stuck after payment."
          actionPath="/admin/cases"
          actionLabel="Open cases"
          renderRow={(row) => (
            <button key={row.id} type="button" className="admin-finance__queue-row" onClick={() => openRecord("case-finance", row)}>
              <strong>{row.caseCode}</strong>
              <span>{row.customerLabel} • {row.payment_status}</span>
            </button>
          )}
        />
      </div>

      <div className="admin-finance__tables">
        <AdminDataTable
          title="Client payouts"
          description={`${filteredClientPayouts.length} payout records`}
          columns={[
            { key: "case", label: "Case" },
            { key: "customer", label: "Customer" },
            { key: "amount", label: "Payout amount" },
            { key: "status", label: "Status" },
            { key: "updated", label: "Updated" },
            { key: "action", label: "Action" },
          ]}
          rows={filteredClientPayouts}
          loading={isLoading}
          error={!isLoading ? error : ""}
          compact
          emptyLabel="No client payouts match the current filters."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.caseCode}</td>
              <td>{row.customerLabel}</td>
              <td>{formatCurrency(row.customer_payout, row.currencyLabel)}</td>
              <td><AdminStatusBadge tone={statusTone(row.payment_status)}>{row.payment_status}</AdminStatusBadge></td>
              <td>{formatDate(row.updated_at)}</td>
              <td><button type="button" className="admin-link-button" onClick={() => openRecord("case-finance", row)}>Open</button></td>
            </tr>
          )}
        />

        <AdminDataTable
          title="Partner payouts"
          description={`${filteredPartnerPayouts.length} payout records`}
          columns={[
            { key: "partner", label: "Partner" },
            { key: "case", label: "Case" },
            { key: "amount", label: "Payout amount" },
            { key: "status", label: "Status" },
            { key: "reference", label: "Payment reference" },
            { key: "action", label: "Action" },
          ]}
          rows={filteredPartnerPayouts}
          loading={isLoading}
          error={!isLoading ? error : ""}
          compact
          emptyLabel="No partner payouts match the current filters."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.partnerLabel}</td>
              <td>{row.caseCode}</td>
              <td>{formatCurrency(row.amount, row.currencyLabel)}</td>
              <td><AdminStatusBadge tone={statusTone(row.status)}>{row.status}</AdminStatusBadge></td>
              <td>{row.payment_reference || "—"}</td>
              <td><button type="button" className="admin-link-button" onClick={() => openRecord("partner-payout", row)}>Open</button></td>
            </tr>
          )}
        />

        <AdminDataTable
          title="Commissions"
          description={`${filteredCommissions.length} commission records`}
          columns={[
            { key: "partner", label: "Partner" },
            { key: "case", label: "Case" },
            { key: "amount", label: "Commission amount" },
            { key: "status", label: "Status" },
            { key: "rate", label: "Rate" },
            { key: "action", label: "Action" },
          ]}
          rows={filteredCommissions}
          loading={isLoading}
          error={!isLoading ? error : ""}
          compact
          emptyLabel="No commission records match the current filters."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.partnerLabel}</td>
              <td>{row.caseCode}</td>
              <td>{formatCurrency(row.amount, row.currencyLabel)}</td>
              <td><AdminStatusBadge tone={statusTone(row.status)}>{row.status}</AdminStatusBadge></td>
              <td>{row.commission_rate || "—"}</td>
              <td><button type="button" className="admin-link-button" onClick={() => openRecord("commission", row)}>Open</button></td>
            </tr>
          )}
        />

        <AdminDataTable
          title="Case finance"
          description={`${filteredFinanceRows.length} finance records`}
          columns={[
            { key: "case", label: "Case" },
            { key: "customer", label: "Customer" },
            { key: "estimated", label: "Estimated compensation" },
            { key: "status", label: "Finance status" },
            { key: "revenue", label: "Company fee" },
            { key: "action", label: "Action" },
          ]}
          rows={filteredFinanceRows}
          loading={isLoading}
          error={!isLoading ? error : ""}
          compact
          emptyLabel="No finance records match the current filters."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.caseCode}</td>
              <td>{row.customerLabel}</td>
              <td>{formatCurrency(row.compensation_amount, row.currencyLabel)}</td>
              <td><AdminStatusBadge tone={statusTone(row.payment_status)}>{row.payment_status}</AdminStatusBadge></td>
              <td>{formatCurrency(row.company_fee, row.currencyLabel)}</td>
              <td><button type="button" className="admin-link-button" onClick={() => openRecord("case-finance", row)}>Open</button></td>
            </tr>
          )}
        />
      </div>

      <AdminDetailDrawer
        open={drawerOpen}
        title={selectedRecord?.kind === "case-finance"
          ? selectedRecord.row.caseCode
          : selectedRecord?.kind === "partner-payout"
            ? selectedRecord.row.partnerLabel
            : selectedRecord?.kind === "commission"
              ? selectedRecord.row.partnerLabel
              : "Finance detail"}
        subtitle={selectedRecord?.kind === "case-finance"
          ? selectedRecord.row.customerLabel
          : selectedRecord?.kind === "partner-payout"
            ? `${selectedRecord.row.caseCode} • ${formatCurrency(selectedRecord.row.amount, selectedRecord.row.currencyLabel)}`
            : selectedRecord?.kind === "commission"
              ? `${selectedRecord.row.caseCode} • ${formatCurrency(selectedRecord.row.amount, selectedRecord.row.currencyLabel)}`
              : ""}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedRecord?.kind === "case-finance" ? (
          <div className="admin-finance__drawer">
            <section className="admin-finance__summary">
              <article><strong>Case</strong><span>{selectedRecord.row.caseCode}</span></article>
              <article><strong>Customer</strong><span>{selectedRecord.row.customerLabel}</span></article>
              <article><strong>Manager</strong><span>{selectedRecord.row.linkedManager?.full_name || selectedRecord.row.linkedManager?.email || "—"}</span></article>
              <article><strong>Partner</strong><span>{selectedRecord.row.partnerLabel}</span></article>
            </section>

            <section className="admin-finance__section">
              <h3>Status</h3>
              <div className="admin-finance__actions">
                <label>
                  <span>Payment status</span>
                  <select
                    value={selectedRecord.row.payment_status}
                    onChange={(event) => saveFinance({ payment_status: event.target.value })}
                    disabled={!hasPermission("finance.edit") || isSaving}
                  >
                    {paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span>Payment method</span>
                  <input
                    value={selectedRecord.row.payment_method || ""}
                    onChange={(event) => saveFinance({ payment_method: event.target.value || null })}
                    disabled={!hasPermission("finance.edit") || isSaving}
                  />
                </label>
              </div>
            </section>

            <section className="admin-finance__section">
              <h3>Amounts</h3>
              <div className="admin-finance__amounts">
                <label>
                  <span>Compensation</span>
                  <input type="number" value={selectedRecord.row.compensation_amount || 0} onChange={(event) => saveFinance({ compensation_amount: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                </label>
                <label>
                  <span>Company fee</span>
                  <input type="number" value={selectedRecord.row.company_fee || 0} onChange={(event) => saveFinance({ company_fee: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                </label>
                <label>
                  <span>Customer payout</span>
                  <input type="number" value={selectedRecord.row.customer_payout || 0} onChange={(event) => saveFinance({ customer_payout: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                </label>
                <label>
                  <span>Referral commission</span>
                  <input type="number" value={selectedRecord.row.referral_commission || 0} onChange={(event) => saveFinance({ referral_commission: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                </label>
                <label>
                  <span>Agent bonus</span>
                  <input type="number" value={selectedRecord.row.agent_bonus || 0} onChange={(event) => saveFinance({ agent_bonus: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                </label>
              </div>
            </section>

            <section className="admin-finance__section">
              <h3>Timeline</h3>
              <div className="admin-finance__timeline">
                <article><strong>Updated</strong><span>{formatDate(selectedRecord.row.updated_at)}</span></article>
                <article><strong>Payment received</strong><span>{formatDate(selectedRecord.row.payment_received_at)}</span></article>
                <article><strong>Customer paid</strong><span>{formatDate(selectedRecord.row.customer_paid_at)}</span></article>
                <article><strong>Referral paid</strong><span>{formatDate(selectedRecord.row.referral_paid_at)}</span></article>
              </div>
            </section>
          </div>
        ) : selectedRecord?.kind === "partner-payout" ? (
          <div className="admin-finance__drawer">
            <section className="admin-finance__summary">
              <article><strong>Partner</strong><span>{selectedRecord.row.partnerLabel}</span></article>
              <article><strong>Case</strong><span>{selectedRecord.row.caseCode}</span></article>
              <article><strong>Status</strong><span>{selectedRecord.row.status}</span></article>
              <article><strong>Reference</strong><span>{selectedRecord.row.payment_reference || "—"}</span></article>
              <article><strong>Amount</strong><span>{formatCurrency(selectedRecord.row.amount, selectedRecord.row.currencyLabel)}</span></article>
              <article><strong>Method</strong><span>{selectedRecord.row.payout_method || "—"}</span></article>
            </section>
          </div>
        ) : selectedRecord?.kind === "commission" ? (
          <div className="admin-finance__drawer">
            <section className="admin-finance__summary">
              <article><strong>Partner</strong><span>{selectedRecord.row.partnerLabel}</span></article>
              <article><strong>Case</strong><span>{selectedRecord.row.caseCode}</span></article>
              <article><strong>Status</strong><span>{selectedRecord.row.status}</span></article>
              <article><strong>Commission amount</strong><span>{formatCurrency(selectedRecord.row.amount, selectedRecord.row.currencyLabel)}</span></article>
              <article><strong>Rate</strong><span>{selectedRecord.row.commission_rate || "—"}</span></article>
              <article><strong>Source amount</strong><span>{selectedRecord.row.source_amount ? formatCurrency(selectedRecord.row.source_amount, selectedRecord.row.currencyLabel) : "—"}</span></article>
            </section>
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
