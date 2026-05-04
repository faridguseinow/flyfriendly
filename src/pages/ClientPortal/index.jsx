import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import {
  ArrowRight,
  CircleDollarSign,
  Files,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import {
  fetchClientClaimDetails,
  fetchClientClaims,
  fetchClientDashboardData,
  fetchClientDocuments,
  saveClientProfile,
} from "../../services/clientPortalService.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import "./style.scss";

function formatEstimateBand(distanceBand, t) {
  if (distanceBand === "short") {
    return t("clientPortal.estimate.short", { defaultValue: "Short haul" });
  }

  if (distanceBand === "medium") {
    return t("clientPortal.estimate.medium", { defaultValue: "Medium haul" });
  }

  if (distanceBand === "long") {
    return t("clientPortal.estimate.long", { defaultValue: "Long haul" });
  }

  return t("clientPortal.estimate.unknown", { defaultValue: "Pending review" });
}

function formatEstimateAmount(amount, currency = "EUR", t) {
  if (!Number.isFinite(Number(amount))) {
    return t("clientPortal.estimate.pending", { defaultValue: "Estimate pending review" });
  }

  return t("clientPortal.estimate.upTo", {
    defaultValue: "Up to {{currencySymbol}}{{amount}}",
    currencySymbol: currency === "EUR" ? "€" : `${currency} `,
    amount: Number(amount).toFixed(0),
  });
}

function EstimateSummary({ estimate, t }) {
  if (!estimate) {
    return null;
  }

  const hasDistance = Number.isFinite(Number(estimate.distance_km ?? estimate.distanceKm));
  const amount = estimate.estimated_compensation_eur ?? estimate.estimatedCompensationEur;
  const currency = estimate.compensation_currency ?? estimate.currency ?? "EUR";
  const status = estimate.estimate_status ?? estimate.estimateStatus ?? "pending_review";

  return (
    <div className="portal-estimate">
      <small className="portal-estimate__label">
        {t("clientPortal.estimate.label", { defaultValue: "Possible compensation" })}
      </small>
      <strong>{formatEstimateAmount(amount, currency, t)}</strong>
      <span>
        {hasDistance
          ? t("clientPortal.estimate.distanceBand", {
            defaultValue: "{{distance}} km approx. • {{band}}",
            distance: Math.round(Number(estimate.distance_km ?? estimate.distanceKm)),
            band: formatEstimateBand(estimate.distance_band ?? estimate.distanceBand, t),
          })
          : formatEstimateBand(estimate.distance_band ?? estimate.distanceBand, t)}
      </span>
      {status === "pending_review" ? (
        <small>{t("clientPortal.estimate.pendingNote", { defaultValue: "This route still needs a manual review by our team." })}</small>
      ) : null}
    </div>
  );
}

function PortalNavLink({ to, icon: Icon, label }) {
  return (
    <NavLink to={to} end={to.endsWith("/dashboard")} className={({ isActive }) => `portal-nav__link${isActive ? " is-active" : ""}`}>
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

export function ClientPortalLayout() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const toLocalizedPath = useLocalizedPath();
  const navItems = useMemo(() => ([
    { label: t("clientPortal.nav.dashboard", { defaultValue: "Dashboard" }), path: toLocalizedPath("/client/dashboard"), icon: LayoutDashboard },
    { label: t("clientPortal.nav.claims", { defaultValue: "My claims" }), path: toLocalizedPath("/client/claims"), icon: Files },
    { label: t("clientPortal.nav.documents", { defaultValue: "Documents" }), path: toLocalizedPath("/client/documents"), icon: FolderOpen },
    { label: t("clientPortal.nav.profile", { defaultValue: "Profile" }), path: toLocalizedPath("/client/profile"), icon: UserRound },
    { label: t("clientPortal.nav.payments", { defaultValue: "Payments" }), path: toLocalizedPath("/client/payments"), icon: CircleDollarSign },
  ]), [t, toLocalizedPath]);

  return (
    <div className="portal-shell section">
      <div className="portal-head">
        <div>
          <span className="section-label is-primary">{t("clientPortal.label", { defaultValue: "Client Portal" })}</span>
          <h1>{t("clientPortal.title", { defaultValue: "Your Fly Friendly account" })}</h1>
          <p>{t("clientPortal.text", { defaultValue: "Track submitted claims, review documents, and return to your case anytime." })}</p>
        </div>
        <div className="portal-head__meta">
          <strong>{profile?.full_name || t("clientPortal.defaultName", { defaultValue: "Traveler" })}</strong>
          <span>{profile?.email || ""}</span>
          <button type="button" className="portal-signout" onClick={() => signOut()}>
            <LogOut size={16} />
            <span>{t("clientPortal.signOut", { defaultValue: "Sign out" })}</span>
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

function MetricCard({ label, value, hint }) {
  return (
    <article className="portal-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export function ClientDashboardPage() {
  const { t } = useTranslation();
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    let active = true;
    setState({ isLoading: true, error: "", data: null });
    fetchClientDashboardData()
      .then((data) => {
        if (active) {
          setState({ isLoading: false, error: "", data });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load dashboard.", data: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loading", { defaultValue: "Loading your account..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  const data = state.data || { leads: [], cases: [], finance: [] };
  const latestLead = data.leads[0] || null;
  const paidCases = data.finance.filter((item) => item.customer_paid_at).length;

  return (
    <div className="portal-stack">
      <section className="portal-metrics">
        <MetricCard label={t("clientPortal.metrics.leads", { defaultValue: "Submitted claims" })} value={data.leads.length} />
        <MetricCard label={t("clientPortal.metrics.cases", { defaultValue: "Open cases" })} value={data.cases.length} />
        <MetricCard label={t("clientPortal.metrics.paid", { defaultValue: "Paid cases" })} value={paidCases} />
      </section>

      <section className="portal-card">
        <div className="portal-card__head">
          <div>
            <h2>{t("clientPortal.nextAction.title", { defaultValue: "Next recommended action" })}</h2>
            <p>{t("clientPortal.nextAction.text", { defaultValue: "Keep your contact details current and return here for updates on any submitted case." })}</p>
          </div>
          <LocalizedLink className="btn btn-primary" to="/claim/eligibility">
            {t("clientPortal.nextAction.cta", { defaultValue: "Start a new claim" })}
          </LocalizedLink>
        </div>
      </section>

      <section className="portal-card">
        <div className="portal-card__head">
          <div>
            <h2>{t("clientPortal.recent.title", { defaultValue: "Latest submission" })}</h2>
            <p>{t("clientPortal.recent.text", { defaultValue: "Your most recent claim will appear here after submission." })}</p>
          </div>
        </div>
        {latestLead ? (
          <div className="portal-summary">
            <strong>{latestLead.lead_code}</strong>
            <span>{latestLead.airline || t("clientPortal.recent.noFlight", { defaultValue: "Airline pending" })}</span>
            <div>
              <span>{latestLead.status} / {latestLead.stage}</span>
              <EstimateSummary estimate={latestLead} t={t} />
            </div>
          </div>
        ) : (
          <p className="portal-empty">{t("clientPortal.recent.empty", { defaultValue: "No claims yet. Start your first claim to build your case history." })}</p>
        )}
      </section>
    </div>
  );
}

export function ClientClaimsPage() {
  const { t } = useTranslation();
  const [state, setState] = useState({ isLoading: true, error: "", rows: [] });

  useEffect(() => {
    let active = true;
    fetchClientClaims()
      .then((data) => {
        if (active) {
          setState({ isLoading: false, error: "", rows: data.claimRows || [] });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load claims.", rows: [] });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loadingClaims", { defaultValue: "Loading your claims..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <div className="portal-card__head">
          <div>
            <h2>{t("clientPortal.claims.title", { defaultValue: "My claims" })}</h2>
            <p>{t("clientPortal.claims.text", { defaultValue: "Track each submitted lead or active case in one list." })}</p>
          </div>
        </div>
        {state.rows.length ? (
          <div className="portal-list">
            {state.rows.map((item) => (
              <LocalizedLink key={`${item.kind}-${item.id}`} to={`/client/claims/${item.id}`} className="portal-row">
                <div>
                  <strong>{item.code || item.id}</strong>
                  <span>{item.flight || t("clientPortal.claims.noFlight", { defaultValue: "Airline pending" })}</span>
                  {item.kind === "lead" ? <EstimateSummary estimate={item} t={t} /> : null}
                </div>
                <div>
                  <span>{item.route || "-"}</span>
                  <small>{item.status} / {item.substatus}</small>
                </div>
                <ArrowRight size={18} />
              </LocalizedLink>
            ))}
          </div>
        ) : (
          <p className="portal-empty">{t("clientPortal.claims.empty", { defaultValue: "No claims have been attached to your account yet." })}</p>
        )}
      </section>
    </div>
  );
}

export function ClientClaimDetailsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    let active = true;
    fetchClientClaimDetails(id)
      .then((data) => {
        if (active) {
          setState({ isLoading: false, error: "", data });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load claim details.", data: null });
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loadingClaimDetails", { defaultValue: "Loading claim details..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  const data = state.data;
  const base = data?.type === "case" ? data.case : data?.lead;
  const estimate = data?.type === "case" ? data?.leadEstimate : data?.lead;

  if (!base) {
    return <p className="portal-empty">{t("clientPortal.claimDetails.empty", { defaultValue: "This claim is not available in your account." })}</p>;
  }

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <div className="portal-card__head">
          <div>
            <h2>{base.case_code || base.lead_code || id}</h2>
            <p>{base.airline || t("clientPortal.claimDetails.noFlight", { defaultValue: "Airline pending" })}</p>
          </div>
        </div>
        <div className="portal-detail-grid">
          <article><strong>{t("clientPortal.claimDetails.status", { defaultValue: "Status" })}</strong><span>{base.status || "-"}</span></article>
          <article><strong>{t("clientPortal.claimDetails.route", { defaultValue: "Route" })}</strong><span>{[base.route_from || base.departure_airport, base.route_to || base.arrival_airport].filter(Boolean).join(" -> ") || "-"}</span></article>
          <article><strong>{t("clientPortal.claimDetails.kind", { defaultValue: "Record type" })}</strong><span>{data.type}</span></article>
          <article><strong>{t("clientPortal.claimDetails.payout", { defaultValue: "Payout status" })}</strong><span>{base.payout_status || data.finance?.payment_status || "-"}</span></article>
          <article><strong>{t("clientPortal.claimDetails.estimate", { defaultValue: "Estimated compensation" })}</strong><span>{formatEstimateAmount(estimate?.estimated_compensation_eur ?? estimate?.estimatedCompensationEur, estimate?.compensation_currency ?? estimate?.currency ?? "EUR", t)}</span></article>
          <article><strong>{t("clientPortal.claimDetails.distance", { defaultValue: "Calculated distance" })}</strong><span>{Number.isFinite(Number(estimate?.distance_km ?? estimate?.distanceKm)) ? `${Math.round(Number(estimate.distance_km ?? estimate.distanceKm))} km` : t("clientPortal.estimate.pending", { defaultValue: "Estimate pending review" })}</span></article>
        </div>
        {estimate ? <EstimateSummary estimate={estimate} t={t} /> : null}
      </section>

      <section className="portal-card">
        <h2>{t("clientPortal.claimDetails.documents", { defaultValue: "Documents" })}</h2>
        {data.documents.length ? (
          <div className="portal-list is-compact">
            {data.documents.map((item) => (
              <div key={item.id} className="portal-row is-static">
                <div>
                  <strong>{item.file_name}</strong>
                  <span>{item.document_type}</span>
                </div>
                <div>
                  <small>{item.status}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="portal-empty">{t("clientPortal.claimDetails.noDocuments", { defaultValue: "No uploaded documents are attached yet." })}</p>
        )}
      </section>
    </div>
  );
}

export function ClientDocumentsPage() {
  const { t } = useTranslation();
  const [state, setState] = useState({ isLoading: true, error: "", documents: [] });

  useEffect(() => {
    let active = true;
    fetchClientDocuments()
      .then((data) => {
        if (active) {
          setState({ isLoading: false, error: "", documents: data.documents || [] });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load documents.", documents: [] });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loadingDocuments", { defaultValue: "Loading documents..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("clientPortal.documents.title", { defaultValue: "Documents" })}</h2>
          <p>{t("clientPortal.documents.text", { defaultValue: "Review files uploaded through your claims and active cases." })}</p>
        </div>
      </div>
      {state.documents.length ? (
        <div className="portal-list is-compact">
          {state.documents.map((item) => (
            <div key={item.id} className="portal-row is-static">
              <div>
                <strong>{item.file_name}</strong>
                <span>{item.document_type}</span>
              </div>
              <div>
                <span>{item.ownerType}</span>
                <small>{item.status}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="portal-empty">{t("clientPortal.documents.empty", { defaultValue: "Documents will appear here after you upload them in the claim flow." })}</p>
      )}
    </section>
  );
}

export function ClientProfilePage() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || "",
      email: profile?.email || "",
      phone: profile?.phone || "",
    });
  }, [profile]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      await saveClientProfile(form);
      await refreshProfile();
      setMessage(t("clientPortal.profile.saved", { defaultValue: "Profile updated." }));
    } catch (saveError) {
      setError(saveError.message || t("clientPortal.profile.error", { defaultValue: "Could not update your profile." }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("clientPortal.profile.title", { defaultValue: "Profile" })}</h2>
          <p>{t("clientPortal.profile.text", { defaultValue: "Keep your contact information up to date for case communication." })}</p>
        </div>
      </div>
      <form className="portal-form" onSubmit={submit}>
        <label>
          <span>{t("clientPortal.profile.fullName", { defaultValue: "Full name" })}</span>
          <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
        </label>
        <label>
          <span>{t("clientPortal.profile.email", { defaultValue: "Email" })}</span>
          <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label>
          <span>{t("clientPortal.profile.phone", { defaultValue: "Phone" })}</span>
          <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
        </label>
        {error ? <p className="portal-message is-error">{error}</p> : null}
        {message ? <p className="portal-message is-notice">{message}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSaving}>
          {isSaving ? t("clientPortal.profile.saving", { defaultValue: "Saving..." }) : t("clientPortal.profile.submit", { defaultValue: "Save changes" })}
        </button>
      </form>
    </section>
  );
}

export function ClientPaymentsPage() {
  const { t } = useTranslation();
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    let active = true;
    fetchClientDashboardData()
      .then((data) => {
        if (active) {
          setState({ isLoading: false, error: "", data });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load payments.", data: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loadingPayments", { defaultValue: "Loading payment data..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  const financeRows = state.data?.finance || [];

  return (
    <section className="portal-card">
      <div className="portal-card__head">
        <div>
          <h2>{t("clientPortal.payments.title", { defaultValue: "Payments" })}</h2>
          <p>{t("clientPortal.payments.text", { defaultValue: "When compensation and payout data become available, they will appear here." })}</p>
        </div>
      </div>
      {financeRows.length ? (
        <div className="portal-list is-compact">
          {financeRows.map((item) => (
            <div key={item.id} className="portal-row is-static">
              <div>
                <strong>{Number(item.customer_payout || item.compensation_amount || 0).toFixed(0)} {item.currency || "EUR"}</strong>
                <span>{item.case_id}</span>
              </div>
              <div>
                <span>{item.payment_status || "-"}</span>
                <small>{item.customer_paid_at || ""}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="portal-empty">{t("clientPortal.payments.empty", { defaultValue: "No payment records are attached to your account yet." })}</p>
      )}
    </section>
  );
}
