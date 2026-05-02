import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { ensureCurrentUserProfile } from "../../services/authService.js";
import { isSupabaseConfigured, requireSupabase } from "../../lib/supabase.js";
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
  const location = useLocation();
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const { refreshProfile } = useAuth();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(true);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);

  const recoverySearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const recoveryHashParams = useMemo(() => new URLSearchParams(location.hash.replace(/^#/, "")), [location.hash]);

  const recoveryErrorFromUrl = useMemo(() => {
    return (
      recoveryHashParams.get("error_description")
      || recoveryHashParams.get("error")
      || recoverySearchParams.get("error_description")
      || recoverySearchParams.get("error")
      || ""
    );
  }, [recoveryHashParams, recoverySearchParams]);

  const recoveryType = useMemo(
    () => recoverySearchParams.get("type") || recoveryHashParams.get("type") || "",
    [recoveryHashParams, recoverySearchParams],
  );

  const recoveryTokenHash = useMemo(
    () => recoverySearchParams.get("token_hash")
      || recoverySearchParams.get("token")
      || recoveryHashParams.get("token_hash")
      || "",
    [recoveryHashParams, recoverySearchParams],
  );

  const recoveryCode = useMemo(
    () => recoverySearchParams.get("code") || "",
    [recoverySearchParams],
  );

  const hasRecoveryArtifacts = useMemo(() => {
    return Boolean(
      recoveryHashParams.get("access_token")
      || recoveryHashParams.get("refresh_token")
      || recoveryHashParams.get("type")
      || recoverySearchParams.get("access_token")
      || recoverySearchParams.get("refresh_token")
      || recoverySearchParams.get("type")
      || recoveryTokenHash
      || recoveryCode,
    );
  }, [recoveryCode, recoveryHashParams, recoverySearchParams, recoveryTokenHash]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(t("auth.reset.configError", { defaultValue: "Supabase auth is not configured." }));
      setIsRecoveryLoading(false);
      return;
    }

    if (recoveryErrorFromUrl) {
      setError(recoveryErrorFromUrl);
      setIsRecoveryLoading(false);
      return;
    }

    const client = requireSupabase();
    let active = true;
    let fallbackTimer = null;

    const markReady = () => {
      if (!active) return;
      setError("");
      setIsRecoveryReady(true);
      setIsRecoveryLoading(false);
    };

    const markInvalid = (message) => {
      if (!active) return;
      setIsRecoveryReady(false);
      setIsRecoveryLoading(false);
      setError(message);
    };

    const load = async () => {
      try {
        const { data } = await client.auth.getSession();
        if (data.session?.user) {
          markReady();
          return;
        }

        if (recoveryCode) {
          const { data: codeSession, error: codeError } = await client.auth.exchangeCodeForSession(recoveryCode);
          if (codeError) {
            markInvalid(codeError.message || t("auth.reset.invalidLink", { defaultValue: "This password setup link is invalid or has expired. Request a new reset email." }));
            return;
          }

          if (codeSession?.session?.user) {
            markReady();
            return;
          }
        }

        if (recoveryTokenHash && recoveryType === "recovery") {
          const { data: otpSession, error: otpError } = await client.auth.verifyOtp({
            token_hash: recoveryTokenHash,
            type: "recovery",
          });

          if (otpError) {
            markInvalid(otpError.message || t("auth.reset.invalidLink", { defaultValue: "This password setup link is invalid or has expired. Request a new reset email." }));
            return;
          }

          if (otpSession?.session?.user) {
            markReady();
            return;
          }
        }

        if (!hasRecoveryArtifacts) {
          markInvalid(t("auth.reset.invalidLink", { defaultValue: "This password setup link is invalid or has expired. Request a new reset email." }));
          return;
        }

        fallbackTimer = window.setTimeout(() => {
          markInvalid(t("auth.reset.invalidLink", { defaultValue: "This password setup link is invalid or has expired. Request a new reset email." }));
        }, 2500);
      } catch (authError) {
        markInvalid(authError.message || t("auth.reset.invalidLink", { defaultValue: "This password setup link is invalid or has expired. Request a new reset email." }));
      }
    };

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session?.user)) {
        if (fallbackTimer) {
          window.clearTimeout(fallbackTimer);
        }
        markReady();
      }
    });

    load();

    return () => {
      active = false;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      authListener.subscription.unsubscribe();
    };
  }, [hasRecoveryArtifacts, recoveryCode, recoveryErrorFromUrl, recoveryTokenHash, recoveryType, t]);

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
      await ensureCurrentUserProfile().catch(() => null);
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

  if (isRecoveryLoading) {
    return (
      <AuthShell
        eyebrow={t("auth.reset.label", { defaultValue: "New Password" })}
        title={t("auth.reset.loadingTitle", { defaultValue: "Preparing secure access" })}
        text={t("auth.reset.loadingText", { defaultValue: "Please wait while we verify your password setup link." })}
      >
        <p className="auth-message is-notice">{t("auth.reset.loading", { defaultValue: "Loading..." })}</p>
      </AuthShell>
    );
  }

  if (!isRecoveryReady) {
    return (
      <AuthShell
        eyebrow={t("auth.reset.label", { defaultValue: "New Password" })}
        title={t("auth.reset.invalidTitle", { defaultValue: "Link unavailable" })}
        text={t("auth.reset.invalidText", { defaultValue: "This password setup link could not be verified." })}
      >
        <p className="auth-message is-error">{error || t("auth.reset.invalidLink", { defaultValue: "This password setup link is invalid or has expired. Request a new reset email." })}</p>
        <div className="auth-links">
          <LocalizedLink to="/auth/forgot-password">{t("auth.reset.requestAnother", { defaultValue: "Request another reset link" })}</LocalizedLink>
          <LocalizedLink to="/auth/login">{t("auth.reset.backToLogin", { defaultValue: "Back to sign in" })}</LocalizedLink>
        </div>
      </AuthShell>
    );
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
