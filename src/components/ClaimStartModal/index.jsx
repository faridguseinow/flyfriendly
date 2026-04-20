import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, Phone, User, X } from "lucide-react";
import logoImage from "../../assets/icons/logo-image.svg";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { signInCustomer, signUpCustomer } from "../../services/authService.js";
import "./style.scss";

function ClaimStartModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signup");
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
      setError("Supabase env is missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }

    setIsSubmitting(true);

    try {
      const authResult = isSignup
        ? await signUpCustomer(form)
        : await signInCustomer({ email: form.email, password: form.password });

      if (!authResult.session) {
        setNotice("Check your email to confirm your account, then log in to continue.");
        return;
      }

      onClose();
      navigate("/claim/eligibility");
    } catch (authError) {
      setError(authError.message || "Could not authenticate. Please try again.");
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
        <button className="claim-modal__close" type="button" aria-label="Close" onClick={onClose}>
          <X size={22} strokeWidth={1.8} />
        </button>

        <div className="claim-modal__icon" aria-hidden="true">
          <img src={logoImage} alt="" />
        </div>

        <h2 id="claim-modal-title">{isSignup ? "Get started today" : "Welcome Back"}</h2>
        <p>
          {isSignup
            ? "Create your account to check your ticket and start your compensation claim."
            : "Please enter your full name and email to access your account."}
        </p>

        <form className="claim-modal__form" onSubmit={submitForm}>
          <label>
            <span>Full Name</span>
            <div>
              <User size={18} strokeWidth={1.8} aria-hidden="true" />
              <input name="fullName" value={form.fullName} onChange={updateField} type="text" placeholder="Enter Your Full Name" required />
            </div>
          </label>

          <label>
            <span>Email</span>
            <div>
              <Mail size={18} strokeWidth={1.8} aria-hidden="true" />
              <input name="email" value={form.email} onChange={updateField} type="email" placeholder="Enter Your Email" required />
            </div>
          </label>

          {isSignup ? (
            <>
              <label>
                <span>Contact Number (WhatsApp preferred)</span>
                <div>
                  <Phone size={18} strokeWidth={1.8} aria-hidden="true" />
                  <input name="phone" value={form.phone} onChange={updateField} type="tel" placeholder="E.g.: 050 XXX XX XX" required />
                </div>
              </label>
              <label>
                <span>Password</span>
                <div>
                  <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
                  <input name="password" value={form.password} onChange={updateField} type="password" placeholder="Create Your Password" minLength={6} required />
                </div>
              </label>
            </>
          ) : (
            <label>
              <span>Password</span>
              <div>
                <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
                <input name="password" value={form.password} onChange={updateField} type="password" placeholder="Enter Your Password" required />
              </div>
            </label>
          )}

          {!isSignup && <a href="#" className="claim-modal__forgot">Forgot password?</a>}
          {error && <p className="claim-modal__message is-error">{error}</p>}
          {notice && <p className="claim-modal__message is-notice">{notice}</p>}

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : isSignup ? "Get Started" : "Log In"}
          </button>
        </form>

        <p className="claim-modal__switch">
          {isSignup ? "Already a member?" : "Not a member?"}
          <button type="button" onClick={() => setMode(isSignup ? "login" : "signup")}>
            {isSignup ? "Log In" : "Sign Up"}
          </button>
        </p>
      </section>
    </div>
  );
}

export default ClaimStartModal;
