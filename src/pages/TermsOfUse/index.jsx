import { Trans, useTranslation } from "react-i18next";
import { useLocation, useParams } from "react-router-dom";
import SeoHead from "../../components/SeoHead.jsx";
import { DEFAULT_LANGUAGE } from "../../i18n/languages.js";
import { localizePath } from "../../i18n/path.js";
import { BRAND_NAME, buildSeoPayload } from "../../lib/seo.js";
import "../Legal/style.scss";

function TermsOfUse() {
  const { t } = useTranslation();
  const location = useLocation();
  const { lang } = useParams();
  const locale = lang || DEFAULT_LANGUAGE;
  const sections = t("legal.terms.sections", { returnObjects: true });
  const isAliasRoute = location.pathname.endsWith("/termsOfUse");
  const seo = buildSeoPayload({
    lang: locale,
    title: `${t("legal.terms.title")} | ${BRAND_NAME}`,
    description: t("legal.terms.intro"),
    pathname: location.pathname,
    canonicalPath: localizePath("/terms", locale),
    alternatesPath: "/terms",
    indexable: !isAliasRoute,
  });

  return (
    <main className="legal-page">
      <SeoHead {...seo} />
      <header className="legal-hero">
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
