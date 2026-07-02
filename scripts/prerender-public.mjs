import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import {
  buildAbsoluteUrl,
  buildMatchingEnglishUrl,
  getPrerenderDenyReason,
  getRouteLanguage,
  isBlogArticlePath,
  normalizePathname,
  resolvePrerenderRoutes,
} from "./seo-routes.mjs";

const DIST_DIR = path.join(process.cwd(), "dist");
const DIST_INDEX_FILE = path.join(DIST_DIR, "index.html");
const DIST_SITEMAP_FILE = path.join(DIST_DIR, "sitemap.xml");
const PUBLIC_SITEMAP_FILE = path.join(process.cwd(), "public", "sitemap.xml");
const STATIC_MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function getContentType(filePath) {
  return STATIC_MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function startSpaServer() {
  const indexHtml = await fs.readFile(DIST_INDEX_FILE);

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname || "/");
      const safePath = path.normalize(path.join(DIST_DIR, pathname));
      const isInsideDist = safePath === DIST_DIR || safePath.startsWith(`${DIST_DIR}${path.sep}`);

      if (isInsideDist) {
        try {
          const stat = await fs.stat(safePath);
          if (stat.isFile() && path.extname(safePath)) {
            response.writeHead(200, { "content-type": getContentType(safePath) });
            createReadStream(safePath).pipe(response);
            return;
          }
        } catch {
          // Fall back to SPA shell below.
        }
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(indexHtml);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.message || "Prerender server error.");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve prerender server address.");
  }
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

function stripTags(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return decodeEntities(match?.[1]?.trim() || "");
}

function extractTagAttributes(html, tagName, predicate = () => true) {
  const matches = [];
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

  for (const match of html.matchAll(tagRegex)) {
    const attrs = {};
    const attrRegex = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const attrMatch of match[0].matchAll(attrRegex)) {
      const key = attrMatch[1]?.toLowerCase();
      const value = decodeEntities(attrMatch[3] || attrMatch[4] || attrMatch[5] || "");
      if (key && key !== tagName.toLowerCase()) {
        attrs[key] = value;
      }
    }
    if (predicate(attrs)) {
      matches.push(attrs);
    }
  }

  return matches;
}

function extractMetaContent(html, attrName, attrValue) {
  const match = extractTagAttributes(html, "meta", (attrs) => (
    String(attrs[attrName] || "").toLowerCase() === attrValue.toLowerCase()
  ))[0];
  return match?.content || "";
}

function extractCanonical(html) {
  const match = extractTagAttributes(html, "link", (attrs) => (
    String(attrs.rel || "").toLowerCase() === "canonical"
  ))[0];
  return match?.href || "";
}

function extractAlternates(html) {
  return extractTagAttributes(html, "link", (attrs) => (
    String(attrs.rel || "").toLowerCase() === "alternate" && attrs.hreflang && attrs.href
  )).map((attrs) => ({
    hrefLang: attrs.hreflang.toLowerCase(),
    href: attrs.href,
  }));
}

function extractHtmlLang(html) {
  const match = html.match(/<html\b[^>]*\blang=(?:"([^"]+)"|'([^']+)')/i);
  return (match?.[1] || match?.[2] || "").toLowerCase();
}

