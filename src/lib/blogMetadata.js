import { DEFAULT_LANGUAGE } from "../i18n/languages.js";

const MONTH_NAMES = {
  az: [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avqust",
    "sentyabr",
    "oktyabr",
    "noyabr",
    "dekabr",
  ],
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

function normalizeLocale(locale) {
  const normalized = String(locale || DEFAULT_LANGUAGE).toLowerCase();

  if (normalized.startsWith("az")) return "az";
  if (normalized.startsWith("ru")) return "ru";
  return "en";
}

function getDateParts(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    day: date.getUTCDate(),
    monthIndex: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  };
}

function getWordCount(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export function formatBlogDate(value, locale = DEFAULT_LANGUAGE) {
  const parts = getDateParts(value);
  if (!parts) return "";

  const normalizedLocale = normalizeLocale(locale);
  const month = MONTH_NAMES[normalizedLocale][parts.monthIndex];

  if (normalizedLocale === "ru") {
    return `${parts.day} ${month} ${parts.year} г.`;
  }

  if (normalizedLocale === "az") {
    return `${parts.day} ${month} ${parts.year}`;
  }

  return `${month} ${parts.day}, ${parts.year}`;
}

export function formatReadTime(minutes, locale = DEFAULT_LANGUAGE) {
  const safeMinutes = Math.max(2, Number(minutes) || 2);
  const normalizedLocale = normalizeLocale(locale);

  if (normalizedLocale === "ru") {
    return `${safeMinutes} мин чтения`;
  }

  if (normalizedLocale === "az") {
    return `${safeMinutes} dəq oxu`;
  }

  return `${safeMinutes} min read`;
}

export function parseReadTimeMinutes(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function estimateReadTimeMinutes(article) {
  const sectionsText = Array.isArray(article?.sections)
    ? article.sections.flatMap((section) => [section?.title, section?.body]).filter(Boolean).join(" ")
    : "";
  const wordCount = getWordCount([
    article?.title,
    article?.excerpt,
    article?.text,
    article?.content,
    sectionsText,
  ].filter(Boolean).join(" "));

  return Math.max(2, Math.min(12, Math.ceil(wordCount / 180) || 2));
}

export function resolveArticleReadTime(article, locale = DEFAULT_LANGUAGE) {
  const minutes = parseReadTimeMinutes(article?.readTime) || estimateReadTimeMinutes(article);
  return formatReadTime(minutes, locale);
}
