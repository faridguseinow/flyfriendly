import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SocialIcon from "../../components/SocialIcon/index.jsx";
import { LocalizedLink, LocalizedNavLink } from "../../components/LocalizedLink.jsx";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { socialLinks } from "../../constants/site.js";
import { getLanguageByCode, languages } from "../../i18n/languages.js";
import { replaceLanguageInPath } from "../../i18n/path.js";
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
        <span className="language-current__flag" aria-hidden="true">{currentLanguageOption.flag}</span>
        <span className="language-current__code">{currentLanguageOption.code.toUpperCase()}</span>
      </button>

      {isOpen ? (
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
        </div>
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
  const currentLanguage = location.pathname.split("/").filter(Boolean)[0] || "en";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

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
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.classList.remove("mobile-menu-open");
      document.body.classList.remove("language-modal-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isLanguageOpen, isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);
  const startClaim = () => {
    setIsMenuOpen(false);
    setIsLanguageOpen(false);
  };

  const openLanguageModal = () => setIsLanguageOpen(true);
  const closeLanguageModal = () => setIsLanguageOpen(false);
  const selectLanguage = (languageCode) => {
    if (languageCode !== currentLanguage) {
      navigate(replaceLanguageInPath(`${location.pathname}${location.search}${location.hash}`, languageCode));
    }

    setIsLanguageOpen(false);
    setIsMenuOpen(false);
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
          <LanguageSwitcher currentLanguage={currentLanguage} isOpen={isLanguageOpen} onOpen={openLanguageModal} onClose={closeLanguageModal} onSelectLanguage={selectLanguage} />
          <LocalizedLink className="btn btn-primary" to="/claim/eligibility" onClick={startClaim}>{t("common.startYourClaim")}</LocalizedLink>
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
