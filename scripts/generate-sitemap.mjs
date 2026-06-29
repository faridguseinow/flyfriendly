import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import {
  SEO_LANGUAGES,
  SITEMAP_STATIC_PUBLIC_PATHS,
  SITE_URL,
  localizePath,
} from "./seo-routes.mjs";

function absoluteUrl(pathname) {
  return `${SITE_URL}${pathname}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildAlternates(pathsByLanguage) {
  const alternates = Object.entries(pathsByLanguage).map(([language, pathname]) => (
    `<xhtml:link rel="alternate" hreflang="${language}" href="${escapeXml(absoluteUrl(pathname))}" />`
  ));

  if (pathsByLanguage.en) {
    alternates.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(pathsByLanguage.en))}" />`);
  }

  return alternates.join("");
}

function buildUrlNode(pathname, { alternates = "", lastmod = "" } = {}) {
  return [
    "  <url>",
    `    <loc>${escapeXml(absoluteUrl(pathname))}</loc>`,
    alternates ? `    ${alternates}` : "",
    lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
    "  </url>",
  ].filter(Boolean).join("\n");
}

function buildStaticEntries() {
  return SITEMAP_STATIC_PUBLIC_PATHS.flatMap((pathname) => {
    const localizedPaths = Object.fromEntries(
      SEO_LANGUAGES.map((language) => [language, localizePath(pathname, language)]),
    );

    return SEO_LANGUAGES.map((language) => buildUrlNode(localizedPaths[language], {
      alternates: buildAlternates(localizedPaths),
    }));
  });
}

async function fetchBlogEntries() {
  const env = loadEnv("production", process.cwd(), "");
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!supabaseUrl || !supabaseKey) {
    return [];
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = new Date().toISOString();
    const selectVariants = [
      "slug, locale, updated_at, published_at, translation_group_id",
      "slug, locale, updated_at, published_at",
    ];

    for (const select of selectVariants) {
      const { data, error } = await supabase
        .from("blog_posts")
        .select(select)
        .eq("status", "published")
        .in("locale", SEO_LANGUAGES)
        .or(`published_at.is.null,published_at.lte.${now}`)
        .limit(300);

      if (!error) {
        return data || [];
      }

      const message = String(error.message || "");
      if (!message.includes("column") && error.code !== "PGRST204" && error.code !== "PGRST205") {
        console.warn("Sitemap: could not fetch blog posts.", error.message || error);
        return [];
      }
    }

    return [];
  } catch (error) {
    console.warn("Sitemap: unexpected blog fetch error.", error.message || error);
    return [];
  }
}

function buildBlogEntries(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!row?.slug || !row?.locale || !SEO_LANGUAGES.includes(row.locale)) {
      return;
    }

    const groupKey = row.translation_group_id || row.slug;
    const current = grouped.get(groupKey) || {};
    current[row.locale] = {
      path: localizePath(`/blog/${row.slug}`, row.locale),
      lastmod: row.updated_at || row.published_at || "",
    };
    grouped.set(groupKey, current);
  });

  return Array.from(grouped.values()).flatMap((entry) => {
    const localizedPaths = Object.fromEntries(
      Object.entries(entry).map(([language, value]) => [language, value.path]),
    );
    const alternates = buildAlternates(localizedPaths);

    return Object.values(entry).map((value) => buildUrlNode(value.path, {
      alternates,
      lastmod: value.lastmod,
    }));
  });
}

async function main() {
  const staticEntries = buildStaticEntries();
  const blogEntries = buildBlogEntries(await fetchBlogEntries());
  const sitemap = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">",
    ...staticEntries,
    ...blogEntries,
    "</urlset>",
    "",
  ].join("\n");

  const outputPaths = [path.join(process.cwd(), "public", "sitemap.xml")];
  const distDir = path.join(process.cwd(), "dist");

  try {
    const distStat = await fs.stat(distDir);
    if (distStat.isDirectory()) {
      outputPaths.push(path.join(distDir, "sitemap.xml"));
    }
  } catch {
    // dist is optional here; write there only after a build exists.
  }

  await Promise.all(outputPaths.map(async (outputPath) => {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, sitemap, "utf8");
  }));

  console.log(`Sitemap generated with ${staticEntries.length + blogEntries.length} URLs.`);
}

main().catch((error) => {
  console.error("Could not generate sitemap.", error);
  process.exitCode = 1;
});
