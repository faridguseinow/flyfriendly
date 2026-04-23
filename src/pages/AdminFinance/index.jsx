import { useEffect, useMemo, useState } from "react";
import { Coins, Download, HandCoins, Search, Wallet } from "lucide-react";
import { fetchFinanceModuleData, updateCaseFinance } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
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

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric">
      <span><Icon size={22} strokeWidth={1.8} /></span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
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

function AdminFinance() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [selectedFinanceId, setSelectedFinanceId] = useState(null);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadFinance = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchFinanceModuleData();
      setModuleData(next);
      if (!selectedFinanceId && next.finance[0]) {
        setSelectedFinanceId(next.finance[0].id);
      }
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
    const cases = new Map((moduleData?.cases || []).map((item) => [item.id, item]));
    const customers = new Map((moduleData?.customers || []).map((item) => [item.id, item]));
    const profiles = new Map((moduleData?.profiles || []).map((item) => [item.id, item]));

    return (moduleData?.finance || []).map((item) => {
      const linkedCase = cases.get(item.case_id);
      const linkedCustomer = linkedCase?.customer_id ? customers.get(linkedCase.customer_id) : null;
      const linkedManager = linkedCase?.assigned_manager_id ? profiles.get(linkedCase.assigned_manager_id) : null;

      return {
        ...item,
        linkedCase,
        linkedCustomer,
        linkedManager,
        caseCode: linkedCase?.case_code || item.case_id,
        customerLabel: linkedCustomer?.full_name || linkedCustomer?.email || "-",
      };
    });
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return financeRows.filter((item) => {
      const matchesSearch = !query || [
        item.caseCode,
        item.customerLabel,
        item.linkedCase?.airline,
        item.linkedCase?.route_from,
        item.linkedCase?.route_to,
        item.linkedCase?.referral_partner_label,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = paymentFilter === "all" || item.payment_status === paymentFilter;
      return matchesSearch && matchesStatus;
    });
  }, [financeRows, search, paymentFilter]);

  const selectedFinance = useMemo(
    () => filteredRows.find((item) => item.id === selectedFinanceId)
      || financeRows.find((item) => item.id === selectedFinanceId)
      || filteredRows[0]
      || null,
    [filteredRows, financeRows, selectedFinanceId],
  );

  const metrics = useMemo(() => ({
    totalExpected: financeRows.reduce((sum, item) => sum + Number(item.compensation_amount || 0), 0),
    totalRevenue: financeRows.reduce((sum, item) => sum + Number(item.company_fee || 0), 0),
    customerPayouts: financeRows.reduce((sum, item) => sum + Number(item.customer_payout || 0), 0),
    pendingPayments: financeRows.filter((item) => ["awaiting_payment", "payment_received"].includes(item.payment_status)).length,
    referralPending: financeRows.reduce((sum, item) => sum + Number(item.referral_commission || 0), 0),
    completed: financeRows.filter((item) => item.payment_status === "completed").length,
  }), [financeRows]);

  const saveFinance = async (updates) => {
    if (!selectedFinance) return;

    setError("");
    setIsSaving(true);
    try {
      await updateCaseFinance(selectedFinance.id, updates);
      await loadFinance();
    } catch (nextError) {
      setError(nextError.message || "Could not update finance record.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-finance-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Wallet size={16} /> Business Modules</span>
          <h1>Finance</h1>
          <p>
            Track compensation, revenue, payouts, referral commissions, and case-level finance progress across the operation.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsFinanceModuleV1 && (
        <p className="admin-message">
          Finance schema is not available yet. Run `007_cases_module_v1.sql` in Supabase to unlock the finance module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading finance...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Coins} label="Expected compensation" value={formatCurrency(metrics.totalExpected)} />
            <MetricCard icon={Wallet} label="Company revenue" value={formatCurrency(metrics.totalRevenue)} />
            <MetricCard icon={HandCoins} label="Customer payouts" value={formatCurrency(metrics.customerPayouts)} />
            <MetricCard icon={Wallet} label="Pending payments" value={metrics.pendingPayments} />
            <MetricCard icon={HandCoins} label="Referral commission" value={formatCurrency(metrics.referralPending)} />
            <MetricCard icon={Coins} label="Completed records" value={metrics.completed} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Finance ledger</h2>
                <p>Operational finance records linked to case workflow and payout stages.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportFinanceCsv(filteredRows)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="admin-finance__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search case, customer, airline, referral" />
              </label>
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
                <option value="all">All payment statuses</option>
                {paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="admin-finance__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Compensation</th>
                        <th>Company Fee</th>
                        <th>Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((item) => (
                        <tr key={item.id} className={selectedFinance?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedFinanceId(item.id)}>
                          <td>{item.caseCode}</td>
                          <td>{item.customerLabel}</td>
                          <td>{item.payment_status}</td>
                          <td>{formatCurrency(item.compensation_amount, item.currency)}</td>
                          <td>{formatCurrency(item.company_fee, item.currency)}</td>
                          <td>{formatCurrency(item.customer_payout, item.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-finance__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Finance detail</h2>
                    <p>{selectedFinance ? selectedFinance.caseCode : "Select a finance record to inspect."}</p>
                  </div>
                </div>

                {selectedFinance ? (
                  <div className="admin-finance__detail-body">
                    <div className="admin-finance__summary">
                      <article><strong>Case</strong><span>{selectedFinance.caseCode}</span></article>
                      <article><strong>Customer</strong><span>{selectedFinance.customerLabel}</span></article>
                      <article><strong>Manager</strong><span>{selectedFinance.linkedManager?.full_name || selectedFinance.linkedManager?.email || "-"}</span></article>
                      <article><strong>Referral</strong><span>{selectedFinance.linkedCase?.referral_partner_label || "-"}</span></article>
                    </div>

                    <div className="admin-finance__actions">
                      <label>
                        <span>Payment status</span>
                        <select value={selectedFinance.payment_status} onChange={(event) => saveFinance({ payment_status: event.target.value })} disabled={!hasPermission("finance.edit") || isSaving}>
                          {paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Payment method</span>
                        <input value={selectedFinance.payment_method || ""} onChange={(event) => saveFinance({ payment_method: event.target.value || null })} disabled={!hasPermission("finance.edit") || isSaving} />
                      </label>
                    </div>

                    <section className="admin-finance__section">
                      <h3>Amounts</h3>
                      <div className="admin-finance__amounts">
                        <label>
                          <span>Compensation</span>
                          <input type="number" value={selectedFinance.compensation_amount || 0} onChange={(event) => saveFinance({ compensation_amount: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                        </label>
                        <label>
                          <span>Company fee</span>
                          <input type="number" value={selectedFinance.company_fee || 0} onChange={(event) => saveFinance({ company_fee: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                        </label>
                        <label>
                          <span>Customer payout</span>
                          <input type="number" value={selectedFinance.customer_payout || 0} onChange={(event) => saveFinance({ customer_payout: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                        </label>
                        <label>
                          <span>Referral commission</span>
                          <input type="number" value={selectedFinance.referral_commission || 0} onChange={(event) => saveFinance({ referral_commission: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                        </label>
                        <label>
                          <span>Agent bonus</span>
                          <input type="number" value={selectedFinance.agent_bonus || 0} onChange={(event) => saveFinance({ agent_bonus: Number(event.target.value || 0) })} disabled={!hasPermission("finance.edit") || isSaving} />
                        </label>
                      </div>
                    </section>

                    <section className="admin-finance__section">
                      <h3>Timeline</h3>
                      <div className="admin-finance__timeline">
                        <article><strong>Updated</strong><span>{formatDate(selectedFinance.updated_at)}</span></article>
                        <article><strong>Payment received</strong><span>{formatDate(selectedFinance.payment_received_at)}</span></article>
                        <article><strong>Customer paid</strong><span>{formatDate(selectedFinance.customer_paid_at)}</span></article>
                        <article><strong>Referral paid</strong><span>{formatDate(selectedFinance.referral_paid_at)}</span></article>
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No finance record selected</h2>
                    <p>Select a finance record to review case-linked payment details.</p>
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminFinance;
