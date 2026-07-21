import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, User, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SocialIcon from "../../components/SocialIcon/index.jsx";
import CountryFlag from "../../components/CountryFlag/index.jsx";
import { LocalizedLink, LocalizedNavLink } from "../../components/LocalizedLink.jsx";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { socialLinks } from "../../constants/site.js";
import { getLanguageByCode, languages, setStoredLanguage } from "../../i18n/languages.js";
import { loadLanguageResources } from "../../i18n/index.js";
import { replaceLanguageInPath } from "../../i18n/path.js";
import { updatePreferredLanguage } from "../../services/authService.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { getNormalizedRole, resolveProfilePath } from "../../auth/routeUtils.js";
import { getInitials, getProfileAvatarUrl } from "../../lib/profileAvatar.js";
import "./style.scss";

function LanguageSwitcher({ currentLanguage, isOpen, onOpen, onClose, onSelectLanguage }) {
  const { t } = useTranslation();
  const currentLanguageOption = getLanguageByCode(currentLanguage);
  const mainLanguages = useMemo(() => languages.filter((language) => language.group === "main"), []);
  const additionalLanguages = useMemo(() => languages.filter((language) => language.group === "additional"), []);

  return (
    <div className="language-switcher">
      <button
        className="language-current"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t("languageSwitcher.open")}
        onClick={onOpen}
      >
        <CountryFlag code={currentLanguageOption.countryCode} label={currentLanguageOption.label} className="language-current__flag" />
        <span className="language-current__code">{currentLanguageOption.code.toUpperCase()}</span>
      </button>

      {isOpen ? createPortal(
        <div className="language-modal" role="presentation" onMouseDown={onClose}>
          <section
            className="language-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="language-modal__close" type="button" aria-label={t("common.close")} onClick={onClose}>
              <X size={18} strokeWidth={2} />
            </button>

            <header className="language-modal__header">
              <h2 id="language-modal-title">{t("languageSwitcher.title")}</h2>
            </header>

            <div className="language-modal__section">
              <h3>{t("languageSwitcher.suggestedLanguages")}</h3>
              <div className="language-grid">
                {mainLanguages.map((language) => (
                  <button
                    type="button"
                    key={language.code}
                    className={`language-option${language.code === currentLanguage ? " is-active" : ""}`}
                    onClick={() => onSelectLanguage(language.code)}
                  >
                    <CountryFlag code={language.countryCode} label={language.label} className="language-option__flag" />
                    <span className="language-option__copy">
                      <strong>{language.label}</strong>
                      <small>{language.nativeLabel}</small>
                    </span>
                    <span className="language-option__code">{language.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="language-modal__section">
              <h3>{t("languageSwitcher.additionalLanguages")}</h3>
              <div className="language-grid">
                {additionalLanguages.map((language) => (
                  <button
                    type="button"
                    key={language.code}
                    className={`language-option${language.code === currentLanguage ? " is-active" : ""}`}
                    onClick={() => onSelectLanguage(language.code)}
                  >
                    <CountryFlag code={language.countryCode} label={language.label} className="language-option__flag" />
                    <span className="language-option__copy">
                      <strong>{language.label}</strong>
                      <small>{language.nativeLabel}</small>
                    </span>
                    <span className="language-option__code">{language.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function MobileLanguagePicker({ currentLanguage, isOpen, onToggle, onSelectLanguage, compact = false }) {
  const { t } = useTranslation();
  const currentLanguageOption = getLanguageByCode(currentLanguage);
  const mainLanguages = useMemo(() => languages.filter((language) => language.group === "main"), []);
  const additionalLanguages = useMemo(() => languages.filter((language) => language.group === "additional"), []);

  return (
    <section className={`mobile-language-picker${isOpen ? " is-open" : ""}${compact ? " is-compact" : ""}`} aria-label={t("languageSwitcher.title")}>
      <button className="mobile-language-picker__trigger" type="button" onClick={onToggle} aria-expanded={isOpen}>
        {!compact ? <span className="mobile-language-picker__label">{t("languageSwitcher.title")}</span> : null}
        <span className="mobile-language-picker__current">
          <CountryFlag code={currentLanguageOption.countryCode} label={currentLanguageOption.label} className="mobile-language-picker__flag" />
          <strong>{currentLanguageOption.code.toUpperCase()}</strong>
          <ChevronDown size={16} strokeWidth={2.2} />
        </span>
      </button>

      {isOpen ? (
        <div className="mobile-language-picker__panel">
          <div className="mobile-language-picker__section">
            <h3>{t("languageSwitcher.suggestedLanguages")}</h3>
            <div className="mobile-language-picker__list">
              {mainLanguages.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className={`mobile-language-picker__option${language.code === currentLanguage ? " is-active" : ""}`}
                  onClick={() => onSelectLanguage(language.code)}
                >
                  <CountryFlag code={language.countryCode} label={language.label} className="mobile-language-picker__flag" />
                  <span className="mobile-language-picker__copy">
                    <strong>{language.label}</strong>
                    <small>{language.nativeLabel}</small>
                  </span>
                  <span className="mobile-language-picker__code">{language.code.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-language-picker__section">
            <h3>{t("languageSwitcher.additionalLanguages")}</h3>
            <div className="mobile-language-picker__list">
              {additionalLanguages.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className={`mobile-language-picker__option${language.code === currentLanguage ? " is-active" : ""}`}
                  onClick={() => onSelectLanguage(language.code)}
                >
                  <CountryFlag code={language.countryCode} label={language.label} className="mobile-language-picker__flag" />
                  <span className="mobile-language-picker__copy">
                    <strong>{language.label}</strong>
                    <small>{language.nativeLabel}</small>
                  </span>
                  <span className="mobile-language-picker__code">{language.code.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { isAuthenticated, adminAccess, partnerProfile, profile, user, signOut } = useAuth();
  const normalizedRole = getNormalizedRole(profile, partnerProfile, adminAccess);
  const currentLanguage = location.pathname.split("/").filter(Boolean)[0] || "en";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [hasAvatarLoadError, setHasAvatarLoadError] = useState(false);
  const accountMenuRef = useRef(null);

  const navLinks = useMemo(
    () => [
      { label: t("nav.referralProgram"), path: "/referralProgram" },
      { label: t("nav.blog", { defaultValue: "Blog" }), path: "/blog" },
      { label: t("nav.contact"), path: "/contact" },
      { label: t("nav.aboutUs"), path: "/about" },
    ],
    [t],
  );

  useEffect(() => {
    document.body.classList.toggle("mobile-menu-open", isMenuOpen);
    document.body.classList.toggle("language-modal-open", isLanguageOpen);

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLanguageOpen(false);
        setIsMenuOpen(false);
        setIsAccountOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.classList.remove("mobile-menu-open");
      document.body.classList.remove("language-modal-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isLanguageOpen, isMenuOpen]);

  useEffect(() => {
    if (!isAccountOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setIsAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isAccountOpen]);

  const accountTitle = t("nav.account", { defaultValue: "My account" });
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || accountTitle;
  const accountEmail = profile?.email || user?.email || "";
  const profilePhotoUrl = getProfileAvatarUrl({
    profile,
    partnerProfile,
    user,
    preferUserMetadata: Boolean(adminAccess?.isAdminUser),
  });
  const avatarImageUrl = profilePhotoUrl && !hasAvatarLoadError ? profilePhotoUrl : "";
  const avatarInitials = getInitials(displayName);
  const profilePath = resolveProfilePath(profile, partnerProfile, adminAccess);
  const shouldShowAvatarPhoto = isAuthenticated && Boolean(avatarImageUrl);
  const shouldShowAvatarInitials = isAuthenticated && !avatarImageUrl;

  useEffect(() => {
    setHasAvatarLoadError(false);
  }, [profilePhotoUrl]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    setIsAccountOpen(false);
  };
  const startClaim = () => {
    setIsMenuOpen(false);
    setIsLanguageOpen(false);
    setIsAccountOpen(false);
  };

  const openLanguageModal = () => setIsLanguageOpen(true);
  const closeLanguageModal = () => setIsLanguageOpen(false);
  const selectLanguage = (languageCode) => {
    if (languageCode !== currentLanguage) {
      setStoredLanguage(languageCode);
      void loadLanguageResources(languageCode)
        .then(() => i18n.changeLanguage(languageCode))
        .catch(() => null);
      navigate(replaceLanguageInPath(`${location.pathname}${location.search}${location.hash}`, languageCode));
    }

    if (isAuthenticated && (normalizedRole === "client" || normalizedRole === "partner")) {
      void updatePreferredLanguage(languageCode).catch(() => null);
    }

    setIsLanguageOpen(false);
    setIsMenuOpen(false);
    setIsAccountOpen(false);
  };
  const toggleAccountMenu = () => {
    setIsAccountOpen((current) => !current);
    setIsLanguageOpen(false);
  };
  const handleAccountMouseEnter = () => {
    if (typeof window !== "undefined" && window.innerWidth > 1140) {
      setIsAccountOpen(true);
    }
  };
  const handleAccountMouseLeave = () => {
    if (typeof window !== "undefined" && window.innerWidth > 1140) {
      setIsAccountOpen(false);
    }
  };
  const handleSignOut = async () => {
    setIsAccountOpen(false);
    setIsMenuOpen(false);
    await signOut();
    navigate(replaceLanguageInPath("/", currentLanguage));
  };

  return (
    <header className={`site-header${isMenuOpen ? " is-menu-open" : ""}`}>
      <nav className="navbar" aria-label={t("nav.mainNavigation")}>
        <LocalizedLink to="/" className="brand" aria-label={t("common.flyFriendlyHomeAria")} onClick={closeMenu}>
          <img className="brand__icon" src={logoImage} alt="" width={40} height={40} decoding="async" />
          <img className="brand__text" src={logoText} alt="Fly Friendly" width={110} height={20} decoding="async" />
        </LocalizedLink>
        <div className="nav-links">
          {navLinks.map((item) => (
            <LocalizedNavLink key={item.path} to={item.path}>{item.label}</LocalizedNavLink>
          ))}
        </div>
        <div className="nav-actions">
          <LanguageSwitcher
            currentLanguage={currentLanguage}
            isOpen={isLanguageOpen}
            onOpen={openLanguageModal}
            onClose={closeLanguageModal}
            onSelectLanguage={selectLanguage}
          />

          <div className="account-menu" ref={accountMenuRef} onMouseEnter={handleAccountMouseEnter} onMouseLeave={handleAccountMouseLeave}>
            <button
              type="button"
              className={`account-entry${avatarImageUrl ? " account-entry--with-photo" : ""}`}
              aria-label={accountTitle}
              aria-haspopup="menu"
              aria-expanded={isAccountOpen}
              onClick={toggleAccountMenu}
            >
              {shouldShowAvatarPhoto ? (
                <img
                  className="account-entry__photo"
                  src={avatarImageUrl}
                  alt=""
                  width={44}
                  height={44}
                  decoding="async"
                  onError={() => setHasAvatarLoadError(true)}
                />
              ) : shouldShowAvatarInitials ? (
                <span className="account-entry__initials">{avatarInitials}</span>
              ) : (
                <User size={28} strokeWidth={2} />
              )}
            </button>

            {isAccountOpen ? (
              <div className="account-dropdown" role="menu" aria-label={accountTitle}>
                {isAuthenticated ? (
                  <>
                    <LocalizedLink
                      className="account-dropdown__identity account-dropdown__identity--link"
                      to={profilePath}
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <div className="account-dropdown__avatar" aria-hidden="true">
                        {avatarImageUrl ? (
                          <img src={avatarImageUrl} alt="" width={64} height={64} loading="lazy" decoding="async" onError={() => setHasAvatarLoadError(true)} />
                        ) : (
                          <span className="account-dropdown__avatar-initials">{avatarInitials}</span>
                        )}
                      </div>
                      <div className="account-dropdown__identity-copy">
                        <span className="account-dropdown__eyebrow">{accountTitle}</span>
                        <strong>{displayName}</strong>
                        {accountEmail ? <span className="account-dropdown__identity-email">{accountEmail}</span> : null}
                      </div>
                    </LocalizedLink>
                    <div className="account-dropdown__row">
                      <button className="account-dropdown__ghost" type="button" role="menuitem" onClick={handleSignOut}>
                        <LogOut size={18} strokeWidth={2} />
                        <span>{t("clientPortal.signOut", { defaultValue: "Sign out" })}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="account-dropdown__guest">
                    <LocalizedLink className="account-dropdown__primary btn-primary" to="/auth/login" role="menuitem" onClick={closeMenu}>
                      {t("claimModal.logIn", { defaultValue: "Sign in" })}
                    </LocalizedLink>
                    <p className="account-dropdown__guest-copy">
                      {t("auth.login.registerPrompt", { defaultValue: "Need an account?" })}
                    </p>
                    <LocalizedLink className="account-dropdown__guest-register" to="/auth/register" role="menuitem" onClick={closeMenu}>
                      {t("claimModal.signUp", { defaultValue: "Sign Up" })}
                    </LocalizedLink>
                    <div className="account-dropdown__divider" aria-hidden="true" />
                    <LocalizedLink className="account-dropdown__status-link" to="/auth/login" role="menuitem" onClick={closeMenu}>
                      <span>{t("clientPortal.claim.viewStatus", { defaultValue: "View claim status" })}</span>
                      <ChevronDown size={16} strokeWidth={2.2} />
                    </LocalizedLink>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <MobileLanguagePicker
          currentLanguage={currentLanguage}
          isOpen={isLanguageOpen}
          onToggle={() => setIsLanguageOpen((current) => !current)}
          onSelectLanguage={selectLanguage}
          compact
        />
        <button
          className="menu-toggle"
          type="button"
          aria-label={isMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <span className="menu-toggle__icon" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </nav>
      <div className="mobile-menu" aria-hidden={!isMenuOpen}>
        <div className="mobile-menu__content">
          <h2>
            {t("nav.mobileHeadlinePrefix")}<br />
            <span>{t("nav.mobileHeadlineAccent")}</span>.
          </h2>

          <div className="mobile-menu__links">
            {navLinks.map((item) => (
              <LocalizedNavLink key={item.path} to={item.path} onClick={closeMenu}>
                {item.label}
              </LocalizedNavLink>
            ))}
            {isAuthenticated ? (
              <div className="mobile-menu__account-row">
                <LocalizedLink className="mobile-menu__account-card" to={profilePath} onClick={closeMenu}>
                  <div className="mobile-menu__account-avatar" aria-hidden="true">
                    {avatarImageUrl ? (
                      <img src={avatarImageUrl} alt="" width={52} height={52} loading="lazy" decoding="async" onError={() => setHasAvatarLoadError(true)} />
                    ) : (
                      <span className="mobile-menu__account-initials">{avatarInitials}</span>
                    )}
                  </div>
                  <div className="mobile-menu__account-copy">
                    <strong>{displayName}</strong>
                    {accountEmail ? <small>{accountEmail}</small> : null}
                  </div>
                </LocalizedLink>
                <button
                  type="button"
                  className="mobile-menu__account-signout"
                  aria-label={t("clientPortal.signOut", { defaultValue: "Sign out" })}
                  onClick={handleSignOut}
                >
                  <LogOut size={20} strokeWidth={2.1} />
                </button>
              </div>
            ) : (
              <LocalizedLink to="/auth/login" onClick={closeMenu}>
                {t("claimModal.logIn", { defaultValue: "Sign in" })}
              </LocalizedLink>
            )}
          </div>

          <LocalizedLink className="mobile-menu__claim" to="/claim/eligibility" onClick={startClaim}>
            {t("common.startYourClaim")}
          </LocalizedLink>

          <div className="mobile-menu__socials" aria-label={t("footer.socialAria")}>
            {socialLinks.map((item) => (
              <a key={item.label} href={item.href} aria-label={item.label}>
                <SocialIcon name={item.icon} size={18} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
