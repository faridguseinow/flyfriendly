import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, Mail, Phone, User, X } from "lucide-react";
import logoImage from "../../assets/icons/logo-image.svg";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { signInCustomer, signUpCustomer } from "../../services/authService.js";
import "./style.scss";

function ClaimStartModal({ isOpen, onClose, initialMode = "signup", redirectTo = "/referralProgram", purpose = "partner" }) {
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const { t } = useTranslation();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("claim-modal-open", isOpen);

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", closeOnEscape);
    }

    return () => {
      document.body.classList.remove("claim-modal-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError("");
      setNotice("");
    }
  }, [initialMode, isOpen]);

  if (!isOpen) {
    return null;
  }

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitForm = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!isSupabaseConfigured) {
      setError(t("claimModal.supabaseMissing"));
      return;
    }

    setIsSubmitting(true);

    try {
      const authResult = isSignup
        ? await signUpCustomer(form)
        : await signInCustomer({ email: form.email, password: form.password });

      if (!authResult.session) {
        setNotice(t("claimModal.confirmEmailNotice"));
        return;
      }

      onClose();
      navigate(toLocalizedPath(redirectTo));
    } catch (authError) {
      setError(authError.message || t("claimModal.authError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="claim-modal" role="presentation" onMouseDown={onClose}>
      <section
        className="claim-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="claim-modal__close" type="button" aria-label={t("common.close")} onClick={onClose}>
          <X size={22} strokeWidth={1.8} />
        </button>

        <div className="claim-modal__icon" aria-hidden="true">
          <img src={logoImage} alt="" />
        </div>

        <h2 id="claim-modal-title">{isSignup ? t("claimModal.signupTitle") : t("claimModal.loginTitle")}</h2>
        <p>
          {isSignup
            ? purpose === "partner"
              ? t("claimModal.signupPartnerDescription")
              : t("claimModal.signupDefaultDescription")
            : t("claimModal.loginDescription")}
        </p>

        <form className="claim-modal__form" onSubmit={submitForm}>
          {isSignup && (
            <label>
              <span>{t("claimModal.fullName")}</span>
              <div>
                <User size={18} strokeWidth={1.8} aria-hidden="true" />
                <input name="fullName" value={form.fullName} onChange={updateField} type="text" placeholder={t("claimModal.fullNamePlaceholder")} required />
              </div>
            </label>
          )}

          <label>
            <span>{t("claimModal.email")}</span>
            <div>
              <Mail size={18} strokeWidth={1.8} aria-hidden="true" />
              <input name="email" value={form.email} onChange={updateField} type="email" placeholder={t("claimModal.emailPlaceholder")} required />
            </div>
          </label>

          {isSignup ? (
            <>
              <label>
                <span>{t("claimModal.phone")}</span>
                <div>
                  <Phone size={18} strokeWidth={1.8} aria-hidden="true" />
                  <input name="phone" value={form.phone} onChange={updateField} type="tel" placeholder={t("claimModal.phonePlaceholder")} required />
                </div>
              </label>
              <label>
                <span>{t("claimModal.password")}</span>
                <div>
                  <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
                  <input name="password" value={form.password} onChange={updateField} type="password" placeholder={t("claimModal.passwordCreatePlaceholder")} minLength={6} required />
                </div>
              </label>
            </>
          ) : (
            <label>
              <span>{t("claimModal.password")}</span>
              <div>
                <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
                <input name="password" value={form.password} onChange={updateField} type="password" placeholder={t("claimModal.passwordEnterPlaceholder")} required />
              </div>
            </label>
          )}

          {!isSignup && <a href="#" className="claim-modal__forgot">{t("claimModal.forgotPassword")}</a>}
          {error && <p className="claim-modal__message is-error">{error}</p>}
          {notice && <p className="claim-modal__message is-notice">{notice}</p>}

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("claimModal.pleaseWait") : isSignup ? t("claimModal.getStarted") : t("claimModal.logIn")}
          </button>
        </form>

        <p className="claim-modal__switch">
          {isSignup ? t("claimModal.alreadyMember") : t("claimModal.notMember")}
          <button type="button" onClick={() => setMode(isSignup ? "login" : "signup")}>
            {isSignup ? t("claimModal.logIn") : t("claimModal.signUp")}
          </button>
        </p>
      </section>
    </div>
  );
}

export default ClaimStartModal;
