import { useEffect, useMemo, useState } from "react";
import { Cog, Globe2, Save, Search, SlidersHorizontal } from "lucide-react";
import { fetchSettingsModuleData, upsertSystemSetting } from "../../services/adminService.js";
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

function safeJsonStringify(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? "", null, 2);
}

function parseSettingValue(raw, type) {
  if (type === "number") return Number(raw || 0);
  if (type === "boolean") return raw === "true" || raw === true;
  if (type === "json" || type === "array") return JSON.parse(raw || (type === "array" ? "[]" : "{}"));
  return raw;
}

const emptyDraft = {
  id: null,
  group_key: "general",
  setting_key: "",
  label: "",
  value_type: "string",
  value_input: "",
  description: "",
  is_public: false,
};

export default function AdminSettings() {
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadModule = async (keepSelected = true) => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchSettingsModuleData();
      setModuleData(next);
      if (!keepSelected && next.settings[0]) {
        setSelectedId(next.settings[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule(false);
  }, []);

  useEffect(() => {
    const deepLinkedSettingId = searchParams.get("setting");
    if (deepLinkedSettingId) {
      setSelectedId(deepLinkedSettingId);
    }
  }, [searchParams]);

  const settings = moduleData?.settings || [];

  const groups = useMemo(
    () => Array.from(new Set(settings.map((item) => item.group_key))).sort(),
    [settings],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return settings.filter((item) => {
      const matchesSearch = !q || [item.setting_key, item.label, item.description, item.group_key].some((value) =>
        String(value || "").toLowerCase().includes(q),
      );
      const matchesGroup = groupFilter === "all" || item.group_key === groupFilter;
      return matchesSearch && matchesGroup;
    });
  }, [groupFilter, search, settings]);

  const selected = useMemo(
    () => filtered.find((item) => item.id === selectedId) || settings.find((item) => item.id === selectedId) || null,
    [filtered, selectedId, settings],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft({
      id: selected.id,
      group_key: selected.group_key,
      setting_key: selected.setting_key,
      label: selected.label,
      value_type: selected.value_type,
      value_input: safeJsonStringify(selected.value),
      description: selected.description || "",
      is_public: Boolean(selected.is_public),
    });
  }, [selected]);

  const metrics = useMemo(() => ({
    total: settings.length,
    groups: groups.length,
    publicCount: settings.filter((item) => item.is_public).length,
    jsonCount: settings.filter((item) => item.value_type === "json" || item.value_type === "array").length,
  }), [groups.length, settings]);

  const saveSetting = async () => {
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        ...draft,
        value: parseSettingValue(draft.value_input, draft.value_type),
      };
      const result = await upsertSystemSetting(payload);
      await loadModule();
      setSelectedId(result.id);
    } catch (nextError) {
      setError(nextError.message || "Could not save setting.");
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
          <span className="section-label is-primary"><SlidersHorizontal size={16} /> Content System</span>
          <h1>Settings</h1>
          <p>Manage global system behavior, claim defaults, notification targets, and operational configuration keys.</p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsSettingsModuleV1 && (
        <p className="admin-message">Run `010_content_system_v1.sql` in Supabase to enable the Settings module.</p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading settings...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Cog} label="Settings" value={metrics.total} />
            <MetricCard icon={Globe2} label="Public keys" value={metrics.publicCount} />
            <MetricCard icon={SlidersHorizontal} label="Groups" value={metrics.groups} />
            <MetricCard icon={Save} label="Structured values" value={metrics.jsonCount} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div><h2>System settings</h2><p>Grouped configuration store for admin-driven business rules.</p></div>
              <button className="admin-link-button" type="button" onClick={startNew}>New setting</button>
            </div>

            <div className="admin-content-system__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search key, label, description" />
              </label>
              <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                <option value="all">All groups</option>
                {groups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </div>

            <div className="admin-content-system__layout">
              <div className="admin-content-system__list">
                {filtered.length ? filtered.map((item) => (
                  <article
                    key={item.id}
                    className={`admin-content-system__row ${selectedId === item.id ? "is-active" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <div className="admin-content-system__badges">
                      <span className="admin-content-system__badge">{item.group_key}</span>
                      <span className="admin-content-system__badge">{item.value_type}</span>
                      {item.is_public && <span className="admin-content-system__badge">public</span>}
                    </div>
                    <p>{item.setting_key}</p>
                    <small>{item.description || "No description"}</small>
                  </article>
                )) : <div className="admin-content-system__empty">No settings match the current filters.</div>}
              </div>

              <section className="admin-panel">
                <div className="admin-panel__head">
                  <div><h2>{draft.id ? "Edit setting" : "Create setting"}</h2><p>JSON-backed value storage with lightweight typing.</p></div>
                </div>

                <div className="admin-content-system__form">
                  <div className="admin-content-system__form-grid">
                    <div className="admin-content-system__field">
                      <label>Group</label>
                      <input value={draft.group_key} onChange={(event) => setDraft((state) => ({ ...state, group_key: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Setting key</label>
                      <input value={draft.setting_key} onChange={(event) => setDraft((state) => ({ ...state, setting_key: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Label</label>
                      <input value={draft.label} onChange={(event) => setDraft((state) => ({ ...state, label: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field">
                      <label>Value type</label>
                      <select value={draft.value_type} onChange={(event) => setDraft((state) => ({ ...state, value_type: event.target.value }))}>
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="json">json</option>
                        <option value="array">array</option>
                      </select>
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Value</label>
                      <textarea value={draft.value_input} onChange={(event) => setDraft((state) => ({ ...state, value_input: event.target.value }))} />
                    </div>
                    <div className="admin-content-system__field is-wide">
                      <label>Description</label>
                      <textarea value={draft.description} onChange={(event) => setDraft((state) => ({ ...state, description: event.target.value }))} />
                    </div>
                  </div>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.is_public}
                      onChange={(event) => setDraft((state) => ({ ...state, is_public: event.target.checked }))}
                    />
                    <span>Expose this setting to public site consumers.</span>
                  </label>
                  <div className="admin-content-system__actions">
                    <button className="btn btn--ghost" type="button" onClick={startNew}>Reset</button>
                    <button className="btn btn--primary" type="button" disabled={isSaving} onClick={saveSetting}>Save setting</button>
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
