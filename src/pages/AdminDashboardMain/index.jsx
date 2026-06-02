import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";

const STORAGE_KEY_PREFIX = "ff-admin-dashboard-todos";
const WEEKDAY_REFERENCE = new Date(Date.UTC(2024, 0, 1));

function buildStorageKey(email) {
  const normalizedEmail = String(email || "default").trim().toLowerCase();
  return `${STORAGE_KEY_PREFIX}:${normalizedEmail || "default"}`;
}

function createTodo(text) {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

function readTodos(storageKey) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.text === "string")
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        text: item.text.trim(),
        completed: item.completed === true,
        createdAt: item.createdAt || new Date().toISOString(),
      }))
      .filter((item) => item.text);
  } catch {
    return [];
  }
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
  const { profile } = useAdminAuth();
  const storageKey = useMemo(() => buildStorageKey(profile?.email), [profile?.email]);
  const [draft, setDraft] = useState("");
  const [todos, setTodos] = useState([]);
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
    setTodos(readTodos(storageKey));
  }, [storageKey]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(todos));
    } catch {
      // Ignore storage quota / private mode issues.
    }
  }, [storageKey, todos]);

  const completedCount = todos.filter((item) => item.completed).length;
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

  const addTodo = (event) => {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      return;
    }

    setTodos((current) => [createTodo(text), ...current]);
    setDraft("");
  };

  const toggleTodo = (todoId) => {
    setTodos((current) => current.map((item) => (
      item.id === todoId ? { ...item, completed: !item.completed } : item
    )));
  };

  const deleteTodo = (todoId) => {
    setTodos((current) => current.filter((item) => item.id !== todoId));
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
              <span>{t("admin.dashboardMain.totalCount", { count: todos.length })}</span>
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
            />
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              <Plus size={16} />
              <span>{t("admin.common.add")}</span>
            </button>
          </form>

          {todos.length ? (
            <ul className="admin-dashboard-main__list">
              {todos.map((todo) => (
                <li key={todo.id} className={`admin-dashboard-main__item${todo.completed ? " is-completed" : ""}`}>
                  <button
                    type="button"
                    className="admin-dashboard-main__toggle"
                    onClick={() => toggleTodo(todo.id)}
                    aria-pressed={todo.completed}
                    aria-label={todo.completed ? t("admin.dashboardMain.markTaskActive") : t("admin.dashboardMain.markTaskCompleted")}
                  >
                    <span className="admin-dashboard-main__check" aria-hidden="true">
                      {todo.completed ? <Check size={14} /> : null}
                    </span>
                    <span>{todo.text}</span>
                  </button>

                  <button
                    type="button"
                    className="admin-dashboard-main__delete"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={t("admin.dashboardMain.deleteTask", { task: todo.text })}
                    title={t("admin.common.delete")}
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
