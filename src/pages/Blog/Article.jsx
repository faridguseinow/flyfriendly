import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
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
  getHrefLangsForLanguage,
  isSeoLanguage,
} from "../../lib/seo.js";
import { resolveArticleReadTime } from "../../lib/blogMetadata.js";
import { hasRichTextMarkup, sanitizeRichTextHtml } from "../../lib/richText.js";
import {
  fetchPublishedBlogPost,
  fetchPublishedBlogPostAlternates,
  fetchPublishedBlogPosts,
} from "../../services/blogService.js";
import { getArticles, localizeArticles } from "./articles.js";
import "./style.scss";

function slugifyHeadingId(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function enhanceRichContent(html) {
  if (!html || typeof document === "undefined") {
    return { html: html || "", headings: [] };
  }

  const root = document.createElement("div");
  root.innerHTML = html;
  const headings = [];

  root.querySelectorAll("h2, h3").forEach((node, index) => {
    const title = String(node.textContent || "").trim();
    if (!title) {
      return;
    }

    const level = Number(String(node.tagName || "H2").replace("H", "")) || 2;
    const id = node.id || `${slugifyHeadingId(title) || "section"}-${index + 1}`;
    node.id = id;
    headings.push({ id, title, level });
  });

  return { html: root.innerHTML, headings };
}

function BlogArticle() {
  const { t } = useTranslation();
  const { lang, slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const locale = lang || DEFAULT_LANGUAGE;
  const [cmsArticle, setCmsArticle] = useState(null);
  const [cmsArticles, setCmsArticles] = useState([]);
  const [articleLocales, setArticleLocales] = useState([]);
  const [articleSource, setArticleSource] = useState("fallback");
  const [isLoading, setIsLoading] = useState(true);
  const redirectedSlugRef = useRef("");
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
  const richContent = useMemo(
    () => enhanceRichContent(contentHtml),
    [contentHtml],
  );
  const hasRichContent = useMemo(
    () => hasRichTextMarkup(article?.content || ""),
    [article?.content],
  );
  const tocItems = useMemo(() => {
    const items = [];

    if (article?.text || article?.excerpt) {
      items.push({
        id: "article-introduction",
        title: t("blog.introduction", { defaultValue: "Introduction" }),
        level: 2,
      });
    }

    if (hasRichContent) {
      return [...items, ...richContent.headings];
    }

    if (Array.isArray(article?.sections) && article.sections.length) {
      return [
        ...items,
        ...article.sections.map((section, index) => ({
          id: `${slugifyHeadingId(section.title) || "section"}-${index + 1}`,
          title: section.title,
          level: 2,
        })),
      ];
    }

    return items;
  }, [article?.excerpt, article?.sections, article?.text, hasRichContent, richContent.headings, t]);

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

  useEffect(() => {
    if (isLoading || articleSource !== "supabase" || !articleLocales.length || !slug) {
      redirectedSlugRef.current = "";
      return;
    }

    const localizedEntry = articleLocales.find((item) => item?.locale === locale && item?.slug);
    if (!localizedEntry || localizedEntry.slug === slug) {
      redirectedSlugRef.current = "";
      return;
    }

    const redirectSignature = `${locale}:${slug}:${localizedEntry.slug}`;
    if (redirectedSlugRef.current === redirectSignature) {
      return;
    }

    redirectedSlugRef.current = redirectSignature;
    navigate(localizePath(`/blog/${localizedEntry.slug}`, locale), { replace: true });
  }, [articleLocales, articleSource, isLoading, locale, navigate, slug]);

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
  const alternates = realArticleLocales.flatMap((item) => (
    getHrefLangsForLanguage(item.locale).map((hrefLang) => ({
      hrefLang,
      href: buildAbsoluteUrl(localizePath(`/blog/${item.slug}`, item.locale)),
    }))
  ));
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
        <div className="article-page__shell">
          <LocalizedLink to="/blog" className="article-back"><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" /> {t("blog.backToBlog", { defaultValue: "Back to blog" })}</LocalizedLink>

          <div className="article-layout">
            <div className="article-main">
              <header className="article-hero-card">
                <h1>{article.title}</h1>
                <div className="article-meta">
                  <span><CalendarDays size={18} strokeWidth={2} aria-hidden="true" /> {article.date}</span>
                  <span><Clock3 size={18} strokeWidth={2} aria-hidden="true" /> {resolveArticleReadTime(article, locale)}</span>
                </div>
                <img className="article-cover" src={article.image} alt={article.cover_image_alt || article.title || ""} />
              </header>

              <div className="article-body article-body--editorial">
                {article.text || article.excerpt ? (
                  <section className="article-introduction" id="article-introduction">
                    <p className="article-lead">{article.text || article.excerpt}</p>
                  </section>
                ) : null}

                {hasRichContent ? (
                  <section className="article-body__rich" dangerouslySetInnerHTML={{ __html: richContent.html }} />
                ) : article.sections?.length ? article.sections.map((section, index) => (
                  <section key={section.title} id={`${slugifyHeadingId(section.title) || "section"}-${index + 1}`}>
                    <h2>{section.title}</h2>
                    <p>{section.body}</p>
                  </section>
                )) : (
                  <section>
                    {contentParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </section>
                )}
              </div>
            </div>

            {tocItems.length ? (
              <aside className="article-sidebar">
                <div className="article-toc">
                  <strong>{t("blog.tableOfContents", { defaultValue: "Contents" })}</strong>
                  <nav aria-label={t("blog.tableOfContents", { defaultValue: "Contents" })}>
                    <ul>
                      {tocItems.map((item) => (
                        <li key={item.id} className={item.level > 2 ? "is-subsection" : ""}>
                          <a href={`#${item.id}`}>{item.title}</a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>
              </aside>
            ) : null}
          </div>
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
