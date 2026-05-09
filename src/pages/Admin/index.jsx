import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Briefcase, CheckCircle2, Clock3, FileText, HandCoins, SearchCheck, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchAdminOverview } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatCurrency(value, currency = "EUR") {
  if (value === null || value === undefined) return "Not configured";
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function formatAge(value) {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "-";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) {
    return `${Math.max(1, hours)}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function formatRoute(from, to) {
  if (!from && !to) return "-";
  return [from || "-", to || "-"].join(" → ");
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "completed", "paid", "customer_paid", "referral_paid"].includes(normalized)) return "success";
  if (["rejected", "cancelled", "archived", "blocked"].includes(normalized)) return "danger";
  if (["documents_pending", "pending", "pending_review", "awaiting_payment", "payment_received", "suspended"].includes(normalized)) return "warning";
  return "neutral";
}

function StatusBadge({ children, tone }) {
  return <span className={`admin-dashboard__badge is-${tone || "neutral"}`}>{children}</span>;
}

function KpiCard({ icon: Icon, label, value, meta }) {
  return (
    <article className="admin-dashboard__kpi">
      <span className="admin-dashboard__kpi-icon"><Icon size={18} strokeWidth={1.9} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
    </article>
  );
}

function QueueCard({ icon: Icon, title, count, description, rows, emptyLabel, actionPath, actionLabel, renderRow }) {
  return (
    <section className="admin-panel admin-dashboard__queue-card">
      <div className="admin-panel__head">
        <div>
          <h2><Icon size={18} strokeWidth={1.9} /> {title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="admin-dashboard__queue-meta">
          <strong>{count}</strong>
          {actionPath ? <Link to={actionPath}>{actionLabel || "Open"}</Link> : null}
        </div>
      </div>

      {rows.length ? (
        <div className="admin-dashboard__queue-list">
          {rows.map((row) => renderRow(row))}
        </div>
      ) : (
        <div className="admin-dashboard__empty">{emptyLabel}</div>
      )}
    </section>
  );
}

function ActivityCard({ title, rows, emptyLabel, renderRow }) {
  return (
    <section className="admin-panel admin-dashboard__activity-card">
      <div className="admin-panel__head">
        <div>
          <h2>{title}</h2>
        </div>
      </div>

      {rows.length ? (
        <div className="admin-dashboard__activity-list">
          {rows.map((row) => renderRow(row))}
        </div>
      ) : (
        <div className="admin-dashboard__empty">{emptyLabel}</div>
      )}
    </section>
  );
}

function HealthCard({ title, value, tone = "neutral", description }) {
  return (
    <article className={`admin-panel admin-dashboard__health-card is-${tone}`}>
      <div className="admin-dashboard__health-value">{value}</div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </article>
  );
}

function AdminDashboard() {
  const { profile, primaryRoleLabel, hasPermission } = useAdminAuth();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadAdmin = async () => {
    setError("");
    setIsLoading(true);

    try {
      setOverview(await fetchAdminOverview());
    } catch (adminError) {
      setError(adminError.message || "Could not load admin dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
  }, []);

  const data = useMemo(() => {
    const leads = overview?.leads || [];
    const cases = overview?.cases || [];
    const finance = overview?.finance || [];
    const caseDocuments = overview?.caseDocuments || [];
    const partnerApplications = overview?.partnerApplications || [];
    const partnerPayouts = overview?.partnerPayouts || [];
    const profiles = new Map((overview?.profiles || []).map((item) => [item.id, item]));
    const documentsByCase = caseDocuments.reduce((acc, item) => {
      acc[item.case_id] ||= 0;
      acc[item.case_id] += 1;
      return acc;
    }, {});
    const leadById = new Map(leads.map((item) => [item.id, item]));
    const financeByCase = new Map(finance.map((item) => [item.case_id, item]));
    const pendingPayoutStatuses = new Set(["awaiting_payment", "payment_received"]);

    const unassignedLeads = leads
      .filter((lead) => ["new", "submitted"].includes(String(lead.status || "").toLowerCase()) && !lead.assigned_user_id)
      .slice(0, 6);

    const leadsNeedingReview = leads
      .filter((lead) => ["new", "submitted"].includes(String(lead.status || "").toLowerCase()))
      .slice(0, 6);

    const casesMissingDocuments = cases
      .filter((item) => {
        const caseStatus = String(item.status || "").toLowerCase();
        const isTerminal = ["approved", "rejected", "paid", "closed"].includes(caseStatus);
        return !isTerminal && (caseStatus === "documents_pending" || !documentsByCase[item.id]);
      })
      .slice(0, 6);

    const casesPendingEstimate = cases
      .filter((item) => {
        const linkedLead = item.lead_id ? leadById.get(item.lead_id) : null;
        return String(linkedLead?.estimate_status || "pending_review").toLowerCase() === "pending_review";
      })
      .slice(0, 6);

    const pendingApplications = partnerApplications
      .filter((item) => item.status === "pending")
      .slice(0, 6);

    const pendingFinanceRows = finance
      .filter((item) => pendingPayoutStatuses.has(String(item.payment_status || "").toLowerCase()))
      .map((item) => ({
        ...item,
        linkedCase: cases.find((caseRow) => caseRow.id === item.case_id) || null,
      }))
      .slice(0, 6);

    const latestLeadSubmissions = leads.slice(0, 5);
    const latestCaseUpdates = cases.slice(0, 5);
    const latestPartnerReviews = partnerApplications
      .filter((item) => item.reviewed_at && ["approved", "rejected"].includes(String(item.status || "").toLowerCase()))
      .sort((left, right) => new Date(right.reviewed_at).getTime() - new Date(left.reviewed_at).getTime())
      .slice(0, 5);
    const latestPayoutEvents = [
      ...finance
        .filter((item) => item.payment_status && item.payment_status !== "not_started")
        .map((item) => ({
          id: `finance-${item.id}`,
          created_at: item.updated_at,
          label: item.payment_status,
          amount: item.customer_payout || item.compensation_amount,
          currency: item.currency,
          caseCode: cases.find((caseRow) => caseRow.id === item.case_id)?.case_code || item.case_id,
        })),
      ...partnerPayouts
        .filter((item) => item.status && item.status !== "pending")
        .map((item) => ({
          id: `partner-${item.id}`,
          created_at: item.updated_at || item.paid_at || item.created_at,
          label: `Partner payout · ${item.status}`,
          amount: item.amount,
          currency: item.currency,
          caseCode: item.case_id || "-",
        })),
    ]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 5);

    const leadsMissingAirportIds = leads.filter((lead) =>
      ["new", "submitted", "converted"].includes(String(lead.status || "").toLowerCase())
      && (!lead.departure_airport_id || !lead.arrival_airport_id),
    );

    const leadsMissingDistanceEstimate = leads.filter((lead) =>
      ["new", "submitted", "converted"].includes(String(lead.status || "").toLowerCase())
      && String(lead.estimate_status || "pending_review").toLowerCase() === "pending_review",
    );

    const casesWithoutOwner = cases.filter((item) =>
      ["draft", "documents_pending", "ready_to_submit", "submitted_to_airline", "awaiting_response", "airline_replied", "escalated"].includes(String(item.status || "").toLowerCase())
      && !item.assigned_manager_id,
    );

    return {
      profiles,
      leadById,
      financeByCase,
      unassignedLeads,
      leadsNeedingReview,
      casesMissingDocuments,
      casesPendingEstimate,
      pendingApplications,
      pendingFinanceRows,
      latestLeadSubmissions,
      latestCaseUpdates,
      latestPartnerReviews,
      latestPayoutEvents,
      leadsMissingAirportIds,
      leadsMissingDistanceEstimate,
      casesWithoutOwner,
    };
  }, [overview]);

  return (
    <div className="admin-page admin-dashboard-page">

      {isLoading ? <p className="admin-message">Loading dashboard...</p> : null}
      {error ? <p className="admin-message is-error">{error}</p> : null}

      {!isLoading && !error && overview ? (
        <>
          <section className="admin-metrics admin-dashboard__kpis">
            <KpiCard icon={SearchCheck} label="New leads today" value={overview.metrics?.newLeadsToday ?? "Not configured"} />
            <KpiCard icon={Briefcase} label="Claims under review" value={overview.metrics?.claimsUnderReview ?? "Not configured"} />
            <KpiCard icon={FileText} label="Documents needed" value={overview.metrics?.documentsNeeded ?? "Not configured"} />
            <KpiCard icon={HandCoins} label="Pending partner applications" value={overview.metrics?.pendingPartnerApplications ?? "Not configured"} />
            <KpiCard
              icon={Wallet}
              label="Estimated compensation pipeline"
              value={formatCurrency(overview.metrics?.estimatedCompensationPipeline)}
            />
            <KpiCard icon={Clock3} label="Pending payouts" value={overview.metrics?.pendingPayouts ?? "Not configured"} />
          </section>

          <section className="admin-dashboard__section">
            <div className="admin-dashboard__section-head">
              <div>
                <h2>Action queue</h2>
              </div>
            </div>

            <div className="admin-dashboard__queue-grid">
              {hasPermission("leads.view") ? (
                <QueueCard
                  icon={AlertTriangle}
                  title="Unassigned leads"
                  count={data.unassignedLeads.length}
                  rows={data.unassignedLeads}
                  emptyLabel="No unassigned leads."
                  actionPath="/admin/leads"
                  actionLabel="Open Leads"
                  renderRow={(lead) => (
                    <Link key={lead.id} to={`/admin/leads?lead=${lead.id}`} className="admin-dashboard__queue-row">
                      <div>
                        <strong>{lead.lead_code || lead.full_name || "Lead"}</strong>
                        <span>{formatRoute(lead.departure_airport, lead.arrival_airport)}</span>
                      </div>
                      <StatusBadge tone={statusTone(lead.status)}>{lead.status || "new"}</StatusBadge>
                    </Link>
                  )}
                />
              ) : null}

              {hasPermission("leads.view") ? (
                <QueueCard
                  icon={SearchCheck}
                  title="Leads needing review"
                  count={data.leadsNeedingReview.length}
                  rows={data.leadsNeedingReview}
                  emptyLabel="No leads waiting for review."
                  actionPath="/admin/leads"
                  actionLabel="Review queue"
                  renderRow={(lead) => (
                    <Link key={lead.id} to={`/admin/leads?lead=${lead.id}`} className="admin-dashboard__queue-row">
                      <div>
                        <strong>{lead.lead_code || lead.full_name || "Lead"}</strong>
                        <span>{lead.full_name || lead.email || "-"}</span>
                      </div>
                      <span className="admin-dashboard__queue-age">{formatAge(lead.created_at)}</span>
                    </Link>
                  )}
                />
              ) : null}

              {hasPermission("cases.view") ? (
                <QueueCard
                  icon={FileText}
                  title="Cases missing documents"
                  count={data.casesMissingDocuments.length}
                  rows={data.casesMissingDocuments}
                  emptyLabel="No cases blocked on documents."
                  actionPath="/admin/cases"
                  actionLabel="Open Cases"
                  renderRow={(item) => (
                    <Link key={item.id} to={`/admin/cases?case=${item.id}`} className="admin-dashboard__queue-row">
                      <div>
                        <strong>{item.case_code || "Case"}</strong>
                        <span>{formatRoute(item.route_from, item.route_to)}</span>
                      </div>
                      <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                    </Link>
                  )}
                />
              ) : null}

              {hasPermission("cases.view") ? (
                <QueueCard
                  icon={AlertTriangle}
                  title="Estimate pending review"
                  count={data.casesPendingEstimate.length}
                  rows={data.casesPendingEstimate}
                  emptyLabel="No estimate blockers."
                  actionPath="/admin/cases"
                  actionLabel="Open Cases"
                  renderRow={(item) => {
                    const linkedLead = item.lead_id ? data.leadById.get(item.lead_id) : null;
                    return (
                      <Link key={item.id} to={`/admin/cases?case=${item.id}`} className="admin-dashboard__queue-row">
                        <div>
                          <strong>{item.case_code || "Case"}</strong>
                          <span>{linkedLead?.lead_code || formatRoute(item.route_from, item.route_to)}</span>
                        </div>
                        <StatusBadge tone="warning">{linkedLead?.estimate_status || "pending_review"}</StatusBadge>
                      </Link>
                    );
                  }}
                />
              ) : null}

              {hasPermission("partners.view") ? (
                <QueueCard
                  icon={HandCoins}
                  title="Partner applications pending"
                  count={data.pendingApplications.length}
                  rows={data.pendingApplications}
                  emptyLabel="No partner applications pending."
                  actionPath="/admin/partner-applications"
                  actionLabel="Open Applications"
                  renderRow={(item) => (
                    <Link key={item.id} to={`/admin/partner-applications`} className="admin-dashboard__queue-row">
                      <div>
                        <strong>{item.full_name || item.email}</strong>
                        <span>{[item.country, item.primary_platform, item.niche].filter(Boolean).join(" • ") || item.email}</span>
                      </div>
                      <span className="admin-dashboard__queue-age">{formatAge(item.created_at)}</span>
                    </Link>
                  )}
                />
              ) : null}

              {hasPermission("finance.view") ? (
                <QueueCard
                  icon={Wallet}
                  title="Payouts pending"
                  count={data.pendingFinanceRows.length}
                  rows={data.pendingFinanceRows}
                  emptyLabel="No pending payouts."
                  actionPath="/admin/finances/finance"
                  actionLabel="Open Finance"
                  renderRow={(item) => (
                    <Link key={item.id} to="/admin/finances/finance" className="admin-dashboard__queue-row">
                      <div>
                        <strong>{item.linkedCase?.case_code || item.case_id}</strong>
                        <span>{formatCurrency(item.customer_payout || item.compensation_amount, item.currency)}</span>
                      </div>
                      <StatusBadge tone={statusTone(item.payment_status)}>{item.payment_status}</StatusBadge>
                    </Link>
                  )}
                />
              ) : null}
            </div>
          </section>

          <section className="admin-dashboard__section">
            <div className="admin-dashboard__section-head">
              <div>
                <h2>Recent activity</h2>
              </div>
            </div>

            <div className="admin-dashboard__activity-grid">
              <ActivityCard
                title="Latest lead submissions"
                rows={data.latestLeadSubmissions}
                emptyLabel="No recent leads."
                renderRow={(lead) => (
                  <Link key={lead.id} to={`/admin/leads?lead=${lead.id}`} className="admin-dashboard__activity-row">
                    <strong>{lead.lead_code || lead.full_name || "Lead"}</strong>
                    <span>{formatRoute(lead.departure_airport, lead.arrival_airport)}</span>
                    <small>{formatDateTime(lead.created_at)}</small>
                  </Link>
                )}
              />

              <ActivityCard
                title="Latest case updates"
                rows={data.latestCaseUpdates}
                emptyLabel="No recent case updates."
                renderRow={(item) => (
                  <Link key={item.id} to={`/admin/cases?case=${item.id}`} className="admin-dashboard__activity-row">
                    <strong>{item.case_code || "Case"}</strong>
                    <span>{item.status || "-"}</span>
                    <small>{formatDateTime(item.updated_at || item.created_at)}</small>
                  </Link>
                )}
              />

              <ActivityCard
                title="Partner approvals / rejections"
                rows={data.latestPartnerReviews}
                emptyLabel={overview.supportsPartnerApplications ? "No reviewed applications yet." : "Not configured"}
                renderRow={(item) => (
                  <Link key={item.id} to="/admin/partner-applications" className="admin-dashboard__activity-row">
                    <strong>{item.full_name || item.email}</strong>
                    <span>{item.status}</span>
                    <small>{formatDateTime(item.reviewed_at)}</small>
                  </Link>
                )}
              />

              <ActivityCard
                title="Latest payout events"
                rows={data.latestPayoutEvents}
                emptyLabel="No payout events yet."
                renderRow={(item) => (
                  <Link key={item.id} to="/admin/finances/finance" className="admin-dashboard__activity-row">
                    <strong>{item.caseCode || "Payout"}</strong>
                    <span>{item.label} • {formatCurrency(item.amount, item.currency)}</span>
                    <small>{formatDateTime(item.created_at)}</small>
                  </Link>
                )}
              />
            </div>
          </section>

          <section className="admin-dashboard__section">
            <div className="admin-dashboard__section-head">
              <div>
                <h2>Operational health</h2>
              </div>
            </div>

            <div className="admin-dashboard__health-grid">
              <HealthCard
                title="Failed emails"
                value={overview.health?.failedEmailsSupported ? overview.health.failedEmails : "Not configured"}
                tone="neutral"
                description={overview.health?.failedEmailsSupported ? null : "Not configured"}
              />
              <HealthCard
                title="Claims missing airport ids"
                value={data.leadsMissingAirportIds.length}
                tone={data.leadsMissingAirportIds.length ? "warning" : "success"}
              />
              <HealthCard
                title="Claims missing distance estimate"
                value={data.leadsMissingDistanceEstimate.length}
                tone={data.leadsMissingDistanceEstimate.length ? "warning" : "success"}
              />
              <HealthCard
                title="Cases without owner"
                value={data.casesWithoutOwner.length}
                tone={data.casesWithoutOwner.length ? "warning" : "success"}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default AdminDashboard;
