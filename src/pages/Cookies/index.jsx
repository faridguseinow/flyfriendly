import { Trans, useTranslation } from "react-i18next";
import { useLocation, useParams } from "react-router-dom";
import SeoHead from "../../components/SeoHead.jsx";
import { DEFAULT_LANGUAGE } from "../../i18n/languages.js";
import { localizePath } from "../../i18n/path.js";
import { BRAND_NAME, buildSeoPayload } from "../../lib/seo.js";
import "../Legal/style.scss";

function Cookies() {
  const { t } = useTranslation();
  const location = useLocation();
  const { lang } = useParams();
  const locale = lang || DEFAULT_LANGUAGE;
  const sections = t("legal.cookies.sections", { returnObjects: true });
  const seo = buildSeoPayload({
    lang: locale,
    title: `${t("legal.cookies.title")} | ${BRAND_NAME}`,
    description: t("legal.cookies.intro"),
    pathname: location.pathname,
    canonicalPath: localizePath("/cookies", locale),
    alternatesPath: "/cookies",
  });

  return (
    <main className="legal-page">
      <SeoHead {...seo} />
      <header className="legal-hero">
        <h1>{t("legal.cookies.title")}</h1>
        <p>{t("legal.cookies.intro")}</p>
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
        <p className="legal-note">{t("legal.cookies.note")}</p>
      </article>
    </main>
  );
}

export default Cookies;
