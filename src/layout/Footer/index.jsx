import { Link } from "react-router-dom";
import SocialIcon from "../../components/SocialIcon/index.jsx";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { socialLinks } from "../../constants/site.js";
import "./style.scss";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__glow footer__glow--left" aria-hidden="true" />
      <div className="footer__glow footer__glow--center" aria-hidden="true" />
      <div className="footer__content">
        <div className="footer__lead">
          <Link to="/" className="footer__brand" aria-label="Fly Friendly home">
            <img src={logoImage} alt="" />
            <img src={logoText} alt="Fly Friendly" />
          </Link>
          <h2>3 Simple Steps to Your Compensation</h2>
          <p>Compensation news, travel tips, and passenger rights delivered monthly.</p>
          <span className="footer__follow">Follow us:</span>
          <div className="socials" aria-label="Social links">
            {socialLinks.map((item) => (
              <a key={item.label} href={item.href} aria-label={item.label}>
                <SocialIcon name={item.icon} />
              </a>
            ))}
          </div>
        </div>
        <div className="footer-links">
          <div>
            <h3>Company</h3>
            <Link to="/about">About us</Link>
            <Link to="/claim/eligibility">Compensation</Link>
            <Link to="/referralProgram">Referral Program</Link>
            <Link to="/contact">Contact</Link>
          </div>
          <div>
            <h3>Resources</h3>
            <Link to="/terms">Terms of Use</Link>
            <Link to="/privacyPolicy">Privacy Policy</Link>
            <Link to="/cookies">Cookies</Link>
            <Link to="/contact">Support</Link>
          </div>
          <div>
            <h3>Claim Help</h3>
            <Link to="/claim/eligibility">Check compensation</Link>
            <Link to="/claim/eligibility">Delayed flights</Link>
            <Link to="/claim/eligibility">Cancelled flights</Link>
            <Link to="/claim/eligibility">Missed connections</Link>
          </div>
        </div>
      </div>
      <div className="footer__bottom">
        <strong>Fly Friendly</strong>
        <span>©2026 Fly Friendly</span>
      </div>
    </footer>
  );
}

export default Footer;
