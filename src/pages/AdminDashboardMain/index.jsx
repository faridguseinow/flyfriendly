import { Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { createTask, fetchTasksModuleData, updateTask } from "../../services/adminService.js";

const DASHBOARD_TASK_ENTITY_ID = "00000000-0000-4000-8000-000000000001";
const WEEKDAY_REFERENCE = new Date(Date.UTC(2024, 0, 1));

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

function formatDueDate(value, t) {
  if (!value) {
    return t("admin.dashboardMain.noDeadline");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("admin.dashboardMain.noDeadline");
  }

  const today = startOfDay(new Date()).getTime();
  const due = startOfDay(date).getTime();
  if (due < today) {
    return t("admin.dashboardMain.overdue");
  }
  if (due === today) {
    return t("admin.dashboardMain.dueToday");
  }

  return date.toLocaleDateString();
}

function getPriorityRank(priority) {
  return { urgent: 0, high: 1, medium: 2, low: 3 }[priority] ?? 4;
}

function sortDashboardTasks(left, right) {
  const leftDone = left.status === "done" ? 1 : 0;
  const rightDone = right.status === "done" ? 1 : 0;
  if (leftDone !== rightDone) return leftDone - rightDone;

  const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;

  const priorityDiff = getPriorityRank(left.priority) - getPriorityRank(right.priority);
  if (priorityDiff) return priorityDiff;

  return new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime();
}

function buildWeekdayLabels(locale) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(WEEKDAY_REFERENCE);
    day.setUTCDate(WEEKDAY_REFERENCE.getUTCDate() + index);
    return formatter.format(day);
  });
}

function buildCalendarDays(date) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const todayValue = startOfDay(new Date()).getTime();

  return Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    if (index < firstWeekday) {
      return null;
    }

    const dayNumber = index - firstWeekday + 1;
    const dayDate = new Date(date.getFullYear(), date.getMonth(), dayNumber);

    return {
      key: dayDate.toISOString(),
      dayNumber,
      isToday: startOfDay(dayDate).getTime() === todayValue,
    };
  });
}