function extractStructuredDataBlocks(html) {
  return Array.from(
    html.matchAll(/<script[^>]+type=(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1] || "",
  );
}

function validateRenderedHtml(route, html, staticRouteSet) {
  const normalizedRoute = normalizePathname(route);
  const routeLanguage = getRouteLanguage(normalizedRoute);
  const expectedCanonical = buildAbsoluteUrl(normalizedRoute);
  const expectedXDefault = buildMatchingEnglishUrl(normalizedRoute);
  const isStaticRoute = staticRouteSet.has(normalizedRoute);
  const isBlogRoute = isBlogArticlePath(normalizedRoute);
  const title = extractTitle(html);
  const description = extractMetaContent(html, "name", "description");
  const robots = extractMetaContent(html, "name", "robots");
  const canonical = extractCanonical(html);
  const alternates = extractAlternates(html);
  const htmlLang = extractHtmlLang(html);
  const structuredDataBlocks = extractStructuredDataBlocks(html);
  const bodyText = stripTags(html);
  const errors = [];

  if (!title || !title.includes("Fly Friendly")) {
    errors.push("Missing route-specific title.");
  }

  if (!description) {
    errors.push("Missing meta description.");
  }

  if (canonical !== expectedCanonical) {
    errors.push(`Canonical mismatch. Expected ${expectedCanonical}, received ${canonical || "empty"}.`);
  }

  if (canonical.includes("localhost") || canonical.includes("127.0.0.1") || canonical.includes("vercel.app")) {
    errors.push("Canonical contains local or preview host.");
  }

  if (robots.toLowerCase() !== "index, follow") {
    errors.push(`Unexpected robots directive "${robots || "empty"}".`);
  }

  if (htmlLang !== routeLanguage) {
    errors.push(`HTML lang mismatch. Expected ${routeLanguage}, received ${htmlLang || "empty"}.`);
  }

  if (!html.includes('<div id="root"')) {
    errors.push("Missing #root container.");
  }

  if (bodyText.length < 200) {
    errors.push("Rendered body content looks too small.");
  }

  if (html.includes("http://127.0.0.1:") || html.includes("http://localhost:")) {
    errors.push("Rendered HTML still references local URLs.");
  }

  const alternatesByLang = new Map(alternates.map((entry) => [entry.hrefLang, entry.href]));
  const xDefaultHref = alternatesByLang.get("x-default");

  if (xDefaultHref !== expectedXDefault) {
    errors.push(`x-default mismatch. Expected ${expectedXDefault}, received ${xDefaultHref || "empty"}.`);
  }

  if (isStaticRoute) {
    for (const language of ["az", "ru", "en"]) {
      const expectedHref = buildAbsoluteUrl(normalizedRoute.replace(/^\/[a-z]{2}(?=\/|$)/, `/${language}`));
      if (alternatesByLang.get(language) !== expectedHref) {
        errors.push(`Missing hreflang ${language} for static page.`);
      }
    }
  }

  if (isBlogRoute && !structuredDataBlocks.some((block) => block.includes('"@type":"BlogPosting"'))) {
    errors.push("Missing BlogPosting JSON-LD.");
  }

  if (normalizedRoute.match(/^\/(az|ru|en)$/) && (
    !structuredDataBlocks.some((block) => block.includes('"@type":"Organization"')) ||
    !structuredDataBlocks.some((block) => block.includes('"@type":"WebSite"'))
  )) {
    errors.push("Missing Organization/WebSite JSON-LD on home page.");
  }

  return errors;
}

async function renderRoute({ browser, origin, route }) {
  const page = await browser.newPage({
    javaScriptEnabled: true,
  });

  try {
    await page.goto(`${origin}${route}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForFunction(() => {
      const canonical = document.head.querySelector('link[rel="canonical"]');
      const description = document.head.querySelector('meta[name="description"]');
      const root = document.getElementById("root");
      return Boolean(
        canonical?.getAttribute("href")
          && description?.getAttribute("content")
          && document.title
          && root?.textContent?.trim()?.length,
      );
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
      const main = document.querySelector("main");
      if (!main) {
        return true;
      }

      const style = window.getComputedStyle(main);
      return Number(style.opacity || "1") >= 0.99;
    }, { timeout: 5000 }).catch(() => null);

    return `<!doctype html>\n${await page.content()}\n`;
  } finally {
    await page.close();
  }
}

async function renderRouteWithRetries(options, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await renderRoute(options);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.warn(`Retrying prerender for ${options.route} (${attempt}/${maxAttempts - 1} retries used): ${error.message || error}`);
      }
    }
  }

  throw lastError;
}

function buildOutputFile(route) {
  const normalizedRoute = normalizePathname(route);
  const segments = normalizedRoute.slice(1);
  return path.join(DIST_DIR, segments, "index.html");
}

async function writeRenderedRoute(route, html) {
  const outputFile = buildOutputFile(route);
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, html, "utf8");
  return outputFile;
}

async function main() {
  if (!(await pathExists(DIST_INDEX_FILE))) {
    throw new Error("dist/index.html is missing. Run npm run build first.");
  }

  const sitemapPath = await pathExists(DIST_SITEMAP_FILE)
    ? DIST_SITEMAP_FILE
    : PUBLIC_SITEMAP_FILE;
  const { staticRoutes, blogRoutes, routes } = await resolvePrerenderRoutes({ sitemapPath });
  const staticRouteSet = new Set(staticRoutes);
  const failures = [];
  const writtenFiles = [];
  const deniedRoutes = routes
    .map((route) => ({ route, reason: getPrerenderDenyReason(route) }))
    .filter((entry) => entry.reason);

  if (deniedRoutes.length) {
    const details = deniedRoutes.map(({ route, reason }) => `${route}: ${reason}`).join("\n");
    throw new Error(`Prerender guard rejected routes.\n${details}`);
  }

  const { server, origin } = await startSpaServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });

  try {
    for (const route of routes) {
      const renderedHtml = await renderRouteWithRetries({
        browser,
        origin,
        route,
      });
      const errors = validateRenderedHtml(route, renderedHtml, staticRouteSet);

      if (errors.length) {
        failures.push({ route, errors });
        continue;
      }

      const outputFile = await writeRenderedRoute(route, renderedHtml);
      writtenFiles.push(path.relative(process.cwd(), outputFile));
      console.log(`Prerendered ${route} -> ${path.relative(process.cwd(), outputFile)}`);
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  if (failures.length) {
    const details = failures
      .map(({ route, errors }) => `${route}\n${errors.map((error) => `  - ${error}`).join("\n")}`)
      .join("\n");
    throw new Error(`Prerender finished with validation failures.\n${details}`);
  }

  console.log(`Prerender complete. ${writtenFiles.length} routes written (${staticRoutes.length} static, ${blogRoutes.length} blog).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
