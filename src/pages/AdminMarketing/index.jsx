import { BarChart3, FlaskConical, Megaphone, MousePointerClick, RefreshCw, Smartphone, Send, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminFilterBar, AdminMetricsStrip, AdminPageHeader } from "../../admin/components/AdminUi.jsx";
import { getMarketingAnalyticsSummary } from "../../services/adminMarketingService.js";
import "./style.scss";

function toInputDate(date) {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
}

function buildDefaultDateRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return {
    from: toInputDate(from),
    to: toInputDate(today),
  };
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function formatDateTime(value, locale) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AnalyticsBars({ items = [], emptyLabel }) {
  const maxCount = Math.max(...items.map((item) => item.count), 0);

  if (!items.length) {
    return <div className="admin-marketing__empty">{emptyLabel}</div>;
  }

  return (
    <div className="admin-marketing__bars">
      {items.map((item) => {
        const width = maxCount ? `${Math.max((item.count / maxCount) * 100, 8)}%` : "0%";

        return (
          <article key={item.label} className="admin-marketing__bar-row">
            <div className="admin-marketing__bar-meta">
              <strong>{item.label}</strong>
              <span>{item.count}</span>
            </div>
            <div className="admin-marketing__bar-track">
              <span className="admin-marketing__bar-fill" style={{ width }} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ConversionFunnel({ items = [], t }) {
  const maxCount = Math.max(...items.map((item) => item.count), 0);

  if (!items.length) {
    return <div className="admin-marketing__empty">{t("admin.marketing.states.noFunnelData")}</div>;
  }

  return (
    <div className="admin-marketing__funnel">
      {items.map((item, index) => {
        const width = maxCount ? `${Math.max((item.count / maxCount) * 100, 10)}%` : "10%";
        const rateLabel = index === 0
          ? t("admin.marketing.funnel.entryPoint")
          : t("admin.marketing.funnel.fromPrevious", { rate: formatPercent(item.rateFromPrevious) });

        return (
          <article key={item.key} className="admin-marketing__funnel-step">
            <div className="admin-marketing__funnel-meta">
              <div>
                <strong>{item.label}</strong>
                <span>{rateLabel}</span>
              </div>
              <b>{formatCount(item.count)}</b>
            </div>
            <div className="admin-marketing__funnel-track">
              <span style={{ width }} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CampaignPerformanceTable({ rows = [], t }) {
  if (!rows.length) {
    return <div className="admin-marketing__empty">{t("admin.marketing.states.noCampaignData")}</div>;
  }

  return (
    <div className="admin-marketing__table-wrap">
      <table className="admin-marketing__table">
        <thead>
          <tr>
            <th>{t("admin.marketing.table.campaignSource")}</th>
            <th>{t("admin.marketing.table.visitors")}</th>
            <th>{t("admin.marketing.table.referralOpens")}</th>
            <th>{t("admin.marketing.table.claims")}</th>
            <th>{t("admin.marketing.table.conversion")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.label}-${row.source}-${row.medium}`}>
              <td>
                <strong>{row.campaign || row.label}</strong>
                <span>{[row.source, row.medium].filter(Boolean).join(" / ") || t("admin.marketing.table.direct")}</span>
              </td>
              <td>{formatCount(row.visitors)}</td>
              <td>{formatCount(row.referralVisits)}</td>
              <td>{formatCount(row.claims)}</td>
              <td>{formatPercent(row.conversionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbTestResults({ tests = [], supportsAbTesting = true, t }) {
  if (!supportsAbTesting) {
    return <div className="admin-marketing__empty">{t("admin.marketing.states.migrationHint")}</div>;
  }

  if (!tests.length) {
    return <div className="admin-marketing__empty">{t("admin.marketing.states.noAbTestData")}</div>;
  }

  return (
    <div className="admin-marketing__ab-tests">
      {tests.map((test) => (
        <article key={test.testName} className="admin-marketing__ab-test">
          <header>
            <strong>{test.testName}</strong>
            <span>{t("admin.marketing.table.variantsCount", { count: test.variants.length })}</span>
          </header>
          <div className="admin-marketing__table-wrap">
            <table className="admin-marketing__table">
              <thead>
                <tr>
                  <th>{t("admin.marketing.table.variant")}</th>
                  <th>{t("admin.marketing.table.visitors")}</th>
                  <th>{t("admin.marketing.table.claims")}</th>
                  <th>{t("admin.marketing.table.conversion")}</th>
                </tr>
              </thead>
              <tbody>
                {test.variants.map((variant) => (
                  <tr key={variant.variantName}>
                    <td><strong>{variant.variantName}</strong></td>
                    <td>{formatCount(variant.visitors)}</td>
                    <td>{formatCount(variant.claims)}</td>
                    <td>{formatPercent(variant.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AdminMarketing() {
  const { t, i18n } = useTranslation();
  const [dateRange, setDateRange] = useState(() => buildDefaultDateRange());
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const rangeLabel = useMemo(() => {
    if (!summary?.range?.from || !summary?.range?.to) {
      return t("admin.marketing.last30Days");
    }

    const from = new Date(summary.range.from);
    const to = new Date(summary.range.to);
    return `${from.toLocaleDateString(i18n.language)} - ${to.toLocaleDateString(i18n.language)}`;
  }, [i18n.language, summary?.range?.from, summary?.range?.to, t]);

  const loadSummary = async () => {
    setIsLoading(true);
    setError("");

    try {
      const nextSummary = await getMarketingAnalyticsSummary(dateRange);
      setSummary(nextSummary);
    } catch (nextError) {
      setError(nextError?.message || t("admin.marketing.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, [dateRange.from, dateRange.to]);

  const metrics = summary ? [
    { label: t("admin.marketing.metrics.visitorsToday"), value: summary.visitorsToday },
    { label: t("admin.marketing.metrics.claimsToday"), value: summary.claimsToday },
    { label: t("admin.marketing.metrics.referralVisits"), value: summary.referralVisitsToday },
    { label: t("admin.marketing.metrics.mobileShare"), value: formatPercent(summary.mobileShare) },
  ] : [];

  return (
    <section className="admin-marketing-page">
      <div className="admin-marketing__workspace">
        <AdminPageHeader
          title={t("admin.marketing.title")}
          subtitle={t("admin.marketing.subtitle")}
          secondaryActions={[
            {
              label: t("admin.common.refresh"),
              icon: RefreshCw,
              onClick: loadSummary,
              disabled: isLoading,
            },
          ]}
        />

        <AdminFilterBar
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        <AdminMetricsStrip items={metrics} />

        {error ? (
          <div className="admin-marketing__state admin-card">
            <strong>{t("admin.marketing.loadErrorTitle")}</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {!error ? (
          <div className="admin-marketing__kpis">
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-blue"><Users size={18} /></span>
              <div>
                <small>{t("admin.marketing.metrics.visitorsToday")}</small>
                <strong>{summary?.visitorsToday ?? (isLoading ? "…" : 0)}</strong>
              </div>
            </article>
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-green"><Send size={18} /></span>
              <div>
                <small>{t("admin.marketing.metrics.claimsToday")}</small>
                <strong>{summary?.claimsToday ?? (isLoading ? "…" : 0)}</strong>
              </div>
            </article>
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-orange"><MousePointerClick size={18} /></span>
              <div>
                <small>{t("admin.marketing.metrics.referralVisitsToday")}</small>
                <strong>{summary?.referralVisitsToday ?? (isLoading ? "…" : 0)}</strong>
              </div>
            </article>
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-violet"><Smartphone size={18} /></span>
              <div>
                <small>{t("admin.marketing.metrics.mobileShare")}</small>
                <strong>{summary ? formatPercent(summary.mobileShare) : (isLoading ? "…" : "0%")}</strong>
              </div>
            </article>
          </div>
        ) : null}

        {!error ? (
          <div className="admin-marketing__grid">
            <article className="admin-card admin-marketing__panel">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>{t("admin.marketing.panels.trafficSources")}</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><Megaphone size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">{t("admin.marketing.states.loadingSources")}</div>
              ) : (
                <AnalyticsBars items={summary?.sources || []} emptyLabel={t("admin.marketing.states.noSourceData")} />
              )}
            </article>

            <article className="admin-card admin-marketing__panel">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>{t("admin.marketing.panels.devices")}</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><Smartphone size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">{t("admin.marketing.states.loadingDevices")}</div>
              ) : (
                <AnalyticsBars items={summary?.devices || []} emptyLabel={t("admin.marketing.states.noDeviceData")} />
              )}
            </article>

            <article className="admin-card admin-marketing__panel">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>{t("admin.marketing.panels.conversionFunnel")}</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><BarChart3 size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">{t("admin.marketing.states.loadingFunnel")}</div>
              ) : (
                <ConversionFunnel items={summary?.funnel || []} t={t} />
              )}
            </article>

            <article className="admin-card admin-marketing__panel admin-marketing__panel-wide">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>{t("admin.marketing.panels.campaignPerformance")}</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><MousePointerClick size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">{t("admin.marketing.states.loadingCampaigns")}</div>
              ) : (
                <CampaignPerformanceTable rows={summary?.campaignPerformance || []} t={t} />
              )}
            </article>

            <article className="admin-card admin-marketing__panel admin-marketing__panel-wide">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>{t("admin.marketing.panels.topPartners")}</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><Users size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">{t("admin.marketing.states.loadingPartners")}</div>
              ) : summary?.topPartners?.length ? (
                <div className="admin-marketing__table-wrap">
                  <table className="admin-marketing__table">
                    <thead>
                      <tr>
                        <th>{t("admin.marketing.table.partnerCode")}</th>
                        <th>{t("admin.marketing.table.visits")}</th>
                        <th>{t("admin.marketing.table.claims")}</th>
                        <th>{t("admin.marketing.table.lastVisit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topPartners.map((partner) => (
                        <tr key={partner.referralCode}>
                          <td>
                            <strong>{partner.partnerName || partner.referralCode}</strong>
                            <span>{partner.referralCode}</span>
                          </td>
                          <td>{partner.visits}</td>
                          <td>{partner.claims}</td>
                          <td>{formatDateTime(partner.lastVisit, i18n.language)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-marketing__empty">{t("admin.marketing.states.noPartnerData")}</div>
              )}
            </article>

            <article className="admin-card admin-marketing__panel admin-marketing__panel-wide">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>{t("admin.marketing.panels.abTesting")}</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><FlaskConical size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">{t("admin.marketing.states.loadingTests")}</div>
              ) : (
                <AbTestResults tests={summary?.abTests || []} supportsAbTesting={summary?.supportsAbTesting !== false} t={t} />
              )}
            </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}
