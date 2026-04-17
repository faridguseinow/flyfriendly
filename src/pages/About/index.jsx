import SectionLabel from "../../components/SectionLabel/index.jsx";
import { BadgeCheck, ClipboardCheck, FileText, HeartHandshake, Route, ShieldCheck, Sparkles } from "lucide-react";
import "./style.scss";

const values = [
  ["Transparency", "Clear steps, practical explanations, and status updates that make the claim process easier to follow."],
  ["Simplicity", "A guided flow that helps travelers move from disruption to submitted claim without unnecessary friction."],
  ["Security", "Careful handling of passenger details, uploaded documents, and case information throughout the process."],
  ["User-first", "Built for real passengers who need practical support after stressful travel disruptions."],
];

const steps = [
  ["1", "Enter details", "Provide flight, route, disruption, and passenger information."],
  ["2", "Upload documents", "Add booking confirmation, boarding pass, airline messages, or ID if needed."],
  ["3", "Submit", "Send the claim for review and airline communication."],
  ["4", "Track status", "Follow updates until the case is resolved or closed."],
];

const featureIcons = [ClipboardCheck, FileText, Route];

function About() {
  return (
    <>
      <section className="about-hero section">
        <SectionLabel icon={HeartHandshake}>About Fly Friendly</SectionLabel>
        <h1>A simpler way to manage flight disruption claims</h1>
        <p>
          Fly Friendly helps travelers organize claim information, upload required documents,
          and track progress in one clear, step-by-step flow.
        </p>
        <div className="about-hero__actions">
          <a href="#" className="btn btn-primary">Start a Claim</a>
          <a href="/contact" className="btn about-btn-secondary">Contact</a>
        </div>
      </section>

      <section className="about-mission band">
        <div className="about-mission__inner">
          <article>
            <SectionLabel icon={BadgeCheck}>Our Mission</SectionLabel>
            <h2>Make passenger rights easier to use</h2>
            <p>
              We turn a complex compensation process into a guided experience. From eligibility checks
              to document uploads and case tracking, our work is focused on clarity, speed, and trust.
            </p>
          </article>
          <article className="about-stat-card">
            <strong>€600</strong>
            <span>Potential compensation for eligible disrupted flights.</span>
            <a href="#" className="btn btn-primary">Check Compensation</a>
          </article>
        </div>
      </section>

      <section className="about-section section">
        <SectionLabel icon={ClipboardCheck}>What We Do</SectionLabel>
        <h2>Practical support from first check to final update</h2>
        <div className="about-feature-grid">
          {[
            ["Eligibility Check", "We help passengers understand whether a delay, cancellation, denied boarding, or missed connection may qualify."],
            ["Document Flow", "Travelers can prepare the details and documents needed to support a compensation case."],
            ["Case Handling", "Fly Friendly can manage airline communication and keep the claim process organized."],
          ].map(([title, text], index) => {
            const FeatureIcon = featureIcons[index];
            return (
              <article key={title}>
                <span><FeatureIcon size={24} strokeWidth={2} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="about-section section">
        <SectionLabel icon={ShieldCheck}>Our Values</SectionLabel>
        <h2>Built around trust, clarity, and action</h2>
        <div className="about-value-grid">
          {values.map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-process band">
        <div className="about-process__inner">
          <SectionLabel icon={Sparkles}>How It Works</SectionLabel>
          <h2>Four clear stages</h2>
          <div className="about-step-grid">
            {steps.map(([number, title, text]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-help section">
        <h2>Need help?</h2>
        <p>Reach out to our team and we will guide you through the next steps.</p>
        <a href="/contact" className="btn btn-primary">Contact</a>
        <small>Disclaimer: This page is for informational purposes. Eligibility and claim requirements may vary by route, airline, and local regulations.</small>
      </section>
    </>
  );
}

export default About;
