import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  Copy,
  FileText,
  Gift,
  House,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ProfileAvatarUploader, { ProfileAvatar } from "../../components/profile/ProfileAvatarUploader.jsx";
import { LocalizedLink, LocalizedNavLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { languages } from "../../i18n/languages.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { contactEmail } from "../../constants/site.js";
import { getProfileAvatarUrl, uploadProfileAvatar, validateAvatarFile } from "../../lib/profileAvatar.js";
import { requireSupabase } from "../../lib/supabase.js";
import { fetchPartnerPortalData, normalizePortalError, updateCurrentPartnerPublicProfile } from "../../services/partnerPortalService.js";
import { updatePreferredLanguage } from "../../services/authService.js";
import "../ClientPortal/style.scss";
import "./style.scss";

function formatCurrency(value, currency = "EUR") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency || "EUR"}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCompactLabel(value) {
  return String(value || "—")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizePortalStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["active", "approved"].includes(status)) return "approved";
  if (["rejected", "archived"].includes(status)) return "rejected";
  if (["suspended", "paused"].includes(status)) return "suspended";
  return "pending";
}

function getStatusTone(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["paid", "approved", "converted"].includes(status)) return "success";
  if (["pending", "under_review", "documents_needed", "submitted", "lead_created", "case_created"].includes(status)) return "warning";
  if (["rejected", "cancelled", "suspended"].includes(status)) return "danger";
  return "neutral";
}

function PartnerStatusBadge({ value, t, kind = "claim" }) {
  const key = String(value || "").trim().toLowerCase() || "pending";
  const prefix = kind === "commission" ? "partnerPortal.commissionStatus" : "partnerPortal.status";

  return (
    <span className={`partner-portal-status-badge is-${getStatusTone(key)}`}>
      {t(`${prefix}.${key}`, { defaultValue: key.replace(/_/g, " ") })}
    </span>
  );
}

function PartnerPortalNavLink({ to, icon: Icon, label, mobile = false, end = false }) {
  return (
    <LocalizedNavLink
      to={to}
      end={end}
      className={({ isActive }) => `client-portal-nav__link partner-portal-nav__link${mobile ? " is-mobile" : ""}${isActive ? " is-active" : ""}`}
    >
      <span className="client-portal-nav__icon">
        <Icon size={18} />
      </span>
      <span className="client-portal-nav__label">{label}</span>
    </LocalizedNavLink>
  );
}

function PortalErrorState({ message }) {
  return <p className="portal-message is-error">{message}</p>;
}

function PortalEmptyState({ title = "", message }) {
  return (
    <div className="partner-portal-empty">
      {title ? <strong>{title}</strong> : null}
      <span>{message}</span>
    </div>
  );
}

function PartnerMetricsStrip({ items = [] }) {
  const visibleItems = items.filter((item) => item && item.label);
  if (!visibleItems.length) {
    return null;
  }

  return (
    <section className="partner-metrics-strip">
      {visibleItems.map((item) => (
        <article key={item.label} className="partner-metric">
          <span>{item.label}</span>
          <strong>{item.value ?? "—"}</strong>
        </article>
      ))}
    </section>
  );
}

