export const articleImages = [];

export const articleSlugs = [];

export const fallbackArticleDetails = [];

export function getArticles(translatedArticles, translatedDetails = fallbackArticleDetails) {
  if (!Array.isArray(translatedArticles)) {
    return [];
  }

  const details = Array.isArray(translatedDetails) ? translatedDetails : fallbackArticleDetails;

  return translatedArticles.map((item, index) => ({
    ...item,
    ...(details[index] || {}),
    image: articleImages[index] || item.image,
    slug: articleSlugs[index] || item.slug,
  }));
}

export function localizeArticles(posts, translatedArticles, translatedDetails, locale, defaultLocale = "en") {
  const fallbackArticles = getArticles(translatedArticles, translatedDetails);
  const bySlug = new Map(fallbackArticles.map((article) => [article.slug, article]));

  return posts.map((post) => {
    const localizedFallback = bySlug.get(post.slug);
    if (!localizedFallback) {
      return post;
    }

    if (!locale || locale === defaultLocale || post.locale === locale) {
      return post;
    }

    return {
      ...post,
      title: localizedFallback.title,
      text: localizedFallback.text,
      excerpt: localizedFallback.excerpt,
      sections: localizedFallback.sections,
      readTime: localizedFallback.readTime,
      date: localizedFallback.date,
    };
  });
}
