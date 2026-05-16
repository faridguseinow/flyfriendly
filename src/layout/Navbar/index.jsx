import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CircleUserRound, LogOut, UserRound, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SocialIcon from "../../components/SocialIcon/index.jsx";
import { LocalizedLink, LocalizedNavLink } from "../../components/LocalizedLink.jsx";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { socialLinks } from "../../constants/site.js";
import { getLanguageByCode, languages } from "../../i18n/languages.js";
import { replaceLanguageInPath } from "../../i18n/path.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { resolveProfilePath } from "../../auth/routeUtils.js";
import "./style.scss";

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
        <span className="language-current__flag" aria-hidden="true">{currentLanguageOption.flag}</span>
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
                    <span className="language-option__flag" aria-hidden="true">{language.flag}</span>
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
                    <span className="language-option__flag" aria-hidden="true">{language.flag}</span>
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

function MobileLanguagePicker({ currentLanguage, isOpen, onToggle, onSelectLanguage }) {
  const { t } = useTranslation();
  const currentLanguageOption = getLanguageByCode(currentLanguage);
  const mainLanguages = useMemo(() => languages.filter((language) => language.group === "main"), []);
  const additionalLanguages = useMemo(() => languages.filter((language) => language.group === "additional"), []);

  return (
    <section className={`mobile-language-picker${isOpen ? " is-open" : ""}`} aria-label={t("languageSwitcher.title")}>
      <button className="mobile-language-picker__trigger" type="button" onClick={onToggle} aria-expanded={isOpen}>
        <span className="mobile-language-picker__label">{t("languageSwitcher.title")}</span>
        <span className="mobile-language-picker__current">
          <span aria-hidden="true">{currentLanguageOption.flag}</span>
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
                  <span className="mobile-language-picker__flag" aria-hidden="true">{language.flag}</span>
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
                  <span className="mobile-language-picker__flag" aria-hidden="true">{language.flag}</span>
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
  const { t } = useTranslation();
  const { isAuthenticated, adminAccess, dashboardPath, partnerProfile, profile, user, signOut } = useAuth();
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
  const profileLabel = t("nav.myProfile", { defaultValue: "My profile" });
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || accountTitle;
  const accountEmail = profile?.email || user?.email || "";
  const profilePhotoUrl = getIdentityAvatarUrl(profile, user);
  const avatarImageUrl = profilePhotoUrl && !hasAvatarLoadError ? profilePhotoUrl : "";
  const profilePath = resolveProfilePath(profile, partnerProfile, adminAccess);

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
      navigate(replaceLanguageInPath(`${location.pathname}${location.search}${location.hash}`, languageCode));
    }

    setIsLanguageOpen(false);
    setIsMenuOpen(false);
    setIsAccountOpen(false);
  };
  const toggleAccountMenu = () => {
    setIsAccountOpen((current) => !current);
    setIsLanguageOpen(false);
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
          <img className="brand__icon" src={logoImage} alt="" />
          <img className="brand__text" src={logoText} alt="Fly Friendly" />
        </LocalizedLink>
        <div className="nav-links">
          {navLinks.map((item) => (
            <LocalizedNavLink key={item.path} to={item.path}>{item.label}</LocalizedNavLink>
          ))}
        </div>
        <div className="nav-actions">
          <div className="account-menu" ref={accountMenuRef}>
            <button
              type="button"
              className={`account-entry${avatarImageUrl ? " account-entry--with-photo" : ""}`}
              aria-label={accountTitle}
              aria-haspopup="menu"
              aria-expanded={isAccountOpen}
              onClick={toggleAccountMenu}
            >
              {avatarImageUrl ? (
                <img
                  className="account-entry__photo"
                  src={avatarImageUrl}
                  alt=""
                  onError={() => setHasAvatarLoadError(true)}
                />
              ) : (
                <CircleUserRound size={20} strokeWidth={1.9} />
              )}
            </button>

            {isAccountOpen ? (
              <div className="account-dropdown" role="menu" aria-label={accountTitle}>
                {isAuthenticated ? (
                  <>
                    <div className="account-dropdown__identity">
                      <div className="account-dropdown__avatar" aria-hidden="true">
                        {avatarImageUrl ? (
                          <img src={avatarImageUrl} alt="" onError={() => setHasAvatarLoadError(true)} />
                        ) : (
                          <CircleUserRound size={24} strokeWidth={1.9} />
                        )}
                      </div>
                      <div className="account-dropdown__identity-copy">
                        <span className="account-dropdown__eyebrow">{accountTitle}</span>
                        <strong>{displayName}</strong>
                        {accountEmail ? <span className="account-dropdown__identity-email">{accountEmail}</span> : null}
                      </div>
                    </div>
                    <LocalizedLink className="account-dropdown__link" to={profilePath} role="menuitem" onClick={closeMenu}>
                      <UserRound size={18} strokeWidth={2} />
                      <span>{profileLabel}</span>
                    </LocalizedLink>
                    <div className="account-dropdown__row">
                      <LanguageSwitcher
                        currentLanguage={currentLanguage}
                        isOpen={isLanguageOpen}
                        onOpen={openLanguageModal}
                        onClose={closeLanguageModal}
                        onSelectLanguage={selectLanguage}
                      />
                      <button className="account-dropdown__ghost" type="button" role="menuitem" onClick={handleSignOut}>
                        <LogOut size={18} strokeWidth={2} />
                        <span>{t("clientPortal.signOut", { defaultValue: "Sign out" })}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="account-dropdown__row account-dropdown__row--guest">
                      <LanguageSwitcher
                        currentLanguage={currentLanguage}
                        isOpen={isLanguageOpen}
                        onOpen={openLanguageModal}
                        onClose={closeLanguageModal}
                        onSelectLanguage={selectLanguage}
                      />
                    <LocalizedLink className="account-dropdown__primary" to="/auth/login" role="menuitem" onClick={closeMenu}>
                      {t("claimModal.logIn", { defaultValue: "Sign in" })}
                    </LocalizedLink>
                  </div>
                )}
                <LocalizedLink className="account-dropdown__claim" to="/claim/eligibility" role="menuitem" onClick={startClaim}>
                  {t("common.startYourClaim")}
                </LocalizedLink>
              </div>
            ) : null}
          </div>
        </div>
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
              <>
                <div className="mobile-menu__account-card">
                  <div className="mobile-menu__account-avatar" aria-hidden="true">
                    {avatarImageUrl ? (
                      <img src={avatarImageUrl} alt="" onError={() => setHasAvatarLoadError(true)} />
                    ) : (
                      <CircleUserRound size={24} strokeWidth={1.9} />
                    )}
                  </div>
                  <div className="mobile-menu__account-copy">
                    <span>{accountTitle}</span>
                    <strong>{displayName}</strong>
                    {accountEmail ? <small>{accountEmail}</small> : null}
                  </div>
                </div>
                <LocalizedLink to={dashboardPath} onClick={closeMenu}>
                  {accountTitle}
                </LocalizedLink>
                <LocalizedLink to={profilePath} onClick={closeMenu}>
                  {profileLabel}
                </LocalizedLink>
              </>
            ) : (
              <LocalizedLink to="/auth/login" onClick={closeMenu}>
                {t("claimModal.logIn", { defaultValue: "Sign in" })}
              </LocalizedLink>
            )}
          </div>

          <LocalizedLink className="mobile-menu__claim" to="/claim/eligibility" onClick={startClaim}>
            {t("common.startYourClaim")}
          </LocalizedLink>

          <MobileLanguagePicker
            currentLanguage={currentLanguage}
            isOpen={isLanguageOpen}
            onToggle={() => setIsLanguageOpen((current) => !current)}
            onSelectLanguage={selectLanguage}
          />

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