function PartnerMetricCard({ label, value, hint }) {
  return (
    <article className="partner-portal-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function PartnerDataTable({
  columns = [],
  rows = [],
  emptyTitle = "",
  emptyMessage = "",
  mobileRender,
}) {
  if (!rows.length) {
    return <PortalEmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <>
      <div className="partner-data-card partner-data-table">
        <div className="partner-data-table__head">
          {columns.map((column) => (
            <span key={column.key}>{column.label}</span>
          ))}
        </div>
        <div className="partner-data-table__body">
          {rows.map((row) => (
            <div key={row.id} className="partner-data-row">
              {columns.map((column) => (
                <div key={column.key} className={`partner-data-row__cell${column.wrap ? " is-wrap" : ""}`} data-label={column.label}>
                  {column.render(row)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="partner-data-mobile-list">
        {rows.map((row) => mobileRender(row))}
      </div>
    </>
  );
}

function PartnerReferralMobileCard({ item, t }) {
  const commissionAmount = item.paidCommissionAmount || item.approvedCommissionAmount || item.estimatedCommissionAmount;

  return (
    <article className="partner-portal-record-card">
      <div className="partner-portal-record-card__head">
        <div>
          <strong>{item.referenceLabel || "—"}</strong>
          <span>{item.routeLabel || "—"}</span>
        </div>
        <PartnerStatusBadge value={item.claimStatusKey} t={t} />
      </div>

      <div className="partner-portal-record-card__footer">
        <div className="partner-portal-record-card__meta is-compact">
          <div>
            <small>{t("partnerPortal.referrals.commission", { defaultValue: "Commission" })}</small>
            <span>{formatCurrency(commissionAmount, item.currency)}</span>
          </div>
          <div>
            <small>{t("partnerPortal.finance.payoutStatus", { defaultValue: "Payout status" })}</small>
            <PartnerStatusBadge value={item.payoutStatus || "pending"} kind="commission" t={t} />
          </div>
          <div>
            <small>{t("partnerPortal.referrals.updatedAt", { defaultValue: "Updated" })}</small>
            <span>{formatDate(item.updatedAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function PartnerFinanceMobileCard({ item, t }) {
  const commissionAmount = item.paidCommissionAmount || item.approvedCommissionAmount || item.estimatedCommissionAmount;

  return (
    <article className="partner-portal-record-card partner-portal-record-card--finance">
      <div className="partner-portal-record-card__head">
        <div>
          <strong>{item.referenceLabel || "—"}</strong>
          <span>{item.routeLabel || "—"}</span>
        </div>
        <PartnerStatusBadge value={item.commissionStatusKey} kind="commission" t={t} />
      </div>

      <div className="partner-portal-finance-grid">
        <div>
          <small>{t("partnerPortal.finance.compensation", { defaultValue: "Compensation" })}</small>
          <span>{formatCurrency(item.compensationAmount, item.currency)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.rate", { defaultValue: "Rate" })}</small>
          <span>{item.commissionRate ? `${Number(item.commissionRate)}%` : "—"}</span>
        </div>
        <div>
          <small>{t("partnerPortal.referrals.commission", { defaultValue: "Commission" })}</small>
          <span>{formatCurrency(commissionAmount, item.currency)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.payoutStatus", { defaultValue: "Payout status" })}</small>
          <span>{formatCompactLabel(item.payoutStatus || "pending")}</span>
        </div>
      </div>
    </article>
  );
}

function getDashboardActivityPriority(item) {
  const hasCommission = Number(
    item.paidCommissionAmount
    || item.approvedCommissionAmount
    || item.estimatedCommissionAmount
    || 0,
  ) > 0;
  const isPaidOut = String(item.payoutStatus || "").trim().toLowerCase() === "paid";

  if (hasCommission && !isPaidOut && item.commissionStatusKey !== "cancelled") {
    return 0;
  }

  if (item.filterBucket === "approved") {
    return 1;
  }

  if (item.filterBucket === "active") {
    return 2;
  }

  return 3;
}

function selectDashboardActivity(records = []) {
  return [...records]
    .sort((left, right) => {
      const priorityDelta = getDashboardActivityPriority(left) - getDashboardActivityPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(right.updatedAt || right.createdAt || 0).getTime()
        - new Date(left.updatedAt || left.createdAt || 0).getTime();
    })
    .slice(0, 5);
}

async function copyTextToClipboard(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let didCopy = false;
  try {
    didCopy = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return didCopy;
}

function usePartnerPortalState() {
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    let active = true;

    setState({ isLoading: true, error: "", data: null });
    fetchPartnerPortalData()
      .then((data) => {
        if (active) {
          setState({ isLoading: false, error: "", data });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: normalizePortalError(error), data: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function PartnerPortalLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { partnerProfile, profile, user, signOut } = useAuth();
  const toLocalizedPath = useLocalizedPath();
  const partnerName = partnerProfile?.public_name || partnerProfile?.name || t("partnerPortal.profile.defaultName", { defaultValue: "Partner" });
  const statusKey = normalizePortalStatus(partnerProfile?.portal_status || partnerProfile?.status);
  const avatarUrl = getProfileAvatarUrl({ partnerProfile, profile, user });

  const navItems = useMemo(() => ([
    { label: t("partnerPortal.nav.home", { defaultValue: "Home" }), path: toLocalizedPath("/partner/dashboard"), icon: House, end: true },
    { label: t("partnerPortal.nav.referrals", { defaultValue: "Referrals" }), path: toLocalizedPath("/partner/referrals"), icon: Gift },
    { label: t("partnerPortal.nav.finance", { defaultValue: "Finance" }), path: toLocalizedPath("/partner/finance"), icon: CircleDollarSign },
    { label: t("partnerPortal.nav.profile", { defaultValue: "Profile" }), path: toLocalizedPath("/partner/profile"), icon: UserRound },
  ]), [t, toLocalizedPath]);

  return (
    <div className="client-portal-shell section partner-portal-shell">
      <div className="client-portal-layout partner-portal-layout">
        <aside className="client-portal-sidebar partner-portal-sidebar">
          <div className="partner-portal-sidebar-card">
            <div className="partner-portal-sidebar-card__identity">
              <ProfileAvatar
                avatarUrl={avatarUrl}
                fallbackName={partnerName}
                size="md"
                className="partner-portal-sidebar-card__avatar"
              />
              <div className="partner-portal-sidebar-card__copy">
                <strong>{partnerName}</strong>
              </div>
            </div>
            <PartnerStatusBadge value={statusKey} t={t} />
          </div>

          <nav className="client-portal-nav partner-portal-nav" aria-label={t("partnerPortal.navLabel", { defaultValue: "Partner account sections" })}>
            {navItems.map((item) => (
              <PartnerPortalNavLink key={item.path} to={item.path} icon={item.icon} label={item.label} end={item.end} />
            ))}
          </nav>

          <button type="button" className="partner-portal-signout" onClick={() => signOut()}>
            <LogOut size={16} />
            <span>{t("partnerPortal.signOut", { defaultValue: "Sign out" })}</span>
          </button>
        </aside>

        <main className="client-portal-main partner-portal-main">
          <div key={location.pathname} className="client-portal-main__viewport partner-portal-main__viewport">
            <Outlet />
          </div>
        </main>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <nav className="client-portal-mobile-nav partner-portal-mobile-nav" aria-label={t("partnerPortal.navLabel", { defaultValue: "Partner account sections" })}>
              {navItems.map((item) => (
                <PartnerPortalNavLink
                  key={`mobile-${item.path}`}
                  to={item.path}
                  icon={item.icon}
                  label={item.label}
                  end={item.end}
                  mobile
                />
              ))}
            </nav>,
            document.body,
          )
        : null}
    </div>
  );
}

export function PartnerDashboardPage() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const state = usePartnerPortalState();
  const [copied, setCopied] = useState(false);
  const data = state.data || {};
  const summary = data.summary || {};
  const avatarUrl = getProfileAvatarUrl({
    avatarUrl: data.partnerProfile?.avatar_url || "",
    partnerProfile: data.partnerProfile,
    profile,
    user,
  });
  const recentReferrals = useMemo(
    () => selectDashboardActivity(data.referralRecords || []),
    [data.referralRecords],
  );

  const copyReferralLink = async () => {
    const didCopy = await copyTextToClipboard(data.referralLink);
    if (!didCopy) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loading", { defaultValue: "Loading..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  return (
    <div className="client-portal-page partner-portal-page">
      <section className="portal-card partner-portal-hero-card partner-portal-hero-card--compact partner-portal-banner">
        <div className="partner-portal-page-header">
          <ProfileAvatar
            avatarUrl={avatarUrl}
            fallbackName={data.partnerName || t("partnerPortal.profile.defaultName", { defaultValue: "Partner" })}
            size="xl"
            className="partner-portal-page-header__avatar"
          />
          <div className="partner-portal-page-header__copy">
            <strong>{data.partnerName || t("partnerPortal.profile.defaultName", { defaultValue: "Partner" })}</strong>
            <div className="partner-portal-hero-card__badges">
              <PartnerStatusBadge value={data.partnerStatusKey} t={t} />
              {data.referralCode ? <span className="partner-portal-inline-pill">{data.referralCode}</span> : null}
            </div>
          </div>
        </div>
        <div className="partner-referral-link-card partner-referral-link-card--embedded">
          <div className="partner-referral-link-card__copy">
            <small>{t("partnerPortal.home.link", { defaultValue: "Referral link" })}</small>
            <strong>{data.referralLink || t("partnerPortal.home.linkMissing", { defaultValue: "Link will appear after partner approval." })}</strong>
          </div>
          <div className="partner-referral-link-card__actions">
            <button className="btn btn-secondary" type="button" onClick={copyReferralLink} disabled={!data.referralLink}>
              <Copy size={16} />
              <span>{t("partnerPortal.home.copy", { defaultValue: "Copy link" })}</span>
            </button>
            {copied ? <span className="partner-portal-inline-message">{t("partnerPortal.home.copied", { defaultValue: "Copied" })}</span> : null}
          </div>
        </div>
      </section>

      <PartnerMetricsStrip
        items={[
          { label: t("partnerPortal.metrics.referrals", { defaultValue: "Clients" }), value: summary.referralCount || 0 },
          { label: t("partnerPortal.metrics.activeClaims", { defaultValue: "Active claims" }), value: summary.activeClaims || 0 },
          { label: t("partnerPortal.metrics.successfulClaims", { defaultValue: "Successful claims" }), value: summary.successfulClaims || 0 },
          { label: t("partnerPortal.metrics.pendingPayout", { defaultValue: "Awaiting payout" }), value: formatCurrency(summary.pendingEarnings, summary.currency) },
          { label: t("partnerPortal.metrics.paidOut", { defaultValue: "Paid" }), value: formatCurrency(summary.totalPaid, summary.currency) },
          { label: t("partnerPortal.metrics.totalEarned", { defaultValue: "Total earned" }), value: formatCurrency(summary.totalEarned, summary.currency) },
        ]}
      />

      <section className="portal-card partner-data-card partner-table-card">
        <div className="client-portal-card-heading partner-portal-section-heading">
          <strong>{t("partnerPortal.activity.title", { defaultValue: "Latest activity" })}</strong>
        </div>
        <PartnerDataTable
          columns={[
            { key: "reference", label: "Reference", render: (item) => <span className="partner-data-row__main">{item.referenceLabel || "—"}</span>, wrap: true },
            { key: "route", label: "Route", render: (item) => <span className="partner-data-row__main">{item.routeLabel || "—"}</span>, wrap: true },
            { key: "status", label: "Status", render: (item) => <PartnerStatusBadge value={item.claimStatusKey} t={t} /> },
            { key: "commission", label: t("partnerPortal.referrals.commission", { defaultValue: "Commission" }), render: (item) => <span className="partner-data-row__main">{formatCurrency(item.paidCommissionAmount || item.approvedCommissionAmount || item.estimatedCommissionAmount, item.currency)}</span> },
            { key: "payout", label: t("partnerPortal.finance.payoutStatus", { defaultValue: "Payout" }), render: (item) => <PartnerStatusBadge value={item.payoutStatus || "pending"} kind="commission" t={t} /> },
            { key: "updated", label: t("partnerPortal.referrals.updatedAt", { defaultValue: "Updated" }), render: (item) => <span className="partner-data-row__main">{formatDate(item.updatedAt)}</span> },
          ]}
          rows={recentReferrals}
          emptyMessage={t("partnerPortal.activity.empty", { defaultValue: "No referral activity yet." })}
          mobileRender={(item) => <PartnerReferralMobileCard key={item.id} item={item} t={t} />}
        />
      </section>
    </div>
  );
}

export function PartnerReferralsPage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();
  const [filter, setFilter] = useState("all");
  const allRows = state.data?.referralRecords || [];
  const filters = useMemo(() => ([
    { key: "all", label: t("partnerPortal.filters.all", { defaultValue: "All" }) },
    { key: "active", label: t("partnerPortal.filters.active", { defaultValue: "Active" }) },
    { key: "approved", label: t("partnerPortal.filters.approved", { defaultValue: "Approved" }) },
    { key: "paid", label: t("partnerPortal.filters.paid", { defaultValue: "Paid" }) },
    { key: "cancelled", label: t("partnerPortal.filters.cancelled", { defaultValue: "Cancelled" }) },
  ]), [t]);
  const referrals = useMemo(() => allRows.filter((item) => {
    if (filter === "active") return item.filterBucket === "active";
    if (filter === "approved") return item.filterBucket === "approved";
    if (filter === "paid") return item.filterBucket === "paid";
    if (filter === "cancelled") return item.filterBucket === "cancelled";
    return true;
  }), [allRows, filter]);
  const referralMetrics = useMemo(() => ({
    total: allRows.length,
    active: allRows.filter((item) => item.filterBucket === "active").length,
    approved: allRows.filter((item) => item.filterBucket === "approved").length,
    paid: allRows.filter((item) => item.filterBucket === "paid").length,
    cancelled: allRows.filter((item) => item.filterBucket === "cancelled").length,
  }), [allRows]);

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loadingReferrals", { defaultValue: "Loading..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  return (
    <div className="client-portal-page partner-portal-page">
      <section className="portal-card partner-table-card">
        <div className="partner-portal-filter-row" role="tablist" aria-label={t("partnerPortal.filters.label", { defaultValue: "Referral filters" })}>
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`partner-portal-filter-chip${filter === item.key ? " is-active" : ""}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <PartnerMetricsStrip
          items={[
            { label: t("partnerPortal.filters.all", { defaultValue: "Total" }), value: referralMetrics.total },
            { label: t("partnerPortal.filters.active", { defaultValue: "Active" }), value: referralMetrics.active },
            { label: t("partnerPortal.filters.approved", { defaultValue: "Approved" }), value: referralMetrics.approved },
            { label: t("partnerPortal.filters.paid", { defaultValue: "Paid" }), value: referralMetrics.paid },
            { label: t("partnerPortal.filters.cancelled", { defaultValue: "Cancelled" }), value: referralMetrics.cancelled },
          ]}
        />

        <PartnerDataTable
          columns={[
            { key: "reference", label: "Reference", render: (item) => <span className="partner-data-row__main">{item.referenceLabel || "—"}</span>, wrap: true },
            { key: "route", label: "Route", render: (item) => <span className="partner-data-row__main">{item.routeLabel || "—"}</span>, wrap: true },
            { key: "status", label: "Status", render: (item) => <PartnerStatusBadge value={item.claimStatusKey} t={t} /> },
            { key: "commission", label: t("partnerPortal.referrals.commission", { defaultValue: "Commission" }), render: (item) => <span className="partner-data-row__main">{formatCurrency(item.paidCommissionAmount || item.approvedCommissionAmount || item.estimatedCommissionAmount, item.currency)}</span> },
            { key: "payout", label: t("partnerPortal.finance.payoutStatus", { defaultValue: "Payout" }), render: (item) => <PartnerStatusBadge value={item.payoutStatus || "pending"} kind="commission" t={t} /> },
            { key: "updated", label: t("partnerPortal.referrals.updatedAt", { defaultValue: "Updated" }), render: (item) => <span className="partner-data-row__main">{formatDate(item.updatedAt)}</span> },
          ]}
          rows={referrals}
          emptyTitle={t("partnerPortal.referrals.emptyTitle", { defaultValue: "No referrals yet." })}
          emptyMessage={t("partnerPortal.referrals.emptyText", { defaultValue: "Claims sent through your link will appear here." })}
          mobileRender={(item) => <PartnerReferralMobileCard key={item.id} item={item} t={t} />}
        />
      </section>
    </div>
  );
}

export function PartnerFinancePage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loadingFinance", { defaultValue: "Loading..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const data = state.data || {};
  const summary = data.financeSummary || {};
  const tier = data.tier || {};
  const breakdown = data.financeRecords || [];
  const payouts = data.payoutRecords || [];

  return (
    <div className="client-portal-page partner-portal-page">
      <PartnerMetricsStrip
        items={[
          { label: t("partnerPortal.finance.potentialIncome", { defaultValue: "Potential" }), value: formatCurrency(summary.potentialEarnings, summary.currency) },
          { label: t("partnerPortal.finance.approvedAmount", { defaultValue: "Approved" }), value: formatCurrency(summary.approvedAmount, summary.currency) },
          { label: t("partnerPortal.finance.awaitingApproval", { defaultValue: "Pending" }), value: formatCurrency(summary.pendingApprovalAmount, summary.currency) },
          { label: t("partnerPortal.finance.paidAmount", { defaultValue: "Paid" }), value: formatCurrency(summary.paidAmount, summary.currency) },
          { label: t("partnerPortal.finance.cancelledAmount", { defaultValue: "Cancelled" }), value: formatCurrency(summary.cancelledAmount, summary.currency) },
        ]}
      />

      <section className="partner-portal-two-up">
        <article className="portal-card partner-portal-tier-card">
          <div className="partner-portal-tier-card__top">
            <div>
              <small>{t("partnerPortal.finance.currentTier", { defaultValue: "Current level" })}</small>
              <strong>{t(`partnerPortal.tiers.${tier.key}.name`, { defaultValue: tier.name || "Starter" })}</strong>
            </div>
            <span>{tier.rate ? `${tier.rate}%` : "—"}</span>
          </div>
          {!tier.unlocked ? (
            <>
              <p>{tier.progressLabel || `0 / ${tier.nextUnlockCount || 11}`}</p>
              <small>{t("partnerPortal.finance.growthHint", { defaultValue: "After 10+ paid clients your commission increases to 20%." })}</small>
            </>
          ) : (
            <>
              <p>{t("partnerPortal.finance.growthUnlocked", { defaultValue: "20% unlocked" })}</p>
              <small>{t("partnerPortal.finance.growthUnlockedText", { defaultValue: "New eligible claims now use the 20% rate." })}</small>
            </>
          )}
        </article>
      </section>

      <section className="portal-card partner-data-card partner-table-card">
        <div className="client-portal-card-heading partner-portal-section-heading">
          <strong>{t("partnerPortal.finance.breakdownTitle", { defaultValue: "Commission breakdown" })}</strong>
        </div>
        <PartnerDataTable
          columns={[
            { key: "reference", label: "Reference", render: (item) => <span className="partner-data-row__main">{item.referenceLabel || "—"}</span>, wrap: true },
            { key: "route", label: "Route", render: (item) => <span className="partner-data-row__main">{item.routeLabel || "—"}</span>, wrap: true },
            { key: "rate", label: t("partnerPortal.finance.rate", { defaultValue: "Rate" }), render: (item) => <span className="partner-data-row__main">{item.commissionRate ? `${Number(item.commissionRate)}%` : "—"}</span> },
            { key: "commission", label: t("partnerPortal.referrals.commission", { defaultValue: "Commission" }), render: (item) => <span className="partner-data-row__main">{formatCurrency(item.paidCommissionAmount || item.approvedCommissionAmount || item.estimatedCommissionAmount, item.currency)}</span> },
            { key: "payout", label: t("partnerPortal.finance.payoutStatus", { defaultValue: "Payout" }), render: (item) => <PartnerStatusBadge value={item.payoutStatus || "pending"} kind="commission" t={t} /> },
            { key: "updated", label: t("partnerPortal.referrals.updatedAt", { defaultValue: "Updated" }), render: (item) => <span className="partner-data-row__main">{formatDate(item.updatedAt)}</span> },
          ]}
          rows={breakdown}
          emptyMessage={t("partnerPortal.finance.empty", { defaultValue: "No commissions yet." })}
          mobileRender={(item) => <PartnerFinanceMobileCard key={item.id} item={item} t={t} />}
        />
      </section>

      <section className="portal-card partner-portal-payout-card">
        <div className="client-portal-card-heading partner-portal-section-heading">
          <strong>{t("partnerPortal.finance.payoutsTitle", { defaultValue: "Payout history" })}</strong>
        </div>
        {payouts.length ? (
          <div className="partner-portal-payout-list">
            {payouts.map((item) => (
              <div key={item.id} className="partner-portal-payout-row">
                <div>
                  <strong>{formatCurrency(item.amount, item.currency)}</strong>
                  <span>{item.clientLabel || "—"}</span>
                </div>
                <div>
                  <PartnerStatusBadge value={item.status} kind="commission" t={t} />
                  <small>{formatDateTime(item.paid_at || item.created_at)}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <PortalEmptyState message={t("partnerPortal.finance.emptyPayouts", { defaultValue: "No payouts yet." })} />
        )}
      </section>
    </div>
  );
}

export function PartnerProfilePage() {
  const { t } = useTranslation();
  const { partnerProfile, profile, user, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    public_name: partnerProfile?.public_name || partnerProfile?.name || "",
    bio: partnerProfile?.bio || "",
    avatar_url: partnerProfile?.avatar_url || "",
    website_url: partnerProfile?.website_url || "",
    instagram_url: partnerProfile?.instagram_url || "",
    tiktok_url: partnerProfile?.tiktok_url || "",
    youtube_url: partnerProfile?.youtube_url || "",
    preferred_language: profile?.preferred_language || document.documentElement.lang || "en",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const avatarFallbackUrl = getProfileAvatarUrl({ partnerProfile, profile, user });
  const avatarName = form.public_name || partnerProfile?.name || profile?.full_name || "Partner";

  useEffect(() => {
    setForm({
      public_name: partnerProfile?.public_name || partnerProfile?.name || "",
      bio: partnerProfile?.bio || "",
      avatar_url: partnerProfile?.avatar_url || "",
      website_url: partnerProfile?.website_url || "",
      instagram_url: partnerProfile?.instagram_url || "",
      tiktok_url: partnerProfile?.tiktok_url || "",
      youtube_url: partnerProfile?.youtube_url || "",
      preferred_language: profile?.preferred_language || document.documentElement.lang || "en",
    });
    setAvatarFile(null);
    setAvatarPreviewUrl("");
  }, [partnerProfile, profile]);

  useEffect(() => () => {
    if (avatarPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
  }, [avatarPreviewUrl]);

  const handleAvatarSelected = async (file) => {
    setAvatarError("");
    setError("");
    setMessage("");

    try {
      validateAvatarFile(file);
      setAvatarFile(file);
      setAvatarPreviewUrl((current) => {
        if (current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(file);
      });
    } catch (validationError) {
      setAvatarError(validationError.message || t("profileAvatar.validation", { defaultValue: "Please upload JPG, PNG, or WEBP up to 5MB." }));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setAvatarError("");
    setIsSaving(true);

    try {
      let nextAvatarUrl = form.avatar_url || "";

      if (avatarFile) {
        const uploaded = await uploadProfileAvatar({
          supabase: requireSupabase(),
          file: avatarFile,
          ownerType: "partner",
          ownerId: profile?.id || partnerProfile?.profile_id || user?.id,
        });
        nextAvatarUrl = uploaded.publicUrl;
      }

      await Promise.all([
        updateCurrentPartnerPublicProfile({
          ...form,
          avatar_url: nextAvatarUrl,
        }),
        updatePreferredLanguage(form.preferred_language),
      ]);
      await refreshProfile();
      setForm((current) => ({ ...current, avatar_url: nextAvatarUrl }));
      setAvatarFile(null);
      setAvatarPreviewUrl((current) => {
        if (current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return "";
      });
      setMessage(t("partnerPortal.profile.saved", { defaultValue: "Profile updated." }));
    } catch (saveError) {
      setError(normalizePortalError(saveError) || t("partnerPortal.profile.error", { defaultValue: "Could not update the profile." }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="client-portal-page client-portal-page--account partner-portal-page partner-profile-page">
      <section className="portal-card partner-profile-card">
        <div className="client-portal-card-heading partner-portal-section-heading">
          <strong>{t("partnerPortal.profile.publicSection", { defaultValue: "Public information" })}</strong>
        </div>

        <form className="portal-form client-portal-account-form partner-profile-form" onSubmit={submit}>
          <div className="partner-profile-avatar">
            <ProfileAvatarUploader
              avatarUrl={avatarPreviewUrl || form.avatar_url}
              fallbackImageUrl={avatarFallbackUrl}
              fallbackName={avatarName}
              size="xl"
              editable
              uploading={isSaving}
              onFileSelected={handleAvatarSelected}
              error={avatarError}
              label={t("profileAvatar.label", { defaultValue: "Profile photo" })}
              actionLabel={t("profileAvatar.change", { defaultValue: "Change photo" })}
              uploadingLabel={t("profileAvatar.uploading", { defaultValue: "Uploading..." })}
            />
          </div>
          <label>
            <span>{t("partnerPortal.profile.publicName", { defaultValue: "Public name" })}</span>
            <input value={form.public_name} onChange={(event) => setForm((current) => ({ ...current, public_name: event.target.value }))} />
          </label>
          <label>
            <span>{t("partnerPortal.profile.website", { defaultValue: "Website URL" })}</span>
            <input value={form.website_url} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} />
          </label>
          <label>
            <span>{t("partnerPortal.profile.instagram", { defaultValue: "Instagram URL" })}</span>
            <input value={form.instagram_url} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} />
          </label>
          <label>
            <span>{t("partnerPortal.profile.tiktok", { defaultValue: "TikTok URL" })}</span>
            <input value={form.tiktok_url} onChange={(event) => setForm((current) => ({ ...current, tiktok_url: event.target.value }))} />
          </label>
          <label>
            <span>{t("partnerPortal.profile.youtube", { defaultValue: "YouTube URL" })}</span>
            <input value={form.youtube_url} onChange={(event) => setForm((current) => ({ ...current, youtube_url: event.target.value }))} />
          </label>
          <label>
            <span>{t("partnerPortal.profile.language", { defaultValue: "Language" })}</span>
            <select value={form.preferred_language} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))}>
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="is-full">
            <span>{t("partnerPortal.profile.bio", { defaultValue: "Bio" })}</span>
            <textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={4} />
          </label>
          {error ? <p className="portal-message is-error">{error}</p> : null}
          {message ? <p className="portal-message is-notice">{message}</p> : null}
          <div className="partner-profile-card__actions">
            <button className="btn btn-primary partner-profile-submit" type="submit" disabled={isSaving}>
              {isSaving ? t("partnerPortal.profile.saving", { defaultValue: "Saving..." }) : t("partnerPortal.profile.submit", { defaultValue: "Save changes" })}
            </button>
          </div>
        </form>
      </section>

      <section className="portal-card partner-profile-card">
        <div className="client-portal-card-heading partner-portal-section-heading">
          <strong>{t("partnerPortal.profile.accountSection", { defaultValue: "Account" })}</strong>
        </div>

        <div className="client-portal-support-grid">
          <div className="client-portal-support-link is-static">
            <UserRound size={18} />
            <div>
              <strong>{profile?.full_name || partnerProfile?.name || "—"}</strong>
              <span>{t("partnerPortal.profile.fullName", { defaultValue: "Full name" })}</span>
            </div>
          </div>
          <div className="client-portal-support-link is-static">
            <Mail size={18} />
            <div>
              <strong>{profile?.email || "—"}</strong>
              <span>{t("partnerPortal.profile.email", { defaultValue: "Email" })}</span>
            </div>
          </div>
          <div className="client-portal-support-link is-static">
            <Phone size={18} />
            <div>
              <strong>{profile?.phone || "—"}</strong>
              <span>{t("partnerPortal.profile.phone", { defaultValue: "Phone" })}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="portal-card partner-profile-card">
        <div className="client-portal-card-heading partner-portal-section-heading">
          <strong>{t("partnerPortal.profile.supportSection", { defaultValue: "Support" })}</strong>
        </div>

        <div className="client-portal-support-grid">
          <a className="client-portal-support-link" href={`mailto:${contactEmail}`}>
            <Mail size={18} />
            <div>
              <strong>{t("partnerPortal.profile.contactSupport", { defaultValue: "Contact support" })}</strong>
              <span>{contactEmail}</span>
            </div>
          </a>
          <LocalizedLink className="client-portal-support-link" to="/contact">
            <Phone size={18} />
            <div>
              <strong>{t("common.contact", { defaultValue: "Contact" })}</strong>
            </div>
          </LocalizedLink>
          <LocalizedLink className="client-portal-support-link" to="/privacyPolicy">
            <ShieldCheck size={18} />
            <div>
              <strong>{t("common.privacyPolicy", { defaultValue: "Privacy Policy" })}</strong>
            </div>
          </LocalizedLink>
          <LocalizedLink className="client-portal-support-link" to="/termsOfUse">
            <FileText size={18} />
            <div>
              <strong>{t("common.termsOfUse", { defaultValue: "Terms of Use" })}</strong>
            </div>
          </LocalizedLink>
        </div>
      </section>
    </div>
  );
}

export function PartnerLinkPage() {
  return <PartnerDashboardPage />;
}

export function PartnerEarningsPage() {
  return <PartnerFinancePage />;
}

export function PartnerPayoutsPage() {
  return <PartnerFinancePage />;
}

export function PartnerAssetsPage() {
  const { t } = useTranslation();

  return (
    <div className="client-portal-page partner-portal-page">
      <section className="portal-card">
        <PortalEmptyState message={t("partnerPortal.assets.empty", { defaultValue: "No managed assets yet." })} />
      </section>
    </div>
  );
}

function PartnerStatusTemplate({ title, text }) {
  return (
    <div className="placeholder-page">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

export function PartnerPendingPage() {
  const { t } = useTranslation();

  return (
    <PartnerStatusTemplate
      title={t("partnerPortal.pending.title", { defaultValue: "Application under review" })}
      text={t("partnerPortal.pending.text", { defaultValue: "Your regular client account is available while partner access is being reviewed." })}
    />
  );
}

export function PartnerRejectedPage() {
  const { t } = useTranslation();

  return (
    <PartnerStatusTemplate
      title={t("partnerPortal.rejected.title", { defaultValue: "Partner access was not approved" })}
      text={t("partnerPortal.rejected.text", { defaultValue: "Your client account remains active. Contact the team if you need a review." })}
    />
  );
}

export function PartnerSuspendedPage() {
  const { t } = useTranslation();

  return (
    <PartnerStatusTemplate
      title={t("partnerPortal.suspended.title", { defaultValue: "Partner access is suspended" })}
      text={t("partnerPortal.suspended.text", { defaultValue: "Your client account remains available while partner tools are paused." })}
    />
  );
}
