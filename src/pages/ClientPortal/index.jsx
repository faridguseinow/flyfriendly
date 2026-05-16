import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileImage,
  FileText,
  FolderOpen,
  Globe,
  House,
  Mail,
  Phone,
  ShieldCheck,
  Signature,
  Ticket,
  TriangleAlert,
  UserRound,
  UserSquare2,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getLanguageByCode } from "../../i18n/languages.js";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import {
  fetchClientClaimDetails,
  fetchClientClaims,
  fetchClientDashboardData,
  fetchClientDocuments,
  getClientDocumentDownloadUrl,
  getClientDocumentStatus,
  getClientPaymentStatus,
  saveClientProfile,
} from "../../services/clientPortalService.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { contactEmail } from "../../constants/site.js";
import "./style.scss";

const CLIENT_STATUS_STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "documents_needed", label: "Documents needed" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "paid", label: "Paid" },
];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCurrencyValue(value, currency = "EUR") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
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

function formatEstimateAmount(amount, currency = "EUR", t) {
  if (!Number.isFinite(Number(amount))) {
    return t("clientPortal.estimate.pending", { defaultValue: "Estimate pending" });
  }

  return t("clientPortal.estimate.upTo", {
    defaultValue: "Up to {{amount}}",
    amount: formatCurrencyValue(amount, currency),
  });
}

function getStatusIcon(tone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return TriangleAlert;
  if (tone === "danger") return XCircle;
  return Clock3;
}

function isImageDocument(document) {
  if (!document) return false;
  if (document.kind === "signature") return true;
  const mime = String(document.mime_type || "").toLowerCase();
  const name = String(document.file_name || "").toLowerCase();
  return mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((suffix) => name.endsWith(suffix));
}

