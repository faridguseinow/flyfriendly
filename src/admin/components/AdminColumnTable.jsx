import { ChevronLeft, ChevronRight, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draggedColumnKey, setDraggedColumnKey] = useState("");
  const [dropTargetColumnKey, setDropTargetColumnKey] = useState("");
  const columnsMenuRef = useRef(null);
  const {
    layoutColumns,
    orderedColumns,
    moveColumn,
    moveColumnTo,
    resetLayout,
    startResize,
    toggleColumnVisibility,
  } = useAdminTableColumns({
    storageKey,
    columns,
  });

  const hideableColumns = useMemo(
    () => layoutColumns.filter((column) => column.hideable !== false),
    [layoutColumns],
  );

  useEffect(() => {
    if (!columnsOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (columnsMenuRef.current?.contains(event.target)) {
        return;
      }

      setColumnsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [columnsOpen]);

  const renderState = () => {
    if (loading) {
      return <div className="admin-crm-page__state">{t("admin.common.loading")}</div>;
    }

    if (error) {
      return (
        <div className="admin-crm-page__state is-error">
          <strong>{t("admin.common.dataLoadErrorTitle")}</strong>
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

  const resetDragState = () => {
    setDraggedColumnKey("");
    setDropTargetColumnKey("");
  };

  return (
    <section className="admin-crm-page__table-card">
      <div className="admin-crm-page__table-head">
        <div>
          <h2>{title}</h2>
          {countLabel ? <p>{countLabel}</p> : null}
        </div>
        <div className="admin-crm-page__table-controls">
          {hideableColumns.length ? (
            <div className="admin-crm-table__columns-menu" ref={columnsMenuRef}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-crm-table__columns-trigger"
                onClick={() => setColumnsOpen((current) => !current)}
                aria-expanded={columnsOpen}
              >
                <Settings2 size={14} />
                <span>{t("admin.common.columns")}</span>
              </button>
              {columnsOpen ? (
                <div className="admin-crm-table__columns-popover">
                  <div className="admin-crm-table__columns-popover-head">
                    <strong>{t("admin.common.manageColumns")}</strong>
                    <span>{t("admin.common.toggleColumnsHint")}</span>
                  </div>
                  <div className="admin-crm-table__columns-list">
                    {hideableColumns.map((column) => (
                      <label key={column.key} className="admin-crm-table__columns-item">
                        <input
                          type="checkbox"
                          checked={column.isVisible}
                          onChange={() => toggleColumnVisibility(column.key)}
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="button" className="admin-btn admin-btn-secondary admin-crm-table__reset" onClick={resetLayout}>
            <RotateCcw size={14} />
            <span>{t("admin.common.resetColumns")}</span>
          </button>
        </div>
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
                    className={`admin-crm-table__header-cell${column.wrap ? " admin-crm-table__cell--wrap" : " admin-crm-table__cell--nowrap"}${column.align === "right" ? " is-right" : ""}${draggedColumnKey === column.key ? " is-dragging" : ""}${dropTargetColumnKey === column.key ? " is-drop-target" : ""}`}
                    style={{ width: `${column.width}px`, minWidth: `${column.minWidth || column.width}px`, maxWidth: `${column.maxWidth || column.width}px` }}
                    onDragOver={(event) => {
                      if (!draggedColumnKey || draggedColumnKey === column.key || !column.reorderable) {
                        return;
                      }

                      event.preventDefault();
                      setDropTargetColumnKey(column.key);
                    }}
                    onDrop={(event) => {
                      if (!draggedColumnKey || draggedColumnKey === column.key || !column.reorderable) {
                        resetDragState();
                        return;
                      }

                      event.preventDefault();
                      moveColumnTo(draggedColumnKey, column.key);
                      resetDragState();
                    }}
                    onDragEnd={resetDragState}
                  >
                    <div
                      className="admin-crm-table__header-inner"
                      draggable={column.reorderable}
                      onDragStart={(event) => {
                        if (!column.reorderable) {
                          return;
                        }

                        if (typeof event.target?.closest === "function" && event.target.closest("button")) {
                          event.preventDefault();
                          return;
                        }

                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", column.key);
                        setDraggedColumnKey(column.key);
                      }}
                    >
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
                            aria-label={t("admin.common.moveColumnLeft", { column: column.label })}
                            title={t("admin.common.moveLeft")}
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
                            aria-label={t("admin.common.moveColumnRight", { column: column.label })}
                            title={t("admin.common.moveRight")}
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
                        aria-label={t("admin.common.resizeColumn", { column: column.label })}
                        title={t("admin.common.resize")}
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
