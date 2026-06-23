import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, Menu, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logoImage from "../assets/icons/logo-image.svg";
import logoText from "../assets/icons/fly-friendly.svg";
import { signInCustomer, signOut as signOutUser } from "../services/authService.js";
import {
  endAdminWorkSession,
  fetchAdminSearchData,
  fetchAdminSidebarMenu,
  heartbeatAdminWorkSession,
  logAdminActivity,
  preloadAdminWorkspaceData,
  startAdminWorkSession,
} from "../services/adminService.js";
import { preloadAdminFinanceWorkspaceData } from "../services/adminFinanceService.js";
import PasswordField from "../components/forms/PasswordField.jsx";
import { requireSupabase } from "../lib/supabase.js";
import { buildAdminNavigationSections, getAdminNavigation, getAdminNavigationSections } from "./navigation.js";
import { AdminPreferencesProvider, useAdminPreferencesState } from "./AdminPreferencesContext.jsx";
import { useAdminAuth } from "./AdminAuthContext.jsx";
import { getVisibleAdminNavigation } from "./accessControl.js";
import "./admin.scss";

function rankSearchValue(value, query) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (!normalizedValue || !query) {
    return 0;
  }

  if (normalizedValue === query) {
    return 120;
  }

  if (normalizedValue.startsWith(query)) {
    return 72;
  }

  if (normalizedValue.includes(query)) {
    return 30;
  }

  return 0;
}

