import { useEffect, useMemo, useState } from "react";
import { FileText, LayoutTemplate, Plus, Save, Search } from "lucide-react";
import {
  createCmsBlock,
  createCmsPage,
  fetchCmsModuleData,
  refreshAviationCatalog,
  updateCmsBlock,
  updateCmsPage,
} from "../../services/adminService.js";
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

const emptyPage = {
  id: null,
  page_key: "",
  title: "",
  slug: "",
  status: "draft",
  locale: "en",
  seo_title: "",
  seo_description: "",
};

const emptyBlock = {
  id: null,
  page_id: "",
  block_type: "rich_text",
  block_key: "",
  title: "",
  body: "",
  image_url: "",
  cta_label: "",
  cta_link: "",
  sort_order: 0,
  status: "draft",
  payload_input: "{}",
};

function stringifyPayload(value) {
  return JSON.stringify(value || {}, null, 2);
}

export default function AdminCms() {
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [pageDraft, setPageDraft] = useState(emptyPage);
  const [blockDraft, setBlockDraft] = useState(emptyBlock);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);

  const loadModule = async (keepSelection = true) => {
    setError("");
    setNotice("");
    setIsLoading(true);
    try {
      const next = await fetchCmsModuleData();
      setModuleData(next);
      if (!keepSelection && next.pages[0]) {
        setSelectedPageId(next.pages[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load CMS module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule(false);
  }, []);

  useEffect(() => {
    const deepLinkedPageId = searchParams.get("page");
    if (deepLinkedPageId) {
      setSelectedPageId(deepLinkedPageId);
    }
  }, [searchParams]);

  const pages = moduleData?.pages || [];
  const blocks = moduleData?.blocks || [];
  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((item) => !q || [item.page_key, item.title, item.slug].some((value) => String(value || "").toLowerCase().includes(q)));
  }, [pages, search]);

  const selectedPage = useMemo(
    () => filteredPages.find((item) => item.id === selectedPageId) || pages.find((item) => item.id === selectedPageId) || null,
    [filteredPages, pages, selectedPageId],
  );

  const pageBlocks = useMemo(
    () => blocks.filter((item) => item.page_id === selectedPage?.id).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [blocks, selectedPage],
  );

  const selectedBlock = useMemo(
    () => pageBlocks.find((item) => item.id === selectedBlockId) || null,
    [pageBlocks, selectedBlockId],
  );

  useEffect(() => {
    if (!selectedPage) return;
    setPageDraft({
      id: selectedPage.id,
      page_key: selectedPage.page_key,
      title: selectedPage.title,
      slug: selectedPage.slug,
      status: selectedPage.status,
      locale: selectedPage.locale,
      seo_title: selectedPage.seo_title || "",
      seo_description: selectedPage.seo_description || "",
    });
    setBlockDraft((state) => ({ ...state, page_id: selectedPage.id }));
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedBlock) return;
    setBlockDraft({
      id: selectedBlock.id,
      page_id: selectedBlock.page_id,
      block_type: selectedBlock.block_type,
      block_key: selectedBlock.block_key,
      title: selectedBlock.title || "",
      body: selectedBlock.body || "",
      image_url: selectedBlock.image_url || "",
      cta_label: selectedBlock.cta_label || "",
      cta_link: selectedBlock.cta_link || "",
      sort_order: selectedBlock.sort_order || 0,
      status: selectedBlock.status,
      payload_input: stringifyPayload(selectedBlock.payload),
    });
  }, [selectedBlock]);

  const metrics = useMemo(() => ({
    pages: pages.length,
    published: pages.filter((item) => item.status === "published").length,
    blocks: blocks.length,
    publishedBlocks: blocks.filter((item) => item.status === "published").length,
  }), [blocks, pages]);

  const savePage = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      if (pageDraft.id) {
        await updateCmsPage(pageDraft.id, pageDraft);
      } else {
        const result = await createCmsPage(pageDraft);
        setSelectedPageId(result.id);
      }
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save CMS page.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveBlock = async () => {
    if (!blockDraft.page_id) {
      setError("Select or create a page first.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...blockDraft,
        payload: JSON.parse(blockDraft.payload_input || "{}"),
      };
      if (blockDraft.id) {
        await updateCmsBlock(blockDraft.id, payload);
      } else {
        const result = await createCmsBlock(payload);
        setSelectedBlockId(result.id);
      }
      await loadModule();
    } catch (nextError) {
      setError(nextError.message || "Could not save CMS block.");
    } finally {
      setIsSaving(false);
    }
  };

  const startNewPage = () => {
    setSelectedPageId(null);
    setSelectedBlockId(null);
    setPageDraft(emptyPage);
    setBlockDraft(emptyBlock);
  };

  const startNewBlock = () => {
    setSelectedBlockId(null);
    setBlockDraft({ ...emptyBlock, page_id: selectedPage?.id || "" });
  };

  const handleRefreshCatalog = async () => {
    setIsRefreshingCatalog(true);
    setError("");
    setNotice("");
    try {
      const result = await refreshAviationCatalog();
      setNotice(`Aviation catalog refreshed: ${result.airports} airports and ${result.airlines} airlines.`);
    } catch (nextError) {
      setError(nextError.message || "Could not refresh aviation catalog.");
    } finally {
      setIsRefreshingCatalog(false);
    }
  };

  return (
    <div className="admin-page admin-content-system-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><LayoutTemplate size={16} /> Content System</span>
          <h1>Website CMS</h1>
          <p>Manage public site pages and ordered content blocks with publish states, SEO fields, and reusable payloads.</p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {notice && <p className="admin-message">{notice}</p>}
      {moduleData && !moduleData.supportsCmsModuleV1 && (
        <p className="admin-message">Run `010_content_system_v1.sql` in Supabase to enable the Website CMS module.</p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading CMS data...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={FileText} label="Pages" value={metrics.pages} />
            <MetricCard icon={LayoutTemplate} label="Published pages" value={metrics.published} />
            <MetricCard icon={Plus} label="Blocks" value={metrics.blocks} />
            <MetricCard icon={Save} label="Published blocks" value={metrics.publishedBlocks} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div><h2>CMS workspace</h2><p>Pages and their ordered blocks stay in one connected editing flow.</p></div>
              <div className="admin-content-system__toolbar">
                <button className="admin-link-button" type="button" disabled={isRefreshingCatalog} onClick={handleRefreshCatalog}>
                  {isRefreshingCatalog ? "Refreshing catalog..." : "Refresh aviation data"}
                </button>
                <button className="admin-link-button" type="button" onClick={startNewPage}>New page</button>
              </div>
            </div>

            <div className="admin-content-system__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search page key, title, slug" />
              </label>
            </div>

            <div className="admin-content-system__layout">
              <div className="admin-content-system__list">
                {filteredPages.length ? filteredPages.map((item) => (
                  <article key={item.id} className={`admin-content-system__row ${selectedPageId === item.id ? "is-active" : ""}`} onClick={() => setSelectedPageId(item.id)}>
                    <strong>{item.title}</strong>
                    <div className="admin-content-system__badges">
                      <span className="admin-content-system__badge">{item.page_key}</span>
                      <span className="admin-content-system__badge">{item.status}</span>
                      <span className="admin-content-system__badge">{item.locale}</span>
                    </div>
                    <p>{item.slug}</p>
                    <small>{blocks.filter((block) => block.page_id === item.id).length} blocks</small>
                  </article>
                )) : <div className="admin-content-system__empty">No CMS pages found.</div>}
              </div>

              <div className="admin-content-system__subgrid">
                <section className="admin-panel">
                  <div className="admin-panel__head">
                    <div><h2>{pageDraft.id ? "Edit page" : "Create page"}</h2><p>Page shell with SEO and publication metadata.</p></div>
                  </div>
                  <div className="admin-content-system__form">
                    <div className="admin-content-system__form-grid">
                      <div className="admin-content-system__field">
                        <label>Page key</label>
                        <input value={pageDraft.page_key} onChange={(event) => setPageDraft((state) => ({ ...state, page_key: event.target.value }))} />
                      </div>
                      <div className="admin-content-system__field">
                        <label>Title</label>
                        <input value={pageDraft.title} onChange={(event) => setPageDraft((state) => ({ ...state, title: event.target.value }))} />
                      </div>
                      <div className="admin-content-system__field">
                        <label>Slug</label>
                        <input value={pageDraft.slug} onChange={(event) => setPageDraft((state) => ({ ...state, slug: event.target.value }))} />
                      </div>
                      <div className="admin-content-system__field">
                        <label>Status</label>
                        <select value={pageDraft.status} onChange={(event) => setPageDraft((state) => ({ ...state, status: event.target.value }))}>
                          <option value="draft">draft</option>
                          <option value="published">published</option>
                          <option value="archived">archived</option>
                        </select>
                      </div>
                      <div className="admin-content-system__field">
                        <label>Locale</label>
                        <input value={pageDraft.locale} onChange={(event) => setPageDraft((state) => ({ ...state, locale: event.target.value }))} />
                      </div>
                      <div className="admin-content-system__field">
                        <label>SEO title</label>
                        <input value={pageDraft.seo_title} onChange={(event) => setPageDraft((state) => ({ ...state, seo_title: event.target.value }))} />
                      </div>
                      <div className="admin-content-system__field is-wide">
                        <label>SEO description</label>
                        <textarea value={pageDraft.seo_description} onChange={(event) => setPageDraft((state) => ({ ...state, seo_description: event.target.value }))} />
                      </div>
                    </div>
                    <div className="admin-content-system__actions">
                      <button className="btn btn--ghost" type="button" onClick={startNewPage}>Reset</button>
                      <button className="btn btn--primary" type="button" disabled={isSaving} onClick={savePage}>Save page</button>
                    </div>
                  </div>
                </section>

                <section className="admin-panel">
                  <div className="admin-panel__head">
                    <div><h2>Page blocks</h2><p>Ordered sections that make up the selected page.</p></div>
                    <button className="admin-link-button" type="button" onClick={startNewBlock}>New block</button>
                  </div>

                  {selectedPage ? (
                    <>
                      <div className="admin-content-system__mini-list">
                        {pageBlocks.length ? pageBlocks.map((item) => (
                          <article key={item.id} className={`admin-content-system__mini-row ${selectedBlockId === item.id ? "is-active" : ""}`} onClick={() => setSelectedBlockId(item.id)}>
                            <strong>{item.title || item.block_key}</strong>
                            <small>{item.block_type} • order {item.sort_order} • {item.status}</small>
                          </article>
                        )) : <div className="admin-content-system__empty">No blocks on this page yet.</div>}
                      </div>

                      <div className="admin-content-system__form">
                        <div className="admin-content-system__form-grid">
                          <div className="admin-content-system__field">
                            <label>Block key</label>
                            <input value={blockDraft.block_key} onChange={(event) => setBlockDraft((state) => ({ ...state, block_key: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>Type</label>
                            <input value={blockDraft.block_type} onChange={(event) => setBlockDraft((state) => ({ ...state, block_type: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>Status</label>
                            <select value={blockDraft.status} onChange={(event) => setBlockDraft((state) => ({ ...state, status: event.target.value, page_id: selectedPage.id }))}>
                              <option value="draft">draft</option>
                              <option value="published">published</option>
                              <option value="archived">archived</option>
                            </select>
                          </div>
                          <div className="admin-content-system__field">
                            <label>Sort order</label>
                            <input type="number" value={blockDraft.sort_order} onChange={(event) => setBlockDraft((state) => ({ ...state, sort_order: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field is-wide">
                            <label>Title</label>
                            <input value={blockDraft.title} onChange={(event) => setBlockDraft((state) => ({ ...state, title: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field is-wide">
                            <label>Body</label>
                            <textarea value={blockDraft.body} onChange={(event) => setBlockDraft((state) => ({ ...state, body: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>Image URL</label>
                            <input value={blockDraft.image_url} onChange={(event) => setBlockDraft((state) => ({ ...state, image_url: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>CTA label</label>
                            <input value={blockDraft.cta_label} onChange={(event) => setBlockDraft((state) => ({ ...state, cta_label: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>CTA link</label>
                            <input value={blockDraft.cta_link} onChange={(event) => setBlockDraft((state) => ({ ...state, cta_link: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                          <div className="admin-content-system__field is-wide">
                            <label>Payload JSON</label>
                            <textarea value={blockDraft.payload_input} onChange={(event) => setBlockDraft((state) => ({ ...state, payload_input: event.target.value, page_id: selectedPage.id }))} />
                          </div>
                        </div>
                        <div className="admin-content-system__actions">
                          <button className="btn btn--ghost" type="button" onClick={startNewBlock}>Reset block</button>
                          <button className="btn btn--primary" type="button" disabled={isSaving} onClick={saveBlock}>Save block</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="admin-content-system__empty">Select a page to manage its blocks.</div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
