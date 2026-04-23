import { useEffect, useMemo, useState } from "react";
import { BarChart3, Briefcase, CircleCheckBig, Download, FileCheck2, Users, Wallet } from "lucide-react";
import { fetchReportsModuleData } from "../../services/adminService.js";
import "./style.scss";

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

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function simpleTop(items, key, limit = 5) {
  const counts = new Map();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function StatusChart({ rows }) {
  const max = Math.max(1, ...rows.map((item) => item.value));

  return (
    <div className="admin-reports__chart">
      {rows.map((item) => (
        <article key={item.label}>
          <div><span style={{ width: `${(item.value / max) * 100}%` }} /></div>
          <strong>{item.label}</strong>
          <small>{item.value}</small>
        </article>
      ))}
    </div>
  );
}

function AdminReports() {
  const [moduleData, setModuleData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = async () => {
    setError("");
    setIsLoading(true);

    try {
      setModuleData(await fetchReportsModuleData());
    } catch (nextError) {
      setError(nextError.message || "Could not load reports module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const metrics = useMemo(() => {
    const leads = moduleData?.leads || [];
    const cases = moduleData?.cases || [];
    const finance = moduleData?.finance || [];
    const tasks = moduleData?.tasks || [];
    const communications = moduleData?.communications || [];
    const documents = moduleData?.documents || [];

    return {
      totalLeads: leads.length,
      totalCases: cases.length,
      conversionRate: leads.length ? (cases.length / leads.length) * 100 : 0,
      revenue: finance.reduce((sum, item) => sum + Number(item.company_fee || 0), 0),
      compensation: finance.reduce((sum, item) => sum + Number(item.compensation_amount || 0), 0),
      completedTasks: tasks.filter((item) => item.status === "done").length,
      communications: communications.length,
      documentCompletion: cases.length ? (documents.length / cases.length) * 100 : 0,
    };
  }, [moduleData]);

  const reports = useMemo(() => {
    const leads = moduleData?.leads || [];
    const cases = moduleData?.cases || [];
    const finance = moduleData?.finance || [];
    const tasks = moduleData?.tasks || [];
    const partners = moduleData?.partners || [];

    return {
      leadsByStatus: simpleTop(leads, (item) => item.status, 8),
      casesByStatus: simpleTop(cases, (item) => item.status, 8),
      topAirlines: simpleTop(cases, (item) => item.airline, 6),
      topRoutes: simpleTop(cases, (item) => item.route_from && item.route_to ? `${item.route_from} → ${item.route_to}` : null, 6),
      leadsBySource: simpleTop(leads, (item) => item.source, 6),
      agentPerformance: simpleTop(cases, (item) => item.assigned_manager_id, 6),
      taskStatus: simpleTop(tasks, (item) => item.status, 6),
      partnerPerformance: partners.map((partner) => {
        const linkedCases = cases.filter((item) => item.referral_partner_id === partner.id || String(item.referral_partner_label || "").toLowerCase() === String(partner.referral_code || "").toLowerCase());
        const linkedFinance = finance.filter((item) => linkedCases.some((caseItem) => caseItem.id === item.case_id));
        return {
          label: partner.name,
          value: linkedCases.length,
          earned: linkedFinance.reduce((sum, item) => sum + Number(item.referral_commission || 0), 0),
        };
      }).sort((a, b) => b.value - a.value).slice(0, 6),
    };
  }, [moduleData]);

  const exportReportSnapshot = () => {
    const snapshot = {
      metrics,
      reports,
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fly-friendly-reports-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-page admin-reports-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><BarChart3 size={16} /> Business Modules</span>
          <h1>Reports & Analytics</h1>
          <p>
            Operational and commercial reporting across leads, cases, finance, tasks, communications, documents, and partners.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}

      {isLoading ? (
        <p className="admin-message">Loading reports...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Users} label="Total leads" value={metrics.totalLeads} />
            <MetricCard icon={Briefcase} label="Total cases" value={metrics.totalCases} />
            <MetricCard icon={CircleCheckBig} label="Conversion rate" value={`${metrics.conversionRate.toFixed(1)}%`} />
            <MetricCard icon={Wallet} label="Revenue" value={formatCurrency(metrics.revenue)} />
            <MetricCard icon={Wallet} label="Compensation" value={formatCurrency(metrics.compensation)} />
            <MetricCard icon={FileCheck2} label="Doc completion" value={`${metrics.documentCompletion.toFixed(1)}%`} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Analytics workspace</h2>
                <p>Aggregated metrics and top-performing operational dimensions.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={exportReportSnapshot}>
                <Download size={14} />
                <span>Export JSON</span>
              </button>
            </div>

            <div className="admin-reports__grid">
              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>Leads by status</h2><p>Inbound pipeline distribution.</p></div>
                </div>
                <div className="admin-reports__panel-body">
                  <StatusChart rows={reports.leadsByStatus} />
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>Cases by status</h2><p>Case workflow distribution.</p></div>
                </div>
                <div className="admin-reports__panel-body">
                  <StatusChart rows={reports.casesByStatus} />
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>Top airlines</h2><p>Highest-volume airline distribution.</p></div>
                </div>
                <div className="admin-reports__list">
                  {reports.topAirlines.map((item) => (
                    <article key={item.label}><strong>{item.label}</strong><span>{item.value}</span></article>
                  ))}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>Top routes</h2><p>Most common route patterns.</p></div>
                </div>
                <div className="admin-reports__list">
                  {reports.topRoutes.map((item) => (
                    <article key={item.label}><strong>{item.label}</strong><span>{item.value}</span></article>
                  ))}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>Leads by source</h2><p>Acquisition mix by source.</p></div>
                </div>
                <div className="admin-reports__list">
                  {reports.leadsBySource.map((item) => (
                    <article key={item.label}><strong>{item.label}</strong><span>{item.value}</span></article>
                  ))}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>Task status</h2><p>Current workflow pressure and completion.</p></div>
                </div>
                <div className="admin-reports__list">
                  {reports.taskStatus.map((item) => (
                    <article key={item.label}><strong>{item.label}</strong><span>{item.value}</span></article>
                  ))}
                </div>
              </section>

              <section className="admin-panel admin-reports__wide">
                <div className="admin-panel__head">
                  <div><h2>Partner performance</h2><p>Cases and earned commission by referral partner.</p></div>
                </div>
                <div className="admin-reports__list">
                  {reports.partnerPerformance.map((item) => (
                    <article key={item.label}>
                      <strong>{item.label}</strong>
                      <span>{item.value} cases · {formatCurrency(item.earned)}</span>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminReports;
