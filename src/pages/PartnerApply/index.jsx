import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Globe2,
  Image,
  Languages,
  Link2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Send,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { applyForPartner, getPartnerApplicationState } from "../../services/partnerService.js";
import "./style.scss";

export default function PartnerApplyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const [state, setState] = useState({
    isLoading: true,
    error: "",
    existing: null,
    application: null,
    profile: null,
  });
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    country: "",
    preferred_language: "",
    public_name: "",
    primary_platform: "",
    audience_size: "",
    audience_countries: "",
    website_url: "",
    instagram_url: "",
    tiktok_url: "",
    youtube_url: "",
    niche: "",
    content_links: "",
    motivation: "",
    consent_accepted: false,
  });
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    getPartnerApplicationState()
      .then(({ profile, partnerProfile, application }) => {
        if (!active) return;

        if (partnerProfile?.id) {
          setState({
            isLoading: false,
            error: "",
            existing: partnerProfile,
            application: null,
            profile,
          });
          return;
        }

        setForm((current) => ({
          ...current,
          full_name: current.full_name || profile?.full_name || "",
          email: current.email || profile?.email || "",
          phone: current.phone || profile?.phone || "",
          preferred_language: current.preferred_language || i18n.language || "en",
          public_name: current.public_name || profile?.full_name || "",
        }));
        setState({
          isLoading: false,
          error: "",
          existing: null,
          application,
          profile,
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          isLoading: false,
          error: error.message || "Could not load partner application state.",
          existing: null,
          application: null,
          profile: null,
        });
      });

    return () => {
      active = false;
    };
  }, [i18n.language]);

  useEffect(() => {
    if (!state.existing) {
      return;
    }

    const nextPath = state.existing.portal_status === "approved"
      ? "/partner/dashboard"
      : `/partner/${state.existing.portal_status || "pending"}`;
    navigate(toLocalizedPath(nextPath), { replace: true });
  }, [navigate, state.existing, toLocalizedPath]);

  const languageOptions = useMemo(() => ([
    { value: "en", label: "English" },
    { value: "az", label: "Azerbaijani" },
    { value: "ru", label: "Russian" },
    { value: "tr", label: "Turkish" },
    { value: "es", label: "Spanish" },
    { value: "it", label: "Italian" },
  ]), []);

  const platformOptions = useMemo(() => ([
    "Instagram",
    "TikTok",
    "YouTube",
    "Blog",
    "Newsletter",
    "Travel agency",
    "Community",
    "Other",
  ]), []);

  const showReceivedState = Boolean(state.application?.id && ["pending", "approved"].includes(state.application.status));
  const canResubmit = ["rejected", "cancelled"].includes(state.application?.status);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const application = await applyForPartner(form);
      setState((current) => ({ ...current, application }));
    } catch (error) {
      setSubmitError(error.message || t("partnerApply.error", { defaultValue: "Could not submit your application." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (state.isLoading) {
    return <div className="placeholder-page"><p>{t("partnerApply.loading", { defaultValue: "Loading partner application..." })}</p></div>;
  }

  if (state.error) {
    return <div className="placeholder-page"><p>{state.error}</p></div>;
  }

  if (showReceivedState) {
    return (
      <main className="partner-apply-page section">
        <div className="partner-apply-card partner-apply-card--success">
          <span className="section-label is-primary">{t("partnerApply.label", { defaultValue: "Partner Application" })}</span>
          <div className="partner-apply-success-icon">
            <CheckCircle2 size={34} />
          </div>
          <h1>{t("partnerApply.receivedTitle", { defaultValue: "Application received" })}</h1>
          <p>{t("partnerApply.receivedText", { defaultValue: "Thank you. We have received your partner application and our team will review it before creating any partner account, referral code, or portal access." })}</p>
          <div className="partner-apply-summary">
            <article><strong>{t("partnerApply.fullName", { defaultValue: "Full name" })}</strong><span>{state.application.full_name}</span></article>
            <article><strong>{t("partnerApply.email", { defaultValue: "Email" })}</strong><span>{state.application.email}</span></article>
            <article><strong>{t("partnerApply.publicName", { defaultValue: "Public name" })}</strong><span>{state.application.public_name || "-"}</span></article>
            <article><strong>{t("partnerApply.status", { defaultValue: "Status" })}</strong><span>{state.application.status}</span></article>
          </div>
          <p className="partner-apply-note">{t("partnerApply.receivedNote", { defaultValue: "Approval is handled separately by the Fly Friendly team. Submitting this form does not grant partner portal access." })}</p>
          <div className="partner-apply-actions">
            <LocalizedLink className="btn btn-primary" to="/partner-program">
              {t("partnerApply.backToProgram", { defaultValue: "Back to partner program" })}
            </LocalizedLink>
            {state.profile?.id ? (
              <LocalizedLink className="btn btn-secondary" to="/client/dashboard">
                {t("partnerApply.backToDashboard", { defaultValue: "Back to dashboard" })}
              </LocalizedLink>
            ) : (
              <LocalizedLink className="btn btn-secondary" to="/auth/login">
                {t("partnerApply.backToLogin", { defaultValue: "Back to sign in" })}
              </LocalizedLink>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="partner-apply-page section">
      <div className="partner-apply-card">
        <span className="section-label is-primary">{t("partnerApply.label", { defaultValue: "Partner Application" })}</span>
        <h1>{t("partnerApply.title", { defaultValue: "Apply to become a Fly Friendly partner" })}</h1>
        <p>{t("partnerApply.text", { defaultValue: "Tell us about your audience, channels, and market fit. We will review your application before creating any partner account or referral access." })}</p>

        {canResubmit ? (
          <p className="partner-apply-message is-info">
            {t("partnerApply.resubmitHint", { defaultValue: "Your previous application is no longer active. You can submit a new request below." })}
          </p>
        ) : null}

        <form className="partner-apply-form" onSubmit={submit}>
          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.fullName", { defaultValue: "Full name" })}</span>
              <div className="partner-apply-input">
                <UserRound size={18} />
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required />
              </div>
            </label>
            <label>
              <span>{t("partnerApply.email", { defaultValue: "Email" })}</span>
              <div className="partner-apply-input">
                <Mail size={18} />
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </div>
            </label>
          </div>

          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.phone", { defaultValue: "Phone" })}</span>
              <div className="partner-apply-input">
                <Phone size={18} />
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
            </label>
            <label>
              <span>{t("partnerApply.country", { defaultValue: "Country" })}</span>
              <div className="partner-apply-input">
                <MapPin size={18} />
                <input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} required />
              </div>
            </label>
          </div>

          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.preferredLanguage", { defaultValue: "Preferred language" })}</span>
              <div className="partner-apply-input">
                <Languages size={18} />
                <select value={form.preferred_language} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))} required>
                  <option value="">{t("partnerApply.selectLanguage", { defaultValue: "Select language" })}</option>
                  {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </label>
            <label>
              <span>{t("partnerApply.publicName", { defaultValue: "Public name" })}</span>
              <div className="partner-apply-input">
                <UserRound size={18} />
                <input value={form.public_name} onChange={(event) => setForm((current) => ({ ...current, public_name: event.target.value }))} required />
              </div>
            </label>
          </div>

          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.primaryPlatform", { defaultValue: "Primary platform" })}</span>
              <div className="partner-apply-input">
                <Send size={18} />
                <select value={form.primary_platform} onChange={(event) => setForm((current) => ({ ...current, primary_platform: event.target.value }))} required>
                  <option value="">{t("partnerApply.selectPlatform", { defaultValue: "Select platform" })}</option>
                  {platformOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </label>
            <label>
              <span>{t("partnerApply.audienceSize", { defaultValue: "Audience size" })}</span>
              <div className="partner-apply-input">
                <Users size={18} />
                <input value={form.audience_size} onChange={(event) => setForm((current) => ({ ...current, audience_size: event.target.value }))} placeholder={t("partnerApply.audienceSizePlaceholder", { defaultValue: "e.g. 50k monthly reach" })} required />
              </div>
            </label>
          </div>

          <label>
            <span>{t("partnerApply.audienceCountries", { defaultValue: "Audience countries" })}</span>
            <div className="partner-apply-input is-textarea">
              <Globe2 size={18} />
              <textarea value={form.audience_countries} onChange={(event) => setForm((current) => ({ ...current, audience_countries: event.target.value }))} rows={3} placeholder={t("partnerApply.audienceCountriesPlaceholder", { defaultValue: "List countries separated by commas or new lines" })} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.website", { defaultValue: "Website URL" })}</span>
            <div className="partner-apply-input">
              <Globe2 size={18} />
              <input value={form.website_url} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.instagram", { defaultValue: "Instagram URL" })}</span>
            <div className="partner-apply-input">
              <Image size={18} />
              <input value={form.instagram_url} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.tiktok", { defaultValue: "TikTok URL" })}</span>
            <div className="partner-apply-input">
              <Send size={18} />
              <input value={form.tiktok_url} onChange={(event) => setForm((current) => ({ ...current, tiktok_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.youtube", { defaultValue: "YouTube URL" })}</span>
            <div className="partner-apply-input">
              <Video size={18} />
              <input value={form.youtube_url} onChange={(event) => setForm((current) => ({ ...current, youtube_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.niche", { defaultValue: "Niche or topic" })}</span>
            <div className="partner-apply-input">
              <MessageSquareText size={18} />
              <input value={form.niche} onChange={(event) => setForm((current) => ({ ...current, niche: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.contentLinks", { defaultValue: "Content links" })}</span>
            <div className="partner-apply-input is-textarea">
              <Link2 size={18} />
              <textarea value={form.content_links} onChange={(event) => setForm((current) => ({ ...current, content_links: event.target.value }))} rows={4} placeholder={t("partnerApply.contentLinksPlaceholder", { defaultValue: "Paste notable content links separated by commas or new lines" })} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.reason", { defaultValue: "Why do you want to join?" })}</span>
            <div className="partner-apply-input is-textarea">
              <MessageSquareText size={18} />
              <textarea value={form.motivation} onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))} rows={5} required />
            </div>
          </label>

          <label className="partner-apply-consent">
            <input
              type="checkbox"
              checked={form.consent_accepted}
              onChange={(event) => setForm((current) => ({ ...current, consent_accepted: event.target.checked }))}
              required
            />
            <span>{t("partnerApply.consent", { defaultValue: "I confirm that the information provided is accurate and I agree to be contacted about the Fly Friendly Partner Program." })}</span>
          </label>

          {submitError ? <p className="partner-apply-message is-error">{submitError}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t("partnerApply.submitting", { defaultValue: "Submitting..." })
              : t("partnerApply.submit", { defaultValue: "Submit application" })}
          </button>
        </form>
      </div>
    </main>
  );
}
