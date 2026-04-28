import SectionLabel from "../../components/SectionLabel/index.jsx";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { BadgeCheck, ClipboardCheck, FileText, HeartHandshake, Route, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./style.scss";

const featureIcons = [ClipboardCheck, FileText, Route];

function About() {
  const { t } = useTranslation();
  const values = t("about.values", { returnObjects: true });
  const steps = t("about.processSteps", { returnObjects: true });
  const whatWeDoItems = t("about.whatWeDoItems", { returnObjects: true });

  return (
    <>
      <section className="about-hero section">
        <SectionLabel icon={HeartHandshake}>{t("about.heroLabel")}</SectionLabel>
        <h1>{t("about.heroTitle")}</h1>
        <p>{t("about.heroText")}</p>
        <div className="about-hero__actions">
          <LocalizedLink to="/claim/eligibility" className="btn btn-primary">{t("about.startClaim")}</LocalizedLink>
          <LocalizedLink to="/contact" className="btn about-btn-secondary">{t("common.contact")}</LocalizedLink>
        </div>
      </section>

      <section className="about-mission band">
        <div className="about-mission__inner">
          <article>
            <SectionLabel icon={BadgeCheck}>{t("about.missionLabel")}</SectionLabel>
            <h2>{t("about.missionTitle")}</h2>
            <p>{t("about.missionText")}</p>
          </article>
          <article className="about-stat-card">
            <strong>€600</strong>
            <span>{t("about.missionStatText")}</span>
            <LocalizedLink to="/claim/eligibility" className="btn btn-primary">{t("common.checkCompensation")}</LocalizedLink>
          </article>
        </div>
      </section>

      <section className="about-section section">
        <SectionLabel icon={ClipboardCheck}>{t("about.whatWeDoLabel")}</SectionLabel>
        <h2>{t("about.whatWeDoTitle")}</h2>
        <div className="about-feature-grid">
          {whatWeDoItems.map(({ title, text }, index) => {
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
        <SectionLabel icon={ShieldCheck}>{t("about.valuesLabel")}</SectionLabel>
        <h2>{t("about.valuesTitle")}</h2>
        <div className="about-value-grid">
          {values.map(({ title, text }) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-process band">
        <div className="about-process__inner">
          <SectionLabel icon={Sparkles}>{t("about.processLabel")}</SectionLabel>
          <h2>{t("about.processTitle")}</h2>
          <div className="about-step-grid">
            {steps.map(({ number, title, text }) => (
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
        <h2>{t("about.helpTitle")}</h2>
        <p>{t("about.helpText")}</p>
        <LocalizedLink to="/contact" className="btn btn-primary">{t("common.contact")}</LocalizedLink>
        <small>{t("about.disclaimer")}</small>
      </section>
    </>
  );
}

export default About;
