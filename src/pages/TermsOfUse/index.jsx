import { Trans, useTranslation } from "react-i18next";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { Scale } from "lucide-react";
import "../Legal/style.scss";

function TermsOfUse() {
  const { t } = useTranslation();
  const sections = t("legal.terms.sections", { returnObjects: true });

  return (
    <main className="legal-page">
      <header className="legal-hero">
        <SectionLabel icon={Scale}>{t("legal.label")}</SectionLabel>
        <h1>{t("legal.terms.title")}</h1>
        <p>{t("legal.terms.intro")}</p>
        <span className="legal-updated">{t("legal.updated")}</span>
      </header>

      <article className="legal-content">
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.text ? (
              <p>
                <Trans
                  defaults={section.text}
                  components={{ emailLink: <a href="mailto:info@fly-friendly.com" /> }}
                />
              </p>
            ) : null}
            {section.items ? (
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
        <p className="legal-note">{t("legal.terms.note")}</p>
      </article>
    </main>
  );
}

export default TermsOfUse;
