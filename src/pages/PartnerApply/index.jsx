import { useEffect, useState } from "react";
import { Globe2, Image, PencilLine, Send, UserRound, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { applyForPartner, getPartnerApplicationState } from "../../services/partnerService.js";
import "./style.scss";

export default function PartnerApplyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const [state, setState] = useState({ isLoading: true, error: "", existing: null });
  const [form, setForm] = useState({
    public_name: "",
    website_url: "",
    instagram_url: "",
    tiktok_url: "",
    youtube_url: "",
    bio: "",
    reason: "",
  });
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    getPartnerApplicationState()
      .then(({ profile, partnerProfile }) => {
        if (!active) return;

        if (partnerProfile?.id) {
          setState({ isLoading: false, error: "", existing: partnerProfile });
          return;
        }

        setForm((current) => ({
          ...current,
          public_name: current.public_name || profile?.full_name || "",
        }));
        setState({ isLoading: false, error: "", existing: null });
      })
      .catch((error) => {
        if (active) {
          setState({ isLoading: false, error: error.message || "Could not load partner application state.", existing: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!state.existing) {
      return;
    }

    const nextPath = state.existing.portal_status === "approved"
      ? "/partner/dashboard"
      : `/partner/${state.existing.portal_status || "pending"}`;
    navigate(toLocalizedPath(nextPath), { replace: true });
  }, [navigate, state.existing, toLocalizedPath]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    try {
      await applyForPartner(form);
      navigate(toLocalizedPath("/partner/pending"), { replace: true });
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

  return (
    <main className="partner-apply-page section">
      <div className="partner-apply-card">
        <span className="section-label is-primary">{t("partnerApply.label", { defaultValue: "Partner Application" })}</span>
        <h1>{t("partnerApply.title", { defaultValue: "Apply to become a Fly Friendly partner" })}</h1>
        <p>{t("partnerApply.text", { defaultValue: "Tell us about your audience and channels. After review, we will activate your referral access and dashboard." })}</p>

        <form className="partner-apply-form" onSubmit={submit}>
          <label>
            <span>{t("partnerApply.publicName", { defaultValue: "Public name" })}</span>
            <div className="partner-apply-input">
              <UserRound size={18} />
              <input value={form.public_name} onChange={(event) => setForm((current) => ({ ...current, public_name: event.target.value }))} required />
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
            <span>{t("partnerApply.bio", { defaultValue: "Short bio" })}</span>
            <textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={4} />
          </label>
          <label>
            <span>{t("partnerApply.reason", { defaultValue: "Why do you want to join?" })}</span>
            <div className="partner-apply-input is-textarea">
              <PencilLine size={18} />
              <textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} rows={5} required />
            </div>
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
