import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_VERSION = 1;

function clampWidth(value, column) {
  const width = Number(value);
  const min = Number(column.minWidth || column.width || 120);
  const max = Number(column.maxWidth || 640);

  if (!Number.isFinite(width)) {
    return Number(column.width || min);
  }

  return Math.min(Math.max(width, min), max);
}

function safeReadLayout(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.order) || typeof parsed.widths !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function safeWriteLayout(storageKey, payload) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in private or restricted environments.
  }
}

function buildDefaultOrder(columns) {
  return columns.map((column) => column.key);
}

function mergeOrder(columns, savedOrder) {
  const columnKeys = columns.map((column) => column.key);
  const nextOrder = [];
  const seen = new Set();

  (savedOrder || []).forEach((key) => {
    if (columnKeys.includes(key) && !seen.has(key)) {
      nextOrder.push(key);
      seen.add(key);
    }
  });

  columnKeys.forEach((key) => {
    if (!seen.has(key)) {
      nextOrder.push(key);
      seen.add(key);
    }
  });

  return nextOrder;
}

function buildWidths(columns, savedWidths) {
  return Object.fromEntries(
    columns.map((column) => [
      column.key,
      clampWidth(savedWidths?.[column.key] ?? column.width, column),
    ]),
  );
}

export function useAdminTableColumns({ storageKey, columns = [] }) {
  const resizeRef = useRef(null);
  const savedLayout = useMemo(() => safeReadLayout(storageKey), [storageKey]);
  const [order, setOrder] = useState(() => mergeOrder(columns, savedLayout?.order || buildDefaultOrder(columns)));
  const [widths, setWidths] = useState(() => buildWidths(columns, savedLayout?.widths || {}));

  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );

  const orderedColumns = useMemo(
    () => mergeOrder(columns, order)
      .map((key) => columnsByKey.get(key))
      .filter(Boolean)
      .map((column) => ({
        ...column,
        width: clampWidth(widths[column.key] ?? column.width, column),
      })),
    [columns, columnsByKey, order, widths],
  );

  useEffect(() => {
    const nextSavedLayout = safeReadLayout(storageKey);
    setOrder(mergeOrder(columns, nextSavedLayout?.order || buildDefaultOrder(columns)));
    setWidths(buildWidths(columns, nextSavedLayout?.widths || {}));
  }, [columns, storageKey]);

  useEffect(() => {
    const nextOrder = mergeOrder(columns, order);
    const nextWidths = buildWidths(columns, widths);
    const sameOrder = nextOrder.length === order.length && nextOrder.every((key, index) => key === order[index]);
    const sameWidths = columns.every((column) => nextWidths[column.key] === widths[column.key]);

    if (!sameOrder) {
      setOrder(nextOrder);
    }

    if (!sameWidths) {
      setWidths(nextWidths);
    }
  }, [columns, order, widths]);

  useEffect(() => {
    safeWriteLayout(storageKey, {
      version: STORAGE_VERSION,
      order,
      widths,
    });
  }, [order, storageKey, widths]);

  useEffect(() => () => {
    if (resizeRef.current) {
      window.removeEventListener("mousemove", resizeRef.current.handleMove);
      window.removeEventListener("mouseup", resizeRef.current.handleUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }, []);

  const moveColumn = (columnKey, direction) => {
    setOrder((current) => {
      const index = current.indexOf(columnKey);
      if (index === -1) {
        return current;
      }

      const targetIndex = direction === "left" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const resetLayout = () => {
    setOrder(buildDefaultOrder(columns));
    setWidths(buildWidths(columns, {}));
  };

  const startResize = (event, columnKey) => {
    const column = columnsByKey.get(columnKey);
    if (!column?.resizable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = clampWidth(widths[columnKey] ?? column.width, column);

    const handleMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setWidths((current) => ({
        ...current,
        [columnKey]: clampWidth(startWidth + delta, column),
      }));
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      resizeRef.current = null;
    };

    resizeRef.current = { handleMove, handleUp };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return {
    orderedColumns,
    moveColumn,
    resetLayout,
    startResize,
  };
}
