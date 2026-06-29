import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import SeoHead from "../../components/SeoHead.jsx";
import { DEFAULT_LANGUAGE } from "../../i18n/languages.js";
import { localizePath } from "../../i18n/path.js";
import {
  BRAND_NAME,
  SEO_LANGUAGES,
  buildAbsoluteUrl,
  buildArticleSchema,
  buildSeoPayload,
  isSeoLanguage,
} from "../../lib/seo.js";
import { hasRichTextMarkup, sanitizeRichTextHtml } from "../../lib/richText.js";
import {
  fetchPublishedBlogPost,
  fetchPublishedBlogPostAlternates,
  fetchPublishedBlogPosts,
} from "../../services/blogService.js";
import { getArticles, localizeArticles } from "./articles.js";
import "./style.scss";

function BlogArticle() {
  const { t } = useTranslation();
  const { lang, slug } = useParams();
  const location = useLocation();
  const locale = lang || DEFAULT_LANGUAGE;
  const [cmsArticle, setCmsArticle] = useState(null);
  const [cmsArticles, setCmsArticles] = useState([]);
  const [articleLocales, setArticleLocales] = useState([]);
  const [articleSource, setArticleSource] = useState("fallback");
  const [isLoading, setIsLoading] = useState(true);
  const fallbackArticles = getArticles(
    t("home.articles", { returnObjects: true }),
    t("blog.articleDetails", { returnObjects: true }),
  );
  const localizedCmsArticle = cmsArticle
    ? localizeArticles(
        [cmsArticle],
        t("home.articles", { returnObjects: true }),
        t("blog.articleDetails", { returnObjects: true }),
        locale,
        DEFAULT_LANGUAGE,
      )[0]
    : null;
  const articles = cmsArticles.length
    ? localizeArticles(
        cmsArticles,
        t("home.articles", { returnObjects: true }),
        t("blog.articleDetails", { returnObjects: true }),
        locale,
        DEFAULT_LANGUAGE,
      )
    : fallbackArticles;
  const fallbackArticle = fallbackArticles.find((item) => item.slug === slug);
  const article = localizedCmsArticle || articles.find((item) => item.slug === slug) || fallbackArticle;
  const relatedArticles = articles.filter((item) => item.slug !== slug).slice(0, 2);
  const contentParagraphs = useMemo(
    () => String(article?.content || "").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean),
    [article?.content],
  );
  const contentHtml = useMemo(
    () => sanitizeRichTextHtml(article?.content || ""),
    [article?.content],
  );
  const hasRichContent = useMemo(
    () => hasRichTextMarkup(article?.content || ""),
    [article?.content],
  );

  useEffect(() => {
    let isActive = true;

    async function loadPosts() {
      setIsLoading(true);
      try {
        const [postResult, listResult] = await Promise.all([
          fetchPublishedBlogPost(locale, slug),
          fetchPublishedBlogPosts(locale),
        ]);
        const alternatesResult = postResult.post
          ? await fetchPublishedBlogPostAlternates({
            slug: postResult.post.slug || slug,
            translationGroupId: postResult.post.translation_group_id || null,
            locales: SEO_LANGUAGES,
          })
          : { entries: [], source: "fallback" };

        if (isActive) {
          setCmsArticle(postResult.post);
          setArticleSource(postResult.source);
          setCmsArticles(listResult.posts);
          setArticleLocales(alternatesResult.entries);
        }
      } catch (error) {
        console.warn("Could not load blog posts from Supabase.", error);
        if (isActive) {
          setCmsArticle(null);
          setCmsArticles([]);
          setArticleLocales([]);
          setArticleSource("fallback");
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
  }, [locale, slug]);

  if (!isLoading && !article) {
    return <Navigate to="../blog" replace />;
  }

  if (!article) {
    return <p className="blog-loading article-loading">{t("blog.loading", { defaultValue: "Loading articles..." })}</p>;
  }

  const articlePath = `/blog/${slug}`;
  const actualArticleLocale = cmsArticle?.locale || DEFAULT_LANGUAGE;
  const hasRealCurrentTranslation = actualArticleLocale === locale;
  const isFallbackTranslation = locale !== actualArticleLocale;
  const realArticleLocales = articleSource === "supabase"
    ? articleLocales.filter((item) => isSeoLanguage(item?.locale))
    : [{ locale: DEFAULT_LANGUAGE, slug }];
  const alternates = realArticleLocales.map((item) => ({
    hrefLang: item.locale,
    href: buildAbsoluteUrl(localizePath(`/blog/${item.slug}`, item.locale)),
  }));
  if (realArticleLocales.some((item) => item.locale === "en")) {
    const enEntry = realArticleLocales.find((item) => item.locale === "en");
    alternates.push({
      hrefLang: "x-default",
      href: buildAbsoluteUrl(localizePath(`/blog/${enEntry.slug}`, "en")),
    });
  }
  const seoSourceArticle = isFallbackTranslation && cmsArticle ? cmsArticle : article;
  const canonicalLocale = hasRealCurrentTranslation ? locale : actualArticleLocale;
  const canonicalPath = localizePath(`/blog/${seoSourceArticle.slug || slug}`, canonicalLocale);
  const articleTitle = seoSourceArticle.seo_title || seoSourceArticle.title;
  const articleDescription = seoSourceArticle.seo_description || seoSourceArticle.excerpt || seoSourceArticle.text;
  const isIndexableArticle = hasRealCurrentTranslation
    && isSeoLanguage(canonicalLocale)
    && Boolean(String(seoSourceArticle.seo_title || "").trim() && String(seoSourceArticle.seo_description || "").trim());
  const seo = buildSeoPayload({
    lang: isFallbackTranslation ? actualArticleLocale : locale,
    title: `${articleTitle} | ${BRAND_NAME}`,
    description: articleDescription,
    pathname: location.pathname,
    canonicalPath,
    canonicalOverride: seoSourceArticle.canonical_override || "",
    indexable: isIndexableArticle,
    alternates,
    ogType: "article",
    image: seoSourceArticle.image || article.image || undefined,
    robotsOverride: isFallbackTranslation ? "noindex, follow" : "",
    extraMeta: [
      seoSourceArticle.published_at ? { property: "article:published_time", content: seoSourceArticle.published_at } : null,
      (seoSourceArticle.updated_at || seoSourceArticle.published_at) ? { property: "article:modified_time", content: seoSourceArticle.updated_at || seoSourceArticle.published_at } : null,
      seoSourceArticle.author_name ? { property: "article:author", content: seoSourceArticle.author_name } : null,
      seoSourceArticle.seo_keywords?.length ? { name: "keywords", content: seoSourceArticle.seo_keywords.join(", ") } : null,
    ].filter(Boolean),
    structuredData: isIndexableArticle
      ? [buildArticleSchema({
          title: articleTitle,
          description: articleDescription,
          url: buildAbsoluteUrl(canonicalPath),
          image: seoSourceArticle.image || article.image || undefined,
          publishedTime: seoSourceArticle.published_at,
          modifiedTime: seoSourceArticle.updated_at || seoSourceArticle.published_at,
          authorName: seoSourceArticle.author_name,
          language: canonicalLocale,
        })]
      : [],
  });

  return (
    <>
      <SeoHead {...seo} />
      <article className="article-page">
        <LocalizedLink to="/blog" className="article-back"><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" /> {t("blog.backToBlog", { defaultValue: "Back to blog" })}</LocalizedLink>
        <h1>{article.title}</h1>
        <div className="article-meta">
          <span><CalendarDays size={18} strokeWidth={2} aria-hidden="true" /> {article.date}</span>
          <span><Clock3 size={18} strokeWidth={2} aria-hidden="true" /> {article.readTime}</span>
        </div>
        <img className="article-cover" src={article.image} alt={article.cover_image_alt || article.title || ""} />
        <p className="article-lead">{article.text}</p>
        <div className="article-body">
          {hasRichContent ? (
            <section className="article-body__rich" dangerouslySetInnerHTML={{ __html: contentHtml }} />
          ) : article.sections?.length ? article.sections.map((section) => (
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
