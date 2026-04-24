import SectionLabel from "../../components/SectionLabel/index.jsx";
import { Scale } from "lucide-react";
import "../Legal/style.scss";

function PrivacyPolicy() {
  return (
    <main className="legal-page">
      <header className="legal-hero">
        <SectionLabel icon={Scale}>Legal</SectionLabel>
        <h1>Privacy Policy</h1>
        <p>
          This policy explains how Fly Friendly collects, uses, stores, and protects information
          when you use our flight compensation website, claim flow, contact forms, and newsletter.
        </p>
        <span className="legal-updated">Last updated: April 16, 2026</span>
      </header>

      <article className="legal-content">
        <section>
          <h2>1. Who we are</h2>
          <p>
            Fly Friendly is a flight compensation support service. We help passengers check potential
            eligibility, submit flight disruption details, upload supporting documents, and track claim progress.
          </p>
        </section>
        <section>
          <h2>2. Information we collect</h2>
          <p>Depending on how you use the website, we may collect:</p>
          <ul>
            <li>Contact details such as name, email address, phone number, and message content.</li>
            <li>Flight and claim details such as airline, route, dates, delay length, cancellation details, booking reference, and case status.</li>
            <li>Documents you choose to upload, such as booking confirmations, boarding passes, airline notices, or identity information if required for a claim.</li>
            <li>Technical information such as device type, browser, IP address, pages visited, and cookie identifiers.</li>
            <li>Newsletter and marketing preferences if you subscribe to updates.</li>
          </ul>
        </section>
        <section>
          <h2>3. How we use information</h2>
          <ul>
            <li>To assess and manage flight compensation claims.</li>
            <li>To communicate with you about your case, support request, or submitted message.</li>
            <li>To prepare claim documentation and communicate with airlines or relevant parties when needed.</li>
            <li>To improve website performance, user experience, fraud prevention, and security.</li>
            <li>To send newsletters or updates only when you have subscribed or otherwise permitted this.</li>
          </ul>
        </section>
        <section>
          <h2>4. Sharing information</h2>
          <p>
            We may share information with airlines, legal or operational partners, payment providers,
            analytics providers, hosting providers, and other service providers only when necessary for
            claim handling, website operation, compliance, or support.
          </p>
        </section>
        <section>
          <h2>5. Retention and security</h2>
          <p>
            We keep information only as long as reasonably needed for the purpose it was collected,
            including claim handling, record keeping, legal obligations, dispute resolution, and fraud prevention.
            We use reasonable organizational and technical measures to protect personal information.
          </p>
        </section>
        <section>
          <h2>6. Your rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct, delete, restrict, or object
            to certain processing of your personal information. You may also withdraw marketing consent.
            To make a request, contact <a href="mailto:info@fly-friendly.com">info@fly-friendly.com</a>.
          </p>
        </section>
        <section>
          <h2>7. Contact</h2>
          <p>
            Questions about privacy can be sent to <a href="mailto:info@fly-friendly.com">info@fly-friendly.com</a>.
          </p>
        </section>
        <p className="legal-note">
          This page is a practical website policy draft based on the Fly Friendly service model. It should be reviewed by counsel before production use.
        </p>
      </article>
    </main>
  );
}

export default PrivacyPolicy;
