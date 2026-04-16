import { Link } from "react-router-dom";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { socialLinks } from "../../constants/site.js";
import "./style.scss";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__content">
        <div>
          <Link to="/" className="footer__brand" aria-label="Fly Friendly home">
            <img src={logoImage} alt="" />
            <img src={logoText} alt="Fly Friendly" />
          </Link>
          <h2>3 Simple Steps to Your Compensation</h2>
          <p>Compensation news, travel tips, and passenger rights delivered monthly.</p>
          <span className="footer__follow">Follow us:</span>
          <div className="socials" aria-label="Social links">
            {socialLinks.map((item) => (
              <a key={item.label} href={item.href} aria-label={item.label}>{item.text}</a>
            ))}
          </div>
        </div>
        <div className="footer-links">
          <div><h3>Company</h3><Link to="/about">About us</Link><a href="#">Pricing</a><a href="#">Blog</a><a href="#">Services</a></div>
          <div><h3>Our Products</h3><a href="#">Compensation</a><Link to="/referralProgram">Referral Program</Link><a href="#">Our Fee</a></div>
          <div><h3>Support</h3><Link to="/contact">Contact</Link><a href="#">Partners</a><Link to="/privacyPolicy">Privacy Policy</Link><Link to="/terms">Terms of Use</Link><Link to="/cookies">Cookies</Link></div>
        </div>
      </div>
      <div className="footer__bottom">
        <strong>Fly Friendly</strong>
        <span>©2025 Fly Friendly</span>
      </div>
    </footer>
  );
}

export default Footer;
