import { isSupabaseConfigured, supabase } from "../lib/supabase.js";
import { DEFAULT_LANGUAGE } from "../i18n/languages.js";

export const GLOBAL_BLOG_LOCALE = "global";

const BLOG_PUBLIC_SELECTS = [
  "id, title, slug, excerpt, content, content_sections, cover_image, cover_image_alt, categories, tags, author_name, status, published_at, read_time, locale, seo_title, seo_description, seo_keywords, canonical_override, updated_at, translation_group_id, translated_from_id",
  "id, title, slug, excerpt, content, content_sections, cover_image, categories, tags, author_name, status, published_at, read_time, locale, seo_title, seo_description, updated_at",
];

function isMissingBlogSchema(error) {
  return error?.code === "42P01"
    || error?.code === "PGRST204"
    || error?.code === "PGRST205"
    || error?.message?.includes("schema cache")
    || error?.message?.includes("column");
}

async function runBlogSelectWithFallback(buildQuery) {
  let lastError = null;

  for (let index = 0; index < BLOG_PUBLIC_SELECTS.length; index += 1) {
    const { data, error } = await buildQuery(BLOG_PUBLIC_SELECTS[index]);
    if (!error) {
      return { data: data || [], supportsBlogSeoCmsV2: index === 0 };
    }

    if (!isMissingBlogSchema(error)) {
      throw error;
    }

    lastError = error;
  }

  if (lastError) {
    throw lastError;
  }

  return { data: [], supportsBlogSeoCmsV2: false };
}

function getTranslationKey(post) {
  if (post?.translation_group_id) {
    return `group:${post.translation_group_id}`;
  }

  return `slug:${post?.slug || post?.id || "post"}`;
}

function normalizePost(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    text: row.excerpt || "",
    excerpt: row.excerpt || "",
    content: row.content || "",
    sections: Array.isArray(row.content_sections) ? row.content_sections : [],
    image: row.cover_image || "",
    cover_image_alt: row.cover_image_alt || "",
    date: row.published_at ? new Date(row.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "",
    published_at: row.published_at,
    readTime: row.read_time || "",
    author_name: row.author_name || "",
    categories: row.categories || [],
    tags: row.tags || [],
    locale: row.locale || DEFAULT_LANGUAGE,
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
    seo_keywords: row.seo_keywords || [],
    canonical_override: row.canonical_override || "",
    updated_at: row.updated_at || null,
    translation_group_id: row.translation_group_id || null,
    translated_from_id: row.translated_from_id || null,
    source: "supabase",
  };
}

function getLocaleFallbacks(locale) {
  const requestedLocale = locale || DEFAULT_LANGUAGE;
  return requestedLocale === DEFAULT_LANGUAGE
    ? [DEFAULT_LANGUAGE, GLOBAL_BLOG_LOCALE]
    : [requestedLocale, GLOBAL_BLOG_LOCALE, DEFAULT_LANGUAGE];
}

function preferRequestedLocale(posts, locale) {
  const requestedLocale = locale || DEFAULT_LANGUAGE;
  const priority = {
    [requestedLocale]: 0,
    [GLOBAL_BLOG_LOCALE]: 1,
    [DEFAULT_LANGUAGE]: requestedLocale === DEFAULT_LANGUAGE ? 0 : 2,
  };
  const grouped = new Map();

  posts.forEach((post) => {
    const key = getTranslationKey(post);
    const current = grouped.get(key);
    const currentPriority = priority[current?.locale] ?? 3;
    const postPriority = priority[post.locale] ?? 3;
    if (!current || postPriority < currentPriority) {
      grouped.set(key, post);
    }
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const leftDate = left.published_at ? new Date(left.published_at).getTime() : 0;
    const rightDate = right.published_at ? new Date(right.published_at).getTime() : 0;
    return rightDate - leftDate;
  });
}

export async function fetchPublishedBlogPosts(locale) {
  if (!isSupabaseConfigured || !supabase) {
    return { posts: [], source: "fallback" };
  }

  try {
    const now = new Date().toISOString();
    const locales = getLocaleFallbacks(locale);
    const { data } = await runBlogSelectWithFallback((select) => supabase
      .from("blog_posts")
      .select(select)
      .eq("status", "published")
      .in("locale", locales)
      .or(`published_at.is.null,published_at.lte.${now}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(100));

    return { posts: preferRequestedLocale((data || []).map(normalizePost), locale), source: "supabase" };
  } catch (error) {
    if (isMissingBlogSchema(error)) {
      return { posts: [], source: "fallback" };
    }
    throw error;
  }
}

export async function fetchPublishedBlogPost(locale, slug) {
  if (!isSupabaseConfigured || !supabase) {
    return { post: null, source: "fallback" };
  }

  try {
    const now = new Date().toISOString();
    const locales = getLocaleFallbacks(locale);
    const { data } = await runBlogSelectWithFallback((select) => supabase
      .from("blog_posts")
      .select(select)
      .eq("status", "published")
      .in("locale", locales)
      .eq("slug", slug)
      .or(`published_at.is.null,published_at.lte.${now}`)
      .limit(10));

    const posts = preferRequestedLocale((data || []).map(normalizePost), locale);
    return { post: posts[0] || null, source: "supabase" };
  } catch (error) {
    if (isMissingBlogSchema(error)) {
      return { post: null, source: "fallback" };
    }
    throw error;
  }
}

export async function fetchPublishedBlogPostAlternates({
  slug,
  translationGroupId = null,
  locales = [],
}) {
  if (!isSupabaseConfigured || !supabase || !slug || !Array.isArray(locales) || locales.length === 0) {
    return { entries: [], source: "fallback" };
  }

  const now = new Date().toISOString();
  try {
    let result = null;

    if (translationGroupId) {
      try {
        result = await runBlogSelectWithFallback((select) => supabase
          .from("blog_posts")
          .select(select)
          .eq("status", "published")
          .in("locale", locales)
          .eq("translation_group_id", translationGroupId)
          .or(`published_at.is.null,published_at.lte.${now}`)
          .limit(50));
      } catch (error) {
        if (!isMissingBlogSchema(error)) {
          throw error;
        }
      }
    }

    if (!result || !result.data?.length) {
      result = await runBlogSelectWithFallback((select) => supabase
        .from("blog_posts")
        .select(select)
        .eq("status", "published")
        .in("locale", locales)
        .eq("slug", slug)
        .or(`published_at.is.null,published_at.lte.${now}`)
        .limit(50));
    }

    const normalized = (result.data || []).map(normalizePost);
    const entriesByLocale = new Map();
    normalized.forEach((post) => {
      if (!post?.locale || entriesByLocale.has(post.locale)) {
        return;
      }
      entriesByLocale.set(post.locale, { locale: post.locale, slug: post.slug });
    });

    return {
      entries: Array.from(entriesByLocale.values()),
      source: "supabase",
    };
  } catch (error) {
    if (isMissingBlogSchema(error)) {
      return { entries: [], source: "fallback" };
    }
    throw error;
  }
}
