import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock, Mail, Phone, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import {
  resetPassword,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from "../../services/authService.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { resolveDashboardPath } from "../../auth/routeUtils.js";
import "./style.scss";

function AuthShell({ eyebrow, title, text, children }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <LocalizedLink to="/" className="auth-brand" aria-label="Fly Friendly">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </LocalizedLink>
        <span className="section-label is-primary">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
        {children}
      </section>
    </main>
  );
}

function getReturnPath(searchParams) {
  const raw = searchParams.get("returnTo");
  return raw && raw.startsWith("/") ? raw : null;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const { refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await signInWithEmail(form.email, form.password);
      const nextAuth = await refreshProfile();
      navigate(
        getReturnPath(searchParams) || resolveDashboardPath(nextAuth?.profile, nextAuth?.partnerProfile),
        { replace: true },
      );
    } catch (authError) {
      setError(authError.message || t("auth.login.error", { defaultValue: "Could not sign in. Please check your email and password." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t("auth.login.label", { defaultValue: "Account Access" })}
      title={t("auth.login.title", { defaultValue: "Welcome back" })}
      text={t("auth.login.text", { defaultValue: "Sign in to view your claims, documents, and payout updates." })}
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>{t("auth.fields.email", { defaultValue: "Email" })}</span>
          <div className="auth-input">
            <Mail size={18} />
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder={t("auth.placeholders.email", { defaultValue: "you@example.com" })}
              required
            />
          </div>
        </label>
        <label>
          <span>{t("auth.fields.password", { defaultValue: "Password" })}</span>
          <div className="auth-input">
            <Lock size={18} />
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={t("auth.placeholders.password", { defaultValue: "Enter your password" })}
              required
            />
          </div>
        </label>
        {error ? <p className="auth-message is-error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("auth.login.loading", { defaultValue: "Signing in..." }) : t("auth.login.submit", { defaultValue: "Sign in" })}
        </button>
      </form>
      <div className="auth-links">
        <LocalizedLink to="/auth/forgot-password">{t("auth.login.forgot", { defaultValue: "Forgot password?" })}</LocalizedLink>
        <span>
          {t("auth.login.registerPrompt", { defaultValue: "Need an account?" })}{" "}
          <LocalizedLink to="/auth/register">{t("auth.login.registerLink", { defaultValue: "Create one" })}</LocalizedLink>
        </span>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const { refreshProfile } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptedLegal: false,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (form.password.length < 6) {
      setError(t("auth.register.passwordLength", { defaultValue: "Password must be at least 6 characters." }));
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t("auth.register.passwordMismatch", { defaultValue: "Passwords do not match." }));
      return;
    }

    if (!form.acceptedLegal) {
      setError(t("auth.register.legalRequired", { defaultValue: "Please accept the terms and privacy policy." }));
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signUpWithEmail(form.email, form.password, {
        fullName: form.fullName,
        phone: form.phone,
      });

      if (result.session) {
        const nextAuth = await refreshProfile();
        navigate(resolveDashboardPath(nextAuth?.profile, nextAuth?.partnerProfile) || toLocalizedPath("/client/dashboard"), { replace: true });
        return;
      }

      setNotice(t("auth.register.confirmNotice", { defaultValue: "Check your email to confirm your account, then sign in to access your dashboard." }));
    } catch (authError) {
      setError(authError.message || t("auth.register.error", { defaultValue: "Could not create your account." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t("auth.register.label", { defaultValue: "Create Account" })}
      title={t("auth.register.title", { defaultValue: "Open your Fly Friendly account" })}
      text={t("auth.register.text", { defaultValue: "Create an account to track claims, upload documents, and return to your case at any time." })}
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>{t("auth.fields.fullName", { defaultValue: "Full name" })}</span>
          <div className="auth-input">
            <User size={18} />
            <input type="text" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required />
          </div>
        </label>
        <label>
          <span>{t("auth.fields.email", { defaultValue: "Email" })}</span>
          <div className="auth-input">
            <Mail size={18} />
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
          </div>
        </label>
        <label>
          <span>{t("auth.fields.phone", { defaultValue: "Phone" })}</span>
          <div className="auth-input">
            <Phone size={18} />
            <input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </div>
        </label>
        <label>
          <span>{t("auth.fields.password", { defaultValue: "Password" })}</span>
          <div className="auth-input">
            <Lock size={18} />
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
          </div>
        </label>
        <label>
          <span>{t("auth.fields.confirmPassword", { defaultValue: "Confirm password" })}</span>
          <div className="auth-input">
            <Lock size={18} />
            <input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} required />
          </div>
        </label>
        <label className="auth-checkbox">
          <input type="checkbox" checked={form.acceptedLegal} onChange={(event) => setForm((current) => ({ ...current, acceptedLegal: event.target.checked }))} />
          <span>
            {t("auth.register.legalText", { defaultValue: "I agree to the Terms of Use and Privacy Policy." })}
          </span>
        </label>
        {error ? <p className="auth-message is-error">{error}</p> : null}
        {notice ? <p className="auth-message is-notice">{notice}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("auth.register.loading", { defaultValue: "Creating account..." }) : t("auth.register.submit", { defaultValue: "Create account" })}
        </button>
      </form>
      <div className="auth-links">
        <span>
          {t("auth.register.loginPrompt", { defaultValue: "Already have an account?" })}{" "}
          <LocalizedLink to="/auth/login">{t("auth.register.loginLink", { defaultValue: "Sign in" })}</LocalizedLink>
        </span>
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      await resetPassword(email);
      setNotice(t("auth.forgot.notice", { defaultValue: "Reset instructions have been sent to your email." }));
    } catch (authError) {
      setError(authError.message || t("auth.forgot.error", { defaultValue: "Could not send reset instructions." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t("auth.forgot.label", { defaultValue: "Reset Access" })}
      title={t("auth.forgot.title", { defaultValue: "Forgot your password?" })}
      text={t("auth.forgot.text", { defaultValue: "Enter your email and we will send you a secure reset link." })}
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>{t("auth.fields.email", { defaultValue: "Email" })}</span>
          <div className="auth-input">
            <Mail size={18} />
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
        </label>
        {error ? <p className="auth-message is-error">{error}</p> : null}
        {notice ? <p className="auth-message is-notice">{notice}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("auth.forgot.loading", { defaultValue: "Sending..." }) : t("auth.forgot.submit", { defaultValue: "Send reset link" })}
        </button>
      </form>
      <div className="auth-links">
        <LocalizedLink to="/auth/login">{t("auth.forgot.backToLogin", { defaultValue: "Back to sign in" })}</LocalizedLink>
      </div>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const { isAuthenticated, refreshProfile } = useAuth();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    refreshProfile().catch(() => {});
  }, [isAuthenticated, refreshProfile]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (form.password.length < 6) {
      setError(t("auth.reset.passwordLength", { defaultValue: "Password must be at least 6 characters." }));
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t("auth.reset.passwordMismatch", { defaultValue: "Passwords do not match." }));
      return;
    }

    setIsSubmitting(true);

    try {
      await updatePassword(form.password);
      setNotice(t("auth.reset.notice", { defaultValue: "Password updated. Redirecting to your account..." }));
      const nextAuth = await refreshProfile();
      window.setTimeout(() => {
        navigate(resolveDashboardPath(nextAuth?.profile, nextAuth?.partnerProfile) || toLocalizedPath("/client/dashboard"), { replace: true });
      }, 700);
    } catch (authError) {
      setError(authError.message || t("auth.reset.error", { defaultValue: "Could not update your password." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return <Navigate to={toLocalizedPath("/auth/login")} replace />;
  }

  return (
    <AuthShell
      eyebrow={t("auth.reset.label", { defaultValue: "New Password" })}
      title={t("auth.reset.title", { defaultValue: "Choose a new password" })}
      text={t("auth.reset.text", { defaultValue: "Set a secure password for your Fly Friendly account." })}
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>{t("auth.fields.password", { defaultValue: "Password" })}</span>
          <div className="auth-input">
            <Lock size={18} />
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
          </div>
        </label>
        <label>
          <span>{t("auth.fields.confirmPassword", { defaultValue: "Confirm password" })}</span>
          <div className="auth-input">
            <Lock size={18} />
            <input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} required />
          </div>
        </label>
        {error ? <p className="auth-message is-error">{error}</p> : null}
        {notice ? <p className="auth-message is-notice">{notice}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("auth.reset.loading", { defaultValue: "Saving..." }) : t("auth.reset.submit", { defaultValue: "Save password" })}
        </button>
      </form>
      <div className="auth-links">
        <Link to={toLocalizedPath("/auth/login")}>{t("auth.reset.backToLogin", { defaultValue: "Back to sign in" })}</Link>
      </div>
    </AuthShell>
  );
}
