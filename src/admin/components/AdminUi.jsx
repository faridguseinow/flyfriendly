import { ChevronRight, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  breadcrumbs = [],
  primaryAction = null,
  secondaryActions = [],
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__content">
        {breadcrumbs.length ? (
          <nav className="admin-page-header__breadcrumbs" aria-label="Breadcrumbs">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="admin-page-header__breadcrumb">
                {item.path ? <Link to={item.path}>{item.label}</Link> : <strong>{item.label}</strong>}
                {index < breadcrumbs.length - 1 ? <ChevronRight size={14} strokeWidth={1.8} /> : null}
              </span>
            ))}
          </nav>
        ) : null}

        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      {(primaryAction || secondaryActions.length) ? (
        <div className="admin-page-header__actions">
          {secondaryActions.map((action) => (
            action.path ? (
              <Link key={action.label} to={action.path} className="admin-btn admin-btn-secondary admin-link-button">
                {action.icon ? <action.icon size={14} /> : null}
                <span>{action.label}</span>
              </Link>
            ) : (
              <button key={action.label} type="button" className="admin-btn admin-btn-secondary admin-link-button" onClick={action.onClick} disabled={action.disabled}>
                {action.icon ? <action.icon size={14} /> : null}
                <span>{action.label}</span>
              </button>
            )
          ))}

          {primaryAction ? (
            primaryAction.path ? (
              <Link to={primaryAction.path} className="admin-btn admin-btn-primary btn btn--primary">
                {primaryAction.icon ? <primaryAction.icon size={14} /> : null}
                <span>{primaryAction.label}</span>
              </Link>
            ) : (
              <button type="button" className="admin-btn admin-btn-primary btn btn--primary" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
                {primaryAction.icon ? <primaryAction.icon size={14} /> : null}
                <span>{primaryAction.label}</span>
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function AdminStatusBadge({ children, tone = "neutral" }) {
  return <span className={`admin-badge admin-badge-${tone} admin-status-badge is-${tone}`}>{children}</span>;
}

export function AdminKpiCard({ icon: Icon, label, value, trend, status = "neutral", link, meta }) {
  const content = (
    <>
      {Icon ? <span className="admin-kpi-card__icon"><Icon size={18} strokeWidth={1.9} /></span> : null}
      <div className="admin-kpi-card__body">
        <small>{label}</small>
        <strong>{value}</strong>
        {meta ? <span>{meta}</span> : null}
        {trend ? <em className={`admin-kpi-card__trend is-${status}`}>{trend}</em> : null}
      </div>
    </>
  );

  return link ? (
    <Link to={link} className="admin-kpi-card">
      {content}
    </Link>
  ) : (
    <article className="admin-kpi-card">
      {content}
    </article>
  );
}

export function AdminDataTable({
  title,
  description,
  columns = [],
  rows = [],
  loading = false,
  error = "",
  emptyLabel = "No data available.",
  compact = false,
  renderRow,
  actions = null,
}) {
  return (
    <section className={`admin-panel admin-data-table${compact ? " is-compact" : ""}`}>
      {(title || description || actions) ? (
        <div className="admin-panel__head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="admin-data-table__actions">{actions}</div> : null}
        </div>
      ) : null}

      {loading ? <div className="admin-data-table__state">Loading...</div> : null}
      {!loading && error ? <div className="admin-data-table__state is-error">{error}</div> : null}
      {!loading && !error && !rows.length ? <div className="admin-data-table__state">{emptyLabel}</div> : null}

      {!loading && !error && rows.length ? (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => <th key={column.key || column.label}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>{rows.map((row, index) => renderRow(row, index))}</tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function AdminFilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search",
  statusFilter = null,
  onStatusFilterChange,
  statusOptions = [],
  ownerFilter = null,
  onOwnerFilterChange,
  ownerOptions = [],
  dateRange = null,
  onDateRangeChange,
  children = null,
}) {
  return (
    <div className="admin-filter-bar">
      {typeof onSearchChange === "function" ? (
        <label className="admin-search">
          <Search size={16} />
          <input
            className="admin-input"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
      ) : null}

      {statusOptions.length && typeof onStatusFilterChange === "function" ? (
        <select className="admin-filter-control admin-select" value={statusFilter || "all"} onChange={(event) => onStatusFilterChange(event.target.value)}>
          {statusOptions.map((option) => (
            <option key={option.value || option} value={option.value || option}>
              {option.label || option}
            </option>
          ))}
        </select>
      ) : null}

      {ownerOptions.length && typeof onOwnerFilterChange === "function" ? (
        <select className="admin-filter-control admin-select" value={ownerFilter || "all"} onChange={(event) => onOwnerFilterChange(event.target.value)}>
          {ownerOptions.map((option) => (
            <option key={option.value || option} value={option.value || option}>
              {option.label || option}
            </option>
          ))}
        </select>
      ) : null}

      {dateRange && typeof onDateRangeChange === "function" ? (
        <div className="admin-filter-bar__date-range">
          <input
            className="admin-filter-control admin-input"
            type="date"
            value={dateRange.from || ""}
            onChange={(event) => onDateRangeChange({ ...dateRange, from: event.target.value })}
          />
          <span>to</span>
          <input
            className="admin-filter-control admin-input"
            type="date"
            value={dateRange.to || ""}
            onChange={(event) => onDateRangeChange({ ...dateRange, to: event.target.value })}
          />
        </div>
      ) : null}

      {children}
    </div>
  );
}

export function AdminDetailDrawer({
  open = false,
  title,
  subtitle,
  onClose,
  children,
}) {
  return (
    <aside className={`admin-detail-drawer${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="admin-detail-drawer__head">
        <div>
          <h2>{title || "Detail"}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {onClose ? (
          <button type="button" className="admin-detail-drawer__close" onClick={onClose} aria-label="Close detail">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="admin-detail-drawer__body">{children}</div>
    </aside>
  );
}

export function AdminSidePanel({
  open = false,
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
  className = "",
}) {
  return (
    <aside className={`admin-side-panel${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} aria-hidden={!open}>
      <div className="admin-side-panel__inner">
        <div className="admin-side-panel__header">
          <div>
            {eyebrow ? <span className="admin-side-panel__eyebrow">{eyebrow}</span> : null}
            <h2>{title || "Detail"}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button type="button" className="admin-side-panel__close" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="admin-side-panel__body">{children}</div>
      </div>
    </aside>
  );
}

export function AdminActionQueue({
  title,
  description,
  count,
  rows = [],
  emptyLabel = "Nothing requires action.",
  actionPath,
  actionLabel = "Open",
  renderRow,
}) {
  return (
    <section className="admin-panel admin-action-queue">
      <div className="admin-panel__head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="admin-action-queue__meta">
          <strong>{count}</strong>
          {actionPath ? <Link to={actionPath}>{actionLabel}</Link> : null}
        </div>
      </div>

      {rows.length ? (
        <div className="admin-action-queue__list">
          {rows.map((row) => renderRow(row))}
        </div>
      ) : (
        <div className="admin-action-queue__empty">{emptyLabel}</div>
      )}
    </section>
  );
}
