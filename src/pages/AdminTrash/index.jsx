import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { fetchTrashModuleData, permanentlyDeleteTrashItem, purgeExpiredTrashItems, restoreTrashItem } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";

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

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getDaysLeft(value) {
  if (!value) return "-";
  const diff = new Date(value).getTime() - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  return days <= 0 ? "expires now" : `${days}d left`;
}

export default function AdminTrash() {
  const { isSuperAdmin, hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState({ items: [] });
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeActionId, setActiveActionId] = useState("");

  const loadTrash = async () => {
    setError("");
    setInfo("");
    setIsLoading(true);

    try {
      const purgeResult = await purgeExpiredTrashItems().catch(() => ({ purged: 0 }));
      const next = await fetchTrashModuleData();
      setModuleData(next);
      if (!selectedItemId && next.items[0]) {
        setSelectedItemId(next.items[0].id);
      }
      if (purgeResult?.purged) {
        setInfo(`${purgeResult.purged} expired item(s) were purged automatically.`);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load trash.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (moduleData?.items || []).filter((item) => {
      const matchesSearch = !q || [
        item.label,
        item.entity_type,
        item.metadata?.owner_label,
        item.metadata?.email,
      ].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesFilter = entityFilter === "all" || item.entity_type === entityFilter;
      return matchesSearch && matchesFilter;
    });
  }, [entityFilter, moduleData, search]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedItemId)
      || (moduleData?.items || []).find((item) => item.id === selectedItemId)
      || filteredItems[0]
      || null,
    [filteredItems, moduleData, selectedItemId],
  );

  const metrics = useMemo(() => ({
    total: (moduleData?.items || []).length,
    users: (moduleData?.items || []).filter((item) => item.entity_type === "profile").length,
    documents: (moduleData?.items || []).filter((item) => item.entity_type !== "profile").length,
  }), [moduleData]);

  const restoreSelected = async () => {
    if (!selectedItem) return;
    const confirmed = window.confirm(`Restore "${selectedItem.label || selectedItem.entity_id}" from trash?`);
    if (!confirmed) return;

    setError("");
    setInfo("");
    setActiveActionId(selectedItem.id);

    try {
      await restoreTrashItem(selectedItem);
      setSelectedItemId(null);
      await loadTrash();
    } catch (nextError) {
      setError(nextError.message || "Could not restore this item.");
    } finally {
      setActiveActionId("");
    }
  };

  const purgeSelected = async () => {
    if (!selectedItem) return;
    if (selectedItem.entity_type === "profile" && !isSuperAdmin) {
      setError("Only super admins can permanently delete user accounts.");
      return;
    }

    const confirmed = window.confirm(`Permanently delete "${selectedItem.label || selectedItem.entity_id}" now? This cannot be undone.`);
    if (!confirmed) return;

    setError("");
    setInfo("");
    setActiveActionId(selectedItem.id);

    try {
      await permanentlyDeleteTrashItem(selectedItem);
      setSelectedItemId(null);
      await loadTrash();
    } catch (nextError) {
      setError(nextError.message || "Could not permanently delete this item.");
    } finally {
      setActiveActionId("");
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Trash2 size={16} /> Cleanup</span>
          <h1>Trash</h1>
          <p>Deleted documents and users remain here for up to 30 days before permanent purge.</p>
        </div>
      </header>

      {error ? <p className="admin-message is-error">{error}</p> : null}
      {info ? <p className="admin-message">{info}</p> : null}

      {isLoading ? (
        <p className="admin-message">Loading trash...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Trash2} label="Trash items" value={metrics.total} />
            <MetricCard icon={Trash2} label="Deleted users" value={metrics.users} />
            <MetricCard icon={Trash2} label="Deleted documents" value={metrics.documents} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Recycle bin</h2>
                <p>Use restore for accidental deletions or purge immediately when test data should disappear for good.</p>
              </div>
            </div>

            <div className="admin-access__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search trash item, email, owner" />
              </label>
              <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
                <option value="all">All item types</option>
                <option value="profile">Users</option>
                <option value="lead_document">Lead docs</option>
                <option value="case_document">Case docs</option>
                <option value="claim_document">Claim docs</option>
                <option value="lead_signature">Signatures</option>
              </select>
            </div>

            <div className="admin-access__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Label</th>
                        <th>Deleted</th>
                        <th>Purge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id} className={selectedItem?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedItemId(item.id)}>
                          <td>{item.entity_type}</td>
                          <td>{item.label || item.entity_id}</td>
                          <td>{formatDate(item.deleted_at)}</td>
                          <td>{getDaysLeft(item.purge_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="admin-access__detail">
                <section className="admin-panel">
                  <div className="admin-panel__head">
                    <div>
                      <h2>{selectedItem?.label || "Select item"}</h2>
                      <p>{selectedItem?.entity_type || "Choose a deleted user or document."}</p>
                    </div>
                  </div>

                  <div className="admin-access__detail-body">
                    {selectedItem ? (
                      <>
                        <div className="admin-documents__meta">
                          <article><strong>Type</strong><span>{selectedItem.entity_type}</span></article>
                          <article><strong>Deleted at</strong><span>{formatDate(selectedItem.deleted_at)}</span></article>
                          <article><strong>Purge after</strong><span>{formatDate(selectedItem.purge_after)}</span></article>
                          <article><strong>Owner</strong><span>{selectedItem.metadata?.owner_label || selectedItem.metadata?.email || selectedItem.owner_id || "-"}</span></article>
                        </div>

                        <div className="admin-access__actions">
                          <button className="btn btn--primary" type="button" disabled={activeActionId === selectedItem.id || !(hasPermission("documents.manage") || hasPermission("users.manage"))} onClick={restoreSelected}>
                            <RotateCcw size={14} />
                            <span>{activeActionId === selectedItem.id ? "Working..." : "Restore"}</span>
                          </button>
                          <button className="admin-link-button" type="button" disabled={activeActionId === selectedItem.id || (selectedItem.entity_type === "profile" && !isSuperAdmin)} onClick={purgeSelected}>
                            <Trash2 size={14} />
                            <span>{selectedItem.entity_type === "profile" ? "Delete user now" : "Delete now"}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="admin-message">Select an item to restore it or purge it immediately.</p>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
