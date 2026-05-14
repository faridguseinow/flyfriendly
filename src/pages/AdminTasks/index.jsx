import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FilterX, Plus, Search, X } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { createTask, fetchTasksModuleData, updateTask } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { AdminSidePanel, AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
import "./style.scss";

const priorities = ["low", "medium", "high", "urgent"];
const statuses = ["todo", "in_progress", "done", "cancelled"];
const entityTypeOptions = [
  { value: "case", label: "Case" },
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
  { value: "case_document", label: "Document" },
  { value: "referral_partner", label: "Partner" },
  { value: "case_finance", label: "Finance" },
];
const taskTemplates = [
  { key: "review_docs", label: "Review passenger documents", description: "Review uploaded passenger documents and confirm completeness.", related_entity_type: "case_document", priority: "high" },
  { key: "verify_eu261", label: "Verify EU261 eligibility", description: "Verify route, airline, disruption type, and compensation basis.", related_entity_type: "case", priority: "high" },
  { key: "check_disruption", label: "Check airline disruption reason", description: "Validate airline disruption reason before submission.", related_entity_type: "case", priority: "medium" },
  { key: "missing_docs", label: "Contact passenger for missing documents", description: "Request missing claim documents from the passenger.", related_entity_type: "lead", priority: "urgent" },
  { key: "submit_claim", label: "Prepare airline claim submission", description: "Prepare and validate the airline submission package.", related_entity_type: "case", priority: "high" },
  { key: "follow_up", label: "Follow up with airline", description: "Follow up on pending airline response for the claim.", related_entity_type: "case", priority: "medium" },
  { key: "review_payout", label: "Review payout details", description: "Check payout and finance values before release.", related_entity_type: "case_finance", priority: "high" },
  { key: "close_case", label: "Close case after payment", description: "Verify payout completion and close the case cleanly.", related_entity_type: "case", priority: "medium" },
];

const boardColumns = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "—";
  return `€${Number(value || 0).toFixed(0)}${currency && currency !== "EUR" ? ` ${currency}` : ""}`;
}

function formatEstimateCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "Estimate pending review";
  return `Up to €${Number(value || 0).toFixed(0)}${currency && currency !== "EUR" ? ` ${currency}` : ""}`;
}

function formatDistanceBand(band) {
  if (band === "short") return "Short";
  if (band === "medium") return "Medium";
  if (band === "long") return "Long";
  return "Pending review";
}

function formatEstimateStatus(status) {
  if (status === "calculated") return "Calculated";
  if (status === "manual_override") return "Manual override";
  return "Estimate pending review";
}

function toDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getPriorityTone(priority) {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "success";
}

function getStatusTone(status) {
  if (status === "done") return "success";
  if (status === "cancelled") return "danger";
  if (status === "in_progress") return "warning";
  return "neutral";
}

function getEntityTypeLabel(type) {
  return entityTypeOptions.find((item) => item.value === type)?.label || normalizeLabel(type);
}

function getEntityFilterKey(type) {
  if (type === "case_document" || type === "document") return "document";
  if (type === "referral_partner" || type === "partner") return "partner";
  if (type === "case_finance" || type === "finance") return "finance";
  if (type === "case" || type === "lead" || type === "customer") return type;
  return String(type || "other");
}

function getBoardLane(task) {
  const status = String(task?.status || "").toLowerCase();
  if (status === "in_progress") return "in_progress";
  if (status === "done" || status === "completed" || status === "cancelled" || status === "archived") return "done";
  if (status === "review" || status === "in_review") return "in_review";
  return "todo";
}

function getStatusProgress(status) {
  if (status === "done") return 100;
  if (status === "in_progress") return 55;
  if (status === "cancelled") return 100;
  if (status === "review" || status === "in_review") return 80;
  return 10;
}

function isOverdue(task) {
  if (!task?.due_date || task.status === "done" || task.status === "cancelled") return false;
  return new Date(task.due_date).getTime() < startOfToday().getTime();
}

function isDueToday(task) {
  return Boolean(task?.due_date) && toDateKey(task.due_date) === toDateKey(new Date());
}

function isDueThisWeek(task) {
  if (!task?.due_date) return false;
  const due = new Date(task.due_date);
  const start = startOfToday();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return due >= start && due < end;
}

function isDueSoon(task) {
  return isDueThisWeek(task) && !isDueToday(task) && !isOverdue(task);
}

function formatRelativeDue(task) {
  if (!task?.due_date) return "No deadline";
  if (isOverdue(task)) return "Overdue";
  if (isDueToday(task)) return "Due today";
  if (isDueSoon(task)) return "Due this week";
  return formatDate(task.due_date);
}

