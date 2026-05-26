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
import { LocalizedLink, LocalizedNavLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { languages } from "../../i18n/languages.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { contactEmail } from "../../constants/site.js";
import { getPublicSiteUrl } from "../../lib/siteUrl.js";
import {
  PARTNER_GROWTH_RATE,
  PARTNER_REVENUE_SHARE_RATE,
  PARTNER_STARTER_RATE,
  calculatePartnerCommission,
} from "../../lib/partnerCommission.js";
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

function PartnerMetricCard({ label, value, hint }) {
  return (
    <article className="partner-portal-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function PartnerReferralCard({ item, t }) {
  return (
    <article className="partner-portal-record-card">
      <div className="partner-portal-record-card__head">
        <div>
          <strong>{item.clientLabel}</strong>
          <span>{[item.referenceLabel, item.routeLabel].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <PartnerStatusBadge value={item.claimStatusKey} t={t} />
      </div>

      <div className="partner-portal-record-card__meta">
        <div>
          <small>{t("partnerPortal.referrals.flightDate", { defaultValue: "Flight date" })}</small>
          <span>{formatDate(item.flightDate)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.referrals.createdAt", { defaultValue: "Created" })}</small>
          <span>{formatDate(item.createdAt)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.referrals.updatedAt", { defaultValue: "Updated" })}</small>
          <span>{formatDate(item.updatedAt)}</span>
        </div>
      </div>

      <div className="partner-portal-record-card__footer">
        <div className="partner-portal-record-card__status-row">
          <small>{t("partnerPortal.referrals.commission", { defaultValue: "Commission" })}</small>
          <PartnerStatusBadge value={item.commissionStatusKey} kind="commission" t={t} />
        </div>
        <div className="partner-portal-record-card__amounts">
          <span>{t("partnerPortal.referrals.estimated", { defaultValue: "Estimated" })}: {formatCurrency(item.estimatedCommissionAmount, item.currency)}</span>
          <span>{t("partnerPortal.referrals.approved", { defaultValue: "Approved" })}: {formatCurrency(item.approvedCommissionAmount, item.currency)}</span>
          <span>{t("partnerPortal.referrals.paid", { defaultValue: "Paid" })}: {formatCurrency(item.paidCommissionAmount, item.currency)}</span>
        </div>
      </div>
    </article>
  );
}

function PartnerFinanceBreakdownCard({ item, t }) {
  return (
    <article className="partner-portal-record-card partner-portal-record-card--finance">
      <div className="partner-portal-record-card__head">
        <div>
          <strong>{item.clientLabel}</strong>
          <span>{[item.referenceLabel, item.routeLabel].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <PartnerStatusBadge value={item.commissionStatusKey} kind="commission" t={t} />
      </div>

      <div className="partner-portal-finance-grid">
        <div>
          <small>{t("partnerPortal.finance.compensation", { defaultValue: "Compensation" })}</small>
          <span>{formatCurrency(item.compensationAmount, item.currency)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.revenue", { defaultValue: "Fly Friendly revenue" })}</small>
          <span>{formatCurrency(item.companyRevenue, item.currency)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.rate", { defaultValue: "Rate" })}</small>
          <span>{item.commissionRate ? `${Number(item.commissionRate)}%` : "—"}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.estimated", { defaultValue: "Estimated" })}</small>
          <span>{formatCurrency(item.estimatedCommissionAmount, item.currency)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.approved", { defaultValue: "Approved" })}</small>
          <span>{formatCurrency(item.approvedCommissionAmount, item.currency)}</span>
        </div>
        <div>
          <small>{t("partnerPortal.finance.paid", { defaultValue: "Paid" })}</small>
          <span>{formatCurrency(item.paidCommissionAmount, item.currency)}</span>
        </div>
      </div>

      <div className="partner-portal-record-card__amounts">
        <span>{t("partnerPortal.finance.createdAt", { defaultValue: "Created" })}: {formatDate(item.createdAt)}</span>
        <span>{t("partnerPortal.finance.approvedAt", { defaultValue: "Approved" })}: {formatDate(item.approvedAt)}</span>
        <span>{t("partnerPortal.finance.paidAt", { defaultValue: "Paid" })}: {formatDate(item.paidAt)}</span>
      </div>
    </article>
  );
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
  const { partnerProfile, signOut } = useAuth();
  const toLocalizedPath = useLocalizedPath();
  const partnerName = partnerProfile?.public_name || partnerProfile?.name || t("partnerPortal.profile.defaultName", { defaultValue: "Partner" });
  const statusKey = normalizePortalStatus(partnerProfile?.portal_status || partnerProfile?.status);

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
            <div className="partner-portal-sidebar-card__copy">
              <strong>{partnerName}</strong>
              {partnerProfile?.referral_code ? <span>{partnerProfile.referral_code}</span> : null}
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
  const state = usePartnerPortalState();
  const [copied, setCopied] = useState(false);

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loading", { defaultValue: "Loading..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const data = state.data || {};
  const summary = data.summary || {};
  const recentReferrals = (data.referralRecords || []).slice(0, 5);

  const copyReferralLink = async () => {
    if (!data.referralLink) return;
    await navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="client-portal-page partner-portal-page">
      <section className="portal-card partner-portal-hero-card">
        <div className="partner-portal-hero-card__main">
          <div className="partner-portal-hero-card__copy">
            <strong>{data.partnerName || t("partnerPortal.profile.defaultName", { defaultValue: "Partner" })}</strong>
            <div className="partner-portal-hero-card__badges">
              <PartnerStatusBadge value={data.partnerStatusKey} t={t} />
              <span className="partner-portal-inline-pill">{t("partnerPortal.home.code", { defaultValue: "Code" })}: {data.referralCode || "—"}</span>
            </div>
          </div>

          <div className="partner-portal-link-box">
            <div>
              <small>{t("partnerPortal.home.link", { defaultValue: "Referral link" })}</small>
              <strong>{data.referralLink || t("partnerPortal.home.linkMissing", { defaultValue: "Link will appear after partner approval." })}</strong>
            </div>
            <button className="btn btn-primary" type="button" onClick={copyReferralLink} disabled={!data.referralLink}>
              <Copy size={16} />
              <span>{t("partnerPortal.home.copy", { defaultValue: "Copy link" })}</span>
            </button>
          </div>

          {copied ? <span className="partner-portal-inline-message">{t("partnerPortal.home.copied", { defaultValue: "Link copied." })}</span> : null}
        </div>
      </section>

      <section className="partner-portal-metrics-grid">
        <PartnerMetricCard label={t("partnerPortal.metrics.referrals", { defaultValue: "Referred clients" })} value={summary.referralCount || 0} />
        <PartnerMetricCard label={t("partnerPortal.metrics.activeClaims", { defaultValue: "Active claims" })} value={summary.activeClaims || 0} />
        <PartnerMetricCard label={t("partnerPortal.metrics.successfulClaims", { defaultValue: "Successful claims" })} value={summary.successfulClaims || 0} />
        <PartnerMetricCard label={t("partnerPortal.metrics.pendingPayout", { defaultValue: "Awaiting payout" })} value={formatCurrency(summary.pendingEarnings, summary.currency)} />
        <PartnerMetricCard label={t("partnerPortal.metrics.paidOut", { defaultValue: "Paid out" })} value={formatCurrency(summary.totalPaid, summary.currency)} />
        <PartnerMetricCard label={t("partnerPortal.metrics.totalEarned", { defaultValue: "Total earned" })} value={formatCurrency(summary.totalEarned, summary.currency)} />
      </section>

      <section className="portal-card">
        <div className="client-portal-card-heading">
          <strong>{t("partnerPortal.activity.title", { defaultValue: "Latest activity" })}</strong>
        </div>
        {recentReferrals.length ? (
          <div className="partner-portal-record-list">
            {recentReferrals.map((item) => (
              <PartnerReferralCard key={item.id} item={item} t={t} />
            ))}
          </div>
        ) : (
          <PortalEmptyState message={t("partnerPortal.activity.empty", { defaultValue: "No claims from your link yet." })} />
        )}
      </section>
    </div>
  );
}

export function PartnerReferralsPage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();
  const [filter, setFilter] = useState("all");

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loadingReferrals", { defaultValue: "Loading..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const filters = [
    { key: "all", label: t("partnerPortal.filters.all", { defaultValue: "All" }) },
    { key: "active", label: t("partnerPortal.filters.active", { defaultValue: "Active" }) },
    { key: "approved", label: t("partnerPortal.filters.approved", { defaultValue: "Approved" }) },
    { key: "paid", label: t("partnerPortal.filters.paid", { defaultValue: "Paid" }) },
    { key: "cancelled", label: t("partnerPortal.filters.cancelled", { defaultValue: "Cancelled" }) },
  ];

  const referrals = (state.data?.referralRecords || []).filter((item) => {
    if (filter === "active") return item.filterBucket === "active";
    if (filter === "approved") return item.filterBucket === "approved";
    if (filter === "paid") return item.filterBucket === "paid";
    if (filter === "cancelled") return item.filterBucket === "cancelled";
    return true;
  });

  return (
    <div className="client-portal-page partner-portal-page">
      <section className="portal-card">
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

        {referrals.length ? (
          <div className="partner-portal-record-list">
            {referrals.map((item) => (
              <PartnerReferralCard key={item.id} item={item} t={t} />
            ))}
          </div>
        ) : (
          <PortalEmptyState
            title={t("partnerPortal.referrals.emptyTitle", { defaultValue: "No referrals yet." })}
            message={t("partnerPortal.referrals.emptyText", { defaultValue: "Claims sent through your link will appear here." })}
          />
        )}
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
  const starterExample = calculatePartnerCommission(600, PARTNER_STARTER_RATE);
  const growthExample = calculatePartnerCommission(600, PARTNER_GROWTH_RATE);

  return (
    <div className="client-portal-page partner-portal-page">
      <section className="partner-portal-metrics-grid partner-portal-metrics-grid--finance">
        <PartnerMetricCard label={t("partnerPortal.finance.potentialIncome", { defaultValue: "Potential income" })} value={formatCurrency(summary.potentialEarnings, summary.currency)} />
        <PartnerMetricCard label={t("partnerPortal.finance.awaitingApproval", { defaultValue: "Awaiting confirmation" })} value={formatCurrency(summary.pendingApprovalAmount, summary.currency)} />
        <PartnerMetricCard label={t("partnerPortal.finance.approvedAmount", { defaultValue: "Approved" })} value={formatCurrency(summary.approvedAmount, summary.currency)} />
        <PartnerMetricCard label={t("partnerPortal.finance.paidAmount", { defaultValue: "Paid out" })} value={formatCurrency(summary.paidAmount, summary.currency)} />
        <PartnerMetricCard label={t("partnerPortal.finance.cancelledAmount", { defaultValue: "Cancelled" })} value={formatCurrency(summary.cancelledAmount, summary.currency)} />
      </section>

      <section className="partner-portal-two-up">
        <article className="portal-card partner-portal-tier-card">
          <div className="client-portal-card-heading">
            <strong>{t("partnerPortal.finance.currentTier", { defaultValue: "Current tier" })}</strong>
          </div>
          <div className="partner-portal-tier-card__header">
            <strong>{t(`partnerPortal.tiers.${tier.key}.name`, { defaultValue: tier.name || "Starter" })}</strong>
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
              <small>{t("partnerPortal.finance.growthUnlockedText", { defaultValue: "You now receive 20% of Fly Friendly revenue on new eligible claims." })}</small>
            </>
          )}
        </article>

        <article className="portal-card partner-portal-formula-card">
          <div className="client-portal-card-heading">
            <strong>{t("partnerPortal.finance.formulaTitle", { defaultValue: "Commission formula" })}</strong>
          </div>
          <p>{t("partnerPortal.finance.formulaText", { defaultValue: "Commission is calculated from Fly Friendly revenue. Fly Friendly revenue equals 30% of client compensation." })}</p>
          <div className="partner-portal-formula-card__list">
            <span>{t("partnerPortal.finance.formulaStarter", { defaultValue: "Starter: compensation × 30% × 15%" })}</span>
            <span>{t("partnerPortal.finance.formulaGrowth", { defaultValue: "Growth: compensation × 30% × 20%" })}</span>
          </div>
          <div className="partner-portal-example-card">
            <strong>{t("partnerPortal.finance.exampleTitle", { defaultValue: "Example" })}</strong>
            <span>{t("partnerPortal.finance.exampleRevenue", { defaultValue: "600 EUR compensation → 180 EUR Fly Friendly revenue" })}</span>
            <span>{t("partnerPortal.finance.exampleStarter", { defaultValue: "Starter 15% → 27 EUR commission" })}</span>
            <span>{t("partnerPortal.finance.exampleGrowth", { defaultValue: "Growth 20% → 36 EUR commission" })}</span>
            <small>{`${formatCurrency(starterExample.companyRevenue)} · ${formatCurrency(starterExample.partnerCommission)} · ${formatCurrency(growthExample.partnerCommission)}`}</small>
          </div>
        </article>
      </section>

      <section className="portal-card">
        <div className="client-portal-card-heading">
          <strong>{t("partnerPortal.finance.breakdownTitle", { defaultValue: "Commission breakdown" })}</strong>
        </div>
        {breakdown.length ? (
          <div className="partner-portal-record-list">
            {breakdown.map((item) => (
              <PartnerFinanceBreakdownCard key={item.id} item={item} t={t} />
            ))}
          </div>
        ) : (
          <PortalEmptyState message={t("partnerPortal.finance.empty", { defaultValue: "No commissions yet." })} />
        )}
      </section>

      <section className="portal-card">
        <div className="client-portal-card-heading">
          <strong>{t("partnerPortal.finance.payoutsTitle", { defaultValue: "Payout history" })}</strong>
        </div>
        {payouts.length ? (
          <div className="partner-portal-payout-list">
            {payouts.map((item) => (
              <div key={item.id} className="partner-portal-payout-row">
                <div>
                  <strong>{formatCurrency(item.amount, item.currency)}</strong>
                  <span>{[item.payment_reference || item.payout_method, item.clientLabel].filter(Boolean).join(" · ") || "—"}</span>
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
  const { partnerProfile, profile, refreshProfile } = useAuth();
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
  const [isSaving, setIsSaving] = useState(false);

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
  }, [partnerProfile, profile]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      await Promise.all([
        updateCurrentPartnerPublicProfile(form),
        updatePreferredLanguage(form.preferred_language),
      ]);
      await refreshProfile();
      setMessage(t("partnerPortal.profile.saved", { defaultValue: "Profile updated." }));
    } catch (saveError) {
      setError(normalizePortalError(saveError) || t("partnerPortal.profile.error", { defaultValue: "Could not update the profile." }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="client-portal-page client-portal-page--account partner-portal-page">
      <section className="portal-card client-portal-account-card">
        <div className="client-portal-account-stack">
          <section className="client-portal-account-section">
            <div className="client-portal-card-heading">
              <strong>{t("partnerPortal.profile.publicSection", { defaultValue: "Public information" })}</strong>
            </div>

            <form className="portal-form client-portal-account-form" onSubmit={submit}>
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
              <label>
                <span>{t("partnerPortal.profile.avatar", { defaultValue: "Avatar URL" })}</span>
                <input value={form.avatar_url} onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))} />
              </label>
              <label>
                <span>{t("partnerPortal.profile.bio", { defaultValue: "Bio" })}</span>
                <input value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} />
              </label>
              {error ? <p className="portal-message is-error">{error}</p> : null}
              {message ? <p className="portal-message is-notice">{message}</p> : null}
              <button className="btn btn-primary client-portal-account-submit" type="submit" disabled={isSaving}>
                {isSaving ? t("partnerPortal.profile.saving", { defaultValue: "Saving..." }) : t("partnerPortal.profile.submit", { defaultValue: "Save changes" })}
              </button>
            </form>
          </section>

          <section className="client-portal-account-section">
            <div className="client-portal-card-heading">
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

          <section className="client-portal-account-section">
            <div className="client-portal-card-heading">
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