function isPdfDocument(document) {
  if (!document) return false;
  const mime = String(document.mime_type || "").toLowerCase();
  const name = String(document.file_name || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

function getDocumentIcon(document) {
  const type = String(document?.document_type || "").toLowerCase();
  if (document?.kind === "signature" || type.includes("signature") || type.includes("consent")) return Signature;
  if (type.includes("passport") || type.includes("id")) return UserSquare2;
  if (type.includes("boarding")) return Ticket;
  if (isImageDocument(document)) return FileImage;
  return FileText;
}

function getClaimAction(claim, t) {
  if (!claim) {
    return {
      label: t("clientPortal.actions.startClaim", { defaultValue: "Start new claim" }),
      to: "/claim/eligibility",
    };
  }

  if (claim.publicStatus.key === "documents_needed") {
    return {
      label: t("clientPortal.actions.viewDocuments", { defaultValue: "View documents" }),
      to: "/client/documents",
    };
  }

  return {
    label: t("clientPortal.actions.viewClaim", { defaultValue: "View claim" }),
    to: `/client/claims/${claim.id}`,
  };
}

function getProgressState(currentStatus, stepKey) {
  if (stepKey === "submitted") {
    return currentStatus === "submitted" ? "current" : "completed";
  }

  if (stepKey === "under_review") {
    if (currentStatus === "under_review") return "current";
    if (["documents_needed", "approved", "rejected", "paid"].includes(currentStatus)) return "completed";
    return "idle";
  }

  if (stepKey === "documents_needed") {
    return currentStatus === "documents_needed" ? "current" : "idle";
  }

  if (stepKey === "approved") {
    if (currentStatus === "approved") return "current";
    if (currentStatus === "paid") return "completed";
    return "idle";
  }

  if (stepKey === "rejected") {
    return currentStatus === "rejected" ? "current" : "idle";
  }

  if (stepKey === "paid") {
    return currentStatus === "paid" ? "current" : "idle";
  }

  return "idle";
}

function useDocumentPreviewUrls(documents) {
  const [previewUrls, setPreviewUrls] = useState({});

  useEffect(() => {
    const targets = documents.filter((item) => isImageDocument(item) && !item.signature_data_url && item.file_path && item.bucket);

    if (!targets.length) {
      setPreviewUrls({});
      return;
    }

    let active = true;

    Promise.all(targets.map(async (item) => {
      try {
        const url = await getClientDocumentDownloadUrl(item);
        return [item.id, url];
      } catch {
        return [item.id, ""];
      }
    })).then((entries) => {
      if (!active) {
        return;
      }

      setPreviewUrls(Object.fromEntries(entries.filter(([, value]) => value)));
    });

    return () => {
      active = false;
    };
  }, [documents]);

  return previewUrls;
}

function PortalSectionHeader({ title, text, action }) {
  return (
    <div className="client-portal-section-header">
      <div>
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </div>
      {action ? <div className="client-portal-section-header__action">{action}</div> : null}
    </div>
  );
}

function ClientStatusBadge({ status }) {
  const tone = status?.tone || "neutral";
  const Icon = getStatusIcon(tone);

  return (
    <span className={`client-portal-status-badge is-${tone}`}>
      <Icon size={14} />
      <span>{status?.label || "Under review"}</span>
    </span>
  );
}

function ClaimProgress({ status, t }) {
  return (
    <div className="client-portal-progress" aria-label={t("clientPortal.progress", { defaultValue: "Claim progress" })}>
      {CLIENT_STATUS_STEPS.map((step) => {
        const state = getProgressState(status?.key, step.key);
        return (
          <div key={step.key} className={`client-portal-progress__step is-${state}`}>
            <span className="client-portal-progress__dot" aria-hidden="true" />
            <span>{t(`clientPortal.status.${step.key}`, { defaultValue: step.label })}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClientPortalNavLink({ to, icon: Icon, label, end = false }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `client-portal-nav__link${isActive ? " is-active" : ""}`}>
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

function DocumentStatusCard({ item, previewUrl, onOpen }) {
  const status = item.latestDocument
    ? getClientDocumentStatus(item.latestDocument.status, item.latestDocument.kind)
    : { key: item.statusKey, label: item.statusLabel, tone: item.statusTone };

  return (
    <article className="client-portal-document-card">
      <div className="client-portal-document-card__preview">
        {previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          (() => {
            const Icon = getDocumentIcon(item.latestDocument || { document_type: item.key });
            return <Icon size={22} />;
          })()
        )}
      </div>
      <div className="client-portal-document-card__copy">
        <strong>{item.label}</strong>
        <ClientStatusBadge status={status} />
        <small>{item.uploadedAt ? formatDateTime(item.uploadedAt) : "No file uploaded yet"}</small>
      </div>
      {item.latestDocument ? (
        <button type="button" className="client-portal-inline-button" onClick={() => onOpen(item.latestDocument)}>
          Open
        </button>
      ) : null}
    </article>
  );
}

function UploadedDocumentRow({ document, previewUrl, onOpen }) {
  const status = getClientDocumentStatus(document.status, document.kind);
  const Icon = getDocumentIcon(document);

  return (
    <div className="client-portal-uploaded-row">
      <div className="client-portal-uploaded-row__thumb">
        {previewUrl ? <img src={previewUrl} alt="" /> : <Icon size={20} />}
      </div>
      <div className="client-portal-uploaded-row__copy">
        <strong>{document.file_name || "Document"}</strong>
        <span>{document.kind === "signature" ? "Signature / Consent" : document.document_type}</span>
        <small>{formatDateTime(document.created_at)}</small>
      </div>
      <div className="client-portal-uploaded-row__meta">
        <ClientStatusBadge status={status} />
        <button type="button" className="client-portal-inline-button" onClick={() => onOpen(document)}>
          Open
        </button>
      </div>
    </div>
  );
}

export function ClientPortalLayout() {
  const { t } = useTranslation();
  const toLocalizedPath = useLocalizedPath();

  const navItems = useMemo(() => ([
    { label: t("clientPortal.nav.home", { defaultValue: "Home" }), path: toLocalizedPath("/client/dashboard"), icon: House, end: true },
    { label: t("clientPortal.nav.claims", { defaultValue: "Claims" }), path: toLocalizedPath("/client/claims"), icon: FileText },
    { label: t("clientPortal.nav.documents", { defaultValue: "Documents" }), path: toLocalizedPath("/client/documents"), icon: FolderOpen },
    { label: t("clientPortal.nav.payments", { defaultValue: "Payments" }), path: toLocalizedPath("/client/payments"), icon: CircleDollarSign },
    { label: t("clientPortal.nav.account", { defaultValue: "Account" }), path: toLocalizedPath("/client/account"), icon: UserRound },
  ]), [t, toLocalizedPath]);

  return (
    <div className="client-portal-shell section">
      <div className="client-portal-layout">
        <aside className="client-portal-sidebar">
          <nav className="client-portal-nav" aria-label={t("clientPortal.navLabel", { defaultValue: "Client account sections" })}>
            {navItems.map((item) => (
              <ClientPortalNavLink key={item.path} to={item.path} icon={item.icon} label={item.label} end={item.end} />
            ))}
          </nav>
        </aside>

        <main className="client-portal-main">
          <Outlet />
        </main>
      </div>

      <nav className="client-portal-mobile-nav" aria-label={t("clientPortal.navLabel", { defaultValue: "Client account sections" })}>
        {navItems.map((item) => (
          <ClientPortalNavLink key={`mobile-${item.path}`} to={item.path} icon={item.icon} label={item.label} end={item.end} />
        ))}
      </nav>
    </div>
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
          setState({ isLoading: false, error: error.message || "Could not load your account.", data: null });
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

  const claimRows = state.data?.claimRows || [];
  const activeClaim = claimRows.find((item) => !["paid", "rejected"].includes(item.publicStatus.key)) || claimRows[0] || null;
  const claimsNeedingAttention = claimRows.filter((item) => item.publicStatus.key === "documents_needed").length;
  const paidClaims = claimRows.filter((item) => item.publicStatus.key === "paid").length;
  const action = getClaimAction(activeClaim, t);

  if (!claimRows.length) {
    return (
      <div className="client-portal-page">
        <section className="portal-card client-portal-empty-card">
          <PortalSectionHeader
            title={t("clientPortal.home.emptyTitle", { defaultValue: "No claims yet" })}
            text={t("clientPortal.home.emptyText", { defaultValue: "Start your first claim to track compensation, documents, and payout updates here." })}
            action={<LocalizedLink className="btn btn-primary" to="/claim/eligibility">{t("clientPortal.home.start", { defaultValue: "Start your first claim" })}</LocalizedLink>}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="client-portal-page">
      <div className="client-portal-overview-grid">
        <article className="client-portal-overview-card">
          <span>{t("clientPortal.overview.totalClaims", { defaultValue: "Claims" })}</span>
          <strong>{claimRows.length}</strong>
        </article>
        <article className="client-portal-overview-card">
          <span>{t("clientPortal.overview.documents", { defaultValue: "Needs attention" })}</span>
          <strong>{claimsNeedingAttention}</strong>
        </article>
        <article className="client-portal-overview-card">
          <span>{t("clientPortal.overview.paid", { defaultValue: "Paid" })}</span>
          <strong>{paidClaims}</strong>
        </article>
      </div>

      <section className="portal-card client-portal-hero-card">
        <PortalSectionHeader
          title={t("clientPortal.home.title", { defaultValue: "Home" })}
          text={t("clientPortal.home.text", { defaultValue: "Your latest claim and the only next step that matters right now." })}
          action={<LocalizedLink className="btn btn-secondary" to="/claim/eligibility">{t("clientPortal.home.newClaim", { defaultValue: "Start new claim" })}</LocalizedLink>}
        />

        {activeClaim ? (
          <div className="client-portal-current-claim">
            <div className="client-portal-current-claim__main">
              <div className="client-portal-current-claim__head">
                <div>
                  <small>{t("clientPortal.home.currentClaim", { defaultValue: "Current claim" })}</small>
                  <h2>{activeClaim.reference}</h2>
                </div>
                <ClientStatusBadge status={activeClaim.publicStatus} />
              </div>

              <div className="client-portal-meta-grid">
                <article>
                  <span>{t("clientPortal.claim.airline", { defaultValue: "Airline" })}</span>
                  <strong>{activeClaim.airline || "—"}</strong>
                </article>
                <article>
                  <span>{t("clientPortal.claim.route", { defaultValue: "Route" })}</span>
                  <strong>{activeClaim.route || "—"}</strong>
                </article>
                <article>
                  <span>{t("clientPortal.claim.compensation", { defaultValue: "Possible compensation" })}</span>
                  <strong>{formatEstimateAmount(activeClaim.estimate?.amount, activeClaim.estimate?.currency, t)}</strong>
                </article>
                <article>
                  <span>{t("clientPortal.claim.documents", { defaultValue: "Documents" })}</span>
                  <strong>{activeClaim.documentsSummary.label}</strong>
                </article>
              </div>

              <div className="client-portal-current-claim__actions">
                <LocalizedLink className="btn btn-primary" to={action.to}>{action.label}</LocalizedLink>
                <LocalizedLink className="client-portal-text-link" to={`/client/claims/${activeClaim.id}`}>
                  {t("clientPortal.actions.claimDetails", { defaultValue: "Claim details" })}
                  <ArrowRight size={16} />
                </LocalizedLink>
              </div>
            </div>

            <div className="client-portal-current-claim__side">
              <h3>{t("clientPortal.home.progressTitle", { defaultValue: "Claim status" })}</h3>
              <p>{activeClaim.publicStatus.explanation}</p>
              <ClaimProgress status={activeClaim.publicStatus} t={t} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function ClientClaimsPage() {
  const { t } = useTranslation();
  const [state, setState] = useState({ isLoading: true, error: "", rows: [] });

  useEffect(() => {
    let active = true;
    setState({ isLoading: true, error: "", rows: [] });

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
    <div className="client-portal-page">
      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.claims.title", { defaultValue: "Claims" })}
          text={t("clientPortal.claims.text", { defaultValue: "Every claim attached to your account, simplified into customer-safe updates." })}
          action={<LocalizedLink className="btn btn-secondary" to="/claim/eligibility">{t("clientPortal.claims.newClaim", { defaultValue: "Start new claim" })}</LocalizedLink>}
        />

        {state.rows.length ? (
          <div className="client-portal-claims-list">
            {state.rows.map((item) => (
              <LocalizedLink key={`${item.kind}-${item.id}`} to={`/client/claims/${item.id}`} className="client-portal-claim-card">
                <div className="client-portal-claim-card__head">
                  <div>
                    <small>{item.reference}</small>
                    <h2>{item.route || item.airline || t("clientPortal.claims.pendingRoute", { defaultValue: "Route pending" })}</h2>
                  </div>
                  <ClientStatusBadge status={item.publicStatus} />
                </div>

                <div className="client-portal-meta-grid">
                  <article>
                    <span>{t("clientPortal.claim.airline", { defaultValue: "Airline" })}</span>
                    <strong>{item.airline || "—"}</strong>
                  </article>
                  <article>
                    <span>{t("clientPortal.claim.disruption", { defaultValue: "Disruption" })}</span>
                    <strong>{item.disruptionType || "—"}</strong>
                  </article>
                  <article>
                    <span>{t("clientPortal.claim.submitted", { defaultValue: "Submitted" })}</span>
                    <strong>{formatDate(item.submittedAt)}</strong>
                  </article>
                  <article>
                    <span>{t("clientPortal.claim.compensation", { defaultValue: "Possible compensation" })}</span>
                    <strong>{formatEstimateAmount(item.estimate?.amount, item.estimate?.currency, t)}</strong>
                  </article>
                  <article>
                    <span>{t("clientPortal.claim.documents", { defaultValue: "Documents" })}</span>
                    <strong>{item.documentsSummary.detail}</strong>
                  </article>
                  <article>
                    <span>{t("clientPortal.claim.payment", { defaultValue: "Payment" })}</span>
                    <strong>{item.paymentStatus.label}</strong>
                  </article>
                </div>

                <span className="client-portal-card-link">
                  {t("clientPortal.actions.openClaim", { defaultValue: "Open claim" })}
                  <ChevronRight size={16} />
                </span>
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
    setState({ isLoading: true, error: "", data: null });

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

  const uploadedDocuments = state.data?.documents || [];
  const previewUrls = useDocumentPreviewUrls(uploadedDocuments);

  const openDocument = async (document) => {
    try {
      const url = document.signature_data_url || previewUrls[document.id] || await getClientDocumentDownloadUrl(document);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Keep the UI quiet here; the page-level data already loaded successfully.
    }
  };

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loadingClaimDetails", { defaultValue: "Loading claim details..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  const claim = state.data?.claim || null;

  if (!claim) {
    return <p className="portal-empty">{t("clientPortal.claimDetails.empty", { defaultValue: "This claim is not available in your account." })}</p>;
  }

  return (
    <div className="client-portal-page">
      <section className="portal-card">
        <PortalSectionHeader
          title={claim.reference}
          text={claim.route || claim.airline || t("clientPortal.claimDetails.routePending", { defaultValue: "Route details will appear here." })}
          action={<ClientStatusBadge status={claim.publicStatus} />}
        />

        <div className="client-portal-meta-grid">
          <article>
            <span>{t("clientPortal.claim.airline", { defaultValue: "Airline" })}</span>
            <strong>{claim.airline || "—"}</strong>
          </article>
          <article>
            <span>{t("clientPortal.claim.disruption", { defaultValue: "Disruption" })}</span>
            <strong>{claim.disruptionType || "—"}</strong>
          </article>
          <article>
            <span>{t("clientPortal.claim.submitted", { defaultValue: "Submitted" })}</span>
            <strong>{formatDate(claim.submittedAt)}</strong>
          </article>
          <article>
            <span>{t("clientPortal.claim.compensation", { defaultValue: "Possible compensation" })}</span>
            <strong>{formatEstimateAmount(claim.estimate?.amount, claim.estimate?.currency, t)}</strong>
          </article>
          <article>
            <span>{t("clientPortal.claim.payment", { defaultValue: "Payment" })}</span>
            <strong>{claim.paymentStatus.label}</strong>
          </article>
          <article>
            <span>{t("clientPortal.claim.documents", { defaultValue: "Documents" })}</span>
            <strong>{claim.documentsSummary.label}</strong>
          </article>
        </div>

        <ClaimProgress status={claim.publicStatus} t={t} />
      </section>

      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.documents.requiredTitle", { defaultValue: "Required documents" })}
          text={t("clientPortal.documents.requiredText", { defaultValue: "Only the documents that matter for your claim are shown here." })}
        />

        <div className="client-portal-documents-grid">
          {claim.requiredDocuments.map((item) => (
            <DocumentStatusCard
              key={item.key}
              item={item}
              previewUrl={item.latestDocument ? (item.latestDocument.signature_data_url || previewUrls[item.latestDocument.id] || "") : ""}
              onOpen={openDocument}
            />
          ))}
        </div>
      </section>

      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.documents.uploadedTitle", { defaultValue: "Uploaded files" })}
          text={t("clientPortal.documents.uploadedText", { defaultValue: "These are the files already attached to this claim." })}
        />

        {uploadedDocuments.length ? (
          <div className="client-portal-uploaded-list">
            {uploadedDocuments.map((document) => (
              <UploadedDocumentRow
                key={`${document.kind}-${document.id}`}
                document={document}
                previewUrl={document.signature_data_url || previewUrls[document.id] || ""}
                onOpen={openDocument}
              />
            ))}
          </div>
        ) : (
          <p className="portal-empty">{t("clientPortal.documents.none", { defaultValue: "No files are attached to this claim yet." })}</p>
        )}
      </section>
    </div>
  );
}

export function ClientDocumentsPage() {
  const { t } = useTranslation();
  const [state, setState] = useState({ isLoading: true, error: "", documents: [], requiredDocuments: [] });

  useEffect(() => {
    let active = true;
    setState({ isLoading: true, error: "", documents: [], requiredDocuments: [] });

    fetchClientDocuments()
      .then((data) => {
        if (active) {
          setState({
            isLoading: false,
            error: "",
            documents: data.documents || [],
            requiredDocuments: data.requiredDocuments || [],
          });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load documents.", documents: [], requiredDocuments: [] });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const previewUrls = useDocumentPreviewUrls(state.documents);

  const openDocument = async (document) => {
    try {
      const url = document.signature_data_url || previewUrls[document.id] || await getClientDocumentDownloadUrl(document);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Keep the page stable if a preview fails.
    }
  };

  if (state.isLoading) {
    return <p className="portal-message">{t("clientPortal.loadingDocuments", { defaultValue: "Loading documents..." })}</p>;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  return (
    <div className="client-portal-page">
      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.documents.title", { defaultValue: "Documents" })}
          text={t("clientPortal.documents.text", { defaultValue: "Passport / ID, boarding pass, and signature are the only customer documents surfaced here." })}
        />

        <div className="client-portal-documents-grid">
          {state.requiredDocuments.map((item) => (
            <DocumentStatusCard
              key={item.key}
              item={item}
              previewUrl={item.latestDocument ? (item.latestDocument.signature_data_url || previewUrls[item.latestDocument.id] || "") : ""}
              onOpen={openDocument}
            />
          ))}
        </div>
      </section>

      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.documents.uploadedTitle", { defaultValue: "Uploaded files" })}
          text={t("clientPortal.documents.uploadedText", { defaultValue: "You can review the files already attached to your account here." })}
        />

        {state.documents.length ? (
          <div className="client-portal-uploaded-list">
            {state.documents.map((document) => (
              <UploadedDocumentRow
                key={`${document.kind}-${document.id}`}
                document={document}
                previewUrl={document.signature_data_url || previewUrls[document.id] || ""}
                onOpen={openDocument}
              />
            ))}
          </div>
        ) : (
          <p className="portal-empty">{t("clientPortal.documents.empty", { defaultValue: "Documents will appear here after they are added to your claim." })}</p>
        )}
      </section>
    </div>
  );
}

function ClientAccountPageInner() {
  const { t } = useTranslation();
  const { profile, user, refreshProfile } = useAuth();
  const currentLanguage = getLanguageByCode(document.documentElement.lang || "en");
  const [form, setForm] = useState({
    full_name: profile?.full_name || user?.user_metadata?.full_name || "",
    email: profile?.email || user?.email || "",
    phone: profile?.phone || user?.user_metadata?.phone || "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || user?.user_metadata?.full_name || "",
      email: profile?.email || user?.email || "",
      phone: profile?.phone || user?.user_metadata?.phone || "",
    });
  }, [profile, user]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      await saveClientProfile({
        full_name: form.full_name,
        phone: form.phone,
      });
      await refreshProfile();
      setMessage(t("clientPortal.account.saved", { defaultValue: "Account details updated." }));
    } catch (saveError) {
      setError(saveError.message || t("clientPortal.account.error", { defaultValue: "Could not update your account." }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="client-portal-page">
      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.account.title", { defaultValue: "Account" })}
          text={t("clientPortal.account.text", { defaultValue: "Profile details, support, and the settings that are safe to manage here." })}
        />

        <form className="portal-form" onSubmit={submit}>
          <label>
            <span>{t("clientPortal.account.fullName", { defaultValue: "Full name" })}</span>
            <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
          </label>
          <label>
            <span>{t("clientPortal.account.email", { defaultValue: "Email" })}</span>
            <input value={form.email} readOnly disabled />
          </label>
          <label>
            <span>{t("clientPortal.account.phone", { defaultValue: "Phone" })}</span>
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          {error ? <p className="portal-message is-error">{error}</p> : null}
          {message ? <p className="portal-message is-notice">{message}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? t("clientPortal.account.saving", { defaultValue: "Saving..." }) : t("clientPortal.account.submit", { defaultValue: "Save changes" })}
          </button>
        </form>
      </section>

      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.account.preferences", { defaultValue: "Preferences" })}
          text={t("clientPortal.account.preferencesText", { defaultValue: "Language is managed through the main header so it stays consistent across the whole website." })}
        />

        <div className="client-portal-settings-list">
          <article className="client-portal-settings-item">
            <div className="client-portal-settings-item__icon"><Globe size={18} /></div>
            <div>
              <strong>{t("clientPortal.account.language", { defaultValue: "Language" })}</strong>
              <span>{currentLanguage.label}</span>
            </div>
          </article>
          <article className="client-portal-settings-item">
            <div className="client-portal-settings-item__icon"><Mail size={18} /></div>
            <div>
              <strong>{t("clientPortal.account.notifications", { defaultValue: "Claim updates" })}</strong>
              <span>{t("clientPortal.account.notificationsText", { defaultValue: "Important updates are sent to your account email." })}</span>
            </div>
          </article>
        </div>
      </section>

      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.account.support", { defaultValue: "Support and legal" })}
          text={t("clientPortal.account.supportText", { defaultValue: "Need help or want to review our policies? Start here." })}
        />

        <div className="client-portal-support-grid">
          <a className="client-portal-support-link" href={`mailto:${contactEmail}`}>
            <Mail size={18} />
            <span>{contactEmail}</span>
          </a>
          <LocalizedLink className="client-portal-support-link" to="/contact">
            <Phone size={18} />
            <span>{t("common.contact", { defaultValue: "Contact" })}</span>
          </LocalizedLink>
          <LocalizedLink className="client-portal-support-link" to="/privacyPolicy">
            <ShieldCheck size={18} />
            <span>{t("common.privacyPolicy", { defaultValue: "Privacy Policy" })}</span>
          </LocalizedLink>
          <LocalizedLink className="client-portal-support-link" to="/termsOfUse">
            <FileText size={18} />
            <span>{t("common.termsOfUse", { defaultValue: "Terms of Use" })}</span>
          </LocalizedLink>
        </div>

        <LocalizedLink className="client-portal-text-link" to="/contact">
          {t("clientPortal.account.help", { defaultValue: "Open support page" })}
          <ArrowRight size={16} />
        </LocalizedLink>
      </section>
    </div>
  );
}

export function ClientAccountPage() {
  return <ClientAccountPageInner />;
}

export function ClientProfilePage() {
  return <ClientAccountPageInner />;
}

export function ClientPaymentsPage() {
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
  const claimRows = state.data?.claimRows || [];
  const activeClaim = claimRows.find((item) => !["paid", "rejected"].includes(item.publicStatus.key)) || claimRows[0] || null;
  const estimatedAmount = Number.isFinite(Number(activeClaim?.estimate?.amount)) ? activeClaim.estimate.amount : null;
  const estimatedCurrency = activeClaim?.estimate?.currency || "EUR";
  const approvedTotal = financeRows.reduce((sum, item) => {
    const value = Number(item.compensation_amount);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const paidTotal = financeRows.reduce((sum, item) => {
    const value = Number(item.customer_payout);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const latestPayment = financeRows[0] || null;
  const latestPaymentStatus = latestPayment
    ? getClientPaymentStatus(latestPayment.payment_status, latestPayment.customer_paid_at)
    : getClientPaymentStatus(null);
  const caseReferenceById = new Map((state.data?.cases || []).map((item) => [item.id, item.case_code || item.id]));

  return (
    <div className="client-portal-page">
      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.payments.title", { defaultValue: "Payments" })}
          text={t("clientPortal.payments.text", { defaultValue: "Estimated, approved, and paid amounts appear here only when the data exists." })}
        />

        <div className="client-portal-overview-grid">
          <article className="client-portal-overview-card">
            <span>{t("clientPortal.payments.estimated", { defaultValue: "Estimated compensation" })}</span>
            <strong>{estimatedAmount !== null ? formatEstimateAmount(estimatedAmount, estimatedCurrency, t) : "—"}</strong>
          </article>
          <article className="client-portal-overview-card">
            <span>{t("clientPortal.payments.approvedAmount", { defaultValue: "Approved amount" })}</span>
            <strong>{approvedTotal ? formatCurrencyValue(approvedTotal, latestPayment?.currency || "EUR") : "—"}</strong>
          </article>
          <article className="client-portal-overview-card">
            <span>{t("clientPortal.payments.paidAmount", { defaultValue: "Paid amount" })}</span>
            <strong>{paidTotal ? formatCurrencyValue(paidTotal, latestPayment?.currency || "EUR") : "—"}</strong>
          </article>
          <article className="client-portal-overview-card">
            <span>{t("clientPortal.payments.payoutStatus", { defaultValue: "Payout status" })}</span>
            <strong>{latestPaymentStatus.label}</strong>
          </article>
        </div>
      </section>

      <section className="portal-card">
        <PortalSectionHeader
          title={t("clientPortal.payments.history", { defaultValue: "Payment history" })}
          text={t("clientPortal.payments.historyText", { defaultValue: "Approved payouts and completed transfers will be listed here." })}
        />

        {financeRows.length ? (
          <div className="client-portal-uploaded-list">
            {financeRows.map((item) => {
              const paymentStatus = getClientPaymentStatus(item.payment_status, item.customer_paid_at);
              return (
                <div key={item.id} className="client-portal-uploaded-row">
                  <div className="client-portal-uploaded-row__thumb">
                    <CircleDollarSign size={20} />
                  </div>
                  <div className="client-portal-uploaded-row__copy">
                    <strong>{caseReferenceById.get(item.case_id) || item.case_id}</strong>
                    <span>
                      {t("clientPortal.payments.approvedAmount", { defaultValue: "Approved" })}: {Number.isFinite(Number(item.compensation_amount)) ? formatCurrencyValue(item.compensation_amount, item.currency || "EUR") : "—"}
                    </span>
                    <small>
                      {t("clientPortal.payments.paidAmount", { defaultValue: "Paid" })}: {Number.isFinite(Number(item.customer_payout)) ? formatCurrencyValue(item.customer_payout, item.currency || "EUR") : "—"}
                    </small>
                  </div>
                  <div className="client-portal-uploaded-row__meta">
                    <ClientStatusBadge status={paymentStatus} />
                    <small>{item.customer_paid_at ? formatDateTime(item.customer_paid_at) : formatDateTime(item.updated_at || item.created_at)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="portal-empty">{t("clientPortal.payments.empty", { defaultValue: "Payment information will appear here when your claim is approved." })}</p>
        )}
      </section>
    </div>
  );
}
