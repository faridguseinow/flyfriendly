import { Landmark } from "lucide-react";
import { ADMIN_NAVIGATION_PAGE_DEFINITIONS, ADMIN_PAGE_SECTIONS } from "./adminPages.js";

function translateLabel(t, key, fallback) {
  return typeof t === "function" && key ? t(key, { defaultValue: fallback }) : fallback;
}

function dedupeByPath(items = []) {
  const seenPaths = new Set();

  return items.filter((item) => {
    if (!item?.path || seenPaths.has(item.path)) {
      return false;
    }

    seenPaths.add(item.path);
    return true;
  });
}

export const adminNavigationSectionOrder = ADMIN_PAGE_SECTIONS.map((section) => section.key);
export const adminNavigationGroupOrder = adminNavigationSectionOrder;

export function getAdminNavigationSections(t) {
  return ADMIN_PAGE_SECTIONS.map((section) => {
    const sectionLabel = translateLabel(t, section.labelKey, section.defaultLabel);

    return {
      ...section,
      label: sectionLabel,
      route: ADMIN_NAVIGATION_PAGE_DEFINITIONS.find((page) => page.sectionKey === section.key)?.route || "/admin",
      pages: ADMIN_NAVIGATION_PAGE_DEFINITIONS
        .filter((page) => page.sectionKey === section.key)
        .map((page) => ({
          key: page.navKey,
          pageKey: page.key,
          labelKey: page.labelKey,
          defaultLabel: page.defaultLabel,
          label: translateLabel(t, page.labelKey, page.defaultLabel),
          path: page.route,
          icon: page.icon,
          permission: page.viewPermissions[0] || null,
          anyPermissions: page.viewPermissions,
          sectionKey: section.key,
          sectionLabel,
          sectionIcon: section.icon,
          ownerOnly: Boolean(page.ownerOnly),
          sensitive: Boolean(page.sensitive),
        })),
    };
  }).filter((section) => section.pages.length);
}

export function getAdminNavigation(t) {
  return getAdminNavigationSections(t).flatMap((section) => section.pages);
}

export const adminNavigationSections = getAdminNavigationSections();
export const adminNavigation = getAdminNavigation();
export const adminNavigationByPath = new Map(adminNavigation.map((item) => [item.path, item]));

export function buildAdminNavigationSections(items = [], sectionsConfig = adminNavigationSections) {
  const normalizedItems = dedupeByPath(items);
  const itemsByPath = new Map(normalizedItems.map((item) => [item.path, item]));
  const assignedPaths = new Set();

  const sections = sectionsConfig
    .map((section) => ({
      ...section,
      pages: section.pages
        .map((page) => {
          const item = itemsByPath.get(page.path);
          if (!item) {
            return null;
          }

          assignedPaths.add(page.path);

          return {
            ...page,
            ...item,
            sectionKey: section.key,
            sectionLabel: section.label,
            sectionIcon: section.icon,
          };
        })
        .filter(Boolean),
    }))
    .filter((section) => section.pages.length);

  const unassignedItems = normalizedItems.filter((item) => !assignedPaths.has(item.path));
  if (unassignedItems.length) {
    sections.push({
      key: "other",
      label: "Other",
      icon: Landmark,
      pages: unassignedItems.map((item) => ({
        ...item,
        sectionKey: "other",
        sectionLabel: "Other",
        sectionIcon: Landmark,
      })),
    });
  }

  return sections;
}

export function buildAdminNavigationGroups(items = [], sectionsConfig = adminNavigationSections) {
  return buildAdminNavigationSections(items, sectionsConfig).map((section) => ({
    key: section.key,
    label: section.label,
    icon: section.icon,
    items: section.pages,
  }));
}

export const adminNavigationGroups = buildAdminNavigationGroups(adminNavigation);
