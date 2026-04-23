import { useEffect, useMemo, useState } from "react";
import { AlarmClock, CalendarClock, CheckCircle2, Download, Search, SquareCheckBig } from "lucide-react";
import { createTask, fetchTasksModuleData, updateTask } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { useSearchParams } from "react-router-dom";
import "./style.scss";

const priorities = ["low", "medium", "high", "urgent"];
const statuses = ["todo", "in_progress", "done", "cancelled"];
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

function isOverdue(task) {
  return task.due_date && task.status !== "done" && new Date(task.due_date).getTime() < Date.now();
}

function isDueSoon(task) {
  if (!task.due_date || task.status === "done") return false;
  const diff = new Date(task.due_date).getTime() - Date.now();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 2;
}

function exportTasksCsv(rows) {
  const headers = ["Title", "Status", "Priority", "Entity Type", "Entity Id", "Assigned", "Due Date", "Created At"];
  const lines = rows.map((item) => [
    item.title,
    item.status,
    item.priority,
    item.related_entity_type,
    item.related_entity_id,
    item.assignedLabel,
    item.due_date,
    item.created_at,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AdminTasks() {
  const { hasPermission } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    related_entity_type: "lead",
    related_entity_id: "",
    assigned_user_id: "",
    priority: "medium",
    status: "todo",
    task_type: "",
    due_date: "",
  });

  const loadTasks = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchTasksModuleData();
      setModuleData(next);
      if (!selectedTaskId && next.tasks[0]) {
        setSelectedTaskId(next.tasks[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load tasks module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    const deepLinkedTaskId = searchParams.get("task");
    if (deepLinkedTaskId) {
      setSelectedTaskId(deepLinkedTaskId);
    }
  }, [searchParams]);

  const tasksWithMeta = useMemo(() => {
    const users = new Map((moduleData?.assignableUsers || []).map((item) => [item.id, item]));
    const leads = new Map((moduleData?.leads || []).map((item) => [item.id, item]));
    const cases = new Map((moduleData?.cases || []).map((item) => [item.id, item]));
    const customers = new Map((moduleData?.customers || []).map((item) => [item.id, item]));

    return (moduleData?.tasks || []).map((task) => {
      const assigned = users.get(task.assigned_user_id);
      const relatedLead = task.related_entity_type === "lead" ? leads.get(task.related_entity_id) : null;
      const relatedCase = task.related_entity_type === "case" ? cases.get(task.related_entity_id) : null;
      const relatedCustomer = task.related_entity_type === "customer" ? customers.get(task.related_entity_id) : null;
      const relatedLabel = relatedLead?.lead_code
        || relatedCase?.case_code
        || relatedCustomer?.full_name
        || task.related_entity_id;

      return {
        ...task,
        assignedLabel: assigned?.full_name || assigned?.email || "Unassigned",
        relatedLabel,
        relatedLead,
        relatedCase,
        relatedCustomer,
      };
    });
  }, [moduleData]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasksWithMeta.filter((task) => {
      const matchesSearch = !query || [
        task.title,
        task.description,
        task.relatedLabel,
        task.assignedLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesEntity = entityFilter === "all" || task.related_entity_type === entityFilter;
      const matchesOwner = ownerFilter === "all" || String(task.assigned_user_id || "") === ownerFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesEntity && matchesOwner;
    });
  }, [tasksWithMeta, search, statusFilter, priorityFilter, entityFilter, ownerFilter]);

  const selectedTask = useMemo(
    () => filteredTasks.find((item) => item.id === selectedTaskId)
      || tasksWithMeta.find((item) => item.id === selectedTaskId)
      || filteredTasks[0]
      || null,
    [filteredTasks, tasksWithMeta, selectedTaskId],
  );

  const metrics = useMemo(() => ({
    total: tasksWithMeta.length,
    open: tasksWithMeta.filter((item) => !["done", "cancelled"].includes(item.status)).length,
    overdue: tasksWithMeta.filter((item) => isOverdue(item)).length,
    dueSoon: tasksWithMeta.filter((item) => isDueSoon(item)).length,
    completed: tasksWithMeta.filter((item) => item.status === "done").length,
  }), [tasksWithMeta]);

  const entityOptions = useMemo(() => ({
    lead: moduleData?.leads || [],
    case: moduleData?.cases || [],
    customer: moduleData?.customers || [],
  }), [moduleData]);

  const saveTask = async (taskId, updates) => {
    setError("");
    setIsSaving(true);
    try {
      await updateTask(taskId, updates);
      await loadTasks();
    } catch (nextError) {
      setError(nextError.message || "Could not update task.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitTask = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.related_entity_id) {
      setError("Task title and linked entity are required.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await createTask(form);
      setForm({
        title: "",
        description: "",
        related_entity_type: "lead",
        related_entity_id: "",
        assigned_user_id: "",
        priority: "medium",
        status: "todo",
        task_type: "",
        due_date: "",
      });
      await loadTasks();
    } catch (nextError) {
      setError(nextError.message || "Could not create task.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-tasks-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><SquareCheckBig size={16} /> Core Operations</span>
          <h1>Tasks</h1>
          <p>
            Manage follow-ups, assign operational work, and track overdue actions across leads, cases, and customers.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsTasksModuleV1 && (
        <p className="admin-message">
          Tasks schema is not available yet. Run `006_core_operations_schema_v1.sql` in Supabase to unlock the full tasks module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading tasks...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={SquareCheckBig} label="Total tasks" value={metrics.total} />
            <MetricCard icon={AlarmClock} label="Open tasks" value={metrics.open} />
            <MetricCard icon={CalendarClock} label="Overdue" value={metrics.overdue} />
            <MetricCard icon={CalendarClock} label="Due soon" value={metrics.dueSoon} />
            <MetricCard icon={CheckCircle2} label="Completed" value={metrics.completed} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Task queue</h2>
                <p>Filter operational tasks and create new work items linked to leads, cases, or customers.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportTasksCsv(filteredTasks)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="admin-tasks__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search title, relation, assignee" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="all">All priorities</option>
                {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
                <option value="all">All entity types</option>
                {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">All owners</option>
                {(moduleData?.assignableUsers || []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
              </select>
            </div>

            <div className="admin-tasks__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Relation</th>
                        <th>Assigned</th>
                        <th>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map((item) => (
                        <tr key={item.id} className={selectedTask?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedTaskId(item.id)}>
                          <td>{item.title}</td>
                          <td>{item.status}</td>
                          <td>{item.priority}</td>
                          <td>{item.related_entity_type} · {item.relatedLabel || "-"}</td>
                          <td>{item.assignedLabel}</td>
                          <td>{item.due_date ? formatDate(item.due_date) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-tasks__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Create task</h2>
                    <p>Assign structured follow-up work to the team.</p>
                  </div>
                </div>
                <form className="admin-tasks__form" onSubmit={submitTask}>
                  <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Task title" />
                  <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
                  <div className="admin-tasks__form-grid">
                    <select
                      value={form.related_entity_type}
                      onChange={(event) => setForm((current) => ({ ...current, related_entity_type: event.target.value, related_entity_id: "" }))}
                    >
                      {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select
                      value={form.related_entity_id}
                      onChange={(event) => setForm((current) => ({ ...current, related_entity_id: event.target.value }))}
                    >
                      <option value="">Select linked entity</option>
                      {(entityOptions[form.related_entity_type] || []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.lead_code || item.case_code || item.full_name || item.email || item.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <select value={form.assigned_user_id} onChange={(event) => setForm((current) => ({ ...current, assigned_user_id: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {(moduleData?.assignableUsers || []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                    </select>
                    <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                      {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <input value={form.task_type} onChange={(event) => setForm((current) => ({ ...current, task_type: event.target.value }))} placeholder="Task type" />
                    <input type="datetime-local" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value || null }))} />
                  </div>
                  <div className="admin-tasks__form-actions">
                    <button className="admin-link-button" type="submit" disabled={!hasPermission("tasks.edit") || isSaving}>
                      <span>{isSaving ? "Saving..." : "Create task"}</span>
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <section className="admin-tasks__detail-grid">
              <section className="admin-panel admin-tasks__detail-panel">
                <div className="admin-panel__head">
                  <div>
                    <h2>Task detail</h2>
                    <p>{selectedTask ? selectedTask.title : "Select a task to inspect."}</p>
                  </div>
                </div>

                {selectedTask ? (
                  <div className="admin-tasks__detail-body">
                    <div className="admin-tasks__summary">
                      <article><strong>Relation</strong><span>{selectedTask.related_entity_type} · {selectedTask.relatedLabel || "-"}</span></article>
                      <article><strong>Assigned</strong><span>{selectedTask.assignedLabel}</span></article>
                      <article><strong>Created</strong><span>{formatDate(selectedTask.created_at)}</span></article>
                      <article><strong>Due</strong><span>{selectedTask.due_date ? formatDate(selectedTask.due_date) : "-"}</span></article>
                    </div>

                    <div className="admin-tasks__actions">
                      <label>
                        <span>Status</span>
                        <select value={selectedTask.status} onChange={(event) => saveTask(selectedTask.id, { status: event.target.value })} disabled={!hasPermission("tasks.edit") || isSaving}>
                          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Priority</span>
                        <select value={selectedTask.priority} onChange={(event) => saveTask(selectedTask.id, { priority: event.target.value })} disabled={!hasPermission("tasks.edit") || isSaving}>
                          {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Assigned user</span>
                        <select value={selectedTask.assigned_user_id || ""} onChange={(event) => saveTask(selectedTask.id, { assigned_user_id: event.target.value || null })} disabled={!hasPermission("tasks.edit") || isSaving}>
                          <option value="">Unassigned</option>
                          {(moduleData?.assignableUsers || []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                        </select>
                      </label>
                    </div>

                    <section className="admin-tasks__section">
                      <h3>Description</h3>
                      <p>{selectedTask.description || "No description provided."}</p>
                    </section>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No task selected</h2>
                    <p>Select a task to review and update its workflow.</p>
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

export default AdminTasks;
