import fs from "node:fs";
import path from "node:path";

const localeDir = path.resolve("src/i18n/locales");
const localeFiles = {
  en: path.join(localeDir, "en.json"),
  ru: path.join(localeDir, "ru.json"),
  az: path.join(localeDir, "az.json"),
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, nextValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(nextValue, nextPrefix);
  });
}

const localeAdminTrees = Object.fromEntries(
  Object.entries(localeFiles).map(([locale, filePath]) => [locale, readJson(filePath).admin || {}]),
);

const keySets = Object.fromEntries(
  Object.entries(localeAdminTrees).map(([locale, tree]) => [locale, new Set(flattenKeys(tree, "admin"))]),
);

const sourceLocale = "en";
const sourceKeys = [...keySets[sourceLocale]].sort();
const failures = [];

for (const [locale, keys] of Object.entries(keySets)) {
  if (locale === sourceLocale) continue;

  const missing = sourceKeys.filter((key) => !keys.has(key));
  if (missing.length) {
    failures.push({ locale, missing });
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`Missing admin i18n keys in ${failure.locale}:`);
    for (const key of failure.missing) {
      console.error(`- ${key}`);
    }
  }
  process.exit(1);
}

console.log("Admin i18n audit passed for en/ru/az.");
