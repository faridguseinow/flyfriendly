import { useEffect } from "react";

function ensureMetaTag(selector, attributes = {}) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value) {
      element.setAttribute(key, value);
    }
  });

  element.setAttribute("data-seo-managed", "meta");
  return element;
}

function ensureLinkTag(selector, attributes = {}) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("link");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value) {
      element.setAttribute(key, value);
    }
  });

  element.setAttribute("data-seo-managed", "link");
  return element;
}

function setMetaContent(selector, attributes, content) {
  const element = ensureMetaTag(selector, attributes);

  if (content) {
    element.setAttribute("content", content);
  } else {
    element.removeAttribute("content");
  }
}

function clearManaged(selector) {
  document.head.querySelectorAll(selector).forEach((node) => node.remove());
}

export default function SeoHead({
  title,
  description,
  canonical,
  robots,
  lang,
  openGraph,
  twitter,
  alternates = [],
  structuredData = [],
  extraMeta = [],
}) {
  useEffect(() => {
    if (title) {
      document.title = title;
    }

    if (lang) {
      document.documentElement.lang = lang;
    }

    if (description) {
      setMetaContent('meta[name="description"]', { name: "description" }, description);
    }

    if (robots) {
      setMetaContent('meta[name="robots"]', { name: "robots" }, robots);
    }

    if (canonical) {
      ensureLinkTag('link[rel="canonical"]', { rel: "canonical", href: canonical });
    }

    const ogData = openGraph || {};
    setMetaContent('meta[property="og:type"]', { property: "og:type" }, ogData.type);
    setMetaContent('meta[property="og:url"]', { property: "og:url" }, ogData.url);
    setMetaContent('meta[property="og:title"]', { property: "og:title" }, ogData.title);
    setMetaContent('meta[property="og:description"]', { property: "og:description" }, ogData.description);
    setMetaContent('meta[property="og:image"]', { property: "og:image" }, ogData.image);

    const twitterData = twitter || {};
    setMetaContent('meta[name="twitter:card"]', { name: "twitter:card" }, twitterData.card);
    setMetaContent('meta[name="twitter:url"]', { name: "twitter:url" }, twitterData.url);
    setMetaContent('meta[name="twitter:title"]', { name: "twitter:title" }, twitterData.title);
    setMetaContent('meta[name="twitter:description"]', { name: "twitter:description" }, twitterData.description);
    setMetaContent('meta[name="twitter:image"]', { name: "twitter:image" }, twitterData.image);

    clearManaged('meta[data-seo-managed-extra="true"]');
    extraMeta.forEach((meta) => {
      if (!meta?.content || (!meta.name && !meta.property)) {
        return;
      }

      const selector = meta.name
        ? `meta[name="${meta.name}"]`
        : `meta[property="${meta.property}"]`;
      const element = ensureMetaTag(selector, meta.name ? { name: meta.name } : { property: meta.property });
      element.setAttribute("content", meta.content);
      element.setAttribute("data-seo-managed-extra", "true");
    });

    clearManaged('link[data-seo-managed-alternate="true"]');
    alternates.forEach((alternate) => {
      if (!alternate?.href || !alternate?.hrefLang) {
        return;
      }

      const element = document.createElement("link");
      element.setAttribute("rel", "alternate");
      element.setAttribute("href", alternate.href);
      element.setAttribute("hreflang", alternate.hrefLang);
      element.setAttribute("data-seo-managed", "link");
      element.setAttribute("data-seo-managed-alternate", "true");
      document.head.appendChild(element);
    });

    clearManaged('script[data-seo-managed-structured="true"]');
    const schemas = Array.isArray(structuredData)
      ? structuredData.filter(Boolean)
      : [structuredData].filter(Boolean);

    schemas.forEach((schema) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(schema);
      script.setAttribute("data-seo-managed-structured", "true");
      document.head.appendChild(script);
    });
  }, [alternates, canonical, description, extraMeta, lang, openGraph, robots, structuredData, title, twitter]);

  return null;
}