function hasUnassignedHighPriority(task) {
  return ["high", "urgent"].includes(task?.priority) && !task?.assigned_user_id && task?.status !== "done" && task?.status !== "cancelled";
}

function exportTasksCsv(rows) {
  const headers = ["Title", "Status", "Priority", "Entity Type", "Related", "Assigned", "Due Date", "Updated At"];
  const lines = rows.map((item) => [
    item.title,
    item.status,
    item.priority,
    item.related_entity_type,
    item.relatedLabel,
    item.assignedLabel,
    item.due_date,
    item.updated_at || item.created_at,
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

function buildCreateForm(defaults = {}) {
  return {
    title: defaults.title || "",
    description: defaults.description || "",
    related_entity_type: defaults.related_entity_type || "case",
    related_entity_id: defaults.related_entity_id || "",
    assigned_user_id: defaults.assigned_user_id || "",
    priority: defaults.priority || "medium",
    status: defaults.status || "todo",
    task_type: defaults.task_type || "",
    due_date: defaults.due_date || "",
    reminder_at: defaults.reminder_at || "",
  };
}

function getRelatedRoute(task) {
  if (task.related_entity_type === "case" && task.related_entity_id) {
    return `/admin/cases?case=${task.related_entity_id}`;
  }
  if (task.related_entity_type === "lead" && task.related_entity_id) {
    return `/admin/leads?lead=${task.related_entity_id}`;
  }
  if (task.related_entity_type === "customer" && task.related_entity_id) {
    return `/admin/customers?customer=${task.related_entity_id}`;
  }
  if ((task.related_entity_type === "case_document" || task.related_entity_type === "document") && task.related_entity_id) {
    return `/admin/documents?document=${task.related_entity_id}`;
  }
  if ((task.related_entity_type === "case_finance" || task.related_entity_type === "finance") && task.related_entity_id) {
    return `/admin/finances/finance?record=${task.related_entity_id}`;
  }
  if ((task.related_entity_type === "referral_partner" || task.related_entity_type === "partner") && task.related_entity_id) {
    return `/admin/referral-partners?partner=${task.related_entity_id}`;
  }
  return null;
}

function TaskAvatar({ label }) {
  const initials = String(label || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return <span className="admin-tasks-page__avatar">{initials || "U"}</span>;
}

export default function AdminTasks() {
  const { hasPermission } = useAdminAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(buildCreateForm());
  const [draft, setDraft] = useState(null);
  const prefillAppliedRef = useRef(false);

  const loadTasks = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchTasksModuleData();
      setModuleData(next);
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
      setDetailOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const stateDefaults = location.state?.createTaskDefaults;
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const openCreate = searchParams.get("createTask") === "1" || location.state?.openCreateTask;
    const defaults = stateDefaults || (entityType && entityId ? {
      related_entity_type: entityType,
      related_entity_id: entityId,
      title: searchParams.get("taskTitle") || "",
    } : null);

    if (!defaults) return;
    setForm(buildCreateForm(defaults));
    if (openCreate) {
      setCreateOpen(true);
    }
    prefillAppliedRef.current = true;
  }, [location.state, searchParams]);

  const tasksWithMeta = useMemo(() => {
    const users = new Map((moduleData?.assignableUsers || []).map((item) => [item.id, item]));
    const leads = new Map((moduleData?.leads || []).map((item) => [item.id, item]));
    const cases = new Map((moduleData?.cases || []).map((item) => [item.id, item]));
    const customers = new Map((moduleData?.customers || []).map((item) => [item.id, item]));
    const documents = new Map((moduleData?.documents || []).map((item) => [item.id, item]));
    const finance = new Map((moduleData?.finance || []).map((item) => [item.id, item]));
    const financeByCase = new Map((moduleData?.finance || []).map((item) => [item.case_id, item]));
    const partners = new Map((moduleData?.partners || []).map((item) => [item.id, item]));

    return (moduleData?.tasks || []).map((task) => {
      const assigned = users.get(task.assigned_user_id);
      const relatedLead = task.related_entity_type === "lead" ? leads.get(task.related_entity_id) : null;
      const relatedCase = task.related_entity_type === "case" ? cases.get(task.related_entity_id) : null;
      const relatedCustomer = task.related_entity_type === "customer" ? customers.get(task.related_entity_id) : null;
      const relatedDocument = task.related_entity_type === "case_document" || task.related_entity_type === "document" ? documents.get(task.related_entity_id) : null;
      const relatedFinance = task.related_entity_type === "case_finance" || task.related_entity_type === "finance" ? finance.get(task.related_entity_id) : null;
      const relatedPartner = task.related_entity_type === "referral_partner" || task.related_entity_type === "partner" ? partners.get(task.related_entity_id) : null;
      const caseFromFinance = relatedFinance?.case_id ? cases.get(relatedFinance.case_id) : null;
      const caseFromDocument = relatedDocument?.case_id ? cases.get(relatedDocument.case_id) : null;
      const compensationCase = relatedCase || caseFromFinance || caseFromDocument || null;
      const compensationLead = relatedLead || (compensationCase?.lead_id ? leads.get(compensationCase.lead_id) : null) || null;
      const compensationFinance = relatedFinance || (compensationCase?.id ? financeByCase.get(compensationCase.id) : null) || null;
      const customerLabel = relatedCustomer?.full_name
        || (relatedCase ? customers.get(relatedCase?.customer_id)?.full_name : null);
      const relatedLabel = relatedLead?.lead_code
        || relatedCase?.case_code
        || relatedCustomer?.full_name
        || relatedDocument?.file_name
        || relatedPartner?.public_name
        || relatedPartner?.name
        || relatedFinance?.id
        || task.related_entity_id;
      const routeLabel = relatedLead
        ? `${relatedLead.departure_airport || "—"} → ${relatedLead.arrival_airport || "—"}`
        : relatedCase
          ? `${relatedCase.route_from || "—"} → ${relatedCase.route_to || "—"}`
          : "—";

      return {
        ...task,
        boardLane: getBoardLane(task),
        assignedLabel: assigned?.full_name || assigned?.email || "Unassigned",
        assignedUser: assigned || null,
        relatedLabel,
        relatedLead,
        relatedCase,
        relatedCustomer,
        relatedDocument,
        relatedFinance,
        relatedPartner,
        compensationCase,
        compensationLead,
        compensationFinance,
        relatedRoute: routeLabel,
        customerLabel: customerLabel || relatedLead?.full_name || "Unknown customer",
        relatedRouteLink: getRelatedRoute(task),
        progressValue: getStatusProgress(task.status),
        dueDateKey: toDateKey(task.due_date),
        reminderDateKey: toDateKey(task.reminder_at),
        entityFilterKey: getEntityFilterKey(task.related_entity_type),
      };
    });
  }, [moduleData]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasksWithMeta.filter((task) => {
      if (statusFilter === "all" && task.status === "cancelled") {
        return false;
      }

      const matchesSearch = !query || [
        task.title,
        task.description,
        task.relatedLabel,
        task.assignedLabel,
        task.customerLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesEntity = entityFilter === "all" || task.entityFilterKey === entityFilter || task.related_entity_type === entityFilter;
      const matchesOwner = ownerFilter === "all" || String(task.assigned_user_id || "") === ownerFilter;

      let matchesDue = true;
      if (dueFilter === "overdue") matchesDue = isOverdue(task);
      if (dueFilter === "today") matchesDue = isDueToday(task);
      if (dueFilter === "week") matchesDue = isDueThisWeek(task);
      if (dueFilter === "no_deadline") matchesDue = !task.due_date;

      const matchesSelectedDate = !selectedDateKey || task.dueDateKey === selectedDateKey;

      return matchesSearch && matchesStatus && matchesPriority && matchesEntity && matchesOwner && matchesDue && matchesSelectedDate;
    });
  }, [tasksWithMeta, search, statusFilter, priorityFilter, entityFilter, ownerFilter, dueFilter, selectedDateKey]);

  const tasksByColumn = useMemo(() => {
    const buckets = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };

    filteredTasks.forEach((task) => {
      buckets[task.boardLane].push(task);
    });

    Object.values(buckets).forEach((list) => {
      list.sort((left, right) => {
        const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) return leftDue - rightDue;
        const leftUpdated = left.updated_at ? new Date(left.updated_at).getTime() : new Date(left.created_at).getTime();
        const rightUpdated = right.updated_at ? new Date(right.updated_at).getTime() : new Date(right.created_at).getTime();
        return rightUpdated - leftUpdated;
      });
    });

    return buckets;
  }, [filteredTasks]);

  const selectedTask = useMemo(
    () => filteredTasks.find((item) => item.id === selectedTaskId)
      || tasksWithMeta.find((item) => item.id === selectedTaskId)
      || null,
    [filteredTasks, tasksWithMeta, selectedTaskId],
  );

  useEffect(() => {
    if (!selectedTask) {
      setDraft(null);
      return;
    }
    setDraft({
      title: selectedTask.title || "",
      description: selectedTask.description || "",
      status: selectedTask.status || "todo",
      priority: selectedTask.priority || "medium",
      assigned_user_id: selectedTask.assigned_user_id || "",
      due_date: selectedTask.due_date ? toDateKey(selectedTask.due_date) : "",
      reminder_at: selectedTask.reminder_at ? toDateKey(selectedTask.reminder_at) : "",
    });
  }, [selectedTask?.id]);

  const metrics = useMemo(() => ({
    total: filteredTasks.length,
    overdue: filteredTasks.filter((item) => isOverdue(item)).length,
    dueToday: filteredTasks.filter((item) => isDueToday(item)).length,
    dueThisWeek: filteredTasks.filter((item) => isDueThisWeek(item)).length,
    done: filteredTasks.filter((item) => item.status === "done").length,
  }), [filteredTasks]);

  const entityOptions = useMemo(() => ({
    case: moduleData?.cases || [],
    lead: moduleData?.leads || [],
    customer: moduleData?.customers || [],
    case_document: moduleData?.documents || [],
    referral_partner: moduleData?.partners || [],
    case_finance: moduleData?.finance || [],
  }), [moduleData]);

  const selectedTaskActivity = useMemo(
    () => (moduleData?.activityLogs || []).filter((item) => item.target_entity_type === "task" && String(item.target_entity_id || "") === String(selectedTask?.id || "")),
    [moduleData?.activityLogs, selectedTask?.id],
  );

  const agendaDays = useMemo(() => {
    const base = startOfToday();
    return Array.from({ length: 7 }, (_, index) => {
      const next = new Date(base);
      next.setDate(base.getDate() + index);
      const key = toDateKey(next);
      const count = tasksWithMeta.filter((task) => task.dueDateKey === key && task.status !== "cancelled").length;
      return {
        key,
        label: next.toLocaleDateString(undefined, { weekday: "short" }),
        day: next.getDate(),
        count,
      };
    });
  }, [tasksWithMeta]);

  const agendaBuckets = useMemo(() => {
    const visible = filteredTasks.filter((task) => task.due_date);
    return {
      overdue: visible.filter((task) => isOverdue(task)),
      today: visible.filter((task) => isDueToday(task)),
      week: visible.filter((task) => isDueSoon(task)),
      upcoming: visible.filter((task) => !isOverdue(task) && !isDueThisWeek(task)),
    };
  }, [filteredTasks]);

  const openTask = (taskId) => {
    setSelectedTaskId(taskId);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedTaskId(null);
  };

  const openCreate = (defaults = {}) => {
    setForm(buildCreateForm(defaults));
    setCreateOpen(true);
  };

  const applyTemplate = (template) => {
    setForm((current) => buildCreateForm({
      ...current,
      title: current.title || template.label,
      description: template.description,
      related_entity_type: template.related_entity_type,
      priority: template.priority,
      task_type: template.key,
    }));
    setCreateOpen(true);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setEntityFilter("all");
    setOwnerFilter("all");
    setDueFilter("all");
    setSelectedDateKey("");
  };

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

  const saveDraft = async () => {
    if (!selectedTask || !draft?.title?.trim()) {
      setError("Task title is required.");
      return;
    }

    await saveTask(selectedTask.id, {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      status: draft.status,
      priority: draft.priority,
      assigned_user_id: draft.assigned_user_id || null,
      due_date: draft.due_date || null,
      reminder_at: draft.reminder_at || null,
    });
  };

  const submitTask = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.related_entity_id) {
      setError("Task title and linked entity are required.");
      return;
    }

    setError("");
    setIsCreating(true);
    try {
      await createTask({
        ...form,
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        reminder_at: form.reminder_at || null,
      });
      setForm(buildCreateForm());
      setCreateOpen(false);
      await loadTasks();
    } catch (nextError) {
      setError(nextError.message || "Could not create task.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="admin-page admin-tasks-page">
      <section className="admin-tasks-page__header">
        <div>
          <span className="admin-tasks-page__eyebrow">Operations</span>
          <h2>Tasks</h2>
          <p>Team work queue for claims, cases, documents, and payouts.</p>
        </div>

        <div className="admin-tasks-page__header-actions">
          <button type="button" className="admin-link-button" onClick={() => exportTasksCsv(filteredTasks)} disabled={!filteredTasks.length}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="admin-link-button"
            onClick={() => applyTemplate(taskTemplates[0])}
            disabled={!hasPermission("tasks.edit")}
          >
            <span>Templates</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => openCreate()}
            disabled={!hasPermission("tasks.edit")}
          >
            <Plus size={14} />
            <span>Create task</span>
          </button>
        </div>
      </section>

      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsTasksModuleV1 ? (
        <p className="admin-message">
          Tasks schema is not available yet. Run `006_core_operations_schema_v1.sql` in Supabase to unlock the full tasks module.
        </p>
      ) : null}

      <section className="admin-tasks-page__toolbar">
        <label className="admin-tasks-page__search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="Search title, case, assignee, customer"
          />
        </label>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{normalizeLabel(item)}</option>)}
        </select>

        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
          <option value="all">All priorities</option>
          {priorities.map((item) => <option key={item} value={item}>{normalizeLabel(item)}</option>)}
        </select>

        <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="all">All assignees</option>
          {(moduleData?.assignableUsers || []).map((user) => (
            <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
          ))}
        </select>

        <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
          <option value="all">All related work</option>
          <option value="case">Case</option>
          <option value="lead">Lead</option>
          <option value="customer">Customer</option>
          <option value="document">Document</option>
          <option value="partner">Partner</option>
          <option value="finance">Finance</option>
        </select>

        <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>
          <option value="all">All deadlines</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="no_deadline">No deadline</option>
        </select>

        <button type="button" className="admin-tasks-page__clear" onClick={clearFilters}>
          <FilterX size={15} />
          <span>Clear filters</span>
        </button>
      </section>

      <section className="admin-tasks-page__metrics">
        <article><strong>{metrics.total}</strong><span>Visible tasks</span></article>
        <article><strong>{metrics.overdue}</strong><span>Overdue</span></article>
        <article><strong>{metrics.dueToday}</strong><span>Due today</span></article>
        <article><strong>{metrics.dueThisWeek}</strong><span>This week</span></article>
        <article><strong>{metrics.done}</strong><span>Done</span></article>
      </section>

      <section className="admin-tasks-page__workspace">
        <div className="admin-tasks-page__board">
          {isLoading ? (
            <div className="admin-tasks-page__board-state">Loading tasks...</div>
          ) : !filteredTasks.length ? (
            <div className="admin-tasks-page__board-state">No tasks yet</div>
          ) : (
            <div className="admin-tasks-page__columns">
              {boardColumns.map((column) => {
                const tasks = tasksByColumn[column.key];
                const isReviewColumnWithoutStatus = column.key === "in_review" && !tasks.length && !statuses.includes("in_review");

                return (
                  <section key={column.key} className="admin-tasks-page__column">
                    <header className="admin-tasks-page__column-header">
                      <div>
                        <h3>{column.label}</h3>
                        <span>{tasks.length}</span>
                      </div>
                      <button
                        type="button"
                        className="admin-tasks-page__column-add"
                        onClick={() => openCreate({ status: column.key === "in_progress" ? "in_progress" : "todo" })}
                        disabled={!hasPermission("tasks.edit")}
                        aria-label={`Create task in ${column.label}`}
                      >
                        <Plus size={14} />
                      </button>
                    </header>

                    <div className="admin-tasks-page__column-scroll">
                      {tasks.length ? (
                        tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className={`admin-tasks-page__card${selectedTask?.id === task.id ? " is-active" : ""}${isOverdue(task) ? " is-overdue" : ""}${hasUnassignedHighPriority(task) ? " is-sla-risk" : ""}`}
                            onClick={() => openTask(task.id)}
                          >
                            <div className="admin-tasks-page__card-top">
                              <div className="admin-tasks-page__card-tags">
                                <AdminStatusBadge tone={getPriorityTone(task.priority)}>{normalizeLabel(task.priority)}</AdminStatusBadge>
                                <AdminStatusBadge tone={getStatusTone(task.status)}>{normalizeLabel(task.status)}</AdminStatusBadge>
                              </div>
                              <span>{formatDate(task.updated_at || task.created_at)}</span>
                            </div>

                            <strong>{task.title || "Untitled task"}</strong>
                            <p>{task.description || "No description provided."}</p>

                            <div className="admin-tasks-page__card-meta">
                              <span>{getEntityTypeLabel(task.related_entity_type)} • {task.relatedLabel || "Unknown relation"}</span>
                              <span>{task.customerLabel}</span>
                              <span>{task.relatedRoute}</span>
                            </div>

                            <div className="admin-tasks-page__progress">
                              <div className="admin-tasks-page__progress-bar">
                                <span style={{ width: `${task.progressValue}%` }} />
                              </div>
                              <small>Status-based progress {task.progressValue}%</small>
                            </div>

                            <div className="admin-tasks-page__card-footer">
                              <div className="admin-tasks-page__assignee">
                                <TaskAvatar label={task.assignedLabel} />
                                <span>{task.assignedLabel}</span>
                              </div>
                              <div className="admin-tasks-page__deadline">
                                {isOverdue(task) ? <em>Overdue</em> : null}
                                {!isOverdue(task) && isDueToday(task) ? <em className="is-today">Due today</em> : null}
                                {hasUnassignedHighPriority(task) ? <em className="is-warning">Unassigned urgent</em> : null}
                                <span>{formatRelativeDue(task)}</span>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="admin-tasks-page__column-empty">
                          <strong>{column.label} is clear</strong>
                          <p>{isReviewColumnWithoutStatus ? "Review status is not configured in the current task schema." : "No tasks in this column."}</p>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <aside className="admin-tasks-page__agenda">
          <header className="admin-tasks-page__agenda-header">
            <div>
              <span className="admin-tasks-page__eyebrow">Calendar</span>
              <h3>{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
            </div>
            {selectedDateKey ? (
              <button type="button" className="admin-link-button" onClick={() => setSelectedDateKey("")}>
                Clear day
              </button>
            ) : null}
          </header>

          <div className="admin-tasks-page__day-strip">
            {agendaDays.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`admin-tasks-page__day-chip${selectedDateKey === day.key ? " is-active" : ""}`}
                onClick={() => setSelectedDateKey((current) => current === day.key ? "" : day.key)}
              >
                <span>{day.label}</span>
                <strong>{day.day}</strong>
                <small>{day.count}</small>
              </button>
            ))}
          </div>

          <div className="admin-tasks-page__deadline-groups">
            {[
              { key: "overdue", label: "Overdue", items: agendaBuckets.overdue },
              { key: "today", label: "Today", items: agendaBuckets.today },
              { key: "week", label: "This week", items: agendaBuckets.week },
              { key: "upcoming", label: "Upcoming", items: agendaBuckets.upcoming },
            ].map((group) => (
              <section key={group.key} className="admin-tasks-page__deadline-group">
                <header>
                  <h4>{group.label}</h4>
                  <span>{group.items.length}</span>
                </header>
                {group.items.length ? (
                  <div className="admin-tasks-page__deadline-list">
                    {group.items.slice(0, 6).map((task) => (
                      <button key={task.id} type="button" className="admin-tasks-page__deadline-item" onClick={() => openTask(task.id)}>
                        <div>
                          <strong>{task.title}</strong>
                          <p>{task.assignedLabel} • {task.relatedLabel}</p>
                        </div>
                        <span>{formatDate(task.due_date)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="admin-tasks-page__agenda-empty">No tasks here.</p>
                )}
              </section>
            ))}
          </div>
        </aside>
      </section>

      <AdminSidePanel
        open={Boolean(selectedTask && detailOpen)}
        eyebrow="Task detail"
        title={selectedTask?.title || "Task detail"}
        subtitle={selectedTask ? `${selectedTask.relatedLabel} • ${selectedTask.assignedLabel}` : ""}
        onClose={closeDetail}
        className="admin-tasks-page__drawer"
        withOverlay
        overlayClassName="admin-tasks-page__overlay"
        overlayLabel="Close task detail"
      >
        {!selectedTask ? (
          <div className="admin-tasks-page__drawer-empty">
            <strong>Select a task to review details</strong>
            <p>Open any task card to inspect the assignment, related work, deadline, and status updates.</p>
          </div>
        ) : draft ? (
          <div className="admin-tasks-page__drawer-inner">
            <div className="admin-tasks-page__drawer-scroll">
              <section className="admin-tasks-page__summary">
                <article><strong>Status</strong><span>{normalizeLabel(selectedTask.status)}</span></article>
                <article><strong>Priority</strong><span>{normalizeLabel(selectedTask.priority)}</span></article>
                <article><strong>Assignee</strong><span>{selectedTask.assignedLabel}</span></article>
                <article><strong>Due date</strong><span>{selectedTask.due_date ? formatDate(selectedTask.due_date) : "No deadline"}</span></article>
                <article><strong>Reminder</strong><span>{selectedTask.reminder_at ? formatDate(selectedTask.reminder_at) : "Not configured"}</span></article>
                <article><strong>Created</strong><span>{formatDateTime(selectedTask.created_at)}</span></article>
                <article><strong>Updated</strong><span>{formatDateTime(selectedTask.updated_at || selectedTask.created_at)}</span></article>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Related work</h4>
                  {selectedTask.relatedRouteLink ? <Link to={selectedTask.relatedRouteLink}>Open related</Link> : null}
                </div>
                <div className="admin-tasks-page__meta-grid">
                  <article><strong>Entity type</strong><span>{getEntityTypeLabel(selectedTask.related_entity_type)}</span></article>
                  <article><strong>Reference</strong><span>{selectedTask.relatedLabel || "—"}</span></article>
                  <article><strong>Route</strong><span>{selectedTask.relatedRoute}</span></article>
                  <article><strong>Customer</strong><span>{selectedTask.customerLabel}</span></article>
                </div>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Compensation / Finance</h4>
                </div>
                <div className="admin-tasks-page__meta-grid">
                  <article>
                    <strong>Estimated compensation</strong>
                    <span>
                      {selectedTask.compensationLead
                        ? formatEstimateCurrency(selectedTask.compensationLead.estimated_compensation_eur, selectedTask.compensationLead.compensation_currency)
                        : formatCurrency(selectedTask.compensationCase?.estimated_compensation)}
                    </span>
                  </article>
                  <article>
                    <strong>Distance</strong>
                    <span>{selectedTask.compensationLead?.distance_km ? `${Math.round(Number(selectedTask.compensationLead.distance_km))} km` : "Pending review"}</span>
                  </article>
                  <article>
                    <strong>Distance band</strong>
                    <span>{selectedTask.compensationLead ? formatDistanceBand(selectedTask.compensationLead.distance_band) : "Pending review"}</span>
                  </article>
                  <article>
                    <strong>Estimate status</strong>
                    <span>{selectedTask.compensationLead ? formatEstimateStatus(selectedTask.compensationLead.estimate_status) : "Estimate pending review"}</span>
                  </article>
                  <article>
                    <strong>Recovered amount</strong>
                    <span>{selectedTask.compensationFinance ? formatCurrency(selectedTask.compensationFinance.compensation_amount, selectedTask.compensationFinance.currency) : "Not configured"}</span>
                  </article>
                  <article>
                    <strong>Customer payout</strong>
                    <span>{selectedTask.compensationFinance ? formatCurrency(selectedTask.compensationFinance.customer_payout, selectedTask.compensationFinance.currency) : "Not configured"}</span>
                  </article>
                </div>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Description</h4>
                </div>
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  disabled={!hasPermission("tasks.edit") || isSaving}
                />
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Checklist / progress</h4>
                </div>
                <div className="admin-tasks-page__progress-panel">
                  <div className="admin-tasks-page__progress-bar is-large">
                    <span style={{ width: `${selectedTask.progressValue}%` }} />
                  </div>
                  <strong>{selectedTask.progressValue}%</strong>
                  <p>Progress is derived from the current task status in the existing schema. Checklist not configured in the current task backend.</p>
                </div>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Comments / internal communication</h4>
                </div>
                <div className="admin-tasks-page__progress-panel">
                  <strong>Not configured</strong>
                  <p>Task comments are not available in the current backend yet. Use the task description and activity history for now.</p>
                </div>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Activity history</h4>
                </div>
                <div className="admin-tasks-page__activity-list">
                  {selectedTaskActivity.length ? selectedTaskActivity.map((item) => (
                    <article key={item.id}>
                      <strong>{normalizeLabel(item.action || "update")}</strong>
                      <p>{formatDateTime(item.created_at)}</p>
                    </article>
                  )) : (
                    <p className="admin-tasks-page__empty-copy">
                      {moduleData?.supportsTaskActivity ? "No activity entries yet" : "Activity history not configured"}
                    </p>
                  )}
                </div>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Time tracking</h4>
                </div>
                <div className="admin-tasks-page__progress-panel">
                  <strong>Not configured</strong>
                  <p>Time tracking fields are not present in the current task schema, so manual time entry is hidden.</p>
                </div>
              </section>

              <section className="admin-tasks-page__section">
                <div className="admin-tasks-page__section-title">
                  <h4>Actions</h4>
                </div>
                <div className="admin-tasks-page__action-grid">
                  <label>
                    <span>Title</span>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                      disabled={!hasPermission("tasks.edit") || isSaving}
                    />
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={draft.status}
                      onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                      disabled={!hasPermission("tasks.edit") || isSaving}
                    >
                      {statuses.map((item) => <option key={item} value={item}>{normalizeLabel(item)}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Priority</span>
                    <select
                      value={draft.priority}
                      onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}
                      disabled={!hasPermission("tasks.edit") || isSaving}
                    >
                      {priorities.map((item) => <option key={item} value={item}>{normalizeLabel(item)}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Assignee</span>
                    <select
                      value={draft.assigned_user_id}
                      onChange={(event) => setDraft((current) => ({ ...current, assigned_user_id: event.target.value }))}
                      disabled={!hasPermission("tasks.edit") || isSaving}
                    >
                      <option value="">Unassigned</option>
                      {(moduleData?.assignableUsers || []).map((user) => (
                        <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Due date</span>
                    <input
                      type="date"
                      value={draft.due_date}
                      onChange={(event) => setDraft((current) => ({ ...current, due_date: event.target.value }))}
                      disabled={!hasPermission("tasks.edit") || isSaving}
                    />
                  </label>
                  <label>
                    <span>Reminder</span>
                    <input
                      type="date"
                      value={draft.reminder_at}
                      onChange={(event) => setDraft((current) => ({ ...current, reminder_at: event.target.value }))}
                      disabled={!hasPermission("tasks.edit") || isSaving}
                    />
                  </label>
                </div>

                <div className="admin-tasks-page__drawer-actions">
                  <button type="button" className="admin-link-button" onClick={() => saveTask(selectedTask.id, { status: "done" })} disabled={!hasPermission("tasks.edit") || isSaving}>
                    <CheckCircle2 size={14} />
                    <span>Mark completed</span>
                  </button>
                  <button type="button" className="btn btn--primary" onClick={saveDraft} disabled={!hasPermission("tasks.edit") || isSaving}>
                    <span>{isSaving ? "Saving..." : "Save changes"}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </AdminSidePanel>

      {createOpen ? (
        <div className="admin-tasks-page__modal-layer" role="presentation">
          <button type="button" className="admin-tasks-page__modal-backdrop" onClick={() => setCreateOpen(false)} aria-label="Close create task" />
          <section className="admin-tasks-page__modal" role="dialog" aria-modal="true" aria-labelledby="tasks-create-title">
            <header className="admin-tasks-page__modal-header">
              <div>
                <span className="admin-tasks-page__eyebrow">Task</span>
                <h3 id="tasks-create-title">Create task</h3>
                <p>Create an operational work item linked to a case, lead, customer, document, partner, or finance record.</p>
              </div>
              <button type="button" className="admin-tasks-page__close" onClick={() => setCreateOpen(false)} aria-label="Close create task">
                <X size={16} />
              </button>
            </header>

            <form className="admin-tasks-page__modal-form" onSubmit={submitTask}>
              <section className="admin-tasks-page__template-strip">
                <header>
                  <h4>Templates</h4>
                  <span>Frontend defaults</span>
                </header>
                <div className="admin-tasks-page__template-list">
                  {taskTemplates.map((template) => (
                    <button key={template.key} type="button" className="admin-tasks-page__template-chip" onClick={() => applyTemplate(template)}>
                      {template.label}
                    </button>
                  ))}
                </div>
              </section>

              <label>
                <span>Task title</span>
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Task title" />
              </label>

              <label>
                <span>Description</span>
                <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
              </label>

              <div className="admin-tasks-page__modal-grid">
                <label>
                  <span>Related entity type</span>
                  <select
                    value={form.related_entity_type}
                    onChange={(event) => setForm((current) => ({ ...current, related_entity_type: event.target.value, related_entity_id: "" }))}
                  >
                    {entityTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label>
                  <span>Related entity</span>
                  <select
                    value={form.related_entity_id}
                    onChange={(event) => setForm((current) => ({ ...current, related_entity_id: event.target.value }))}
                  >
                    <option value="">Select linked entity</option>
                    {(entityOptions[form.related_entity_type] || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.lead_code || item.case_code || item.full_name || item.file_name || item.public_name || item.name || item.email || item.id?.slice?.(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Assignee</span>
                  <select value={form.assigned_user_id} onChange={(event) => setForm((current) => ({ ...current, assigned_user_id: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {(moduleData?.assignableUsers || []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                  </select>
                </label>

                <label>
                  <span>Priority</span>
                  <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                    {priorities.map((item) => <option key={item} value={item}>{normalizeLabel(item)}</option>)}
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    {statuses.filter((item) => item !== "cancelled").map((item) => <option key={item} value={item}>{normalizeLabel(item)}</option>)}
                  </select>
                </label>

                <label>
                  <span>Due date</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value || "" }))} />
                </label>

                <label>
                  <span>Reminder date</span>
                  <input type="date" value={form.reminder_at} onChange={(event) => setForm((current) => ({ ...current, reminder_at: event.target.value || "" }))} />
                </label>
              </div>

              <div className="admin-tasks-page__modal-actions">
                <button type="button" className="admin-link-button" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button className="btn btn--primary" type="submit" disabled={!hasPermission("tasks.edit") || isCreating}>
                  <span>{isCreating ? "Creating..." : "Create task"}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
