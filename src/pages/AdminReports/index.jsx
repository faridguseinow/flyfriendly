import { useEffect, useMemo, useState } from "react";
import { BarChart3, Briefcase, CircleCheckBig, Download, FileCheck2, TrendingUp, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function StatusChart({ rows = [], emptyLabel }) {
  if (!rows.length) {
    return <div className="admin-reports__empty">{emptyLabel}</div>;
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

function ListCard({ title, subtitle, rows = [], formatter = null, emptyLabel }) {
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
          <div className="admin-reports__empty">{emptyLabel}</div>
        )}
      </div>
    </section>
  );
}

export default function AdminReports() {
  const { t } = useTranslation();
  const [moduleData, setModuleData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = async () => {
    setError("");
    setIsLoading(true);

    try {
      setModuleData(await fetchReportsModuleData());
    } catch (nextError) {
      setError(nextError.message || t("admin.revenue.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [t]);

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
      leadsByStatus: simpleTop(leads, (item) => item.status, 8).map((item) => ({ ...item, label: t(`admin.common.enums.${String(item.label || "").toLowerCase()}`, { defaultValue: normalizeLabel(item.label) }) })),
      casesByStatus: simpleTop(cases, (item) => item.status, 8).map((item) => ({ ...item, label: t(`admin.common.enums.${String(item.label || "").toLowerCase()}`, { defaultValue: normalizeLabel(item.label) }) })),
      topAirlines: simpleTop(cases, (item) => item.airline, 6),
      topRoutes: simpleTop(cases, (item) => item.route_from && item.route_to ? `${item.route_from} → ${item.route_to}` : null, 6),
      leadsBySource: simpleTop(leads, (item) => item.source, 6).map((item) => ({ ...item, label: normalizeLabel(item.label) })),
      taskStatus: simpleTop(tasks, (item) => item.status, 6).map((item) => ({ ...item, label: t(`admin.common.enums.${String(item.label || "").toLowerCase()}`, { defaultValue: normalizeLabel(item.label) }) })),
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
  }, [moduleData, t]);

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
        title={t("admin.revenue.title")}
        subtitle={t("admin.revenue.subtitle")}
        breadcrumbs={[
          { label: t("admin.common.admin"), path: "/admin" },
          { label: t("admin.nav.sections.dashboard") },
          { label: t("admin.revenue.title") },
        ]}
        secondaryActions={[
          {
            label: t("admin.revenue.exportJson"),
            icon: Download,
            onClick: exportReportSnapshot,
            disabled: isLoading,
          },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}

      {isLoading ? (
        <p className="admin-message">{t("admin.revenue.loading")}</p>
      ) : (
        <>
          <section className="admin-reports__kpis">
            <AdminKpiCard icon={Users} label={t("admin.leads.metrics.total")} value={metrics.totalLeads} />
            <AdminKpiCard icon={Briefcase} label={t("admin.cases.title")} value={metrics.totalCases} />
            <AdminKpiCard icon={TrendingUp} label={t("admin.revenue.leadsToCaseRatio")} value={`${metrics.conversionRate.toFixed(1)}%`} />
            <AdminKpiCard icon={Wallet} label={t("admin.common.revenue")} value={formatCurrency(metrics.revenue)} />
            <AdminKpiCard icon={BarChart3} label={t("admin.common.compensation")} value={formatCurrency(metrics.compensation)} />
            <AdminKpiCard icon={CircleCheckBig} label={t("admin.revenue.taskStatus")} value={metrics.completedTasks} />
            <AdminKpiCard icon={FileCheck2} label="Doc completion" value={`${metrics.documentCompletion.toFixed(1)}%`} />
          </section>

          <section className="admin-panel admin-reports__hero">
            <div className="admin-panel__head">
              <div>
                <h2>{t("admin.revenue.overviewTitle")}</h2>
                <p>{t("admin.revenue.overviewSubtitle")}</p>
              </div>
            </div>

            <div className="admin-reports__hero-grid">
              <article className="admin-reports__hero-card">
                <small>{t("admin.revenue.revenuePerCase")}</small>
                <strong>{metrics.totalCases ? formatCurrency(metrics.revenue / metrics.totalCases) : "—"}</strong>
                <span>{t("admin.revenue.revenuePerCaseDescription")}</span>
              </article>
              <article className="admin-reports__hero-card">
                <small>{t("admin.revenue.compensationPerCase")}</small>
                <strong>{metrics.totalCases ? formatCurrency(metrics.compensation / metrics.totalCases) : "—"}</strong>
                <span>{t("admin.revenue.compensationPerCaseDescription")}</span>
              </article>
              <article className="admin-reports__hero-card">
                <small>{t("admin.revenue.leadsToCaseRatio")}</small>
                <strong>{metrics.totalLeads ? `${Math.round((metrics.totalCases / metrics.totalLeads) * 100)}%` : "—"}</strong>
                <span>{t("admin.revenue.leadsToCaseRatioDescription")}</span>
              </article>
            </div>
          </section>

          <section className="admin-reports__grid">
            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>{t("admin.revenue.leadsByStatus")}</h2>
                  <p>{t("admin.revenue.leadsByStatusSubtitle")}</p>
                </div>
              </div>
              <div className="admin-reports__panel-body">
                <StatusChart rows={reports.leadsByStatus} emptyLabel={t("admin.revenue.noDistributionData")} />
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel__head">
                <div>
                  <h2>{t("admin.revenue.casesByStatus")}</h2>
                  <p>{t("admin.revenue.casesByStatusSubtitle")}</p>
                </div>
              </div>
              <div className="admin-reports__panel-body">
                <StatusChart rows={reports.casesByStatus} emptyLabel={t("admin.revenue.noDistributionData")} />
              </div>
            </section>

            <ListCard
              title={t("admin.revenue.topAirlines")}
              subtitle={t("admin.revenue.topAirlinesSubtitle")}
              rows={reports.topAirlines}
              emptyLabel={t("admin.revenue.noData")}
            />

            <ListCard
              title={t("admin.revenue.topRoutes")}
              subtitle={t("admin.revenue.topRoutesSubtitle")}
              rows={reports.topRoutes}
              emptyLabel={t("admin.revenue.noData")}
            />

            <ListCard
              title={t("admin.revenue.leadsBySource")}
              subtitle={t("admin.revenue.leadsBySourceSubtitle")}
              rows={reports.leadsBySource}
              emptyLabel={t("admin.revenue.noData")}
            />

            <ListCard
              title={t("admin.revenue.taskStatus")}
              subtitle={t("admin.revenue.taskStatusSubtitle")}
              rows={reports.taskStatus}
              emptyLabel={t("admin.revenue.noData")}
            />

            <ListCard
              title={t("admin.revenue.partnerPerformance")}
              subtitle={t("admin.revenue.partnerPerformanceSubtitle")}
              rows={reports.partnerPerformance}
              formatter={(item) => `${item.value} cases · ${formatCurrency(item.earned)}`}
              emptyLabel={t("admin.revenue.noData")}
            />
          </section>
        </>
      )}
    </div>
  );
}
