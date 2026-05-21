import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  FileImage,
  FileText,
  FolderOpen,
  Globe2,
  House,
  LoaderCircle,
  Mail,
  Phone,
  Plane,
  RefreshCw,
  ShieldCheck,
  Signature,
  Ticket,
  TriangleAlert,
  Trash2,
  Upload,
  UserRound,
  UserSquare2,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedLink, LocalizedNavLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { languages } from "../../i18n/languages.js";
import {
  deleteClientDocument,
  fetchClientClaimDetails,
  fetchClientClaims,
  fetchClientDashboardData,
  fetchClientDocuments,
  getClientDocumentDownloadUrl,
  getClientDocumentStatus,
  getClientPaymentStatus,
  replaceClientDocument,
  saveClientProfile,
  uploadClientDocument,
} from "../../services/clientPortalService.js";
import { contactEmail } from "../../constants/site.js";
import { saveLeadSignature } from "../../services/leadService.js";
import "./style.scss";

const CLIENT_STATUS_STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "documents_needed", label: "Documents needed" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "paid", label: "Paid" },
];

const CLIENT_PAYMENT_STEPS = [
  { key: "not_started", label: "Not started" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

const EMPTY_LIST = [];

const COUNTRY_CODE_BY_NAME = {
  azerbaijan: "AZ",
  "azerbaijan republic": "AZ",
  turkiye: "TR",
  turkey: "TR",
  "turkiye cumhuriyeti": "TR",
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  portugal: "PT",
  poland: "PL",
  georgia: "GE",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  netherlands: "NL",
  belgium: "BE",
  switzerland: "CH",
  austria: "AT",
  greece: "GR",
  cyprus: "CY",
  ireland: "IE",
  romania: "RO",
  bulgaria: "BG",
  hungary: "HU",
  "czech republic": "CZ",
  czechia: "CZ",
  croatia: "HR",
  serbia: "RS",
  montenegro: "ME",
  albania: "AL",
  "united arab emirates": "AE",
  uae: "AE",
  qatar: "QA",
  "saudi arabia": "SA",
  "united states": "US",
  usa: "US",
  canada: "CA",
};

function debugClientPortal(event, payload) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log(`[client-portal] ${event}`, payload);
}

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

function formatStatusLabel(value, fallback = "Unknown") {
  const input = String(value || "").trim();
  if (!input) return fallback;

  return input
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getIdentityAvatarUrl(profile, user) {
  const metadata = user?.user_metadata || {};
  const identityData = Array.isArray(user?.identities)
    ? user.identities
      .map((identity) => identity?.identity_data || null)
      .find((identity) => identity?.avatar_url || identity?.picture || identity?.photo_url || identity?.photoURL)
    : null;

  return profile?.avatar_url
    || metadata.avatar_url
    || metadata.picture
    || metadata.photo_url
    || metadata.photoURL
    || identityData?.avatar_url
    || identityData?.picture
    || identityData?.photo_url
    || identityData?.photoURL
    || "";
}

function splitFullName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeCountryLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) {
    return "";
  }

  return countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function parseRouteStop(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      code: "—",
      city: "",
      country: "",
      flag: "",
      label: "—",
    };
  }

  const parts = raw.split(/\s*-\s*/).map((item) => item.trim()).filter(Boolean);
  const first = parts[0] || raw;
  const hasCode = /^[A-Z0-9]{3,4}$/.test(first);
  const code = hasCode ? first : first.slice(0, 3).toUpperCase();
  const country = parts.length > 1 ? parts[parts.length - 1] : "";
  const cityParts = hasCode ? parts.slice(1, -1) : parts.slice(0, -1);
  const city = cityParts.join(" - ") || (hasCode ? "" : first);
  const countryCode = COUNTRY_CODE_BY_NAME[normalizeCountryLookup(country)] || "";

  return {
    code,
    city,
    country,
    flag: getFlagEmoji(countryCode),
    label: [city, country].filter(Boolean).join(", ") || raw,
  };
}

function getClaimRouteStops(claim) {
  const fallbackRoute = String(claim?.route || "");
  const [fromRoute = "", toRoute = ""] = fallbackRoute.split("→").map((item) => item.trim());
  return {
    from: parseRouteStop(claim?.departureLabel || fromRoute),
    to: parseRouteStop(claim?.arrivalLabel || toRoute),
  };
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

function getDocumentLabel(value, t) {
  const type = String(value?.document_type || value?.key || value || "").toLowerCase();

  if (value?.kind === "signature" || type.includes("signature") || type.includes("consent")) {
    return t("clientPortal.documents.signatureConsent", { defaultValue: "Signature / Consent" });
  }

  if (type.includes("passport") || type.includes("id")) {
    return t("clientPortal.documents.passportId", { defaultValue: "Passport / ID" });
  }

  if (type.includes("boarding")) {
    return t("clientPortal.documents.boardingPass", { defaultValue: "Boarding Pass" });
  }

  return t("clientPortal.documents.document", { defaultValue: "Document" });
}

function getDocumentFormatLabel(document, t) {
  const mime = String(document?.mime_type || "").toLowerCase();
  if (document?.kind === "signature") {
    return t("clientPortal.documents.digitalSignature", { defaultValue: "Digital signature" });
  }

  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) {
    return t("clientPortal.documents.image", { defaultValue: "Image" });
  }

  return t("clientPortal.documents.uploadedFile", { defaultValue: "Uploaded file" });
}

function getDocumentExtension(document) {
  if (document?.kind === "signature") {
    return "PNG";
  }

  const fileName = String(document?.file_name || "");
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : "FILE";
}

