import SectionLabel from "../../components/SectionLabel/index.jsx";
import { Scale } from "lucide-react";
import "../Legal/style.scss";

function TermsOfUse() {
  return (
    <main className="legal-page">
      <header className="legal-hero">
        <SectionLabel icon={Scale}>Legal</SectionLabel>
        <h1>Terms of Use</h1>
        <p>
          These terms govern your use of the Fly Friendly website, claim submission tools,
          referral pages, newsletter forms, and related online services.
        </p>
        <span className="legal-updated">Last updated: April 16, 2026</span>
      </header>

      <article className="legal-content">
        <section>
          <h2>1. Use of the website</h2>
          <p>
            You may use the website to learn about passenger rights, check potential compensation,
            submit contact requests, and begin a claim. You agree to use the website lawfully and not
            interfere with its operation, security, or availability.
          </p>
        </section>
        <section>
          <h2>2. Claim information</h2>
          <p>
            You are responsible for providing accurate, complete, and up-to-date flight, passenger,
            contact, and document information. Inaccurate information may delay review or prevent claim handling.
          </p>
        </section>
        <section>
          <h2>3. No guarantee of compensation</h2>
          <p>
            Eligibility depends on route, disruption type, delay length, airline responsibility, evidence,
            applicable law, and other factors. Fly Friendly may help assess and pursue claims, but we do not
            guarantee that every submitted case will succeed.
          </p>
        </section>
        <section>
          <h2>4. Fees and payments</h2>
          <p>
            The website describes a success-based approach such as no win, no fee. Any final fee, commission,
            or payment arrangement should be confirmed in the claim agreement or service terms presented during
            the claim process.
          </p>
        </section>
        <section>
          <h2>5. User conduct</h2>
          <ul>
            <li>Do not submit false, misleading, or fraudulent information.</li>
            <li>Do not upload files that contain malware, illegal material, or information you are not authorized to share.</li>
            <li>Do not copy, scrape, disrupt, reverse engineer, or misuse the website.</li>
          </ul>
        </section>
        <section>
          <h2>6. Content and intellectual property</h2>
          <p>
            The Fly Friendly name, website design, text, graphics, and brand assets belong to Fly Friendly
            or its licensors. You may not reuse them commercially without permission.
          </p>
        </section>
        <section>
          <h2>7. Limitation of liability</h2>
          <p>
            The website is provided for general information and service access. To the fullest extent permitted
            by law, Fly Friendly is not liable for indirect losses, unavailable website access, third-party actions,
            airline decisions, or consequences of inaccurate information submitted by users.
          </p>
        </section>
        <section>
          <h2>8. Contact</h2>
          <p>
            For questions about these terms, contact <a href="mailto:info@fly-friendly.com">info@fly-friendly.com</a>.
          </p>
        </section>
        <p className="legal-note">
          This Terms of Use page is a draft based on the site functionality and should be reviewed by counsel before production use.
        </p>
      </article>
    </main>
  );
}

export default TermsOfUse;
