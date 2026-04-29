import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Newspaper, Save, Search, Tags } from "lucide-react";
import { createBlogPost, fetchBlogModuleData, updateBlogPost } from "../../services/adminService.js";
import { useSearchParams } from "react-router-dom";
import { languages } from "../../i18n/languages.js";
import { GLOBAL_BLOG_LOCALE } from "../../services/blogService.js";
import "../AdminContent/style.scss";

const blogLanguageOptions = [
  { code: GLOBAL_BLOG_LOCALE, nativeLabel: "All languages", label: "Shown on every language" },
  ...languages,
];

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric">
      <span><Icon size={22} strokeWidth={1.8} /></span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifySections(sections) {
  return (sections || [])
    .map((section) => [section.title, section.body].filter(Boolean).join("\n"))
    .join("\n\n");
}

function parseSections(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((block) => {
      const [title = "", ...bodyLines] = block.split("\n");
      return {
        title: title.trim(),
        body: bodyLines.join("\n").trim(),
      };
    })
    .filter((section) => section.title && section.body);
}

const emptyDraft = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  content_sections_input: "",
  cover_image: "",
  categories_input: "",
  tags_input: "",
  author_name: "",
  status: "draft",
  published_at: "",
  locale: GLOBAL_BLOG_LOCALE,
  read_time: "",
  seo_title: "",
  seo_description: "",
};

