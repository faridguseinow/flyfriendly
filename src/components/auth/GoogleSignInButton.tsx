import { useState, type ButtonHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { isSupabaseConfigured, supabase } from "../../lib/supabase.js";
import "./GoogleSignInButton.scss";

const DEFAULT_REDIRECT_TO = "https://flyfriendly.vercel.app";
const GOOGLE_OAUTH_PENDING_KEY = "flyfriendly.googleOAuth.pending";

type GoogleSignInButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick"> & {
  redirectTo?: string;
  onAuthError?: (error: Error) => void;
};

function GoogleIcon() {
  return (
    <svg className="google-sign-in-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  redirectTo = DEFAULT_REDIRECT_TO,
  disabled = false,
  className = "",
  onAuthError,
  ...buttonProps
}: GoogleSignInButtonProps) {
  const { t } = useTranslation();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isDisabled = disabled || isRedirecting || !isSupabaseConfigured || !supabase;
  const buttonLabel = t("auth.login.googleButton", { defaultValue: "Continue with Google" });

  const handleGoogleSignIn = async () => {
    if (isDisabled || !supabase) {
      return;
    }

    setIsRedirecting(true);

    try {
      window.localStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, "true");

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        window.localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
        console.error("Google OAuth sign-in failed:", error);
        onAuthError?.(error);
        setIsRedirecting(false);
      }
    } catch (authError) {
      window.localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
      const normalizedError = authError instanceof Error ? authError : new Error("Google sign-in failed.");
      console.error("Google OAuth sign-in failed:", normalizedError);
      onAuthError?.(normalizedError);
      setIsRedirecting(false);
    }
  };

  return (
    <button
      {...buttonProps}
      type="button"
      className={`google-sign-in-button ${className}`.trim()}
      onClick={handleGoogleSignIn}
      disabled={isDisabled}
      aria-busy={isRedirecting}
      aria-label={buttonLabel}
    >
      {isRedirecting ? <span className="google-sign-in-button__spinner" aria-hidden="true" /> : <GoogleIcon />}
      <span>{buttonLabel}</span>
    </button>
  );
}

export default GoogleSignInButton;
