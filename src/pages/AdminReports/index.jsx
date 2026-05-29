import { useEffect, useMemo, useState } from "react";
import { BarChart3, Briefcase, CircleCheckBig, Download, FileCheck2, TrendingUp, Users, Wallet } from "lucide-react";
import { fetchReportsModuleData } from "../../services/adminService.js";
import { AdminKpiCard, AdminPageHeader } from "../../admin/components/AdminUi.jsx";
import "./style.scss";

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

function StatusChart({ rows = [] }) {
  if (!rows.length) {
    return <div className="admin-reports__empty">No distribution data yet.</div>;
  }

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

function ListCard({ title, subtitle, rows = [], formatter = null }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="admin-reports__list">
        {rows.length ? rows.map((item) => (
          <article key={item.label}>
            <strong>{item.label}</strong>
            <span>{formatter ? formatter(item) : item.value}</span>
          </article>
        )) : (
          <div className="admin-reports__empty">No data yet.</div>
        )}
      </div>
    </section>
  );
}

export default function AdminReports() {
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
    const documents = moduleData?.documents || [];

    return {
      totalLeads: leads.length,
      totalCases: cases.length,
      conversionRate: leads.length ? (cases.length / leads.length) * 100 : 0,
      revenue: finance.reduce((sum, item) => sum + Number(item.company_fee || 0), 0),
      compensation: finance.reduce((sum, item) => sum + Number(item.compensation_amount || 0), 0),
      completedTasks: tasks.filter((item) => item.status === "done").length,
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
      taskStatus: simpleTop(tasks, (item) => item.status, 6),
      partnerPerformance: partners.map((partner) => {
        const linkedCases = cases.filter((item) => item.referral_partner_id === partner.id || String(item.referral_partner_label || "").toLowerCase() === String(partner.referral_code || "").toLowerCase());
        const linkedFinance = finance.filter((item) => linkedCases.some((caseItem) => caseItem.id === item.case_id));

        return {
          label: partner.public_name || partner.name,
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
      <AdminPageHeader
        title="Revenue"
        subtitle="Operational revenue, pipeline mix, and top-performing dimensions."
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Dashboard" },
          { label: "Revenue" },
        ]}
        secondaryActions={[
          {
            label: "Export JSON",
            icon: Download,
            onClick: exportReportSnapshot,
            disabled: isLoading,
          },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}

      {isLoading ? (
        <p className="admin-message">Loading revenue dashboard...</p>
      ) : (
        <>
          <section className="admin-reports__kpis">
            <AdminKpiCard icon={Users} label="Total leads" value={metrics.totalLeads} />
            <AdminKpiCard icon={Briefcase} label="Total cases" value={metrics.totalCases} />
            <AdminKpiCard icon={TrendingUp} label="Conversion rate" value={`${metrics.conversionRate.toFixed(1)}%`} />
            <AdminKpiCard icon={Wallet} label="Company revenue" value={formatCurrency(metrics.revenue)} />
            <AdminKpiCard icon={BarChart3} label="Compensation" value={formatCurrency(metrics.compensation)} />
            <AdminKpiCard icon={CircleCheckBig} label="Completed tasks" value={metrics.completedTasks} />
            <AdminKpiCard icon={FileCheck2} label="Doc completion" value={`${metrics.documentCompletion.toFixed(1)}%`} />
          </section>

          <section className="admin-panel admin-reports__hero">
            <div className="admin-panel__head">
              <div>
                <h2>Overview</h2>
                <p>Revenue health and pipeline efficiency across leads, cases, and referrals.</p>
              </div>
            </div>

            <div className="admin-reports__hero-grid">
              <article className="admin-reports__hero-card">
                <small>Revenue per case</small>
                <strong>{metrics.totalCases ? formatCurrency(metrics.revenue / metrics.totalCases) : "—"}</strong>
                <span>Average company fee across all tracked cases.</span>
              </article>
              <article className="admin-reports__hero-card">
                <small>Compensation per case</small>
                <strong>{metrics.totalCases ? formatCurrency(metrics.compensation / metrics.totalCases) : "—"}</strong>
                <span>Average client compensation amount in finance records.</span>
              </article>
              <article className="admin-reports__hero-card">
                <small>Leads to case ratio</small>
                <strong>{metrics.totalLeads ? `${Math.round((metrics.totalCases / metrics.totalLeads) * 100)}%` : "—"}</strong>
                <span>Share of leads that have already turned into cases.</span>
              </article>
            </div>
          </section>

          <section className="admin-reports__grid">
            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>Leads by status</h2>
                  <p>Inbound pipeline distribution.</p>
                </div>
              </div>
              <div className="admin-reports__panel-body">
                <StatusChart rows={reports.leadsByStatus} />
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>Cases by status</h2>
                  <p>Case workflow distribution.</p>
                </div>
              </div>
              <div className="admin-reports__panel-body">
                <StatusChart rows={reports.casesByStatus} />
              </div>
            </section>

            <ListCard
              title="Top airlines"
              subtitle="Highest-volume airline distribution."
              rows={reports.topAirlines}
            />

            <ListCard
              title="Top routes"
              subtitle="Most common route patterns."
              rows={reports.topRoutes}
            />

            <ListCard
              title="Leads by source"
              subtitle="Acquisition mix by source."
              rows={reports.leadsBySource}
            />

            <ListCard
              title="Task status"
              subtitle="Current workflow pressure and completion."
              rows={reports.taskStatus}
            />

            <ListCard
              title="Partner performance"
              subtitle="Cases and earned commission by referral partner."
              rows={reports.partnerPerformance}
              formatter={(item) => `${item.value} cases · ${formatCurrency(item.earned)}`}
            />
          </section>
        </>
      )}
    </div>
  );
}
