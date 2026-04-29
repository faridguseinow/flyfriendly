import { isSupabaseConfigured, supabase } from "../lib/supabase.js";
import { DEFAULT_LANGUAGE } from "../i18n/languages.js";

export const GLOBAL_BLOG_LOCALE = "global";

function isMissingBlogSchema(error) {
  return error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
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
    date: row.published_at ? new Date(row.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "",
    published_at: row.published_at,
    readTime: row.read_time || "",
    author_name: row.author_name || "",
    categories: row.categories || [],
    tags: row.tags || [],
    locale: row.locale || DEFAULT_LANGUAGE,
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
  const bySlug = new Map();

  posts.forEach((post) => {
    const current = bySlug.get(post.slug);
    const currentPriority = priority[current?.locale] ?? 3;
    const postPriority = priority[post.locale] ?? 3;
    if (!current || postPriority < currentPriority) {
      bySlug.set(post.slug, post);
    }
  });

  return Array.from(bySlug.values()).sort((left, right) => {
    const leftDate = left.published_at ? new Date(left.published_at).getTime() : 0;
    const rightDate = right.published_at ? new Date(right.published_at).getTime() : 0;
    return rightDate - leftDate;
  });
}

export async function fetchPublishedBlogPosts(locale) {
  if (!isSupabaseConfigured || !supabase) {
    return { posts: [], source: "fallback" };
  }

  const now = new Date().toISOString();
  const locales = getLocaleFallbacks(locale);
  const request = supabase
    .from("blog_posts")
    .select("id, title, slug, excerpt, content, content_sections, cover_image, categories, tags, author_name, status, published_at, read_time, locale, seo_title, seo_description, updated_at")
    .eq("status", "published")
    .in("locale", locales)
    .or(`published_at.is.null,published_at.lte.${now}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(100);

  const { data, error } = await request;

  if (error) {
    if (isMissingBlogSchema(error)) {
      return { posts: [], source: "fallback" };
    }
    throw error;
  }

  return { posts: preferRequestedLocale((data || []).map(normalizePost), locale), source: "supabase" };
}

export async function fetchPublishedBlogPost(locale, slug) {
  if (!isSupabaseConfigured || !supabase) {
    return { post: null, source: "fallback" };
  }

  const now = new Date().toISOString();
  const locales = getLocaleFallbacks(locale);
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, title, slug, excerpt, content, content_sections, cover_image, categories, tags, author_name, status, published_at, read_time, locale, seo_title, seo_description, updated_at")
    .eq("status", "published")
    .in("locale", locales)
    .eq("slug", slug)
    .or(`published_at.is.null,published_at.lte.${now}`)
    .limit(10);

  if (error) {
    if (isMissingBlogSchema(error)) {
      return { post: null, source: "fallback" };
    }
    throw error;
  }

  const posts = preferRequestedLocale((data || []).map(normalizePost), locale);
  return { post: posts[0] || null, source: "supabase" };
}
