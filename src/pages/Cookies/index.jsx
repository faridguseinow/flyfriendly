import SectionLabel from "../../components/SectionLabel/index.jsx";
import { Scale } from "lucide-react";
import "../Legal/style.scss";

function Cookies() {
  return (
    <main className="legal-page">
      <header className="legal-hero">
        <SectionLabel icon={Scale}>Legal</SectionLabel>
        <h1>Cookies Policy</h1>
        <p>
          This policy explains how Fly Friendly may use cookies and similar technologies
          to keep the website working, understand usage, improve performance, and support marketing.
        </p>
        <span className="legal-updated">Last updated: April 16, 2026</span>
      </header>

      <article className="legal-content">
        <section>
          <h2>1. What cookies are</h2>
          <p>
            Cookies are small text files stored on your device when you visit a website.
            Similar technologies include local storage, pixels, tags, and analytics identifiers.
          </p>
        </section>
        <section>
          <h2>2. Types of cookies we may use</h2>
          <ul>
            <li><strong>Essential cookies:</strong> Required for navigation, security, forms, and core website functions.</li>
            <li><strong>Preference cookies:</strong> Remember choices such as language or display settings.</li>
            <li><strong>Analytics cookies:</strong> Help us understand page visits, traffic sources, and how users interact with the website.</li>
            <li><strong>Marketing cookies:</strong> May help measure campaigns, referral activity, or newsletter performance.</li>
          </ul>
        </section>
        <section>
          <h2>3. Why we use cookies</h2>
          <p>
            Cookies help us keep the site reliable, improve the claim journey, understand which pages are useful,
            detect technical issues, and measure the performance of content such as referral and newsletter campaigns.
          </p>
        </section>
        <section>
          <h2>4. Third-party tools</h2>
          <p>
            We may use third-party providers for analytics, hosting, forms, security, and marketing measurement.
            These providers may set cookies or collect technical data according to their own policies.
          </p>
        </section>
        <section>
          <h2>5. Managing cookies</h2>
          <p>
            You can block, delete, or restrict cookies through your browser settings. Some essential website
            functions may not work correctly if cookies are disabled.
          </p>
        </section>
        <section>
          <h2>6. Contact</h2>
          <p>
            Questions about cookies can be sent to <a href="mailto:support@fly-friendly.com">support@fly-friendly.com</a>.
          </p>
        </section>
        <p className="legal-note">
          This Cookies Policy is a draft based on the Fly Friendly website model and should be reviewed before production use.
        </p>
      </article>
    </main>
  );
}

export default Cookies;