export default function AdminDashboardMain() {
  const { i18n, t } = useTranslation();
  const { hasPermission, profile } = useAdminAuth();
  const [draft, setDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState("medium");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [tasks, setTasks] = useState([]);
  const [taskError, setTaskError] = useState("");
  const [isTaskLoading, setIsTaskLoading] = useState(true);
  const [activeTaskAction, setActiveTaskAction] = useState("");
  const [now, setNow] = useState(() => new Date());
  const locale = useMemo(() => {
    const language = String(i18n.language || "en").toLowerCase();
    if (language.startsWith("ru")) {
      return "ru-RU";
    }
    if (language.startsWith("az")) {
      return "az-AZ";
    }
    if (language.startsWith("tr")) {
      return "tr-TR";
    }
    if (language.startsWith("uk")) {
      return "uk-UA";
    }
    if (language.startsWith("de")) {
      return "de-DE";
    }
    if (language.startsWith("fr")) {
      return "fr-FR";
    }
    if (language.startsWith("it")) {
      return "it-IT";
    }
    if (language.startsWith("es")) {
      return "es-ES";
    }
    if (language.startsWith("pt")) {
      return "pt-PT";
    }
    if (language.startsWith("pl")) {
      return "pl-PL";
    }
    if (language.startsWith("ka")) {
      return "ka-GE";
    }
    return "en-GB";
  }, [i18n.language]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadTasks() {
      setTaskError("");
      setIsTaskLoading(true);
      try {
        const data = await fetchTasksModuleData();
        if (!isMounted) return;
        setTasks(data.tasks || []);
      } catch (error) {
        if (!isMounted) return;
        setTaskError(error.message || t("admin.dashboardMain.taskLoadError"));
        setTasks([]);
      } finally {
        if (isMounted) {
          setIsTaskLoading(false);
        }
      }
    }

    void loadTasks();

    return () => {
      isMounted = false;
    };
  }, [t]);

  const visibleTasks = useMemo(
    () => tasks
      .filter((item) => item.status !== "cancelled")
      .sort(sortDashboardTasks)
      .slice(0, 8),
    [tasks],
  );
  const completedCount = visibleTasks.filter((item) => item.status === "done").length;
  const currentTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    [locale, now],
  );
  const currentDateLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
    [locale, now],
  );
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(now),
    [locale, now],
  );
  const weekdayLabels = useMemo(() => buildWeekdayLabels(locale), [locale]);
  const calendarDays = useMemo(() => buildCalendarDays(now), [now]);

  const reloadTasks = async () => {
    const data = await fetchTasksModuleData();
    setTasks(data.tasks || []);
  };

  const addTodo = async (event) => {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      return;
    }

    setTaskError("");
    setActiveTaskAction("create");
    try {
      await createTask({
        title: text,
        description: null,
        related_entity_type: "dashboard",
        related_entity_id: DASHBOARD_TASK_ENTITY_ID,
        assigned_user_id: profile?.id || null,
        priority: priorityDraft,
        status: "todo",
        task_type: "dashboard_todo",
        due_date: dueDateDraft || null,
      });
      setDraft("");
      setPriorityDraft("medium");
      setDueDateDraft("");
      await reloadTasks();
    } catch (error) {
      setTaskError(error.message || t("admin.dashboardMain.taskCreateError"));
    } finally {
      setActiveTaskAction("");
    }
  };

  const toggleTodo = async (task) => {
    setTaskError("");
    setActiveTaskAction(task.id);
    try {
      await updateTask(task.id, { status: task.status === "done" ? "todo" : "done" });
      await reloadTasks();
    } catch (error) {
      setTaskError(error.message || t("admin.dashboardMain.taskUpdateError"));
    } finally {
      setActiveTaskAction("");
    }
  };

  const deleteTodo = async (task) => {
    setTaskError("");
    setActiveTaskAction(task.id);
    try {
      await updateTask(task.id, { status: "cancelled" });
      await reloadTasks();
    } catch (error) {
      setTaskError(error.message || t("admin.dashboardMain.taskUpdateError"));
    } finally {
      setActiveTaskAction("");
    }
  };

  return (
    <section className="admin-dashboard-main" aria-label={t("admin.dashboardMain.ariaLabel")}>
      <div className="admin-dashboard-main__grid">
        <article className="admin-card admin-dashboard-main__todo">
          <header className="admin-dashboard-main__head">
            <div>
              <h1>{t("admin.dashboardMain.todoTitle")}</h1>
              <p>{t("admin.dashboardMain.todoDescription")}</p>
            </div>
            <div className="admin-dashboard-main__meta" aria-label={t("admin.dashboardMain.todoSummary")}>
              <span>{t("admin.dashboardMain.totalCount", { count: visibleTasks.length })}</span>
              <strong>{t("admin.dashboardMain.doneCount", { count: completedCount })}</strong>
            </div>
          </header>

          <form className="admin-dashboard-main__composer" onSubmit={addTodo}>
            <input
              type="text"
              className="admin-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("admin.dashboardMain.addTaskPlaceholder")}
              maxLength={180}
              disabled={!hasPermission("tasks.edit") || activeTaskAction === "create"}
            />
            <select
              className="admin-select"
              value={priorityDraft}
              onChange={(event) => setPriorityDraft(event.target.value)}
              disabled={!hasPermission("tasks.edit") || activeTaskAction === "create"}
              aria-label={t("admin.dashboardMain.priority")}
            >
              <option value="low">{t("admin.dashboardMain.priorityLow")}</option>
              <option value="medium">{t("admin.dashboardMain.priorityMedium")}</option>
              <option value="high">{t("admin.dashboardMain.priorityHigh")}</option>
              <option value="urgent">{t("admin.dashboardMain.priorityUrgent")}</option>
            </select>
            <input
              type="date"
              className="admin-input"
              value={dueDateDraft}
              onChange={(event) => setDueDateDraft(event.target.value)}
              disabled={!hasPermission("tasks.edit") || activeTaskAction === "create"}
              aria-label={t("admin.dashboardMain.dueDate")}
            />
            <button type="submit" className="btn btn-primary" disabled={!draft.trim() || !hasPermission("tasks.edit") || activeTaskAction === "create"}>
              {activeTaskAction === "create" ? <LoaderCircle size={16} className="is-spinning" /> : <Plus size={16} />}
              <span>{t("admin.common.add")}</span>
            </button>
          </form>

          {taskError ? <p className="admin-message is-error">{taskError}</p> : null}

          {isTaskLoading ? (
            <div className="admin-dashboard-main__empty">
              <LoaderCircle size={18} className="is-spinning" />
              <p>{t("admin.dashboardMain.loadingTasks")}</p>
            </div>
          ) : visibleTasks.length ? (
            <ul className="admin-dashboard-main__list">
              {visibleTasks.map((task) => (
                <li key={task.id} className={`admin-dashboard-main__item${task.status === "done" ? " is-completed" : ""}`}>
                  <button
                    type="button"
                    className="admin-dashboard-main__toggle"
                    onClick={() => toggleTodo(task)}
                    aria-pressed={task.status === "done"}
                    aria-label={task.status === "done" ? t("admin.dashboardMain.markTaskActive") : t("admin.dashboardMain.markTaskCompleted")}
                    disabled={!hasPermission("tasks.edit") || activeTaskAction === task.id}
                  >
                    <span className="admin-dashboard-main__check" aria-hidden="true">
                      {activeTaskAction === task.id ? <LoaderCircle size={13} className="is-spinning" /> : task.status === "done" ? <Check size={14} /> : null}
                    </span>
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        {t("admin.dashboardMain.taskMeta", {
                          priority: t(`admin.dashboardMain.priority${String(task.priority || "medium").replace(/^\w/, (letter) => letter.toUpperCase())}`),
                          due: formatDueDate(task.due_date, t),
                        })}
                      </small>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="admin-dashboard-main__delete"
                    onClick={() => deleteTodo(task)}
                    aria-label={t("admin.dashboardMain.deleteTask", { task: task.title })}
                    title={t("admin.common.delete")}
                    disabled={!hasPermission("tasks.edit") || activeTaskAction === task.id}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="admin-dashboard-main__empty">
              <p>{t("admin.dashboardMain.empty")}</p>
            </div>
          )}
        </article>

        <aside className="admin-dashboard-main__widgets" aria-label={t("admin.dashboardMain.widgetsAriaLabel")}>
          <article className="admin-card admin-dashboard-main__widget admin-dashboard-main__widget--clock">
            <span className="admin-dashboard-main__widget-label">{t("admin.dashboardMain.localTime")}</span>
            <strong className="admin-dashboard-main__clock-value">{currentTime}</strong>
            <p>{currentDateLabel}</p>
          </article>

          <article className="admin-card admin-dashboard-main__widget admin-dashboard-main__widget--calendar">
            <div className="admin-dashboard-main__calendar-head">
              <span className="admin-dashboard-main__widget-label">{t("admin.dashboardMain.calendar")}</span>
              <strong>{monthLabel}</strong>
            </div>

            <div className="admin-dashboard-main__calendar-weekdays" aria-hidden="true">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="admin-dashboard-main__calendar-grid" aria-label={monthLabel}>
              {calendarDays.map((day, index) => (
                day ? (
                  <span
                    key={day.key}
                    className={`admin-dashboard-main__calendar-day${day.isToday ? " is-today" : ""}`}
                  >
                    {day.dayNumber}
                  </span>
                ) : (
                  <span key={`empty-${index}`} className="admin-dashboard-main__calendar-day is-empty" aria-hidden="true" />
                )
              ))}
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
