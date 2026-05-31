import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useAdminTableColumns } from "../hooks/useAdminTableColumns.js";

export function AdminColumnTable({
  storageKey,
  title,
  countLabel,
  columns = [],
  rows = [],
  loading = false,
  error = "",
  emptyTitle = "No records found",
  emptyDetail = "",
  selectedRowId = "",
  getRowKey,
  onRowClick,
}) {
  const {
    orderedColumns,
    moveColumn,
    resetLayout,
    startResize,
  } = useAdminTableColumns({
    storageKey,
    columns,
  });

  const renderState = () => {
    if (loading) {
      return <div className="admin-crm-page__state">Loading...</div>;
    }

    if (error) {
      return (
        <div className="admin-crm-page__state is-error">
          <strong>Data could not be loaded.</strong>
          {error ? <span>{error}</span> : null}
        </div>
      );
    }

    if (!rows.length) {
      return (
        <div className="admin-crm-page__state">
          <strong>{emptyTitle}</strong>
          {emptyDetail ? <span>{emptyDetail}</span> : null}
        </div>
      );
    }

    return null;
  };

  const state = renderState();

  return (
    <section className="admin-crm-page__table-card">
      <div className="admin-crm-page__table-head">
        <div>
          <h2>{title}</h2>
          {countLabel ? <p>{countLabel}</p> : null}
        </div>
        <button type="button" className="admin-btn admin-btn-secondary admin-crm-table__reset" onClick={resetLayout}>
          <RotateCcw size={14} />
          <span>Reset columns</span>
        </button>
      </div>

      {state || (
        <div className="admin-crm-page__table-wrap">
          <table className="admin-crm-page__table admin-crm-table">
            <colgroup>
              {orderedColumns.map((column) => (
                <col key={column.key} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {orderedColumns.map((column, index) => (
                  <th
                    key={column.key}
                    className={`admin-crm-table__header-cell${column.wrap ? " admin-crm-table__cell--wrap" : " admin-crm-table__cell--nowrap"}${column.align === "right" ? " is-right" : ""}`}
                    style={{ width: `${column.width}px`, minWidth: `${column.minWidth || column.width}px`, maxWidth: `${column.maxWidth || column.width}px` }}
                  >
                    <div className="admin-crm-table__header-inner">
                      <span>{column.label}</span>
                      {column.reorderable ? (
                        <div className="admin-crm-table__move-controls">
                          <button
                            type="button"
                            className="admin-crm-table__move-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveColumn(column.key, "left");
                            }}
                            disabled={index === 0}
                            aria-label={`Move ${column.label} left`}
                            title="Move left"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <button
                            type="button"
                            className="admin-crm-table__move-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveColumn(column.key, "right");
                            }}
                            disabled={index === orderedColumns.length - 1}
                            aria-label={`Move ${column.label} right`}
                            title="Move right"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {column.resizable ? (
                      <button
                        type="button"
                        className="admin-crm-table__resize-handle"
                        onMouseDown={(event) => startResize(event, column.key)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Resize ${column.label} column`}
                        title="Resize column"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = getRowKey(row);
                return (
                  <tr
                    key={rowKey}
                    className={`admin-crm-page__row admin-crm-table__row${selectedRowId === rowKey ? " is-selected" : ""}`}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick?.(row);
                      }
                    }}
                    tabIndex={0}
                  >
                    {orderedColumns.map((column) => (
                      <td
                        key={column.key}
                        className={`admin-crm-table__cell${column.wrap ? " admin-crm-table__cell--wrap" : " admin-crm-table__cell--nowrap"}${column.align === "right" ? " is-right" : ""}`}
                        title={typeof column.getCellTitle === "function" ? column.getCellTitle(row) : undefined}
                      >
                        {column.renderCell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
