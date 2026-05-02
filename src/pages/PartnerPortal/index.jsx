import { useEffect, useMemo, useState } from "react";
import { Gift, HandCoins, Image, Link2, LogOut, PiggyBank, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { getPublicSiteUrl } from "../../lib/siteUrl.js";
import { fetchPartnerPortalData, normalizePortalError, updateCurrentPartnerPublicProfile } from "../../services/partnerPortalService.js";
import "../ClientPortal/style.scss";

function PortalNavLink({ to, icon: Icon, label }) {
  return (
    <NavLink to={to} end={to.endsWith("/dashboard")} className={({ isActive }) => `portal-nav__link${isActive ? " is-active" : ""}`}>
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="portal-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function PortalErrorState({ message }) {
  return <p className="portal-message is-error">{message}</p>;
}

function PortalEmptyState({ message }) {
  return <p className="portal-empty">{message}</p>;
}

export function PartnerPortalLayout() {
  const { t } = useTranslation();
  const { partnerProfile, signOut } = useAuth();
  const toLocalizedPath = useLocalizedPath();
  const navItems = useMemo(() => ([
    { label: t("partnerPortal.nav.dashboard", { defaultValue: "Dashboard" }), path: toLocalizedPath("/partner/dashboard"), icon: HandCoins },
    { label: t("partnerPortal.nav.link", { defaultValue: "Referral link" }), path: toLocalizedPath("/partner/link"), icon: Link2 },
    { label: t("partnerPortal.nav.referrals", { defaultValue: "Referrals" }), path: toLocalizedPath("/partner/referrals"), icon: Gift },
    { label: t("partnerPortal.nav.earnings", { defaultValue: "Earnings" }), path: toLocalizedPath("/partner/earnings"), icon: PiggyBank },
    { label: t("partnerPortal.nav.payouts", { defaultValue: "Payouts" }), path: toLocalizedPath("/partner/payouts"), icon: HandCoins },
    { label: t("partnerPortal.nav.profile", { defaultValue: "Profile" }), path: toLocalizedPath("/partner/profile"), icon: UserRound },
    { label: t("partnerPortal.nav.assets", { defaultValue: "Assets" }), path: toLocalizedPath("/partner/assets"), icon: Image },
  ]), [t, toLocalizedPath]);

  return (
    <div className="portal-shell section">
      <div className="portal-head">
        <div>
          <span className="section-label is-primary">{t("partnerPortal.label", { defaultValue: "Partner Portal" })}</span>
          <h1>{t("partnerPortal.title", { defaultValue: "Your referral account" })}</h1>
          <p>{t("partnerPortal.text", { defaultValue: "Track referral activity, earnings, and payouts from one place." })}</p>
        </div>
        <div className="portal-head__meta">
          <strong>{partnerProfile?.public_name || partnerProfile?.name || t("partnerPortal.defaultName", { defaultValue: "Partner" })}</strong>
          <span>{partnerProfile?.referral_code || ""}</span>
          <button type="button" className="portal-signout" onClick={() => signOut()}>
            <LogOut size={16} />
            <span>{t("partnerPortal.signOut", { defaultValue: "Sign out" })}</span>
          </button>
        </div>
      </div>

      <div className="portal-grid">
        <aside className="portal-nav">
          {navItems.map((item) => <PortalNavLink key={item.path} to={item.path} icon={item.icon} label={item.label} />)}
        </aside>
        <section className="portal-panel">
          <Outlet />
        </section>
      </div>
    </div>
  );
}

function usePartnerPortalState() {
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    let active = true;
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

export function PartnerDashboardPage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loading", { defaultValue: "Loading partner dashboard..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const data = state.data || { partnerProfile: null, summary: null, referralRecords: [] };
  const summary = data.summary || {
    referralCount: 0,
    activeClaims: 0,
    successfulClaims: 0,
    conversionRate: 0,
    totalEarned: 0,
    totalPaid: 0,
    pendingEarnings: 0,
  };
  const recentReferrals = (data.referralRecords || []).slice(0, 4);
  const referralLink = data.partnerProfile?.referral_code ? `${getPublicSiteUrl()}/r/${data.partnerProfile.referral_code}` : "";

  return (
    <div className="portal-stack">
      <section className="portal-metrics">
        <MetricCard label={t("partnerPortal.metrics.referrals", { defaultValue: "Referred clients" })} value={summary.referralCount} hint={`${summary.conversionRate}% ${t("partnerPortal.metrics.convertedHint", { defaultValue: "converted" })}`} />
        <MetricCard label={t("partnerPortal.metrics.activeClaims", { defaultValue: "Active claims" })} value={summary.activeClaims} />
        <MetricCard label={t("partnerPortal.metrics.successfulClaims", { defaultValue: "Successful claims" })} value={summary.successfulClaims} />
        <MetricCard label={t("partnerPortal.metrics.earned", { defaultValue: "Total earned" })} value={formatCurrency(summary.totalEarned)} />
        <MetricCard label={t("partnerPortal.metrics.pending", { defaultValue: "Pending earnings" })} value={formatCurrency(summary.pendingEarnings)} hint={`${formatCurrency(summary.totalPaid)} ${t("partnerPortal.metrics.paidHint", { defaultValue: "paid out" })}`} />
      </section>

      <section className="portal-card">
        <div className="portal-card__head">
          <div>
            <h2>{t("partnerPortal.link.title", { defaultValue: "Referral link" })}</h2>
            <p>{t("partnerPortal.link.text", { defaultValue: "Share this link with your audience. Claims created through it will appear in your partner account." })}</p>
          </div>
        </div>
        <div className="portal-summary">
          <strong>{referralLink || t("partnerPortal.link.missing", { defaultValue: "Referral link will appear after approval." })}</strong>
          <span>{data.partnerProfile?.referral_code || t("partnerPortal.link.codePending", { defaultValue: "Code pending" })}</span>
          <span>{data.partnerProfile?.portal_status || t("partnerPortal.status.pending", { defaultValue: "pending" })}</span>
        </div>
      </section>

      <section className="portal-card">
        <div className="portal-card__head">
          <div>
            <h2>{t("partnerPortal.activity.title", { defaultValue: "Recent pipeline activity" })}</h2>
            <p>{t("partnerPortal.activity.text", { defaultValue: "Latest captured referrals and claim conversions tied to your code." })}</p>
          </div>
        </div>
        {recentReferrals.length ? (
          <div className="portal-list is-compact">
            {recentReferrals.map((item) => (
              <div key={item.id} className="portal-row is-static">
                <div>
                  <strong>{item.clientLabel}</strong>
                  <span>{[item.caseCode || item.leadCode, item.routeLabel].filter(Boolean).join(" · ") || "-"}</span>
                </div>
                <div>
                  <span>{item.caseStatus || item.status}</span>
                  <small>{item.commissionStatus ? `${item.commissionStatus} · ${formatCurrency(item.commissionAmount, item.currency)}` : new Date(item.created_at).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <PortalEmptyState message={t("partnerPortal.activity.empty", { defaultValue: "No captured referrals or claim updates yet." })} />
        )}
      </section>
    </div>
  );
}

export function PartnerLinkPage() {
  const { t } = useTranslation();
  const { partnerProfile } = useAuth();
  const referralLink = partnerProfile?.referral_code ? `${getPublicSiteUrl()}/r/${partnerProfile.referral_code}` : "";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("partnerPortal.link.title", { defaultValue: "Referral link" })}</h2>
          <p>{t("partnerPortal.link.text", { defaultValue: "Use your link in videos, stories, bios, and campaign pages." })}</p>
        </div>
      </div>
      <div className="portal-summary">
        <strong>{referralLink || t("partnerPortal.link.missing", { defaultValue: "Referral link will appear after approval." })}</strong>
        <span>{partnerProfile?.referral_code || t("partnerPortal.link.codePending", { defaultValue: "Code pending" })}</span>
        <button className="btn btn-primary" type="button" onClick={copy}>
          {copied ? t("partnerPortal.link.copied", { defaultValue: "Copied" }) : t("partnerPortal.link.copy", { defaultValue: "Copy link" })}
        </button>
      </div>
      {!referralLink ? (
        <PortalEmptyState message={t("partnerPortal.link.empty", { defaultValue: "Your referral code is not available yet. Once your partner access is fully approved, your shareable link will appear here." })} />
      ) : null}
    </section>
  );
}

export function PartnerReferralsPage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loadingReferrals", { defaultValue: "Loading referrals..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const referrals = state.data?.referralRecords || [];

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("partnerPortal.referrals.title", { defaultValue: "Referrals" })}</h2>
          <p>{t("partnerPortal.referrals.text", { defaultValue: "Every captured referral and claim attribution linked to your code appears here." })}</p>
        </div>
      </div>
      {referrals.length ? (
        <div className="portal-list is-compact">
          {referrals.map((item) => (
            <div key={item.id} className="portal-row is-static">
              <div>
                <strong>{item.clientLabel}</strong>
                <span>{[item.caseCode || item.leadCode, item.routeLabel, item.source_path].filter(Boolean).join(" · ") || "-"}</span>
              </div>
              <div>
                <span>{item.caseStatus || item.status}</span>
                <small>{item.commissionStatus ? `${item.commissionStatus} · ${formatCurrency(item.commissionAmount, item.currency)}` : new Date(item.created_at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <PortalEmptyState message={t("partnerPortal.referrals.empty", { defaultValue: "No referral records yet." })} />
      )}
    </section>
  );
}

export function PartnerEarningsPage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loadingEarnings", { defaultValue: "Loading earnings..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const commissions = state.data?.commissionRecords || [];

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("partnerPortal.earnings.title", { defaultValue: "Earnings" })}</h2>
          <p>{t("partnerPortal.earnings.text", { defaultValue: "Commissions generated from successful referrals will be listed here." })}</p>
        </div>
      </div>
      {commissions.length ? (
        <div className="portal-list is-compact">
          {commissions.map((item) => (
            <div key={item.id} className="portal-row is-static">
              <div>
                <strong>{formatCurrency(item.amount, item.currency)}</strong>
                <span>{[item.clientLabel, item.caseCode, item.routeLabel].filter(Boolean).join(" · ") || "-"}</span>
              </div>
              <div>
                <span>{item.status}</span>
                <small>{item.paid_at ? new Date(item.paid_at).toLocaleString() : new Date(item.created_at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <PortalEmptyState message={t("partnerPortal.earnings.empty", { defaultValue: "No commissions yet." })} />
      )}
    </section>
  );
}

export function PartnerPayoutsPage() {
  const { t } = useTranslation();
  const state = usePartnerPortalState();

  if (state.isLoading) {
    return <p className="portal-message">{t("partnerPortal.loadingPayouts", { defaultValue: "Loading payouts..." })}</p>;
  }

  if (state.error) {
    return <PortalErrorState message={state.error} />;
  }

  const payouts = state.data?.payoutRecords || [];

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("partnerPortal.payouts.title", { defaultValue: "Payouts" })}</h2>
          <p>{t("partnerPortal.payouts.text", { defaultValue: "Completed and pending payout records will appear here." })}</p>
        </div>
      </div>
      {payouts.length ? (
        <div className="portal-list is-compact">
          {payouts.map((item) => (
            <div key={item.id} className="portal-row is-static">
              <div>
                <strong>{formatCurrency(item.amount, item.currency)}</strong>
                <span>{[item.clientLabel, item.caseCode, item.payment_reference || item.payout_method].filter(Boolean).join(" · ") || "-"}</span>
              </div>
              <div>
                <span>{item.status}</span>
                <small>{item.paid_at ? new Date(item.paid_at).toLocaleString() : new Date(item.created_at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <PortalEmptyState message={t("partnerPortal.payouts.empty", { defaultValue: "No payout history yet." })} />
      )}
    </section>
  );
}

export function PartnerProfilePage() {
  const { t } = useTranslation();
  const { partnerProfile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    public_name: partnerProfile?.public_name || partnerProfile?.name || "",
    bio: partnerProfile?.bio || "",
    avatar_url: partnerProfile?.avatar_url || "",
    website_url: partnerProfile?.website_url || "",
    instagram_url: partnerProfile?.instagram_url || "",
    tiktok_url: partnerProfile?.tiktok_url || "",
    youtube_url: partnerProfile?.youtube_url || "",
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
    });
  }, [partnerProfile]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      await updateCurrentPartnerPublicProfile(form);
      await refreshProfile();
      setMessage(t("partnerPortal.profile.saved", { defaultValue: "Partner profile updated." }));
    } catch (saveError) {
      setError(normalizePortalError(saveError) || t("partnerPortal.profile.error", { defaultValue: "Could not update the partner profile." }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("partnerPortal.profile.title", { defaultValue: "Profile" })}</h2>
          <p>{t("partnerPortal.profile.text", { defaultValue: "Update the public information used for your partner presence and campaigns." })}</p>
        </div>
      </div>
      <form className="portal-form" onSubmit={submit}>
        {!partnerProfile ? <PortalEmptyState message={t("partnerPortal.profile.empty", { defaultValue: "Partner profile details are not available yet." })} /> : null}
        <label><span>{t("partnerPortal.profile.publicName", { defaultValue: "Public name" })}</span><input value={form.public_name} onChange={(event) => setForm((current) => ({ ...current, public_name: event.target.value }))} /></label>
        <label><span>{t("partnerPortal.profile.website", { defaultValue: "Website URL" })}</span><input value={form.website_url} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} /></label>
        <label><span>{t("partnerPortal.profile.instagram", { defaultValue: "Instagram URL" })}</span><input value={form.instagram_url} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} /></label>
        <label><span>{t("partnerPortal.profile.tiktok", { defaultValue: "TikTok URL" })}</span><input value={form.tiktok_url} onChange={(event) => setForm((current) => ({ ...current, tiktok_url: event.target.value }))} /></label>
        <label><span>{t("partnerPortal.profile.youtube", { defaultValue: "YouTube URL" })}</span><input value={form.youtube_url} onChange={(event) => setForm((current) => ({ ...current, youtube_url: event.target.value }))} /></label>
        <label><span>{t("partnerPortal.profile.avatar", { defaultValue: "Avatar URL" })}</span><input value={form.avatar_url} onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))} /></label>
        <label><span>{t("partnerPortal.profile.bio", { defaultValue: "Bio" })}</span><input value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} /></label>
        {error ? <p className="portal-message is-error">{error}</p> : null}
        {message ? <p className="portal-message is-notice">{message}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSaving}>
          {isSaving ? t("partnerPortal.profile.saving", { defaultValue: "Saving..." }) : t("partnerPortal.profile.submit", { defaultValue: "Save changes" })}
        </button>
      </form>
    </section>
  );
}

export function PartnerAssetsPage() {
  const { t } = useTranslation();

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("partnerPortal.assets.title", { defaultValue: "Marketing assets" })}</h2>
          <p>{t("partnerPortal.assets.text", { defaultValue: "A fuller asset library can be added later. For now, share your referral link in your normal content and brand placements." })}</p>
        </div>
      </div>
      <PortalEmptyState message={t("partnerPortal.assets.empty", { defaultValue: "No managed assets have been uploaded yet." })} />
    </section>
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
  return <PartnerStatusTemplate title={t("partnerPortal.pending.title", { defaultValue: "Partner application under review" })} text={t("partnerPortal.pending.text", { defaultValue: "Your partner profile has been created, but access is waiting for approval. You can still use your regular client account while the review is in progress." })} />;
}

export function PartnerRejectedPage() {
  const { t } = useTranslation();
  return <PartnerStatusTemplate title={t("partnerPortal.rejected.title", { defaultValue: "Partner access was not approved" })} text={t("partnerPortal.rejected.text", { defaultValue: "Your client account remains active for normal client use. If you need a review, contact the Fly Friendly team." })} />;
}

export function PartnerSuspendedPage() {
  const { t } = useTranslation();
  return <PartnerStatusTemplate title={t("partnerPortal.suspended.title", { defaultValue: "Partner access is temporarily suspended" })} text={t("partnerPortal.suspended.text", { defaultValue: "Your client account remains available, but partner tools are paused until the account is reactivated." })} />;
}
