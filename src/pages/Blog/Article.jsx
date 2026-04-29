import { ArrowLeft, CalendarDays, Clock3, Newspaper } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router-dom";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { DEFAULT_LANGUAGE } from "../../i18n/languages.js";
import { fetchPublishedBlogPosts } from "../../services/blogService.js";
import { getArticles } from "./articles.js";
import "./style.scss";

function BlogArticle() {
  const { t } = useTranslation();
  const { lang, slug } = useParams();
  const locale = lang || DEFAULT_LANGUAGE;
  const [cmsArticles, setCmsArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const fallbackArticles = getArticles(
    t("home.articles", { returnObjects: true }),
    t("blog.articleDetails", { returnObjects: true }),
  );
  const articles = cmsArticles.length ? cmsArticles : fallbackArticles;
  const article = articles.find((item) => item.slug === slug);
  const relatedArticles = articles.filter((item) => item.slug !== slug).slice(0, 2);
  const contentParagraphs = useMemo(
    () => String(article?.content || "").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean),
    [article?.content],
  );

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

  if (!isLoading && !article) {
    return <Navigate to="../blog" replace />;
  }

  if (!article) {
    return <p className="blog-loading article-loading">{t("blog.loading", { defaultValue: "Loading articles..." })}</p>;
  }

  return (
    <>
      <article className="article-page">
        <LocalizedLink to="/blog" className="article-back"><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" /> {t("blog.backToBlog", { defaultValue: "Back to blog" })}</LocalizedLink>
        <SectionLabel icon={Newspaper}>{t("home.resourcesLabel")}</SectionLabel>
        <h1>{article.title}</h1>
        <div className="article-meta">
          <span><CalendarDays size={18} strokeWidth={2} aria-hidden="true" /> {article.date}</span>
          <span><Clock3 size={18} strokeWidth={2} aria-hidden="true" /> {article.readTime}</span>
        </div>
        <img className="article-cover" src={article.image} alt="" />
        <p className="article-lead">{article.text}</p>
        <div className="article-body">
          {article.sections?.length ? article.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          )) : (
            <section>
              {contentParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          )}
        </div>
      </article>

      <section className="article-related section">
        <SectionLabel icon={Newspaper}>{t("blog.relatedLabel", { defaultValue: "Keep reading" })}</SectionLabel>
        <h2>{t("blog.relatedTitle", { defaultValue: "More travel guides" })}</h2>
        <div className="article-related__grid">
          {relatedArticles.map((item) => (
            <LocalizedLink className="article-related__card" to={`/blog/${item.slug}`} key={item.title}>
              <img src={item.image} alt="" />
              <div>
                <time>{item.date}</time>
                <h3>{item.title}</h3>
              </div>
            </LocalizedLink>
          ))}
        </div>
      </section>
    </>
  );
}

export default BlogArticle;
