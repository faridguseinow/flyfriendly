import { ArrowRight, CalendarDays, Newspaper, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { DEFAULT_LANGUAGE } from "../../i18n/languages.js";
import { fetchPublishedBlogPosts } from "../../services/blogService.js";
import { getArticles } from "./articles.js";
import "./style.scss";

function Blog() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const locale = lang || DEFAULT_LANGUAGE;
  const [query, setQuery] = useState("");
  const [cmsArticles, setCmsArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const fallbackArticles = getArticles(
    t("home.articles", { returnObjects: true }),
    t("blog.articleDetails", { returnObjects: true }),
  );
  const articles = cmsArticles.length ? cmsArticles : fallbackArticles;

  useEffect(() => {
    let isActive = true;

    async function loadPosts() {
      setIsLoading(true);
      try {
        const result = await fetchPublishedBlogPosts(locale);
        if (isActive) {
          setCmsArticles(result.posts);
        }
      } catch (error) {
        console.warn("Could not load blog posts from Supabase.", error);
        if (isActive) {
          setCmsArticles([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadPosts();

    return () => {
      isActive = false;
    };
  }, [locale]);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return articles;

    return articles.filter((article) => (
      `${article.title} ${article.text} ${article.date}`.toLowerCase().includes(normalizedQuery)
    ));
  }, [articles, query]);

  return (
    <>
      <section className="blog-hero section">
        <SectionLabel icon={Newspaper}>{t("home.resourcesLabel")}</SectionLabel>
        <h1>{t("home.resourcesTitle")}</h1>
        <p>{t("home.resourcesText")}</p>
        <form className="blog-search" role="search">
          <Search size={22} strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("blog.searchPlaceholder", { defaultValue: "Search travel guides" })}
            aria-label={t("blog.searchAria", { defaultValue: "Search blog posts" })}
          />
        </form>
      </section>

      <section className="blog-list section">
        {isLoading ? <p className="blog-loading">{t("blog.loading", { defaultValue: "Loading articles..." })}</p> : null}
        <div className="blog-grid">
          {filteredArticles.map((article) => (
            <LocalizedLink className="blog-card" to={`/blog/${article.slug}`} key={article.title}>
              <img src={article.image} alt="" />
              <div className="blog-card__content">
                <time><CalendarDays size={18} strokeWidth={2} aria-hidden="true" /> {article.date}</time>
                <h2>{article.title}</h2>
                <p>{article.text}</p>
                <span className="blog-card__link">{t("blog.readArticle", { defaultValue: "Read article" })} <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></span>
              </div>
            </LocalizedLink>
          ))}
        </div>

        {filteredArticles.length === 0 ? (
          <div className="blog-empty">
            <SectionLabel icon={Search}>{t("blog.noResultsLabel", { defaultValue: "No results" })}</SectionLabel>
            <h2>{t("blog.noResultsTitle", { defaultValue: "No matching guides yet" })}</h2>
            <p>{t("blog.noResultsText", { defaultValue: "Try a different keyword or explore our latest air passenger rights resources." })}</p>
          </div>
        ) : null}
      </section>

      <section className="blog-cta band">
        <div className="blog-cta__inner">
          <SectionLabel icon={Sparkles}>{t("common.checkCompensation")}</SectionLabel>
          <h2>{t("home.calculatorTitle")}</h2>
          <p>{t("home.calculatorText")}</p>
          <LocalizedLink to="/claim/eligibility" className="btn btn-primary">{t("common.startYourClaim")}</LocalizedLink>
        </div>
      </section>
    </>
  );
}

export default Blog;
