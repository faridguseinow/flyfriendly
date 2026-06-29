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
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Trans } from "react-i18next";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import SeoHead from "../../components/SeoHead.jsx";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { DEFAULT_LANGUAGE, languages } from "../../i18n/languages.js";
import { localizePath } from "../../i18n/path.js";
import { BRAND_NAME, buildSeoPayload } from "../../lib/seo.js";
import { applyForPartner, getPartnerApplicationState } from "../../services/partnerService.js";
import "./style.scss";

export default function PartnerApplyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useParams();
  const locale = lang || DEFAULT_LANGUAGE;
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
    legal_accepted: false,
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
          error: error.message || t("partnerApply.loadError"),
          existing: null,
          application: null,
          profile: null,
        });
      });

    return () => {
      active = false;
    };
  }, [i18n.language, t]);

  useEffect(() => {
    if (!state.existing) {
      return;
    }

    const nextPath = state.existing.portal_status === "approved"
      ? "/partner/dashboard"
      : `/partner/${state.existing.portal_status || "pending"}`;
    navigate(toLocalizedPath(nextPath), { replace: true });
  }, [navigate, state.existing, toLocalizedPath]);

  const languageOptions = useMemo(
    () => languages.map((language) => ({
      value: language.code,
      label: `${language.nativeLabel} (${language.code.toUpperCase()})`,
    })),
    [],
  );

  const platformOptions = useMemo(() => ([
    { value: "Instagram", label: t("partnerApply.platforms.instagram") },
    { value: "TikTok", label: t("partnerApply.platforms.tiktok") },
    { value: "YouTube", label: t("partnerApply.platforms.youtube") },
    { value: "Blog", label: t("partnerApply.platforms.blog") },
    { value: "Newsletter", label: t("partnerApply.platforms.newsletter") },
    { value: "Travel agency", label: t("partnerApply.platforms.travelAgency") },
    { value: "Community", label: t("partnerApply.platforms.community") },
    { value: "Other", label: t("partnerApply.platforms.other") },
  ]), [t]);

  const showReceivedState = Boolean(state.application?.id && ["pending", "approved"].includes(state.application.status));
  const canResubmit = ["rejected", "cancelled"].includes(state.application?.status);
  const seo = buildSeoPayload({
    lang: locale,
    title: `${t(showReceivedState ? "partnerApply.receivedTitle" : "partnerApply.title")} | ${BRAND_NAME}`,
    description: t(showReceivedState ? "partnerApply.receivedText" : "partnerApply.text"),
    pathname: location.pathname,
    canonicalPath: localizePath("/partner/apply", locale),
    alternatesPath: "/partner/apply",
    indexable: !showReceivedState,
  });

  const submit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    if (!form.legal_accepted) {
      setSubmitError(t("partnerApply.legalRequired"));
      return;
    }

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
    return (
      <>
        <SeoHead {...seo} />
        <div className="placeholder-page"><p>{t("partnerApply.loading")}</p></div>
      </>
    );
  }

  if (state.error) {
    return (
      <>
        <SeoHead {...seo} />
        <div className="placeholder-page"><p>{state.error}</p></div>
      </>
    );
  }

  if (showReceivedState) {
    return (
      <>
        <SeoHead {...seo} />
        <main className="partner-apply-page section">
          <div className="partner-apply-card partner-apply-card--success">
            <div className="partner-apply-success-icon">
              <CheckCircle2 size={34} />
            </div>
            <h1>{t("partnerApply.receivedTitle")}</h1>
            <p>{t("partnerApply.receivedText")}</p>
            <div className="partner-apply-summary">
              <article><strong>{t("partnerApply.fullName")}</strong><span>{state.application.full_name}</span></article>
              <article><strong>{t("partnerApply.email")}</strong><span>{state.application.email}</span></article>
              <article><strong>{t("partnerApply.publicName")}</strong><span>{state.application.public_name || "-"}</span></article>
              <article><strong>{t("partnerApply.status")}</strong><span>{state.application.status}</span></article>
            </div>
            <p className="partner-apply-note">{t("partnerApply.receivedNote")}</p>
            <div className="partner-apply-actions">
              <LocalizedLink className="btn btn-primary" to="/partner-program">
                {t("partnerApply.backToProgram")}
              </LocalizedLink>
              {state.profile?.id ? (
                <LocalizedLink className="btn btn-secondary" to="/client/dashboard">
                  {t("partnerApply.backToDashboard")}
                </LocalizedLink>
              ) : (
                <LocalizedLink className="btn btn-secondary" to="/auth/login">
                  {t("partnerApply.backToLogin")}
                </LocalizedLink>
              )}
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <main className="partner-apply-page section">
      <SeoHead {...seo} />
      <div className="partner-apply-card">
        <h1>{t("partnerApply.title")}</h1>
        <p>{t("partnerApply.text")}</p>

        {canResubmit ? (
          <p className="partner-apply-message is-info">
            {t("partnerApply.resubmitHint")}
          </p>
        ) : null}

        <form className="partner-apply-form" onSubmit={submit}>
          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.fullName")}</span>
              <div className="partner-apply-input">
                <UserRound size={18} />
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required />
              </div>
            </label>
            <label>
              <span>{t("partnerApply.email")}</span>
              <div className="partner-apply-input">
                <Mail size={18} />
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </div>
            </label>
          </div>

          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.phone")}</span>
              <div className="partner-apply-input">
                <Phone size={18} />
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
            </label>
            <label>
              <span>{t("partnerApply.country")}</span>
              <div className="partner-apply-input">
                <MapPin size={18} />
                <input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} required />
              </div>
            </label>
          </div>

          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.preferredLanguage")}</span>
              <div className="partner-apply-input">
                <Languages size={18} />
                <select value={form.preferred_language} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))} required>
                  <option value="">{t("partnerApply.selectLanguage")}</option>
                  {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </label>
            <label>
              <span>{t("partnerApply.publicName")}</span>
              <div className="partner-apply-input">
                <UserRound size={18} />
                <input value={form.public_name} onChange={(event) => setForm((current) => ({ ...current, public_name: event.target.value }))} required />
              </div>
            </label>
          </div>

          <div className="partner-apply-grid">
            <label>
              <span>{t("partnerApply.primaryPlatform")}</span>
              <div className="partner-apply-input">
                <Send size={18} />
                <select value={form.primary_platform} onChange={(event) => setForm((current) => ({ ...current, primary_platform: event.target.value }))} required>
                  <option value="">{t("partnerApply.selectPlatform")}</option>
                  {platformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </label>
            <label>
              <span>{t("partnerApply.audienceSize")}</span>
              <div className="partner-apply-input">
                <Users size={18} />
                <input value={form.audience_size} onChange={(event) => setForm((current) => ({ ...current, audience_size: event.target.value }))} placeholder={t("partnerApply.audienceSizePlaceholder")} required />
              </div>
            </label>
          </div>

          <label>
            <span>{t("partnerApply.audienceCountries")}</span>
            <div className="partner-apply-input is-textarea">
              <Globe2 size={18} />
              <textarea value={form.audience_countries} onChange={(event) => setForm((current) => ({ ...current, audience_countries: event.target.value }))} rows={3} placeholder={t("partnerApply.audienceCountriesPlaceholder")} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.website")}</span>
            <div className="partner-apply-input">
              <Globe2 size={18} />
              <input value={form.website_url} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.instagram")}</span>
            <div className="partner-apply-input">
              <Image size={18} />
              <input value={form.instagram_url} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.tiktok")}</span>
            <div className="partner-apply-input">
              <Send size={18} />
              <input value={form.tiktok_url} onChange={(event) => setForm((current) => ({ ...current, tiktok_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.youtube")}</span>
            <div className="partner-apply-input">
              <Video size={18} />
              <input value={form.youtube_url} onChange={(event) => setForm((current) => ({ ...current, youtube_url: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.niche")}</span>
            <div className="partner-apply-input">
              <MessageSquareText size={18} />
              <input value={form.niche} onChange={(event) => setForm((current) => ({ ...current, niche: event.target.value }))} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.contentLinks")}</span>
            <div className="partner-apply-input is-textarea">
              <Link2 size={18} />
              <textarea value={form.content_links} onChange={(event) => setForm((current) => ({ ...current, content_links: event.target.value }))} rows={4} placeholder={t("partnerApply.contentLinksPlaceholder")} />
            </div>
          </label>

          <label>
            <span>{t("partnerApply.reason")}</span>
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
            <span>{t("partnerApply.consent")}</span>
          </label>

          <label className="partner-apply-consent">
            <input
              type="checkbox"
              checked={form.legal_accepted}
              onChange={(event) => setForm((current) => ({ ...current, legal_accepted: event.target.checked }))}
            />
            <span>
              <Trans
                i18nKey="partnerApply.legalText"
                defaults="I agree to the <termsLink>Terms of Use</termsLink> and <privacyLink>Privacy Policy</privacyLink>."
                components={{
                  termsLink: <LocalizedLink to="/terms" />,
                  privacyLink: <LocalizedLink to="/privacyPolicy" />,
                }}
              />
            </span>
          </label>

          {submitError ? <p className="partner-apply-message is-error">{submitError}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t("partnerApply.submitting")
              : t("partnerApply.submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