function isPathActive(itemPath, pathname) {
  return itemPath === "/admin" ? pathname === "/admin" : pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function buildShellBreadcrumbs(activeSection, currentItem, t) {
  const crumbs = [{ key: "admin", label: t("admin.common.admin") }];

  if (activeSection?.label) {
    crumbs.push({ key: activeSection.key, label: activeSection.label });
  }

  if (currentItem?.label && currentItem.label !== activeSection?.label) {
    crumbs.push({ key: currentItem.path || currentItem.label, label: currentItem.label });
  }

  return crumbs;
}

function findBestMatch(items, pathname) {
  return items
    .filter((item) => isPathActive(item.path, pathname))
    .sort((left, right) => right.path.length - left.path.length)[0] || null;
}

function SectionLink({ item, onNavigate, className = "" }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/admin"}
      className={({ isActive }) => `admin-section-link${isActive ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onNavigate}
    >
      <span>{item.label}</span>
    </NavLink>
  );
}

function RailButton({ section, isActive, onSelect }) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      className={`admin-rail-button${isActive ? " is-active" : ""}`}
      onClick={onSelect}
      aria-pressed={isActive}
      aria-label={section.label}
    >
      <Icon size={18} strokeWidth={1.9} />
    </button>
  );
}

function MobileSectionButton({ section, isActive, isExpanded = false, onSelect }) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      className={`admin-mobile-section-button${isActive ? " is-active" : ""}${isExpanded ? " is-expanded" : ""}`}
      onClick={onSelect}
      aria-pressed={isActive}
      aria-expanded={isExpanded}
    >
      <Icon size={16} strokeWidth={1.9} />
      <span>{section.label}</span>
      <ChevronDown size={14} strokeWidth={1.9} />
    </button>
  );
}

function dedupeNavigationItems(items = []) {
  const seenPaths = new Set();

  return items.filter((item) => {
    if (!item?.path || seenPaths.has(item.path)) {
      return false;
    }

    seenPaths.add(item.path);
    return true;
  });
}

export function AdminLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshAuth } = useAdminAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
        await signInCustomer(form);
        const accessState = await refreshAuth();
        if (!accessState?.isAdminUser) {
          await signOutUser().catch(() => null);
          setError(t("admin.auth.noAccess"));
          return;
        }
      await logAdminActivity("login", "admin_session", null, {
        module: "auth",
        source: "admin_login",
      });
      navigate("/admin", { replace: true });
    } catch (authError) {
      setError(authError.message || t("admin.auth.signInError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <div className="admin-brand">
          <img src={logoImage} alt="" />
        </div>
        <h1>{t("admin.auth.signInTitle")}</h1>
        <p>{t("admin.auth.signInDescription")}</p>
        <form className="admin-auth-form" onSubmit={submit}>
          <input
            type="email"
            placeholder={t("admin.common.email")}
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
          <PasswordField
            className="admin-input"
            placeholder={t("admin.auth.password")}
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            autoComplete="current-password"
            required
          />
          {error && <p className="admin-auth-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("admin.auth.signingIn") : t("admin.auth.logIn")}
          </button>
        </form>
      </section>
    </main>
  );
}

export function AdminForbiddenPage() {
  const { t } = useTranslation();
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <div className="admin-brand">
          <img src={logoImage} alt="" />
        </div>
        <h1>{t("admin.auth.accessRestricted")}</h1>
        <p>{t("admin.auth.accessRestrictedDescription")}</p>
        <NavLink className="btn btn-primary" to="/">{t("admin.auth.backToSite")}</NavLink>
      </section>
    </main>
  );
}

function AdminLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const adminAuth = useAdminAuth();
  const { profile, primaryRoleLabel, roleLabels, roles, isAdminUser } = adminAuth;
  const preferencesState = useAdminPreferencesState(profile?.email, profile?.preferred_language);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchIndex, setSearchIndex] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [dynamicMenu, setDynamicMenu] = useState(null);
  const [openDesktopSectionKey, setOpenDesktopSectionKey] = useState("");
  const [expandedMobileSectionKey, setExpandedMobileSectionKey] = useState("");
  const adminWorkSessionIdRef = useRef("");
  const desktopRailRef = useRef(null);

  useEffect(() => {
    let active = true;

    fetchAdminSidebarMenu(profile?.id || null, roles || [])
      .then((menu) => {
        if (active) {
          setDynamicMenu(menu);
        }
      })
      .catch(() => {
        if (active) {
          setDynamicMenu(null);
        }
      });

    return () => {
      active = false;
    };
  }, [profile?.id, roles]);

  const translatedNavigation = useMemo(() => getAdminNavigation(t), [t]);
  const translatedNavigationSections = useMemo(() => getAdminNavigationSections(t), [t]);
  const navItems = useMemo(() => {
    const sourceItems = getVisibleAdminNavigation(adminAuth, translatedNavigation, {
      menuItems: dynamicMenu?.items || [],
    });
    const translatedByPath = new Map(translatedNavigation.map((item) => [item.path, item]));

    return sourceItems.map((item) => ({
      ...item,
      ...(translatedByPath.get(item.path) || {}),
    }));
  }, [adminAuth, dynamicMenu?.items, translatedNavigation]);

  const navSections = useMemo(
    () => buildAdminNavigationSections(navItems, translatedNavigationSections),
    [navItems, translatedNavigationSections],
  );

  const currentItem = findBestMatch(navItems, location.pathname);
  const activeSection = navSections.find((section) => section.pages.some((item) => isPathActive(item.path, location.pathname))) || navSections[0] || null;
  const currentLabel = currentItem?.label || activeSection?.label || t("admin.common.admin");
  const currentRoleLabel = primaryRoleLabel || roleLabels[0] || t("admin.common.noRoleAssigned");
  const currentUserEmail = profile?.email || t("admin.common.noEmailAvailable");
  const mobileSectionsLabel = t("admin.common.sectionsMenu", { defaultValue: "Sections" });
  const breadcrumbs = useMemo(
    () => buildShellBreadcrumbs(activeSection, currentItem, t),
    [activeSection, currentItem, t],
  );

  useEffect(() => {
    setExpandedMobileSectionKey(activeSection?.key || "");
  }, [activeSection?.key]);

  useEffect(() => {
    setOpenDesktopSectionKey("");
  }, [location.pathname]);

  useEffect(() => {
    if (!openDesktopSectionKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!desktopRailRef.current?.contains(event.target)) {
        setOpenDesktopSectionKey("");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openDesktopSectionKey]);

  const signOut = async () => {
    const client = requireSupabase();
    await endAdminWorkSession(adminWorkSessionIdRef.current || null).catch(() => null);
    adminWorkSessionIdRef.current = "";
    await logAdminActivity("logout", "admin_session", profile?.id || null, {
      module: "auth",
      source: "admin_logout",
    });
    await client.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  useEffect(() => {
    if (!profile?.id || !isAdminUser) {
      return undefined;
    }

    let active = true;
    setIsSearchLoading(true);

    fetchAdminSearchData()
      .then((data) => {
        if (active) {
          setSearchIndex(data);
        }
      })
      .catch(() => null)
      .finally(() => {
        if (active) {
          setIsSearchLoading(false);
        }
      });

    void preloadAdminWorkspaceData().catch(() => null);
    void preloadAdminFinanceWorkspaceData().catch(() => null);

    return () => {
      active = false;
    };
  }, [isAdminUser, profile?.id]);

  useEffect(() => {
    if (!isSearchOpen || searchIndex || isSearchLoading) {
      return;
    }

    let active = true;
    setIsSearchLoading(true);
    fetchAdminSearchData()
      .then((data) => {
        if (active) {
          setSearchIndex(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setIsSearchLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isSearchLoading, isSearchOpen, searchIndex]);

  useEffect(() => {
    if (!profile?.id || !isAdminUser) {
      return undefined;
    }

    let active = true;
    let heartbeatTimer = null;

    startAdminWorkSession()
      .then((sessionId) => {
        if (!active) {
          if (sessionId) {
            void endAdminWorkSession(sessionId);
          }
          return;
        }

        adminWorkSessionIdRef.current = sessionId || "";
        heartbeatTimer = window.setInterval(() => {
          void heartbeatAdminWorkSession(adminWorkSessionIdRef.current || null);
        }, 3 * 60 * 1000);
      })
      .catch(() => null);

    const handleVisibilityChange = () => {
      void heartbeatAdminWorkSession(adminWorkSessionIdRef.current || null);
    };

    const handlePageHide = () => {
      void heartbeatAdminWorkSession(adminWorkSessionIdRef.current || null);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      active = false;
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      void endAdminWorkSession(adminWorkSessionIdRef.current || null);
      adminWorkSessionIdRef.current = "";
    };
  }, [isAdminUser, profile?.id]);

  const searchResults = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const results = [];

    navItems.forEach((item) => {
      if (item.label.toLowerCase().includes(query)) {
        results.push({
          id: `module:${item.path}`,
          group: t("admin.search.groups.modules"),
          label: item.label,
          meta: item.path,
          path: item.path,
          score: rankSearchValue(item.label, query) + rankSearchValue(item.path, query),
        });
      }
    });

    const addMatches = (group, rows, mapper) => {
      rows.forEach((row) => {
        const mapped = mapper(row);
        if (!mapped) return;
        const haystack = [mapped.label, mapped.meta].join(" ").toLowerCase();
        if (haystack.includes(query)) {
          results.push({ group, ...mapped });
        }
      });
    };

    if (searchIndex) {
      addMatches(t("admin.search.groups.leads"), searchIndex.leads || [], (row) => ({
        id: `lead:${row.id}`,
        label: row.full_name || row.lead_code || "Lead",
        meta: [row.lead_code, row.email, row.airline, row.departure_airport, row.arrival_airport, row.status].filter(Boolean).join(" • "),
        path: `/admin/operations/leads?lead=${row.id}`,
        score:
          rankSearchValue(row.full_name, query) * 3 +
          rankSearchValue(row.lead_code, query) +
          rankSearchValue(row.email, query) +
          rankSearchValue(row.airline, query),
      }));
      addMatches(t("admin.search.groups.cases"), searchIndex.cases || [], (row) => ({
        id: `case:${row.id}`,
        label: row.case_code || "Case",
        meta: [row.airline, row.route_from && row.route_to ? `${row.route_from} → ${row.route_to}` : "", row.status].filter(Boolean).join(" • "),
        path: `/admin/operations/cases?case=${row.id}`,
        score: rankSearchValue(row.case_code, query) + rankSearchValue(row.airline, query),
      }));
      addMatches(t("admin.search.groups.customers"), searchIndex.customers || [], (row) => ({
        id: `customer:${row.id}`,
        label: row.full_name || row.email || "Customer",
        meta: [row.email, row.phone, row.country].filter(Boolean).join(" • "),
        path: `/admin/people/customers?customer=${row.id}`,
        score: rankSearchValue(row.full_name, query) + rankSearchValue(row.email, query),
      }));
      addMatches(t("admin.search.groups.tasks"), searchIndex.tasks || [], (row) => ({
        id: `task:${row.id}`,
        label: row.title || "Task",
        meta: [row.related_entity_type, row.status].filter(Boolean).join(" • "),
        path: `/admin/operations/tasks?task=${row.id}`,
        score: rankSearchValue(row.title, query),
      }));
      addMatches(t("admin.search.groups.partners"), searchIndex.partners || [], (row) => ({
        id: `partner:${row.id}`,
        label: row.name || "Partner",
        meta: [row.referral_code, row.status].filter(Boolean).join(" • "),
        path: `/admin/people/referral?partner=${row.id}`,
        score: rankSearchValue(row.name, query) + rankSearchValue(row.referral_code, query),
      }));
      addMatches(t("admin.search.groups.blog"), searchIndex.blogPosts || [], (row) => ({
        id: `post:${row.id}`,
        label: row.title || "Post",
        meta: [row.slug, row.status].filter(Boolean).join(" • "),
        path: `/admin/content/pages?post=${row.id}`,
        score: rankSearchValue(row.title, query) + rankSearchValue(row.slug, query),
      }));
      addMatches(t("admin.search.groups.faq"), searchIndex.faqItems || [], (row) => ({
        id: `faq:${row.id}`,
        label: row.question || "FAQ item",
        meta: [row.category, row.status].filter(Boolean).join(" • "),
        path: `/admin/content/pages?faq=${row.id}`,
        score: rankSearchValue(row.question, query),
      }));
      addMatches(t("admin.search.groups.cms"), searchIndex.cmsPages || [], (row) => ({
        id: `page:${row.id}`,
        label: row.title || row.page_key || "Page",
        meta: [row.page_key, row.slug, row.status].filter(Boolean).join(" • "),
        path: `/admin/content/cms?page=${row.id}`,
        score: rankSearchValue(row.title, query) + rankSearchValue(row.page_key, query),
      }));
      addMatches(t("admin.search.groups.settings"), searchIndex.settings || [], (row) => ({
        id: `setting:${row.id}`,
        label: row.label || row.setting_key || "Setting",
        meta: [row.group_key, row.setting_key].filter(Boolean).join(" • "),
        path: `/admin/settings/system?setting=${row.id}`,
        score: rankSearchValue(row.label, query) + rankSearchValue(row.setting_key, query),
      }));
    }

    return results
      .sort((left, right) => {
        if ((right.score || 0) !== (left.score || 0)) {
          return (right.score || 0) - (left.score || 0);
        }

        return String(left.label || "").localeCompare(String(right.label || ""));
      })
      .slice(0, 14);
  }, [navItems, searchIndex, searchValue]);

  const goToSearchResult = (path) => {
    navigate(path);
    setSearchValue("");
    setIsSearchOpen(false);
  };

  const goToSection = (section) => {
    const target = section.pages.find((item) => item.path === section.route)?.path || section.pages[0]?.path || section.route || "/admin";
    setIsSidebarOpen(false);
    setOpenDesktopSectionKey("");
    navigate(target);
  };

  const toggleDesktopSection = (section) => {
    if (!section.pages?.length) {
      goToSection(section);
      return;
    }

    setOpenDesktopSectionKey((current) => current === section.key ? "" : section.key);
  };

  return (
    <AdminPreferencesProvider value={preferencesState}>
      <div
        className={`admin-shell${isSidebarOpen ? " is-sidebar-open" : ""}`}
        data-admin-theme={preferencesState.resolvedTheme}
        data-admin-theme-mode={preferencesState.preferences.theme}
        data-admin-text-scale={preferencesState.preferences.textScale}
      >
      {isSidebarOpen ? <button type="button" className="admin-sidebar__overlay" aria-label={t("admin.common.closeMenu")} onClick={() => setIsSidebarOpen(false)} /> : null}
      <aside className="admin-icon-rail">
        <div className="admin-rail-logo-wrap">
          <NavLink to="/admin" className="admin-rail-logo" onClick={() => setIsSidebarOpen(false)} aria-label={t("admin.common.adminHomeLabel")}>
            <img src={logoImage} alt="" />
          </NavLink>
          <button type="button" className="admin-sidebar__close" onClick={() => setIsSidebarOpen(false)} aria-label={t("admin.common.closeMenu")}>
            <Menu size={18} />
          </button>
        </div>
        <nav ref={desktopRailRef} className="admin-rail-nav sidebar-scroll compact-nav-group" aria-label="Admin sections">
          {navSections.map((section) => (
            <div
              key={section.key}
              className={`admin-rail-item${openDesktopSectionKey === section.key ? " is-open" : ""}`}
            >
              <RailButton
                section={section}
                isActive={section.key === activeSection?.key}
                onSelect={() => toggleDesktopSection(section)}
              />
              {section.pages?.length ? (
                <div className="admin-rail-flyout" role="menu" aria-label={section.label}>
                  <div className="admin-rail-flyout__header">
                    <span>{mobileSectionsLabel}</span>
                    <strong>{section.label}</strong>
                  </div>
                  <nav className="admin-rail-flyout__nav">
                    {section.pages.map((item) => (
                      <SectionLink
                        key={item.path}
                        item={item}
                        className="admin-rail-flyout__link"
                        onNavigate={() => {
                          setOpenDesktopSectionKey("");
                          setIsSidebarOpen(false);
                        }}
                      />
                    ))}
                  </nav>
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>

      <aside className="admin-section-sidebar">
        <div className="admin-section-header">
          <span>{t("admin.common.section")}</span>
          <strong>{activeSection?.label || t("admin.common.admin")}</strong>
        </div>
        <div className="admin-mobile-sections" aria-label="Admin sections">
          {navSections.map((section) => (
            <div key={section.key} className={`admin-mobile-section-group${expandedMobileSectionKey === section.key ? " is-open" : ""}`}>
              <MobileSectionButton
                section={section}
                isActive={section.key === activeSection?.key}
                isExpanded={expandedMobileSectionKey === section.key}
                onSelect={() => setExpandedMobileSectionKey((current) => current === section.key ? "" : section.key)}
              />
              {expandedMobileSectionKey === section.key ? (
                <div className="admin-mobile-section-panel">
                  <span className="admin-mobile-section-panel__label">{mobileSectionsLabel}</span>
                  <nav className="admin-mobile-section-panel__nav" aria-label={`${section.label} ${mobileSectionsLabel}`}>
                    {section.pages.map((item) => (
                      <SectionLink
                        key={item.path}
                        item={item}
                        className="admin-mobile-section-link"
                        onNavigate={() => setIsSidebarOpen(false)}
                      />
                    ))}
                  </nav>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <nav className="admin-section-nav sidebar-scroll compact-nav-group" aria-label={activeSection?.label || "Admin section pages"}>
          {(activeSection?.pages || []).map((item) => (
            <SectionLink key={item.path} item={item} onNavigate={() => setIsSidebarOpen(false)} />
          ))}
        </nav>
        <div className="admin-mobile-account">
          <div className="admin-user-chip">
            <span>{t("admin.common.email")}</span>
            <strong>{currentUserEmail}</strong>
          </div>
          <div className="admin-user-chip">
            <span>{t("admin.common.role")}</span>
            <strong>{currentRoleLabel}</strong>
          </div>
          <button type="button" className="admin-logout" onClick={signOut}>
            <LogOut size={16} />
            <span>{t("admin.common.logOut")}</span>
          </button>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar__left">
            <button
              type="button"
              className="admin-menu-button"
              onClick={() => setIsSidebarOpen((current) => !current)}
              aria-label={t("admin.common.openAdminNavigation")}
            >
              <Menu size={18} />
            </button>
            <nav className="admin-topbar__breadcrumbs" aria-label="Breadcrumbs">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.key} className={`admin-topbar__breadcrumb${index === breadcrumbs.length - 1 ? " is-current" : ""}`}>
                  {crumb.label}
                </span>
              ))}
            </nav>
          </div>
          <div className="admin-topbar__right">
            <label className="admin-search admin-search--topbar">
              <Search size={16} />
              <input
                type="search"
                placeholder={t("admin.search.placeholder")}
                value={searchValue}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setIsSearchOpen(false), 120)}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0]?.path) {
                    event.preventDefault();
                    goToSearchResult(searchResults[0].path);
                  }
                }}
              />
              <AnimatePresence>
                {isSearchOpen ? (
                  <motion.div
                    className="admin-search__dropdown"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                  {isSearchLoading && !searchIndex ? (
                    <div className="admin-search__empty">{t("admin.search.loading")}</div>
                  ) : searchValue.trim() ? (
                    searchResults.length ? (
                      searchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="admin-search__result"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            goToSearchResult(item.path);
                          }}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.group} • {item.meta}</span>
                        </button>
                      ))
                    ) : (
                      <div className="admin-search__empty">{t("admin.search.noResults")}</div>
                    )
                  ) : (
                    <div className="admin-search__empty">{t("admin.search.startTyping")}</div>
                  )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </label>
            <div className="admin-user-chip">
              <span>{t("admin.common.email")}</span>
              <strong>{currentUserEmail}</strong>
            </div>
            <div className="admin-user-chip">
              <span>{t("admin.common.role")}</span>
              <strong>{currentRoleLabel}</strong>
            </div>
            <button type="button" className="admin-logout" onClick={signOut}>
              <LogOut size={16} />
              <span>{t("admin.common.logOut")}</span>
            </button>
          </div>
        </header>

        <main className="admin-main admin-content-scroll">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="admin-main__viewport"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="admin-shell-page workspace-container">
                {/* <header className="admin-shell-page__header workspace-toolbar">
                  <div className="admin-shell-page__heading">
                    <span className="admin-shell-page__eyebrow">{activeSection?.label || "Admin"}</span>
                    <h1>{currentLabel}</h1>
                    <p>This page header is driven by the active admin route.</p>
                  </div>
                </header> */}

                <div className="admin-shell-page__body workspace-section">
                  <Outlet />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      </div>
    </AdminPreferencesProvider>
  );
}

export default AdminLayout;