export default function AdminBlog() {
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [localeFilter, setLocaleFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadModule = async (keepSelection = true) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchBlogModuleData();
      setModuleData(next);
      if (!keepSelection && next.posts[0]) {
        setSelectedId(next.posts[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load blog module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule(false);
  }, []);

  useEffect(() => {
    const deepLinkedPostId = searchParams.get("post");
    if (deepLinkedPostId) {
      setSelectedId(deepLinkedPostId);
    }
  }, [searchParams]);

  const posts = moduleData?.posts || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((item) => {
      const matchesSearch = !q || [item.title, item.slug, item.excerpt, item.author_name, item.locale, ...(item.categories || []), ...(item.tags || [])]
        .some((value) => String(value || "").toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesLocale = localeFilter === "all" || item.locale === localeFilter;
      return matchesSearch && matchesStatus && matchesLocale;
    });
  }, [posts, search, statusFilter, localeFilter]);

  const selected = useMemo(
    () => filtered.find((item) => item.id === selectedId) || posts.find((item) => item.id === selectedId) || null,
    [filtered, posts, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft({
      id: selected.id,
      title: selected.title,
      slug: selected.slug,
      excerpt: selected.excerpt || "",
      content: selected.content || "",
      content_sections_input: stringifySections(selected.content_sections),
      cover_image: selected.cover_image || "",
      categories_input: (selected.categories || []).join(", "),
      tags_input: (selected.tags || []).join(", "),
      author_name: selected.author_name || "",
      status: selected.status,
      published_at: selected.published_at ? new Date(selected.published_at).toISOString().slice(0, 16) : "",
      locale: selected.locale || "en",
      read_time: selected.read_time || "",
      seo_title: selected.seo_title || "",
      seo_description: selected.seo_description || "",
    });
  }, [selected]);

  const metrics = useMemo(() => ({
    total: posts.length,
    published: posts.filter((item) => item.status === "published").length,
    scheduled: posts.filter((item) => item.status === "scheduled").length,
    draftCount: posts.filter((item) => item.status === "draft").length,
  }), [posts]);

  const savePost = async () => {
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        title: draft.title,
        slug: slugify(draft.slug || draft.title),
        excerpt: draft.excerpt,
        content: draft.content,
        content_sections: parseSections(draft.content_sections_input),
        cover_image: draft.cover_image,
        categories: parseList(draft.categories_input),
        tags: parseList(draft.tags_input),
        author_name: draft.author_name,
        status: draft.status,
        published_at: draft.published_at ? new Date(draft.published_at).toISOString() : null,
        locale: draft.locale,
        read_time: draft.read_time,
        seo_title: draft.seo_title,
        seo_description: draft.seo_description,
      };

      if (draft.id) {
        await updateBlogPost(draft.id, payload);
      } else {
        const result = await createBlogPost(payload);
        setSelectedId(result.id);
      }
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save blog post.");
    } finally {
      setIsSaving(false);
    }
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(emptyDraft);
  };

  return (
    <div className="admin-page admin-content-system-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Newspaper size={16} /> Content System</span>
          <h1>Blog</h1>
          <p>Publish articles, manage SEO metadata, schedule posts, and keep categories and tags structured.</p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsBlogModuleV1 && (
        <p className="admin-message">Run `010_content_system_v1.sql`, then `011_public_blog_management.sql` in Supabase to enable the Blog module.</p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading blog posts...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Newspaper} label="Posts" value={metrics.total} />
            <MetricCard icon={Save} label="Published" value={metrics.published} />
            <MetricCard icon={CalendarClock} label="Scheduled" value={metrics.scheduled} />
            <MetricCard icon={Tags} label="Draft" value={metrics.draftCount} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div><h2>Blog posts</h2><p>Long-form editorial content with scheduling and search metadata.</p></div>
              <button className="admin-link-button" type="button" onClick={startNew}>New post</button>
            </div>

            <div className="admin-content-system__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search title, author, tag, category" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="scheduled">scheduled</option>
                <option value="archived">archived</option>
              </select>
              <select value={localeFilter} onChange={(event) => setLocaleFilter(event.target.value)}>
                <option value="all">All languages</option>
                <option value={GLOBAL_BLOG_LOCALE}>Global posts</option>
                {languages.map((language) => <option value={language.code} key={language.code}>{language.nativeLabel}</option>)}
              </select>
            </div>

            <div className="admin-content-system__layout">
              <div className="admin-content-system__list">
                {filtered.length ? filtered.map((item) => (
                  <article key={item.id} className={`admin-content-system__row ${selectedId === item.id ? "is-active" : ""}`} onClick={() => setSelectedId(item.id)}>
                    <strong>{item.title}</strong>
                    <div className="admin-content-system__badges">
                      <span className="admin-content-system__badge">{item.status}</span>
                      <span className="admin-content-system__badge">{item.locale || "en"}</span>
                      {item.author_name && <span className="admin-content-system__badge">{item.author_name}</span>}
                    </div>
                    <p>{item.excerpt || item.slug}</p>
                    <small>{item.published_at ? new Date(item.published_at).toLocaleString() : "No publish date"}</small>
                  </article>
                )) : <div className="admin-content-system__empty">No posts match the current filters.</div>}
              </div>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>{draft.id ? "Edit post" : "Create post"}</h2><p>Simple editorial workflow for draft, scheduled, and published posts.</p></div>
                </div>

                <div className="admin-content-system__form">
                  <div className="admin-content-system__form-grid">
                    <div className="admin-content-system__field is-wide">
                      <label>Title</label>
                      <input value={draft.title} onChange={(event) => setDraft((state) => ({ ...state, title: event.target.value, slug: state.slug || slugify(event.target.value) }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Slug</label>
                      <input value={draft.slug} onChange={(event) => setDraft((state) => ({ ...state, slug: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Author</label>
                      <input value={draft.author_name} onChange={(event) => setDraft((state) => ({ ...state, author_name: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Language</label>
                      <select value={draft.locale} onChange={(event) => setDraft((state) => ({ ...state, locale: event.target.value }))}>
                        {blogLanguageOptions.map((language) => (
                          <option value={language.code} key={language.code}>
                            {language.nativeLabel}
                            {language.label ? ` - ${language.label}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-content-system__field">
                      <label>Status</label>
                      <select value={draft.status} onChange={(event) => setDraft((state) => ({ ...state, status: event.target.value }))}>
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                        <option value="scheduled">scheduled</option>
                        <option value="archived">archived</option>
                      </select>
                    </div>
                    <div className="admin-content-system__field">
                      <label>Publish at</label>
                      <input type="datetime-local" value={draft.published_at} onChange={(event) => setDraft((state) => ({ ...state, published_at: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Read time</label>
                      <input value={draft.read_time} onChange={(event) => setDraft((state) => ({ ...state, read_time: event.target.value }))} placeholder="5 min read" />
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Excerpt</label>
                      <textarea value={draft.excerpt} onChange={(event) => setDraft((state) => ({ ...state, excerpt: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Content</label>
                      <textarea value={draft.content} onChange={(event) => setDraft((state) => ({ ...state, content: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Article sections</label>
                      <textarea value={draft.content_sections_input} onChange={(event) => setDraft((state) => ({ ...state, content_sections_input: event.target.value }))} placeholder={"Section title\nSection body\n\nAnother section title\nAnother section body"} />
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Cover image URL</label>
                      <input value={draft.cover_image} onChange={(event) => setDraft((state) => ({ ...state, cover_image: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Categories</label>
                      <input value={draft.categories_input} onChange={(event) => setDraft((state) => ({ ...state, categories_input: event.target.value }))} placeholder="travel, compensation" />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Tags</label>
                      <input value={draft.tags_input} onChange={(event) => setDraft((state) => ({ ...state, tags_input: event.target.value }))} placeholder="delay, baggage" />
                    </div>
                    <div className="admin-content-system__field">
                      <label>SEO title</label>
                      <input value={draft.seo_title} onChange={(event) => setDraft((state) => ({ ...state, seo_title: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>SEO description</label>
                      <input value={draft.seo_description} onChange={(event) => setDraft((state) => ({ ...state, seo_description: event.target.value }))} />
                    </div>
                  </div>
                  <div className="admin-content-system__actions">
                    <button className="btn btn--ghost" type="button" onClick={startNew}>Reset</button>
                    <button className="btn btn--primary" type="button" disabled={isSaving} onClick={savePost}>Save post</button>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
