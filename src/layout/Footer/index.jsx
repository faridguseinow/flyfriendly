import { useTranslation } from "react-i18next";
import SocialIcon from "../../components/SocialIcon/index.jsx";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { socialLinks } from "../../constants/site.js";
import "./style.scss";

function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="footer">
      <div className="footer__glow footer__glow--left" aria-hidden="true" />
      <div className="footer__glow footer__glow--center" aria-hidden="true" />
      <div className="footer__content">
        <div className="footer__lead">
          <LocalizedLink to="/" className="footer__brand" aria-label={t("common.flyFriendlyHomeAria")}>
            <img src={logoImage} alt="" />
            <img src={logoText} alt="Fly Friendly" />
          </LocalizedLink>
          <h2>{t("footer.leadTitle")}</h2>
          <p>{t("footer.leadText")}</p>
          <span className="footer__follow">{t("footer.followUs")}</span>
          <div className="socials" aria-label={t("footer.socialAria")}>
            {socialLinks.map((item) => (
              <a key={item.label} href={item.href} aria-label={item.label}>
                <SocialIcon name={item.icon} />
              </a>
            ))}
          </div>
        </div>
        <div className="footer-links">
          <div>
            <h3>{t("footer.company")}</h3>
            <LocalizedLink to="/about">{t("common.aboutUs")}</LocalizedLink>
            <LocalizedLink to="/claim/eligibility">{t("footer.compensation")}</LocalizedLink>
            <LocalizedLink to="/referralProgram">{t("footer.referralProgram")}</LocalizedLink>
            <LocalizedLink to="/contact">{t("common.contact")}</LocalizedLink>
          </div>
          <div>
            <h3>{t("footer.resources")}</h3>
            <LocalizedLink to="/terms">{t("common.termsOfUse")}</LocalizedLink>
            <LocalizedLink to="/privacyPolicy">{t("common.privacyPolicy")}</LocalizedLink>
            <LocalizedLink to="/cookies">{t("common.cookies")}</LocalizedLink>
            <LocalizedLink to="/contact">{t("common.support")}</LocalizedLink>
          </div>
          <div>
            <h3>{t("footer.claimHelp")}</h3>
            <LocalizedLink to="/claim/eligibility">{t("footer.checkCompensation")}</LocalizedLink>
            <LocalizedLink to="/claim/eligibility">{t("footer.delayedFlights")}</LocalizedLink>
            <LocalizedLink to="/claim/eligibility">{t("footer.cancelledFlights")}</LocalizedLink>
            <LocalizedLink to="/claim/eligibility">{t("footer.missedConnections")}</LocalizedLink>
          </div>
        </div>
      </div>
      <div className="footer__bottom">
        <strong>Fly Friendly</strong>
        <span>{t("footer.copyright")}</span>
      </div>
    </footer>
  );
}

export default Footer;
