import { Megaphone, MousePointerClick, RefreshCw, Smartphone, Send, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString(undefined, {
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

export default function AdminMarketing() {
  const [dateRange, setDateRange] = useState(() => buildDefaultDateRange());
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const rangeLabel = useMemo(() => {
    if (!summary?.range?.from || !summary?.range?.to) {
      return "Last 30 days";
    }

    const from = new Date(summary.range.from);
    const to = new Date(summary.range.to);
    return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
  }, [summary?.range?.from, summary?.range?.to]);

  const loadSummary = async () => {
    setIsLoading(true);
    setError("");

    try {
      const nextSummary = await getMarketingAnalyticsSummary(dateRange);
      setSummary(nextSummary);
    } catch (nextError) {
      setError(nextError?.message || "Could not load marketing analytics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, [dateRange.from, dateRange.to]);

  const metrics = summary ? [
    { label: "Visitors today", value: summary.visitorsToday },
    { label: "Claims today", value: summary.claimsToday },
    { label: "Referral visits", value: summary.referralVisitsToday },
    { label: "Mobile share", value: formatPercent(summary.mobileShare) },
  ] : [];

  return (
    <section className="admin-marketing-page">
      <div className="admin-marketing__workspace">
        <AdminPageHeader
          title="Marketing"
          subtitle="First-party acquisition snapshot."
          secondaryActions={[
            {
              label: "Refresh",
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
            <strong>Could not load marketing data.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {!error ? (
          <div className="admin-marketing__kpis">
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-blue"><Users size={18} /></span>
              <div>
                <small>Visitors today</small>
                <strong>{summary?.visitorsToday ?? (isLoading ? "…" : 0)}</strong>
              </div>
            </article>
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-green"><Send size={18} /></span>
              <div>
                <small>Claims today</small>
                <strong>{summary?.claimsToday ?? (isLoading ? "…" : 0)}</strong>
              </div>
            </article>
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-orange"><MousePointerClick size={18} /></span>
              <div>
                <small>Referral visits today</small>
                <strong>{summary?.referralVisitsToday ?? (isLoading ? "…" : 0)}</strong>
              </div>
            </article>
            <article className="admin-card admin-marketing__kpi-card">
              <span className="admin-marketing__kpi-icon is-violet"><Smartphone size={18} /></span>
              <div>
                <small>Mobile share</small>
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
                  <h2>Traffic sources</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><Megaphone size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">Loading sources...</div>
              ) : (
                <AnalyticsBars items={summary?.sources || []} emptyLabel="No source data yet." />
              )}
            </article>

            <article className="admin-card admin-marketing__panel">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>Devices</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><Smartphone size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">Loading devices...</div>
              ) : (
                <AnalyticsBars items={summary?.devices || []} emptyLabel="No device data yet." />
              )}
            </article>

            <article className="admin-card admin-marketing__panel admin-marketing__panel-wide">
              <header className="admin-marketing__panel-head">
                <div>
                  <h2>Top partners</h2>
                  <p>{rangeLabel}</p>
                </div>
                <span className="admin-marketing__panel-icon"><Users size={16} /></span>
              </header>
              {isLoading && !summary ? (
                <div className="admin-marketing__empty">Loading partners...</div>
              ) : summary?.topPartners?.length ? (
                <div className="admin-marketing__table-wrap">
                  <table className="admin-marketing__table">
                    <thead>
                      <tr>
                        <th>Partner / Code</th>
                        <th>Visits</th>
                        <th>Claims</th>
                        <th>Last visit</th>
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
                          <td>{formatDateTime(partner.lastVisit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-marketing__empty">No partner traffic yet.</div>
              )}
            </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}
