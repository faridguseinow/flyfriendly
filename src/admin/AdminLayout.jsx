import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logoImage from "../assets/icons/logo-image.svg";
import logoText from "../assets/icons/fly-friendly.svg";
import { signInCustomer } from "../services/authService.js";
import { fetchAdminSearchData } from "../services/adminService.js";
import { requireSupabase } from "../lib/supabase.js";
import { adminNavigation } from "./navigation.js";
import { useAdminAuth } from "./AdminAuthContext.jsx";
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

function SidebarLink({ item, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/admin"}
      className={({ isActive }) => `admin-sidebar__link${isActive ? " is-active" : ""}`}
      onClick={onNavigate}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function AdminLoginPage() {
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
      await refreshAuth();
      navigate("/admin", { replace: true });
    } catch (authError) {
      setError(authError.message || "Could not sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <div className="admin-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </div>
        <h1>Admin sign in</h1>
        <p>Use an internal account with an assigned Fly Friendly admin role.</p>
        <form className="admin-auth-form" onSubmit={submit}>
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            required
          />
          {error && <p className="admin-auth-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function AdminForbiddenPage() {
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <div className="admin-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </div>
        <h1>Access restricted</h1>
        <p>Your account is authenticated, but it does not have permission to access this admin area.</p>
        <NavLink className="btn btn-primary" to="/">Back to site</NavLink>
      </section>
    </main>
  );
}

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, roleLabels, hasPermission } = useAdminAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchIndex, setSearchIndex] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const navItems = useMemo(
    () => adminNavigation.filter((item) => hasPermission(item.permission)),
    [hasPermission],
  );

  const currentLabel = navItems.find((item) =>
    item.path === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.path),
  )?.label;

  const signOut = async () => {
    const client = requireSupabase();
    await client.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

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
          group: "Modules",
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
      addMatches("Leads", searchIndex.leads || [], (row) => ({
        id: `lead:${row.id}`,
        label: row.full_name || row.lead_code || "Lead",
        meta: [row.lead_code, row.email, row.airline, row.departure_airport, row.arrival_airport, row.status].filter(Boolean).join(" • "),
        path: `/admin/leads?lead=${row.id}`,
        score:
          rankSearchValue(row.full_name, query) * 3 +
          rankSearchValue(row.lead_code, query) +
          rankSearchValue(row.email, query) +
          rankSearchValue(row.airline, query),
      }));
      addMatches("Cases", searchIndex.cases || [], (row) => ({
        id: `case:${row.id}`,
        label: row.case_code || "Case",
        meta: [row.airline, row.route_from && row.route_to ? `${row.route_from} → ${row.route_to}` : "", row.status].filter(Boolean).join(" • "),
        path: `/admin/cases?case=${row.id}`,
        score: rankSearchValue(row.case_code, query) + rankSearchValue(row.airline, query),
      }));
      addMatches("Customers", searchIndex.customers || [], (row) => ({
        id: `customer:${row.id}`,
        label: row.full_name || row.email || "Customer",
        meta: [row.email, row.phone, row.country].filter(Boolean).join(" • "),
        path: `/admin/customers?customer=${row.id}`,
        score: rankSearchValue(row.full_name, query) + rankSearchValue(row.email, query),
      }));
      addMatches("Tasks", searchIndex.tasks || [], (row) => ({
        id: `task:${row.id}`,
        label: row.title || "Task",
        meta: [row.related_entity_type, row.status].filter(Boolean).join(" • "),
        path: `/admin/tasks?task=${row.id}`,
        score: rankSearchValue(row.title, query),
      }));
      addMatches("Partners", searchIndex.partners || [], (row) => ({
        id: `partner:${row.id}`,
        label: row.name || "Partner",
        meta: [row.referral_code, row.status].filter(Boolean).join(" • "),
        path: `/admin/referral-partners?partner=${row.id}`,
        score: rankSearchValue(row.name, query) + rankSearchValue(row.referral_code, query),
      }));
      addMatches("Blog", searchIndex.blogPosts || [], (row) => ({
        id: `post:${row.id}`,
        label: row.title || "Post",
        meta: [row.slug, row.status].filter(Boolean).join(" • "),
        path: `/admin/blog?post=${row.id}`,
        score: rankSearchValue(row.title, query) + rankSearchValue(row.slug, query),
      }));
      addMatches("FAQ", searchIndex.faqItems || [], (row) => ({
        id: `faq:${row.id}`,
        label: row.question || "FAQ item",
        meta: [row.category, row.status].filter(Boolean).join(" • "),
        path: `/admin/faq?faq=${row.id}`,
        score: rankSearchValue(row.question, query),
      }));
      addMatches("CMS", searchIndex.cmsPages || [], (row) => ({
        id: `page:${row.id}`,
        label: row.title || row.page_key || "Page",
        meta: [row.page_key, row.slug, row.status].filter(Boolean).join(" • "),
        path: `/admin/cms?page=${row.id}`,
        score: rankSearchValue(row.title, query) + rankSearchValue(row.page_key, query),
      }));
      addMatches("Settings", searchIndex.settings || [], (row) => ({
        id: `setting:${row.id}`,
        label: row.label || row.setting_key || "Setting",
        meta: [row.group_key, row.setting_key].filter(Boolean).join(" • "),
        path: `/admin/settings?setting=${row.id}`,
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

  return (
    <div className={`admin-shell${isSidebarOpen ? " is-sidebar-open" : ""}`}>
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <NavLink to="/admin" className="admin-brand" onClick={() => setIsSidebarOpen(false)}>
            <img src={logoImage} alt="" />
            <img src={logoText} alt="Fly Friendly" />
          </NavLink>
          <button type="button" className="admin-sidebar__close" onClick={() => setIsSidebarOpen(false)}>
            <Menu size={18} />
          </button>
        </div>
        <nav className="admin-sidebar__nav">
          {navItems.map((item) => (
            <SidebarLink key={item.path} item={item} onNavigate={() => setIsSidebarOpen(false)} />
          ))}
        </nav>
      </aside>

      <div className="admin-shell__content">
        <header className="admin-topbar">
          <div className="admin-topbar__left">
            <button type="button" className="admin-menu-button" onClick={() => setIsSidebarOpen((current) => !current)}>
              <Menu size={18} />
            </button>
            <div>
              <strong>{currentLabel || "Admin"}</strong>
              <span>Fly Friendly internal control panel</span>
            </div>
          </div>
          <div className="admin-topbar__right">
            <label className="admin-search admin-search--topbar">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search modules, leads, cases"
                value={searchValue}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setIsSearchOpen(false), 120)}
                onChange={(event) => setSearchValue(event.target.value)}
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
                    <div className="admin-search__empty">Loading search index...</div>
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
                      <div className="admin-search__empty">No results for this query.</div>
                    )
                  ) : (
                    <div className="admin-search__empty">Start typing to search modules and records.</div>
                  )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </label>
            <div className="admin-user-chip">
              <strong>{profile?.full_name || profile?.email || "Admin User"}</strong>
              <span>{roleLabels.join(" · ") || "No role assigned"}</span>
            </div>
            <button type="button" className="admin-logout" onClick={signOut}>
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </header>

        <main className="admin-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="admin-content__viewport"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
