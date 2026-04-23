import { useEffect, useMemo, useState } from "react";
import { Download, Mail, MessageSquareText, Phone, Search, Send, Users } from "lucide-react";
import { createCommunication, fetchCommunicationsModuleData } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const channels = ["email", "whatsapp", "instagram", "phone", "airline", "internal_note"];
const directions = ["inbound", "outbound", "internal"];
const entityTypes = ["lead", "case", "customer"];

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

function exportCommunicationsCsv(rows) {
  const headers = ["Channel", "Direction", "Entity Type", "Entity", "Subject", "Created At"];
  const lines = rows.map((item) => [
    item.channel,
    item.direction,
    item.entity_type,
    item.entityLabel,
    item.subject,
    item.created_at,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-communications-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AdminCommunication() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [selectedCommunicationId, setSelectedCommunicationId] = useState(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    entity_type: "lead",
    entity_id: "",
    channel: "email",
    direction: "outbound",
    subject: "",
    body: "",
  });

  const loadCommunications = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchCommunicationsModuleData();
      setModuleData(next);
      if (!selectedCommunicationId && next.communications[0]) {
        setSelectedCommunicationId(next.communications[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load communications module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCommunications();
  }, []);

  const rowsWithMeta = useMemo(() => {
    const leads = new Map((moduleData?.leads || []).map((item) => [item.id, item]));
    const cases = new Map((moduleData?.cases || []).map((item) => [item.id, item]));
    const customers = new Map((moduleData?.customers || []).map((item) => [item.id, item]));
    const users = new Map((moduleData?.assignableUsers || []).map((item) => [item.id, item]));

    return (moduleData?.communications || []).map((item) => {
      const entityLabel = item.entity_type === "lead"
        ? leads.get(item.entity_id)?.lead_code
        : item.entity_type === "case"
          ? cases.get(item.entity_id)?.case_code
          : customers.get(item.entity_id)?.full_name || customers.get(item.entity_id)?.email;

      return {
        ...item,
        entityLabel: entityLabel || item.entity_id,
        customerLabel: customers.get(item.customer_id)?.full_name || customers.get(item.customer_id)?.email || "-",
        createdByLabel: users.get(item.created_by)?.full_name || users.get(item.created_by)?.email || "-",
      };
    });
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rowsWithMeta.filter((item) => {
      const matchesSearch = !query || [
        item.subject,
        item.body,
        item.entityLabel,
        item.customerLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesChannel = channelFilter === "all" || item.channel === channelFilter;
      const matchesDirection = directionFilter === "all" || item.direction === directionFilter;
      const matchesEntity = entityFilter === "all" || item.entity_type === entityFilter;

      return matchesSearch && matchesChannel && matchesDirection && matchesEntity;
    });
  }, [rowsWithMeta, search, channelFilter, directionFilter, entityFilter]);

  const selectedCommunication = useMemo(
    () => filteredRows.find((item) => item.id === selectedCommunicationId)
      || rowsWithMeta.find((item) => item.id === selectedCommunicationId)
      || filteredRows[0]
      || null,
    [filteredRows, rowsWithMeta, selectedCommunicationId],
  );

  const metrics = useMemo(() => ({
    total: rowsWithMeta.length,
    inbound: rowsWithMeta.filter((item) => item.direction === "inbound").length,
    outbound: rowsWithMeta.filter((item) => item.direction === "outbound").length,
    internal: rowsWithMeta.filter((item) => item.direction === "internal").length,
    email: rowsWithMeta.filter((item) => item.channel === "email").length,
    whatsapp: rowsWithMeta.filter((item) => item.channel === "whatsapp").length,
  }), [rowsWithMeta]);

  const entityOptions = useMemo(() => ({
    lead: moduleData?.leads || [],
    case: moduleData?.cases || [],
    customer: moduleData?.customers || [],
  }), [moduleData]);

  const submitCommunication = async (event) => {
    event.preventDefault();
    if (!form.entity_id || !form.body.trim()) {
      setError("Linked entity and message body are required.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await createCommunication(form);
      setForm({
        entity_type: "lead",
        entity_id: "",
        channel: "email",
        direction: "outbound",
        subject: "",
        body: "",
      });
      await loadCommunications();
    } catch (nextError) {
      setError(nextError.message || "Could not create communication.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-communication-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><MessageSquareText size={16} /> Core Operations</span>
          <h1>Communication</h1>
          <p>
            Track customer contact, internal notes, airline replies, and outbound follow-ups across leads, cases, and customers.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsCommunicationsModuleV1 && (
        <p className="admin-message">
          Communications schema is not available yet. Run `006_core_operations_schema_v1.sql` in Supabase to unlock this module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading communications...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={MessageSquareText} label="Total logs" value={metrics.total} />
            <MetricCard icon={Mail} label="Inbound" value={metrics.inbound} />
            <MetricCard icon={Send} label="Outbound" value={metrics.outbound} />
            <MetricCard icon={Users} label="Internal" value={metrics.internal} />
            <MetricCard icon={Mail} label="Email" value={metrics.email} />
            <MetricCard icon={Phone} label="WhatsApp" value={metrics.whatsapp} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Communication log</h2>
                <p>Structured timeline of contact history and internal operational notes.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportCommunicationsCsv(filteredRows)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="admin-communication__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search subject, body, entity, customer" />
              </label>
              <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <option value="all">All channels</option>
                {channels.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)}>
                <option value="all">All directions</option>
                {directions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
                <option value="all">All entity types</option>
                {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="admin-communication__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Direction</th>
                        <th>Entity</th>
                        <th>Customer</th>
                        <th>Subject</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((item) => (
                        <tr key={item.id} className={selectedCommunication?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedCommunicationId(item.id)}>
                          <td>{item.channel}</td>
                          <td>{item.direction}</td>
                          <td>{item.entity_type} · {item.entityLabel}</td>
                          <td>{item.customerLabel}</td>
                          <td>{item.subject || "No subject"}</td>
                          <td>{formatDate(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-communication__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Create entry</h2>
                    <p>Add a new communication log linked to a lead, case, or customer.</p>
                  </div>
                </div>
                <form className="admin-communication__form" onSubmit={submitCommunication}>
                  <div className="admin-communication__form-grid">
                    <select value={form.entity_type} onChange={(event) => setForm((current) => ({ ...current, entity_type: event.target.value, entity_id: "" }))}>
                      {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={form.entity_id} onChange={(event) => setForm((current) => ({ ...current, entity_id: event.target.value }))}>
                      <option value="">Select linked entity</option>
                      {(entityOptions[form.entity_type] || []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.lead_code || item.case_code || item.full_name || item.email || item.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <select value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}>
                      {channels.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={form.direction} onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value }))}>
                      {directions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Subject" />
                  <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Message body" />
                  <div className="admin-communication__form-actions">
                    <button className="admin-link-button" type="submit" disabled={!hasPermission("communications.edit") || isSaving}>
                      <span>{isSaving ? "Saving..." : "Create entry"}</span>
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <section className="admin-communication__detail-grid">
              <section className="admin-panel admin-communication__detail-panel">
                <div className="admin-panel__head">
                  <div>
                    <h2>Entry detail</h2>
                    <p>{selectedCommunication ? selectedCommunication.subject || selectedCommunication.channel : "Select a communication record to inspect."}</p>
                  </div>
                </div>

                {selectedCommunication ? (
                  <div className="admin-communication__detail-body">
                    <div className="admin-communication__summary">
                      <article><strong>Entity</strong><span>{selectedCommunication.entity_type} · {selectedCommunication.entityLabel}</span></article>
                      <article><strong>Customer</strong><span>{selectedCommunication.customerLabel}</span></article>
                      <article><strong>Direction</strong><span>{selectedCommunication.direction}</span></article>
                      <article><strong>Created</strong><span>{formatDate(selectedCommunication.created_at)}</span></article>
                    </div>
                    <section className="admin-communication__section">
                      <h3>Subject</h3>
                      <p>{selectedCommunication.subject || "No subject."}</p>
                    </section>
                    <section className="admin-communication__section">
                      <h3>Body</h3>
                      <p>{selectedCommunication.body || "No body."}</p>
                    </section>
                    <section className="admin-communication__section">
                      <h3>Author</h3>
                      <p>{selectedCommunication.createdByLabel}</p>
                    </section>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No communication selected</h2>
                    <p>Select a communication record to review its details.</p>
                  </div>
                )}
              </section>
            </section>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminCommunication;
