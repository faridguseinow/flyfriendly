import { useEffect, useMemo, useState } from "react";
import { CircleHelp, FileText, Save, Search } from "lucide-react";
import { createFaqItem, fetchFaqModuleData, updateFaqItem } from "../../services/adminService.js";
import { useSearchParams } from "react-router-dom";
import "../AdminContent/style.scss";

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

const emptyDraft = {
  id: null,
  question: "",
  answer: "",
  category: "general",
  sort_order: 0,
  status: "draft",
  locale: "en",
};

export default function AdminFaq() {
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadModule = async (keepSelection = true) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchFaqModuleData();
      setModuleData(next);
      if (!keepSelection && next.items[0]) {
        setSelectedId(next.items[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load FAQ module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule(false);
  }, []);

  useEffect(() => {
    const deepLinkedFaqId = searchParams.get("faq");
    if (deepLinkedFaqId) {
      setSelectedId(deepLinkedFaqId);
    }
  }, [searchParams]);

  const items = moduleData?.items || [];
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))).sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !q || [item.question, item.answer, item.category].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [categoryFilter, items, search, statusFilter]);

  const selected = useMemo(
    () => filtered.find((item) => item.id === selectedId) || items.find((item) => item.id === selectedId) || null,
    [filtered, items, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft({
      id: selected.id,
      question: selected.question,
      answer: selected.answer,
      category: selected.category,
      sort_order: selected.sort_order,
      status: selected.status,
      locale: selected.locale,
    });
  }, [selected]);

  const metrics = useMemo(() => ({
    total: items.length,
    published: items.filter((item) => item.status === "published").length,
    draftCount: items.filter((item) => item.status === "draft").length,
    categories: categories.length,
  }), [categories.length, items]);

  const saveFaq = async () => {
    setIsSaving(true);
    setError("");
    try {
      if (draft.id) {
        await updateFaqItem(draft.id, draft);
      } else {
        const result = await createFaqItem(draft);
        setSelectedId(result.id);
      }
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save FAQ item.");
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
          <span className="section-label is-primary"><CircleHelp size={16} /> Content System</span>
          <h1>FAQ</h1>
          <p>Manage published questions, answers, categories, ordering, and locale-specific support content.</p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsFaqModuleV1 && (
        <p className="admin-message">Run `010_content_system_v1.sql` in Supabase to enable the FAQ module.</p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading FAQ items...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={CircleHelp} label="FAQ items" value={metrics.total} />
            <MetricCard icon={FileText} label="Published" value={metrics.published} />
            <MetricCard icon={Save} label="Draft" value={metrics.draftCount} />
            <MetricCard icon={CircleHelp} label="Categories" value={metrics.categories} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div><h2>FAQ library</h2><p>Structured customer support content with publish control and ordering.</p></div>
              <button className="admin-link-button" type="button" onClick={startNew}>New FAQ item</button>
            </div>

            <div className="admin-content-system__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search question, answer, category" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>

            <div className="admin-content-system__layout">
              <div className="admin-content-system__list">
                {filtered.length ? filtered.map((item) => (
                  <article key={item.id} className={`admin-content-system__row ${selectedId === item.id ? "is-active" : ""}`} onClick={() => setSelectedId(item.id)}>
                    <strong>{item.question}</strong>
                    <div className="admin-content-system__badges">
                      <span className="admin-content-system__badge">{item.status}</span>
                      <span className="admin-content-system__badge">{item.category}</span>
                      <span className="admin-content-system__badge">{item.locale}</span>
                    </div>
                    <p>{item.answer.slice(0, 140)}{item.answer.length > 140 ? "..." : ""}</p>
                    <small>Order {item.sort_order}</small>
                  </article>
                )) : <div className="admin-content-system__empty">No FAQ items match the current filters.</div>}
              </div>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>{draft.id ? "Edit FAQ item" : "Create FAQ item"}</h2><p>Draft and publish customer-facing answers from one editor.</p></div>
                </div>
                <div className="admin-content-system__form">
                  <div className="admin-content-system__form-grid">
                    <div className="admin-content-system__field is-wide">
                      <label>Question</label>
                      <input value={draft.question} onChange={(event) => setDraft((state) => ({ ...state, question: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Category</label>
                      <input value={draft.category} onChange={(event) => setDraft((state) => ({ ...state, category: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Locale</label>
                      <input value={draft.locale} onChange={(event) => setDraft((state) => ({ ...state, locale: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Status</label>
                      <select value={draft.status} onChange={(event) => setDraft((state) => ({ ...state, status: event.target.value }))}>
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                        <option value="archived">archived</option>
                      </select>
                    </div>
                    <div className="admin-content-system__field">
                      <label>Sort order</label>
                      <input type="number" value={draft.sort_order} onChange={(event) => setDraft((state) => ({ ...state, sort_order: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Answer</label>
                      <textarea value={draft.answer} onChange={(event) => setDraft((state) => ({ ...state, answer: event.target.value }))} />
                    </div>
                  </div>
                  <div className="admin-content-system__actions">
                    <button className="btn btn--ghost" type="button" onClick={startNew}>Reset</button>
                    <button className="btn btn--primary" type="button" disabled={isSaving} onClick={saveFaq}>Save FAQ item</button>
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