function SignaturePadField({ value, onChange, ariaLabel, clearLabel = "Clear", compact = false }) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const pointsRef = useRef([]);

  const configureContext = (context) => {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1f4b99";
    context.fillStyle = "#1f4b99";
    context.lineWidth = 2.2;
    context.shadowColor = "rgba(20, 47, 97, 0.14)";
    context.shadowBlur = 0.6;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    context.scale(ratio, ratio);
    configureContext(context);

    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
    }
  }, [value]);

  const point = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure && event.pressure > 0 ? event.pressure : 0.5,
    };
  };

  const midpoint = (first, second) => ({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  });

  const strokeWidthForPoint = (current, previous) => {
    if (!previous) return 2.2;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const pressureBoost = (current.pressure || 0.5) * 0.65;
    const speedPenalty = Math.min(distance / 18, 0.9);
    return Math.max(1.6, Math.min(2.8, 2.55 + pressureBoost - speedPenalty));
  };

  const drawDot = (context, current) => {
    context.beginPath();
    context.arc(current.x, current.y, 1.3, 0, Math.PI * 2);
    context.fill();
  };

  const drawSegment = (context, currentPoint) => {
    const points = pointsRef.current;
    points.push(currentPoint);

    if (points.length === 1) {
      drawDot(context, currentPoint);
      return;
    }

    if (points.length === 2) {
      const previous = points[0];
      context.beginPath();
      context.lineWidth = strokeWidthForPoint(currentPoint, previous);
      context.moveTo(previous.x, previous.y);
      context.lineTo(currentPoint.x, currentPoint.y);
      context.stroke();
      return;
    }

    const lastIndex = points.length - 1;
    const previousPoint = points[lastIndex - 1];
    const pointBeforePrevious = points[lastIndex - 2];
    const start = midpoint(pointBeforePrevious, previousPoint);
    const end = midpoint(previousPoint, currentPoint);

    context.beginPath();
    context.lineWidth = strokeWidthForPoint(currentPoint, previousPoint);
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(previousPoint.x, previousPoint.y, end.x, end.y);
    context.stroke();

    if (points.length > 6) {
      points.shift();
    }
  };

  const applyPointerSamples = (event) => {
    if (!isDrawingRef.current || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];

    for (const sample of samples) {
      drawSegment(context, point(sample));
    }
  };

  const beginSignature = (event) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const startPoint = point(event);
    canvas.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    isDrawingRef.current = true;
    pointsRef.current = [startPoint];
    drawDot(context, startPoint);
  };

  const drawSignature = (event) => {
    applyPointerSamples(event);
  };

  const endSignature = (event) => {
    if (!isDrawingRef.current) return;

    applyPointerSamples(event);

    const canvas = canvasRef.current;
    if (event?.pointerId !== undefined && canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    pointsRef.current = [];
    onChange(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    configureContext(context);
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    pointsRef.current = [];
    onChange("");
  };

  return (
    <div className={`client-portal-signature-pad${compact ? " is-compact" : ""}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={beginSignature}
        onPointerMove={drawSignature}
        onPointerUp={endSignature}
        onPointerLeave={endSignature}
        onPointerCancel={endSignature}
        aria-label={ariaLabel}
      />
      <button type="button" onClick={clearSignature}>{clearLabel}</button>
    </div>
  );
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
      setPreviewUrls((current) => (Object.keys(current).length ? {} : current));
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

      const nextPreviewUrls = Object.fromEntries(entries.filter(([, value]) => value));

      setPreviewUrls((current) => {
        const currentKeys = Object.keys(current);
        const nextKeys = Object.keys(nextPreviewUrls);

        if (
          currentKeys.length === nextKeys.length
          && currentKeys.every((key) => current[key] === nextPreviewUrls[key])
        ) {
          return current;
        }

        return nextPreviewUrls;
      });
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

function SkeletonBlock({ className = "" }) {
  return <span className={`client-portal-skeleton ${className}`.trim()} aria-hidden="true" />;
}

function LoadingCard({ rows = 3, compact = false }) {
  return (
    <section className={`portal-card client-portal-loading-card${compact ? " is-compact" : ""}`}>
      <div className="client-portal-loading-card__head">
        <SkeletonBlock className="is-heading" />
        <SkeletonBlock className="is-button" />
      </div>
      <div className="client-portal-loading-card__body">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="client-portal-loading-row">
            <SkeletonBlock className="is-line-lg" />
            <SkeletonBlock className="is-line-sm" />
          </div>
        ))}
      </div>
    </section>
  );
}

function PortalLoadingPage({ variant = "default" }) {
  if (variant === "dashboard") {
    return (
      <div className="client-portal-page client-portal-page--loading">
        <div className="client-portal-overview-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="client-portal-overview-card is-loading">
              <SkeletonBlock className="is-caption" />
              <SkeletonBlock className="is-stat" />
            </article>
          ))}
        </div>
        <section className="portal-card client-portal-hero-card client-portal-loading-hero">
          <div className="client-portal-loading-hero__main">
            <div className="client-portal-loading-card__head">
              <SkeletonBlock className="is-heading" />
              <SkeletonBlock className="is-pill" />
            </div>
            <div className="client-portal-meta-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <article key={index}>
                  <SkeletonBlock className="is-caption" />
                  <SkeletonBlock className="is-line-md" />
                </article>
              ))}
            </div>
            <div className="client-portal-cta-row">
              <SkeletonBlock className="is-button" />
              <SkeletonBlock className="is-line-sm" />
            </div>
          </div>
          <div className="client-portal-loading-hero__side">
            <SkeletonBlock className="is-line-md" />
            <SkeletonBlock className="is-line-lg" />
            <div className="client-portal-progress">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="client-portal-progress__step is-loading">
                  <SkeletonBlock className="is-dot" />
                  <SkeletonBlock className="is-caption" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (variant === "claims") {
    return (
      <div className="client-portal-page client-portal-page--loading">
        <LoadingCard rows={3} />
        <LoadingCard rows={3} compact />
      </div>
    );
  }

  if (variant === "documents") {
    return (
      <div className="client-portal-page client-portal-page--loading">
        <LoadingCard rows={3} />
        <LoadingCard rows={4} compact />
      </div>
    );
  }

  if (variant === "payments") {
    return (
      <div className="client-portal-page client-portal-page--loading">
        <section className="portal-card client-portal-loading-card">
          <div className="client-portal-overview-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <article key={index} className="client-portal-overview-card is-loading">
                <SkeletonBlock className="is-caption" />
                <SkeletonBlock className="is-stat" />
              </article>
            ))}
          </div>
        </section>
        <LoadingCard rows={3} compact />
      </div>
    );
  }

  return (
    <div className="client-portal-page client-portal-page--loading">
      <LoadingCard rows={3} />
    </div>
  );
}

function ClientStatusBadge({ status }) {
  const { t } = useTranslation();
  const tone = status?.tone || "neutral";
  const Icon = getStatusIcon(tone);

  return (
    <span className={`client-portal-status-badge is-${tone}`}>
      <Icon size={14} />
      <span>{status?.label || t("clientPortal.status.under_review", { defaultValue: "Under review" })}</span>
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
            <span className="client-portal-progress__dot" aria-hidden="true">
              {state === "completed" ? <CheckCircle2 size={12} /> : null}
            </span>
            <span>{t(`clientPortal.status.${step.key}`, { defaultValue: step.label })}</span>
          </div>
        );
      })}
    </div>
  );
}

function PaymentProgress({ status, t }) {
  const activeIndex = CLIENT_PAYMENT_STEPS.findIndex((step) => step.key === status?.key);

  return (
    <div className="client-portal-payment-progress" aria-label={t("clientPortal.payments.progress", { defaultValue: "Payment progress" })}>
      {CLIENT_PAYMENT_STEPS.map((step, index) => {
        const state = activeIndex === -1
          ? (index === 0 ? "current" : "idle")
          : index < activeIndex
            ? "completed"
            : index === activeIndex
              ? "current"
              : "idle";

        return (
          <div key={step.key} className={`client-portal-payment-progress__step is-${state}`}>
            <span className="client-portal-payment-progress__dot" aria-hidden="true" />
            <span>{t(`clientPortal.payments.status.${step.key}`, { defaultValue: step.label })}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClientPortalNavLink({ to, icon: Icon, label, end = false, mobile = false, avatarUrl = "" }) {
  return (
    <LocalizedNavLink to={to} end={end} className={({ isActive }) => `client-portal-nav__link${mobile ? " is-mobile" : ""}${isActive ? " is-active" : ""}`}>
      <span className="client-portal-nav__icon">
        {avatarUrl && mobile ? <img src={avatarUrl} alt="" className="client-portal-nav__avatar" /> : <Icon size={18} />}
      </span>
      <span className="client-portal-nav__label">{label}</span>
    </LocalizedNavLink>
  );
}

function ClaimRouteStop({ stop, compact = false }) {
  const { t } = useTranslation();

  return (
    <div className={`client-portal-route-stop${compact ? " is-compact" : ""}`}>
      <div className="client-portal-route-stop__flag" aria-hidden="true">
        {stop.flag || <Globe2 size={14} />}
      </div>
      <div className="client-portal-route-stop__copy">
        <small>{stop.country || t("clientPortal.claim.airport", { defaultValue: "Airport" })}</small>
        <strong>{stop.code}</strong>
        <span>{stop.city || stop.label}</span>
      </div>
    </div>
  );
}

function ClaimHeroCard({ claim, t, compact = false, footer = null, onOpenStatus = null, showChips = compact }) {
  const routeStops = getClaimRouteStops(claim);

  return (
    <div className={`client-portal-claim-hero${compact ? " is-compact" : ""}`}>
      <div className="client-portal-claim-hero__top">
        <div className="client-portal-claim-hero__meta">
          <span>{claim.reference}</span>
          <strong>{claim.airline || t("clientPortal.claim.airlinePending", { defaultValue: "Airline pending" })}</strong>
        </div>
        <ClientStatusBadge status={claim.publicStatus} />
      </div>

      <div className="client-portal-claim-hero__journey">
        <ClaimRouteStop stop={routeStops.from} compact={compact} />
        <div className="client-portal-claim-hero__connector" aria-hidden="true">
          <span />
          <div><Plane size={compact ? 14 : 16} /></div>
          <span />
        </div>
        <ClaimRouteStop stop={routeStops.to} compact={compact} />
      </div>

      <div className="client-portal-claim-hero__facts">
        <article>
          <small>{t("clientPortal.claim.compensation", { defaultValue: "Possible compensation" })}</small>
          <strong>{formatEstimateAmount(claim.estimate?.amount, claim.estimate?.currency, t)}</strong>
        </article>
        <article>
          <small>{t("clientPortal.claim.submitted", { defaultValue: "Submitted" })}</small>
          <strong>{formatDate(claim.submittedAt)}</strong>
        </article>
        <article>
          <small>{t("clientPortal.claim.documents", { defaultValue: "Documents" })}</small>
          <strong>{claim.documentsSummary.label}</strong>
        </article>
      </div>

      {showChips ? (
        <div className="client-portal-claim-hero__chips">
          <span className="client-portal-hero-chip">{claim.disruptionType || t("clientPortal.claim.flightDisruption", { defaultValue: "Flight disruption" })}</span>
          <span className="client-portal-hero-chip">{claim.paymentStatus.label}</span>
          <span className="client-portal-hero-chip">{claim.documentsSummary.detail || claim.documentsSummary.label}</span>
        </div>
      ) : null}

      {footer ? <div className="client-portal-claim-hero__footer">{footer}</div> : null}

      {!compact && onOpenStatus ? (
        <button type="button" className="btn btn-secondary client-portal-claim-hero__status-button" onClick={onOpenStatus}>
          {t("clientPortal.claim.viewStatus", { defaultValue: "View claim status" })}
        </button>
      ) : null}
    </div>
  );
}

function getStatusDrawerItems(claim, t) {
  const currentStatus = String(claim?.publicStatus?.key || "");
  const submittedDate = claim?.submittedAt || claim?.created_at || "";
  const items = [
    {
      key: "submitted",
      title: t("clientPortal.statusDrawer.received.title", { defaultValue: "Claim received" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.received.text", { defaultValue: "Thank you for submitting your claim. We saved your flight details and will keep the next updates here." }),
      state: "completed",
    },
  ];

  if (["under_review", "documents_needed", "approved", "paid", "rejected"].includes(currentStatus)) {
    items.push({
      key: "under_review",
      title: t("clientPortal.statusDrawer.accepted.title", { defaultValue: "Claim accepted" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.accepted.text", { defaultValue: "We reviewed the basic details of your request and your claim is now moving through the compensation process." }),
      state: currentStatus === "under_review" ? "current" : "completed",
    });
  }

  if (currentStatus === "documents_needed") {
    items.push({
      key: "documents_needed",
      title: t("clientPortal.statusDrawer.documentsNeeded.title", { defaultValue: "Documents needed" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.documentsNeeded.text", { defaultValue: "We still need one or more required documents from you before we can continue processing this claim." }),
      state: "current",
    });
  } else if (["under_review", "approved", "paid"].includes(currentStatus)) {
    items.push({
      key: "processing",
      title: t("clientPortal.statusDrawer.underReview.title", { defaultValue: "Claim under review" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.underReview.text", { defaultValue: "Your claim is currently under review based on the information and documents attached to your case." }),
      state: currentStatus === "under_review" ? "current" : "completed",
    });
  }

  if (currentStatus === "approved") {
    items.push({
      key: "approved",
      title: t("clientPortal.statusDrawer.approved.title", { defaultValue: "Compensation approved" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.approved.text", { defaultValue: "Your claim has been approved. We are preparing the next payout step for your compensation." }),
      state: "current",
    });
  }

  if (currentStatus === "paid") {
    items.push({
      key: "approved",
      title: t("clientPortal.statusDrawer.approved.title", { defaultValue: "Compensation approved" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.approvedPaid.text", { defaultValue: "Your claim was approved and moved successfully to payout." }),
      state: "completed",
    });
    items.push({
      key: "paid",
      title: t("clientPortal.statusDrawer.paid.title", { defaultValue: "Compensation paid" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.paid.text", { defaultValue: "Your compensation has been paid. You can review the payment details in the Payments section." }),
      state: "current",
    });
  }

  if (currentStatus === "rejected") {
    items.push({
      key: "rejected",
      title: t("clientPortal.statusDrawer.closed.title", { defaultValue: "Claim closed" }),
      date: submittedDate,
      text: t("clientPortal.statusDrawer.closed.text", { defaultValue: "We could not approve this claim based on the information currently available in your file." }),
      state: "danger",
    });
  }

  return items;
}

function ClaimStatusDrawer({ claim, isOpen, onClose }) {
  const { t } = useTranslation();

  if (!isOpen || !claim) {
    return null;
  }

  const items = getStatusDrawerItems(claim, t);

  return (
    <div className="client-portal-status-drawer-layer" role="dialog" aria-modal="true">
      <button
        type="button"
        className="client-portal-status-drawer-layer__backdrop"
        onClick={onClose}
        aria-label={t("clientPortal.statusDrawer.close", { defaultValue: "Close status details" })}
      />
      <aside className="client-portal-status-drawer">
        <div className="client-portal-status-drawer__head">
          <div>
            <strong>{t("clientPortal.statusDrawer.title", { defaultValue: "Status details" })}</strong>
            <span>{claim.reference}</span>
          </div>
          <button type="button" className="client-portal-status-drawer__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="client-portal-status-drawer__timeline">
          {items.map((item) => (
            <article key={item.key} className={`client-portal-status-drawer__item is-${item.state}`}>
              <div className="client-portal-status-drawer__rail">
                <span className="client-portal-status-drawer__dot">
                  {item.state === "completed" ? <CheckCircle2 size={12} /> : item.state === "danger" ? <XCircle size={12} /> : null}
                </span>
              </div>
              <div className="client-portal-status-drawer__card">
                <strong>{item.title}</strong>
                <small>{formatDate(item.date)}</small>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

function DocumentStatusCard({ item, previewUrl, onOpen, action = null, busy = false }) {
  const { t } = useTranslation();
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
        <small>{item.uploadedAt ? formatDateTime(item.uploadedAt) : t("clientPortal.documents.noFile", { defaultValue: "No file uploaded yet" })}</small>
      </div>
      {item.latestDocument ? (
        <button type="button" className="client-portal-inline-button" onClick={() => onOpen(item.latestDocument)}>
          {t("clientPortal.documents.open", { defaultValue: "Open" })}
        </button>
      ) : action ? (
        <button type="button" className="btn btn-primary btn-small client-portal-document-card__action" onClick={action.onClick} disabled={busy}>
          {busy ? <LoaderCircle size={16} className="is-spinning" /> : <Upload size={16} />}
          <span>{action.label}</span>
        </button>
      ) : null}
    </article>
  );
}

function UploadedDocumentRow({ document, previewUrl, onOpen }) {
  const { t } = useTranslation();
  const status = getClientDocumentStatus(document.status, document.kind);
  const Icon = getDocumentIcon(document);
  const label = getDocumentLabel(document, t);

  return (
    <div className="client-portal-uploaded-row">
      <div className="client-portal-uploaded-row__thumb">
        {previewUrl ? <img src={previewUrl} alt="" /> : <Icon size={20} />}
      </div>
      <div className="client-portal-uploaded-row__copy">
        <strong>{label}</strong>
        <span>{getDocumentFormatLabel(document, t)}</span>
        <small>{formatDateTime(document.created_at)}</small>
      </div>
      <div className="client-portal-uploaded-row__meta">
        <ClientStatusBadge status={status} />
        <button type="button" className="client-portal-inline-button" onClick={() => onOpen(document)}>
          {t("clientPortal.documents.open", { defaultValue: "Open" })}
        </button>
      </div>
    </div>
  );
}

function UploadProgress({ value = 0, busy = false }) {
  return (
    <div className={`client-portal-upload-progress${busy ? " is-busy" : ""}`} aria-hidden="true">
      <span style={{ width: `${Math.max(8, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

function ManagedDocumentCard({
  item,
  previewUrl,
  canUpload,
  busy,
  progress,
  onPreview,
  onUpload,
}) {
  const { t } = useTranslation();
  const document = item.latestDocument || null;
  const status = document
    ? getClientDocumentStatus(document.status, document.kind)
    : { key: item.statusKey, label: item.statusLabel, tone: item.statusTone };
  const Icon = getDocumentIcon(document || { document_type: item.key });

  const handleDrop = (event) => {
    event.preventDefault();
    if (!canUpload) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <article
      className={`client-portal-doc-manager-card${busy ? " is-busy" : ""}${canUpload ? " is-uploadable" : ""}${document ? " is-previewable" : ""}`}
      onDragOver={(event) => {
        if (canUpload) {
          event.preventDefault();
        }
      }}
      onDrop={handleDrop}
      onClick={() => {
        if (document) {
          onPreview(document);
        }
      }}
      onKeyDown={(event) => {
        if (!document) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview(document);
        }
      }}
      role={document ? "button" : undefined}
      tabIndex={document ? 0 : undefined}
    >
      <div className="client-portal-doc-manager-card__preview">
        {previewUrl ? <img src={previewUrl} alt="" /> : <Icon size={24} />}
      </div>

      <div className="client-portal-doc-manager-card__body">
        <div className="client-portal-doc-manager-card__head">
          <div>
            <strong>{item.label}</strong>
            <small>{document?.created_at ? formatDateTime(document.created_at) : t("clientPortal.documents.noFile", { defaultValue: "No file uploaded yet" })}</small>
          </div>
          <ClientStatusBadge status={status} />
        </div>

        <div className="client-portal-doc-manager-card__meta">
          <span>{document ? getDocumentFormatLabel(document, t) : t("clientPortal.documents.uploadRequired", { defaultValue: "Upload required" })}</span>
          <span>{document ? getDocumentExtension(document) : t("clientPortal.documents.formats", { defaultValue: "PNG / JPG / PDF" })}</span>
        </div>

        {!document && canUpload ? (
          <div className="client-portal-doc-manager-card__actions">
            <button type="button" className="btn btn-primary btn-small" onClick={() => onUpload()} disabled={busy}>
              {busy ? <LoaderCircle size={16} className="is-spinning" /> : <Upload size={16} />}
              <span>{t("clientPortal.documents.upload", { defaultValue: "Upload" })}</span>
            </button>
          </div>
        ) : null}

        {busy ? <UploadProgress value={progress} busy /> : null}
      </div>
    </article>
  );
}

function ManagedUploadedDocumentRow({
  document,
  previewUrl,
  busy,
  progress,
  onPreview,
  onReplace,
  onDelete,
}) {
  const { t } = useTranslation();
  const status = getClientDocumentStatus(document.status, document.kind);
  const Icon = getDocumentIcon(document);
  const label = getDocumentLabel(document, t);

  return (
    <div className={`client-portal-uploaded-row is-managed${busy ? " is-busy" : ""}`}>
      <div className="client-portal-uploaded-row__thumb">
        {previewUrl ? <img src={previewUrl} alt="" /> : <Icon size={20} />}
      </div>
      <div className="client-portal-uploaded-row__copy">
        <strong>{label}</strong>
        <span>{getDocumentFormatLabel(document, t)} · {getDocumentExtension(document)}</span>
        <small>{formatDateTime(document.created_at)}</small>
      </div>
      <div className="client-portal-uploaded-row__meta">
        <ClientStatusBadge status={status} />
        <small>{document.claimReference || t("clientPortal.documents.currentClaim", { defaultValue: "Current claim" })}</small>
      </div>
      <div className="client-portal-uploaded-row__actions">
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onPreview(document)} disabled={busy}>
          <Eye size={16} />
          <span>{t("clientPortal.documents.preview", { defaultValue: "Preview" })}</span>
        </button>
        {document.canReplace ? (
          <button type="button" className="btn btn-primary btn-small" onClick={() => onReplace(document)} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="is-spinning" /> : <RefreshCw size={16} />}
            <span>{t("clientPortal.documents.replace", { defaultValue: "Replace" })}</span>
          </button>
        ) : null}
        {document.canDelete ? (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => onDelete(document)} disabled={busy}>
            <Trash2 size={16} />
            <span>{t("clientPortal.documents.delete", { defaultValue: "Delete" })}</span>
          </button>
        ) : null}
      </div>
      {busy ? <UploadProgress value={progress} busy /> : null}
    </div>
  );
}

function DocumentPreviewDrawer({
  document,
  url,
  isLoading,
  error,
  zoom,
  actionBusy = false,
  onZoomIn,
  onZoomOut,
  onOpenFull,
  onReplace,
  onDelete,
  onClose,
}) {
  const { t } = useTranslation();
  if (!document) {
    return null;
  }

  const isImage = isImageDocument(document);
  const isPdf = isPdfDocument(document);

  return (
    <div className="client-portal-preview-layer" onClick={onClose}>
      <aside className="client-portal-preview-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="client-portal-preview-drawer__head">
          <div>
            <strong>{getDocumentLabel(document, t)}</strong>
            <small>{document.created_at ? formatDateTime(document.created_at) : t("clientPortal.documents.previewTitle", { defaultValue: "Document preview" })}</small>
          </div>
          <div className="client-portal-preview-drawer__tools">
            {isImage ? (
              <>
                <button type="button" className="btn btn-secondary btn-small" onClick={onZoomOut}>
                  <ZoomOut size={16} />
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={onZoomIn}>
                  <ZoomIn size={16} />
                </button>
              </>
            ) : null}
            {url ? (
              <button type="button" className="btn btn-secondary btn-small" onClick={onOpenFull}>
                <Eye size={16} />
                <span>{t("clientPortal.documents.openFull", { defaultValue: "Open full" })}</span>
              </button>
            ) : null}
            {document.canReplace ? (
              <button type="button" className="btn btn-primary btn-small" onClick={onReplace} disabled={actionBusy}>
                {actionBusy ? <LoaderCircle size={16} className="is-spinning" /> : <RefreshCw size={16} />}
                <span>{t("clientPortal.documents.replace", { defaultValue: "Replace" })}</span>
              </button>
            ) : null}
            {document.canDelete ? (
              <button type="button" className="btn btn-secondary btn-small" onClick={onDelete} disabled={actionBusy}>
                <Trash2 size={16} />
                <span>{t("clientPortal.documents.delete", { defaultValue: "Delete" })}</span>
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="client-portal-preview-drawer__body">
          {isLoading ? (
            <div className="client-portal-preview-placeholder">
              <LoaderCircle size={24} className="is-spinning" />
              <span>{t("clientPortal.documents.loadingPreview", { defaultValue: "Loading preview…" })}</span>
            </div>
          ) : error ? (
            <div className="client-portal-preview-placeholder is-error">
              <TriangleAlert size={20} />
              <span>{error}</span>
            </div>
          ) : isImage && url ? (
            <div className="client-portal-preview-image">
              <img src={url} alt="" style={{ transform: `scale(${zoom})` }} />
            </div>
          ) : isPdf && url ? (
            <iframe title={getDocumentLabel(document, t)} src={url} className="client-portal-preview-frame" />
          ) : url ? (
            <iframe title={getDocumentLabel(document, t)} src={url} className="client-portal-preview-frame" />
          ) : (
            <div className="client-portal-preview-placeholder">
              <FileText size={22} />
              <span>{t("clientPortal.documents.previewUnavailable", { defaultValue: "Preview is not available." })}</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export function ClientPortalLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { profile, user } = useAuth();
  const avatarUrl = getIdentityAvatarUrl(profile, user);

  const navItems = useMemo(() => ([
    { label: t("clientPortal.nav.home", { defaultValue: "Home" }), path: "/client/dashboard", icon: House, end: true },
    { label: t("clientPortal.nav.claims", { defaultValue: "Claims" }), path: "/client/claims", icon: FileText },
    { label: t("clientPortal.nav.documents", { defaultValue: "Documents" }), path: "/client/documents", icon: FolderOpen },
    { label: t("clientPortal.nav.payments", { defaultValue: "Payments" }), path: "/client/payments", icon: CircleDollarSign },
    { label: t("clientPortal.nav.account", { defaultValue: "Account" }), path: "/client/account", icon: UserRound },
  ]), [t]);

  const activeNavItem = useMemo(
    () => navItems.find((item) => {
      if (item.end) {
        return location.pathname.endsWith("/client/dashboard");
      }

      return location.pathname.includes(item.path);
    })?.label || "unknown",
    [location.pathname, navItems],
  );

  useEffect(() => {
    debugClientPortal("layout", {
      pathname: location.pathname,
      activeNavItem,
      navItems: navItems.map((item) => item.path),
    });
  }, [location.pathname, activeNavItem, navItems]);

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
          <div key={location.pathname} className="client-portal-main__viewport">
            <Outlet />
          </div>
        </main>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <nav className="client-portal-mobile-nav" aria-label={t("clientPortal.navLabel", { defaultValue: "Client account sections" })}>
              {navItems.map((item) => (
                <ClientPortalNavLink
                  key={`mobile-${item.path}`}
                  to={item.path}
                  icon={item.icon}
                  label={item.label}
                  end={item.end}
                  mobile
                  avatarUrl={item.path.endsWith("/client/account") ? avatarUrl : ""}
                />
              ))}
            </nav>,
            document.body,
          )
        : null}
    </div>
  );
}

export function ClientDashboardPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    debugClientPortal("rendered-page", {
      pathname: location.pathname,
      component: "ClientDashboardPage",
    });
  }, [location.pathname]);

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
          setState({ isLoading: false, error: error.message || t("clientPortal.errors.loadAccount", { defaultValue: "Could not load your account." }), data: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const claimRows = state.data?.claimRows || EMPTY_LIST;
  const activeClaim = claimRows.find((item) => !["paid", "rejected"].includes(item.publicStatus.key)) || claimRows[0] || null;
  const action = getClaimAction(activeClaim, t);
  const dashboardDocuments = useMemo(
    () => (activeClaim?.requiredDocuments || EMPTY_LIST).map((item) => item.latestDocument).filter(Boolean),
    [activeClaim],
  );
  const dashboardPreviewUrls = useDocumentPreviewUrls(dashboardDocuments);
  const actionRequired = Boolean(
    activeClaim
    && (activeClaim.publicStatus.key === "documents_needed" || activeClaim.documentsSummary?.needsAttention),
  );
  const compensationCurrency = activeClaim?.finance?.currency || activeClaim?.estimate?.currency || "EUR";
  const approvedAmount = Number.isFinite(Number(activeClaim?.finance?.compensation_amount))
    ? Number(activeClaim.finance.compensation_amount)
    : null;
  const paidAmount = Number.isFinite(Number(activeClaim?.finance?.customer_payout))
    ? Number(activeClaim.finance.customer_payout)
    : null;

  const openDashboardDocument = async (document) => {
    try {
      const url = document.signature_data_url || dashboardPreviewUrls[document.id] || await getClientDocumentDownloadUrl(document);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Dashboard stays quiet; the documents page is the full management surface.
    }
  };

  if (state.isLoading) {
    return <PortalLoadingPage variant="dashboard" />;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

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
      {activeClaim ? (
        <>
          <ClaimHeroCard
            claim={activeClaim}
            t={t}
            showChips={false}
            footer={(
              <div className="client-portal-cta-row">
                <LocalizedLink className="btn btn-primary" to={action.to}>{action.label}</LocalizedLink>
                <LocalizedLink className="client-portal-text-link" to={`/client/claims/${activeClaim.id}`}>
                  {t("clientPortal.actions.claimDetails", { defaultValue: "Claim details" })}
                  <ArrowRight size={16} />
                </LocalizedLink>
              </div>
            )}
          />

          <div className="client-portal-dashboard-grid">
            <section className="portal-card client-portal-dashboard-card">
              <div className="client-portal-dashboard-card__head">
                <strong>{t("clientPortal.home.progressTitle", { defaultValue: "Claim status" })}</strong>
              </div>
              <ClaimProgress status={activeClaim.publicStatus} t={t} />
            </section>

            <section className="portal-card client-portal-dashboard-card">
              <div className="client-portal-dashboard-card__head">
                <strong>{actionRequired
                  ? t("clientPortal.home.actionRequired", { defaultValue: "Action required" })
                  : t("clientPortal.home.noAction", { defaultValue: "No action needed" })}
                </strong>
                <span>{actionRequired
                  ? t("clientPortal.home.actionReason", { defaultValue: "We still need one or more required documents before we can continue your claim." })
                  : t("clientPortal.home.noActionText", { defaultValue: "We will notify you when the status changes." })}
                </span>
              </div>
              {actionRequired ? (
                <LocalizedLink className="btn btn-primary" to="/client/documents">
                  {t("clientPortal.actions.uploadDocuments", { defaultValue: "Upload documents" })}
                </LocalizedLink>
              ) : (
                <div className="client-portal-dashboard-note">
                  <CheckCircle2 size={18} />
                  <span>{t("clientPortal.home.monitoring", { defaultValue: "Your claim is moving forward with the documents already attached." })}</span>
                </div>
              )}
            </section>

            <section className="portal-card client-portal-dashboard-card client-portal-dashboard-card--documents">
              <div className="client-portal-dashboard-card__head">
                <strong>{t("clientPortal.documents.requiredTitle", { defaultValue: "Required documents" })}</strong>
              </div>
              <div className="client-portal-documents-grid">
                {activeClaim.requiredDocuments.map((item) => (
                  <DocumentStatusCard
                    key={item.key}
                    item={item}
                    previewUrl={item.latestDocument ? (item.latestDocument.signature_data_url || dashboardPreviewUrls[item.latestDocument.id] || "") : ""}
                    onOpen={openDashboardDocument}
                  />
                ))}
              </div>
            </section>

            <section className="portal-card client-portal-dashboard-card">
              <div className="client-portal-dashboard-card__head">
                <strong>{t("clientPortal.payments.title", { defaultValue: "Compensation" })}</strong>
              </div>
              <div className="client-portal-dashboard-summary">
                <article>
                  <span>{t("clientPortal.claim.compensation", { defaultValue: "Possible compensation" })}</span>
                  <strong>{formatEstimateAmount(activeClaim.estimate?.amount, activeClaim.estimate?.currency, t)}</strong>
                </article>
                <article>
                  <span>{t("clientPortal.payments.approvedAmount", { defaultValue: "Approved amount" })}</span>
                  <strong>{approvedAmount !== null ? formatCurrencyValue(approvedAmount, compensationCurrency) : "—"}</strong>
                </article>
                <article>
                  <span>{t("clientPortal.payments.paidAmount", { defaultValue: "Paid amount" })}</span>
                  <strong>{paidAmount !== null ? formatCurrencyValue(paidAmount, compensationCurrency) : "—"}</strong>
                </article>
                <article>
                  <span>{t("clientPortal.claim.payment", { defaultValue: "Payment status" })}</span>
                  <strong>{activeClaim.paymentStatus.label}</strong>
                </article>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ClientClaimsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [state, setState] = useState({ isLoading: true, error: "", rows: [] });

  useEffect(() => {
    debugClientPortal("rendered-page", {
      pathname: location.pathname,
      component: "ClientClaimsPage",
    });
  }, [location.pathname]);

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
          setState({ isLoading: false, error: error.message || t("clientPortal.errors.loadClaims", { defaultValue: "Could not load claims." }), rows: [] });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.isLoading) {
    return <PortalLoadingPage variant="claims" />;
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
                <ClaimHeroCard
                  claim={item}
                  t={t}
                  compact
                  footer={(
                    <div className="client-portal-claim-card__footer">
                      <span className="client-portal-card-link">
                        {t("clientPortal.actions.openClaim", { defaultValue: "Open claim" })}
                        <ChevronRight size={16} />
                      </span>
                    </div>
                  )}
                />
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
  const location = useLocation();
  const { id } = useParams();
  const filePickerRef = useRef(null);
  const [state, setState] = useState({ isLoading: true, error: "", data: null });
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState(null);
  const [actionBusy, setActionBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    debugClientPortal("rendered-page", {
      pathname: location.pathname,
      component: "ClientClaimDetailsPage",
      claimId: id,
    });
  }, [location.pathname, id]);

  useEffect(() => {
    let active = true;

    const loadClaimDetails = async (preserveData = false) => {
      setState((current) => ({
        isLoading: true,
        error: "",
        data: preserveData ? current.data : null,
      }));

      try {
        const data = await fetchClientClaimDetails(id);
        if (active) {
          setState({ isLoading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setState({ isLoading: false, error: error.message || t("clientPortal.errors.loadClaimDetails", { defaultValue: "Could not load claim details." }), data: null });
        }
      }
    };

    void loadClaimDetails();

    return () => {
      active = false;
    };
  }, [id]);

  const uploadedDocuments = useMemo(() => state.data?.documents || EMPTY_LIST, [state.data?.documents]);
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
    return <PortalLoadingPage variant="documents" />;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  const claim = state.data?.claim || null;
  const claimLeadId = claim ? (claim.kind === "lead" ? claim.id : claim.raw?.lead_id || null) : null;
  const canUploadMissingDocuments = Boolean(claimLeadId) && !["approved", "rejected", "paid"].includes(claim?.publicStatus?.key || "");

  const reloadClaimDetails = async () => {
    setState((current) => ({ ...current, isLoading: true }));

    try {
      const data = await fetchClientClaimDetails(id);
      setState({ isLoading: false, error: "", data });
    } catch (error) {
      setState({ isLoading: false, error: error.message || t("clientPortal.errors.loadClaimDetails", { defaultValue: "Could not load claim details." }), data: null });
    }
  };

  const requestFilePicker = (context) => {
    setActionError("");
    setNotice("");
    setPickerContext(context);
    filePickerRef.current?.click();
  };

  const handleFilePickerChange = async (event) => {
    const file = event.target.files?.[0];
    const currentContext = pickerContext;
    event.target.value = "";
    setPickerContext(null);

    if (!file || !currentContext || !claimLeadId) {
      return;
    }

    setActionBusy(currentContext.documentType);
    setActionError("");
    setNotice("");

    try {
      await uploadClientDocument({
        leadId: claimLeadId,
        documentType: currentContext.documentType,
        file,
      });
      setNotice(t("clientPortal.documents.uploadSuccess", { defaultValue: "Document uploaded successfully." }));
      await reloadClaimDetails();
    } catch (error) {
      setActionError(error.message || t("clientPortal.documents.uploadError", { defaultValue: "Could not upload the document." }));
    } finally {
      setActionBusy("");
    }
  };

  if (!claim) {
    return <p className="portal-empty">{t("clientPortal.claimDetails.empty", { defaultValue: "This claim is not available in your account." })}</p>;
  }

  return (
    <div className="client-portal-page">
      <section className="portal-card">
        <input
          ref={filePickerRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          hidden
          onChange={handleFilePickerChange}
        />
        <ClaimHeroCard
          claim={claim}
          t={t}
          showChips={false}
          onOpenStatus={() => setStatusDrawerOpen(true)}
        />
        <ClaimProgress status={claim.publicStatus} t={t} />
      </section>

      <section className="portal-card">
        <PortalSectionHeader title={t("clientPortal.documents.requiredTitle", { defaultValue: "Required documents" })} />
        {notice ? <p className="portal-message is-notice">{notice}</p> : null}
        {actionError ? <p className="portal-message is-error">{actionError}</p> : null}

        <div className="client-portal-documents-grid">
          {claim.requiredDocuments.map((item) => (
            <DocumentStatusCard
              key={item.key}
              item={item}
              previewUrl={item.latestDocument ? (item.latestDocument.signature_data_url || previewUrls[item.latestDocument.id] || "") : ""}
              onOpen={openDocument}
              action={
                !item.latestDocument && canUploadMissingDocuments && item.key !== "signature"
                  ? {
                      label: item.key === "passport"
                        ? t("clientPortal.actions.uploadPassport", { defaultValue: "Upload passport" })
                        : t("clientPortal.actions.uploadBoardingPass", { defaultValue: "Upload boarding pass" }),
                      onClick: () => requestFilePicker({ documentType: item.key }),
                    }
                  : null
              }
              busy={actionBusy === item.key}
            />
          ))}
        </div>
      </section>

      <ClaimStatusDrawer
        claim={claim}
        isOpen={statusDrawerOpen}
        onClose={() => setStatusDrawerOpen(false)}
      />
    </div>
  );
}

export function ClientDocumentsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { profile, user } = useAuth();
  const filePickerRef = useRef(null);
  const uploadTimersRef = useRef({});
  const [state, setState] = useState({ isLoading: true, error: "", documents: [], requiredDocuments: [], uploadTarget: null });
  const [pickerContext, setPickerContext] = useState(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyMap, setBusyMap] = useState({});
  const [progressMap, setProgressMap] = useState({});
  const [preview, setPreview] = useState({ document: null, url: "", isLoading: false, error: "", zoom: 1 });
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);

  useEffect(() => {
    debugClientPortal("rendered-page", {
      pathname: location.pathname,
      component: "ClientDocumentsPage",
    });
  }, [location.pathname]);

  const clearBusyState = (actionKey) => {
    const timer = uploadTimersRef.current[actionKey];
    if (timer) {
      window.clearInterval(timer);
      delete uploadTimersRef.current[actionKey];
    }

    setBusyMap((current) => {
      const next = { ...current };
      delete next[actionKey];
      return next;
    });
    setProgressMap((current) => {
      const next = { ...current };
      delete next[actionKey];
      return next;
    });
  };

  const beginBusyState = (actionKey) => {
    clearBusyState(actionKey);
    setBusyMap((current) => ({ ...current, [actionKey]: true }));
    setProgressMap((current) => ({ ...current, [actionKey]: 14 }));

    uploadTimersRef.current[actionKey] = window.setInterval(() => {
      setProgressMap((current) => ({
        ...current,
        [actionKey]: Math.min(92, (current[actionKey] || 14) + 11),
      }));
    }, 180);
  };

  const finishBusyState = (actionKey) => {
    const timer = uploadTimersRef.current[actionKey];
    if (timer) {
      window.clearInterval(timer);
      delete uploadTimersRef.current[actionKey];
    }

    setProgressMap((current) => ({ ...current, [actionKey]: 100 }));
    window.setTimeout(() => {
      clearBusyState(actionKey);
    }, 180);
  };

  const loadDocuments = async (silent = false) => {
    if (!silent) {
      setState({ isLoading: true, error: "", documents: [], requiredDocuments: [], uploadTarget: null });
    }

    try {
      const data = await fetchClientDocuments();
      setState({
        isLoading: false,
        error: "",
        documents: data.documents || [],
        requiredDocuments: data.requiredDocuments || [],
        uploadTarget: data.uploadTarget || null,
      });
    } catch (error) {
      setState({
        isLoading: false,
        error: error.message || t("clientPortal.errors.loadDocuments", { defaultValue: "Could not load documents." }),
        documents: [],
        requiredDocuments: [],
        uploadTarget: null,
      });
    }
  };

  useEffect(() => {
    void loadDocuments();
    return () => {
      Object.values(uploadTimersRef.current).forEach((timer) => window.clearInterval(timer));
      uploadTimersRef.current = {};
    };
  }, []);

  const previewUrls = useDocumentPreviewUrls(state.documents);

  const openDocument = async (document) => {
    setPreview({ document, url: "", isLoading: true, error: "", zoom: 1 });

    try {
      const url = document.signature_data_url || previewUrls[document.id] || await getClientDocumentDownloadUrl(document);
      setPreview({ document, url, isLoading: false, error: "", zoom: 1 });
    } catch (error) {
      setPreview({
        document,
        url: "",
        isLoading: false,
        error: error.message || t("clientPortal.documents.previewUnavailable", { defaultValue: "Preview is not available." }),
        zoom: 1,
      });
    }
  };

  const requestFilePicker = (context) => {
    setActionError("");
    setNotice("");
    setPickerContext(context);
    filePickerRef.current?.click();
  };

  const runUploadAction = async ({ documentType, file, replaceDocument = null }) => {
    if (!file) {
      requestFilePicker({ documentType, replaceDocument });
      return;
    }

    const actionKey = replaceDocument ? `document-${replaceDocument.id}` : `slot-${documentType}`;
    beginBusyState(actionKey);
    setActionError("");
    setNotice("");

    try {
      if (replaceDocument) {
        await replaceClientDocument(replaceDocument, file);
        setNotice(t("clientPortal.documents.replacementSuccess", { defaultValue: "Replacement uploaded successfully." }));
      } else {
        await uploadClientDocument({
          leadId: state.uploadTarget?.leadId,
          documentType,
          file,
        });
        setNotice(t("clientPortal.documents.uploadSuccess", { defaultValue: "Document uploaded successfully." }));
      }

      await loadDocuments(true);
    } catch (error) {
      setActionError(error.message || t("clientPortal.documents.uploadError", { defaultValue: "Could not upload the document." }));
    } finally {
      finishBusyState(actionKey);
    }
  };

  const handleDeleteDocument = async (document) => {
    const confirmed = window.confirm(t("clientPortal.documents.removeConfirm", { defaultValue: "Remove this document from your claim?" }));
    if (!confirmed) {
      return false;
    }

    const actionKey = `document-${document.id}`;
    beginBusyState(actionKey);
    setActionError("");
    setNotice("");

    try {
      await deleteClientDocument(document);
      setNotice(t("clientPortal.documents.removeSuccess", { defaultValue: "Document removed." }));
      await loadDocuments(true);
      return true;
    } catch (error) {
      setActionError(error.message || t("clientPortal.documents.removeError", { defaultValue: "Could not remove the document." }));
      return false;
    } finally {
      finishBusyState(actionKey);
    }
  };

  const handleFilePickerChange = async (event) => {
    const file = event.target.files?.[0];
    const currentContext = pickerContext;
    event.target.value = "";
    setPickerContext(null);

    if (!file || !currentContext) {
      return;
    }

    await runUploadAction({
      documentType: currentContext.documentType,
      replaceDocument: currentContext.replaceDocument || null,
      file,
    });
  };

  const signatureItem = state.requiredDocuments.find((item) => item.key === "signature") || null;
  const canAddSignature = Boolean(state.uploadTarget?.leadId) && !signatureItem?.latestDocument;

  const submitSignature = async (event) => {
    event.preventDefault();
    setActionError("");
    setNotice("");

    if (!state.uploadTarget?.leadId) {
      setActionError(t("clientPortal.documents.signatureUnavailable", { defaultValue: "Signature can be added when an active claim is available." }));
      return;
    }

    if (!signatureDataUrl || !signatureAccepted) {
      setActionError(t("claim.status.signatureRequired", { defaultValue: "Please sign and accept the terms before submitting." }));
      return;
    }

    setIsSavingSignature(true);

    try {
      await saveLeadSignature(state.uploadTarget.leadId, {
        fullName: profile?.full_name || user?.user_metadata?.full_name || "",
        email: profile?.email || user?.email || "",
        signatureDataUrl,
        termsAccepted: true,
      });
      setSignatureDataUrl("");
      setSignatureAccepted(false);
      setNotice(t("clientPortal.documents.signatureAdded", { defaultValue: "Signature added successfully." }));
      await loadDocuments(true);
    } catch (saveError) {
      setActionError(saveError.message || t("clientPortal.documents.signatureSaveError", { defaultValue: "Could not save your signature." }));
    } finally {
      setIsSavingSignature(false);
    }
  };

  if (state.isLoading) {
    return <PortalLoadingPage variant="documents" />;
  }

  if (state.error) {
    return <p className="portal-message is-error">{state.error}</p>;
  }

  return (
    <div className="client-portal-page">
      <section className="portal-card">
        <PortalSectionHeader title={t("clientPortal.documents.title", { defaultValue: "Documents" })} />

        <input
          ref={filePickerRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          hidden
          onChange={handleFilePickerChange}
        />

        {notice ? <p className="portal-message is-notice">{notice}</p> : null}
        {actionError ? <p className="portal-message is-error">{actionError}</p> : null}

        {state.uploadTarget?.leadId ? (
          <div className="client-portal-documents-banner">
            <div>
              <strong>{t("clientPortal.documents.uploadsEnabled", { defaultValue: "Uploads enabled" })}</strong>
              <span>{state.uploadTarget.claimReference}</span>
            </div>
            <ClientStatusBadge status={{ key: state.uploadTarget.publicStatusKey, label: formatStatusLabel(state.uploadTarget.publicStatusKey, "Under review"), tone: state.uploadTarget.publicStatusKey === "documents_needed" ? "warning" : "info" }} />
          </div>
        ) : (
          <p className="portal-message is-notice">{t("clientPortal.documents.lockedMessage", { defaultValue: "Document changes are locked for the claims currently attached to your account." })}</p>
        )}

        <div className="client-portal-documents-manager-grid">
          {state.requiredDocuments.map((item) => (
            <ManagedDocumentCard
              key={item.key}
              item={item}
              previewUrl={item.latestDocument ? (item.latestDocument.signature_data_url || previewUrls[item.latestDocument.id] || "") : ""}
              canUpload={item.key !== "signature" && Boolean(state.uploadTarget?.leadId) && (!item.latestDocument || item.latestDocument.canReplace)}
              busy={Boolean(busyMap[item.latestDocument ? `document-${item.latestDocument.id}` : `slot-${item.key}`])}
              progress={progressMap[item.latestDocument ? `document-${item.latestDocument.id}` : `slot-${item.key}`] || 0}
              onPreview={openDocument}
              onUpload={(file) => runUploadAction({ documentType: item.key, file, replaceDocument: item.latestDocument?.canReplace ? item.latestDocument : null })}
            />
          ))}
        </div>

        {signatureItem && !signatureItem.latestDocument ? (
          <section className="client-portal-documents-signature-panel">
            <div className="client-portal-documents-signature-panel__head">
              <div>
                <strong>{t("clientPortal.documents.signatureConsent", { defaultValue: "Signature / Consent" })}</strong>
                <span>{canAddSignature ? t("clientPortal.documents.addSignature", { defaultValue: "Add signature" }) : t("clientPortal.documents.lockedNow", { defaultValue: "Locked right now" })}</span>
              </div>
              <ClientStatusBadge status={{ key: signatureItem.statusKey, label: signatureItem.statusLabel, tone: signatureItem.statusTone }} />
            </div>

            {canAddSignature ? (
              <form className="client-portal-documents-signature-panel__form" onSubmit={submitSignature}>
                <SignaturePadField
                  value={signatureDataUrl}
                  onChange={setSignatureDataUrl}
                  ariaLabel={t("claim.finish.digitalSignature", { defaultValue: "Digital Signature" })}
                  clearLabel={t("claim.finish.clear", { defaultValue: "Clear" })}
                  compact
                />
                <div className="client-portal-documents-signature-panel__controls">
                  <label className="client-portal-signature-consent is-compact">
                    <input
                      type="checkbox"
                      checked={signatureAccepted}
                      onChange={(event) => setSignatureAccepted(event.target.checked)}
                    />
                    <span>{t("claim.finish.termsLabel", { defaultValue: "I agree with the terms and confirm that the provided information is accurate." })}</span>
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={isSavingSignature}>
                    {isSavingSignature ? t("clientPortal.account.saving", { defaultValue: "Saving..." }) : t("clientPortal.documents.saveSignature", { defaultValue: "Save signature" })}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}
      </section>

      <DocumentPreviewDrawer
        document={preview.document}
        url={preview.url}
        isLoading={preview.isLoading}
        error={preview.error}
        zoom={preview.zoom}
        actionBusy={preview.document ? Boolean(busyMap[`document-${preview.document.id}`]) : false}
        onZoomIn={() => setPreview((current) => ({ ...current, zoom: Math.min(2.6, current.zoom + 0.2) }))}
        onZoomOut={() => setPreview((current) => ({ ...current, zoom: Math.max(1, current.zoom - 0.2) }))}
        onOpenFull={() => {
          if (preview.url) {
            window.open(preview.url, "_blank", "noopener,noreferrer");
          }
        }}
        onReplace={() => {
          if (preview.document?.canReplace) {
            requestFilePicker({
              documentType: preview.document.document_type,
              replaceDocument: preview.document,
            });
          }
        }}
        onDelete={async () => {
          if (!preview.document?.canDelete) {
            return;
          }

          const currentDocument = preview.document;
          const removed = await handleDeleteDocument(currentDocument);
          if (removed) {
            setPreview({ document: null, url: "", isLoading: false, error: "", zoom: 1 });
          }
        }}
        onClose={() => setPreview({ document: null, url: "", isLoading: false, error: "", zoom: 1 })}
      />
    </div>
  );
}

function ClientAccountPageInner() {
  const { t } = useTranslation();
  const location = useLocation();
  const { profile, user, refreshProfile } = useAuth();
  const initialNameParts = splitFullName(profile?.full_name || user?.user_metadata?.full_name || "");
  const [form, setForm] = useState({
    first_name: initialNameParts.firstName,
    last_name: initialNameParts.lastName,
    email: profile?.email || user?.email || "",
    phone: profile?.phone || user?.user_metadata?.phone || "",
    preferred_language: profile?.preferred_language || document.documentElement.lang || "en",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    debugClientPortal("rendered-page", {
      pathname: location.pathname,
      component: "ClientAccountPage",
    });
  }, [location.pathname]);

  useEffect(() => {
    const nextNameParts = splitFullName(profile?.full_name || user?.user_metadata?.full_name || "");
    setForm({
      first_name: nextNameParts.firstName,
      last_name: nextNameParts.lastName,
      email: profile?.email || user?.email || "",
      phone: profile?.phone || user?.user_metadata?.phone || "",
      preferred_language: profile?.preferred_language || document.documentElement.lang || "en",
    });
  }, [profile, user]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      await saveClientProfile({
        full_name: [form.first_name, form.last_name].filter(Boolean).join(" ").trim(),
        phone: form.phone,
        preferred_language: form.preferred_language,
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
    <div className="client-portal-page client-portal-page--account">
      <section className="portal-card client-portal-account-card">
        <div className="client-portal-account-stack">
          <section className="client-portal-account-section">
            <div className="client-portal-card-heading">
              <strong>{t("clientPortal.account.personal", { defaultValue: "Personal information" })}</strong>
            </div>

            <form className="portal-form client-portal-account-form" onSubmit={submit}>
              <label>
                <span>{t("clientPortal.account.firstName", { defaultValue: "First name" })}</span>
                <input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} />
              </label>
              <label>
                <span>{t("clientPortal.account.lastName", { defaultValue: "Last name" })}</span>
                <input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} />
              </label>
              <label>
                <span>{t("clientPortal.account.email", { defaultValue: "Email" })}</span>
                <input value={form.email} readOnly disabled />
              </label>
              <label>
                <span>{t("clientPortal.account.phone", { defaultValue: "Phone" })}</span>
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>
                <span>{t("clientPortal.account.language", { defaultValue: "Language" })}</span>
                <select value={form.preferred_language} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))}>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.nativeLabel}
                    </option>
                  ))}
                </select>
              </label>
              {error ? <p className="portal-message is-error">{error}</p> : null}
              {message ? <p className="portal-message is-notice">{message}</p> : null}
              <button className="btn btn-primary client-portal-account-submit" type="submit" disabled={isSaving}>
                {isSaving ? t("clientPortal.account.saving", { defaultValue: "Saving..." }) : t("clientPortal.account.submit", { defaultValue: "Save changes" })}
              </button>
            </form>
          </section>

          <section className="client-portal-account-section">
            <div className="client-portal-card-heading">
              <strong>{t("clientPortal.account.notificationsTitle", { defaultValue: "Notifications" })}</strong>
            </div>

            <div className="client-portal-soon-card">
              <span className="client-portal-soon-badge">Soon</span>
              <p>{t("clientPortal.account.notificationsSoonText", { defaultValue: "Soon you will be able to personalize claim and marketing notifications from your account." })}</p>
            </div>
          </section>

          <section className="client-portal-account-section">
            <div className="client-portal-card-heading">
              <strong>{t("clientPortal.account.support", { defaultValue: "Support" })}</strong>
            </div>

            <div className="client-portal-support-grid">
          <a className="client-portal-support-link" href={`mailto:${contactEmail}`}>
            <Mail size={18} />
            <div>
              <strong>{t("clientPortal.account.contactSupport", { defaultValue: "Contact support" })}</strong>
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

export function ClientAccountPage() {
  return <ClientAccountPageInner />;
}

export function ClientProfilePage() {
  return <ClientAccountPageInner />;
}

export function ClientPaymentsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [state, setState] = useState({ isLoading: true, error: "", data: null });

  useEffect(() => {
    debugClientPortal("rendered-page", {
      pathname: location.pathname,
      component: "ClientPaymentsPage",
    });
  }, [location.pathname]);

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
          setState({ isLoading: false, error: error.message || t("clientPortal.errors.loadPayments", { defaultValue: "Could not load payments." }), data: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.isLoading) {
    return <PortalLoadingPage variant="payments" />;
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

        <div className="client-portal-overview-grid client-portal-payments-grid">
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

        <div className="client-portal-payment-panel">
          <div className="client-portal-compact-block">
            <small>{t("clientPortal.payments.latestUpdate", { defaultValue: "Latest payout update" })}</small>
            <strong>{latestPaymentStatus.label}</strong>
            <p>
              {latestPayment?.customer_paid_at
                ? formatDateTime(latestPayment.customer_paid_at)
                : latestPayment?.updated_at
                  ? formatDateTime(latestPayment.updated_at)
                  : t("clientPortal.payments.awaiting", { defaultValue: "Payment information will appear here when your claim is approved." })}
            </p>
          </div>
          <PaymentProgress status={latestPaymentStatus} t={t} />
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
