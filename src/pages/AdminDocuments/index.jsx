import { useEffect, useMemo, useState } from "react";
import { Download, FileImage, FileText, FilterX, FolderOpen, Search, Signature, Ticket, Trash2, UserSquare2 } from "lucide-react";
import {
  downloadSignaturePng,
  fetchDocumentsCenterData,
  getDocumentDownloadUrl,
  logAdminActivity,
  moveDocumentToTrash,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { AdminSidePanel, AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
import "./style.scss";

const REQUIRED_DOCUMENTS = [
  { key: "passport", label: "Passport / ID" },
  { key: "boarding_pass", label: "Boarding Pass" },
  { key: "signature", label: "Signature / Consent" },
];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatSize(value) {
  const size = Number(value || 0);
  if (!size) return "—";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getFileExtension(name) {
  const value = String(name || "").toLowerCase();
  const parts = value.split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function getDocumentTypeLabel(type, kind = "document") {
  const value = String(type || "").toLowerCase();
  if (kind === "signature" || value.includes("signature") || value.includes("consent")) return "Signature / Consent";
  if (value.includes("passport") || value.includes("id")) return "Passport / ID";
  if (value.includes("boarding")) return "Boarding Pass";
  if (value.includes("booking") || value.includes("ticket")) return "Booking Confirmation / Ticket";
  if (value.includes("delay")) return "Delay Proof";
  if (value.includes("cancel")) return "Cancellation Proof";
  if (value.includes("airline") || value.includes("communication")) return "Airline Communication";
  return "Other";
}

function getDocumentTypeKey(type, kind = "document") {
  const label = getDocumentTypeLabel(type, kind);
  if (label === "Passport / ID") return "passport";
  if (label === "Boarding Pass") return "boarding_pass";
  if (label === "Booking Confirmation / Ticket") return "booking";
  if (label === "Signature / Consent") return "signature";
  if (label === "Delay Proof") return "delay_proof";
  if (label === "Cancellation Proof") return "cancellation_proof";
  if (label === "Airline Communication") return "airline_communication";
  return "other";
}

function getDocumentStatusLabel(status, kind = "document") {
  const value = String(status || "").toLowerCase();
  if (kind === "signature" && value === "signed") return "Approved";
  if (["uploaded", "pending", "pending_review"].includes(value)) return "Pending review";
  if (["approved", "signed"].includes(value)) return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "missing") return "Missing";
  if (value === "replacement_requested" || value === "requested") return "Replacement requested";
  return normalizeLabel(status || "uploaded");
}

function getStatusTone(status, kind = "document") {
  const label = getDocumentStatusLabel(status, kind).toLowerCase();
  if (label === "approved") return "success";
  if (label === "rejected") return "danger";
  if (label === "missing" || label === "replacement requested" || label === "pending review") return "warning";
  return "neutral";
}

function getFolderHealthTone(health) {
  if (health === "complete") return "success";
  if (health === "missing documents") return "danger";
  return "warning";
}

function getFolderHealthLabel(health) {
  return normalizeLabel(health);
}

function getReferenceForOwner(item, maps) {
  if (item.owner_type === "lead") {
    return maps.leads.get(item.owner_id)?.lead_code || `Lead — ${String(item.owner_id || "").slice(0, 8)}`;
  }
  if (item.owner_type === "case") {
    return maps.cases.get(item.owner_id)?.case_code || `Case — ${String(item.owner_id || "").slice(0, 8)}`;
  }
  if (item.owner_type === "claim") {
    return maps.claims.get(item.owner_id)?.claim_code || `Claim — ${String(item.owner_id || "").slice(0, 8)}`;
  }
  return `${normalizeLabel(item.owner_type)} — ${String(item.owner_id || "").slice(0, 8)}`;
}

function getCustomerForOwner(item, maps) {
  if (item.owner_type === "lead") {
    const lead = maps.leads.get(item.owner_id);
    return maps.customers.get(lead?.customer_id)?.full_name || lead?.full_name || lead?.email || "Unknown customer";
  }
  if (item.owner_type === "case") {
    const caseRow = maps.cases.get(item.owner_id);
    return maps.customers.get(caseRow?.customer_id)?.full_name || maps.customers.get(caseRow?.customer_id)?.email || "Unknown customer";
  }
  if (item.owner_type === "claim") {
    return "Claim customer";
  }
  return "Unknown customer";
}

function getRouteForOwner(item, maps) {
  if (item.owner_type === "lead") {
    const lead = maps.leads.get(item.owner_id);
    return `${lead?.departure_airport || "—"} → ${lead?.arrival_airport || "—"}`;
  }
  if (item.owner_type === "case") {
    const caseRow = maps.cases.get(item.owner_id);
    return `${caseRow?.route_from || "—"} → ${caseRow?.route_to || "—"}`;
  }
  return "—";
}

function getFileIcon(typeKey) {
  if (typeKey === "passport") return UserSquare2;
  if (typeKey === "boarding_pass" || typeKey === "booking") return Ticket;
  if (typeKey === "signature") return Signature;
  return FileText;
}

function isImageDocument(item) {
  if (!item) return false;
  if (item.kind === "signature") return true;
  const mime = String(item.mime_type || "").toLowerCase();
  const ext = getFileExtension(item.file_name);
  return mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
}

function isPdfDocument(item) {
  if (!item) return false;
  const mime = String(item.mime_type || "").toLowerCase();
  const ext = getFileExtension(item.file_name);
  return mime.includes("pdf") || ext === "pdf";
}

function getPreviewSource(item, previewUrls) {
  if (!item) return "";
  if (item.kind === "signature" && item.signature_data_url) return item.signature_data_url;
  return previewUrls[item.id] || "";
}

function canLoadPreview(item) {
  return Boolean(item && isImageDocument(item) && (item.signature_data_url || (item.bucket && item.file_path)));
}

function exportDocumentsCsv(rows) {
  const headers = ["Document Name", "Type", "Customer", "Reference", "Linked Task", "Status", "Uploaded", "Size"];
  const lines = rows.map((item) => [
    item.displayName,
    item.typeLabel,
    item.customerName,
    item.reference,
    item.linkedTaskLabel,
    item.statusLabel,
    item.created_at,
    item.file_size,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-documents-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function DocumentPreviewThumb({ item, previewUrl, compact = false, large = false }) {
  const Icon = getFileIcon(item?.typeKey);
  const classes = [
    "admin-documents-page__thumb",
    compact ? "is-compact" : "",
    large ? "is-large" : "",
    isPdfDocument(item) ? "is-pdf" : "",
  ].filter(Boolean).join(" ");

  if (isImageDocument(item) && previewUrl) {
    return (
      <span className={classes}>
        <img src={previewUrl} alt={item.displayName} loading="lazy" />
      </span>
    );
  }

  return (
    <span className={classes}>
      {isPdfDocument(item) ? <span className="admin-documents-page__thumb-badge">PDF</span> : null}
      {isImageDocument(item) ? <FileImage size={compact ? 16 : 18} /> : <Icon size={compact ? 16 : 18} />}
    </span>
  );
}

export default function AdminDocuments() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [selectedFolderKey, setSelectedFolderKey] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [drawerMode, setDrawerMode] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [folderHealthFilter, setFolderHealthFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [previewUrls, setPreviewUrls] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeDownloadId, setActiveDownloadId] = useState("");
  const [activeTrashId, setActiveTrashId] = useState("");

  const loadDocuments = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchDocumentsCenterData();
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load documents center.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const maps = useMemo(() => ({
    leads: new Map((moduleData?.leads || []).map((item) => [item.id, item])),
    cases: new Map((moduleData?.cases || []).map((item) => [item.id, item])),
    claims: new Map((moduleData?.claims || []).map((item) => [item.id, item])),
    customers: new Map((moduleData?.customers || []).map((item) => [item.id, item])),
  }), [moduleData]);

  const tasksByEntity = useMemo(() => {
    const map = new Map();
    (moduleData?.tasks || []).forEach((task) => {
      const key = `${task.related_entity_type}:${task.related_entity_id}`;
      const current = map.get(key) || [];
      current.push(task);
      map.set(key, current);
    });
    return map;
  }, [moduleData?.tasks]);

  const documentsWithMeta = useMemo(() => (
    (moduleData?.documents || []).map((item) => {
      const reference = getReferenceForOwner(item, maps);
      const customerName = getCustomerForOwner(item, maps);
      const route = getRouteForOwner(item, maps);
      const folderKey = `${item.owner_type}:${item.owner_id}`;
      const linkedTasks = tasksByEntity.get(folderKey) || [];
      return {
        ...item,
        folderKey,
        reference,
        customerName,
        route,
        displayName: item.file_name || item.signer_name || "Untitled document",
        typeLabel: getDocumentTypeLabel(item.document_type, item.kind),
        typeKey: getDocumentTypeKey(item.document_type, item.kind),
        statusLabel: getDocumentStatusLabel(item.status, item.kind),
        statusTone: getStatusTone(item.status, item.kind),
        linkedTaskLabel: linkedTasks[0]?.title || (linkedTasks.length ? `${linkedTasks.length} linked tasks` : "—"),
        linkedTasks,
        entityLabel: normalizeLabel(item.owner_type),
      };
    })
  ), [maps, moduleData?.documents, tasksByEntity]);

  const folders = useMemo(() => {
    const grouped = new Map();

    documentsWithMeta.forEach((item) => {
      const current = grouped.get(item.folderKey) || {
        key: item.folderKey,
        entityType: item.owner_type,
        ownerId: item.owner_id,
        reference: item.reference,
        customerName: item.customerName,
        route: item.route,
        documents: [],
        linkedTasks: item.linkedTasks || [],
      };
      current.documents.push(item);
      if ((item.linkedTasks || []).length) {
        current.linkedTasks = item.linkedTasks;
      }
      grouped.set(item.folderKey, current);
    });

    return Array.from(grouped.values()).map((folder) => {
      const sortedDocuments = [...folder.documents].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
      const requiredChecklist = REQUIRED_DOCUMENTS.map((requirement) => {
        const document = sortedDocuments.find((item) => item.typeKey === requirement.key) || null;
        return {
          ...requirement,
          document,
          statusLabel: document ? document.statusLabel : "Missing",
          statusTone: document ? document.statusTone : "danger",
        };
      });
      const missingDocuments = requiredChecklist.filter((item) => !item.document).map((item) => item.label);
      const hasReviewWork = requiredChecklist.some((item) => item.document && ["Pending review", "Rejected", "Replacement requested"].includes(item.statusLabel));
      const health = missingDocuments.length ? "missing documents" : hasReviewWork ? "pending review" : "complete";
      const lastUpdated = sortedDocuments[0]?.created_at ? new Date(sortedDocuments[0].created_at).getTime() : 0;

      return {
        ...folder,
        documents: sortedDocuments,
        docCount: sortedDocuments.length,
        title: `${folder.reference} — ${folder.customerName}`,
        requiredChecklist,
        missingDocuments,
        health,
        lastUpdated,
      };
    }).sort((left, right) => right.lastUpdated - left.lastUpdated);
  }, [documentsWithMeta]);

  const folderByKey = useMemo(() => new Map(folders.map((folder) => [folder.key, folder])), [folders]);

  const recentTaskFolders = useMemo(() => {
    const seen = new Set();
    return (moduleData?.tasks || [])
      .filter((task) => task.related_entity_type === "case" || task.related_entity_type === "lead")
      .map((task) => {
        const folderKey = `${task.related_entity_type}:${task.related_entity_id}`;
        const folder = folderByKey.get(folderKey);
        if (!folder || seen.has(folderKey)) return null;
        seen.add(folderKey);
        return { ...folder, quickKind: "task", quickLabel: task.title || "Task work", quickUpdated: task.updated_at || task.created_at || folder.lastUpdated };
      })
      .filter(Boolean)
      .sort((left, right) => new Date(right.quickUpdated).getTime() - new Date(left.quickUpdated).getTime())
      .slice(0, 4);
  }, [folderByKey, moduleData?.tasks]);

  const recentCaseFolders = useMemo(
    () => folders.filter((folder) => folder.entityType === "case").slice(0, 4).map((folder) => ({ ...folder, quickKind: "case", quickLabel: "Case" })),
    [folders],
  );

  const recentLeadFolders = useMemo(
    () => folders.filter((folder) => folder.entityType === "lead").slice(0, 4).map((folder) => ({ ...folder, quickKind: "lead", quickLabel: "Lead" })),
    [folders],
  );

  const filteredFolders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return folders.filter((folder) => {
      const matchesSearch = !query || [
        folder.title,
        folder.reference,
        folder.customerName,
        folder.route,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesHealth = folderHealthFilter === "all" || folder.health === folderHealthFilter;
      const matchesEntity = entityFilter === "all"
        || folder.entityType === entityFilter
        || (entityFilter === "task" && folder.linkedTasks.length)
        || (entityFilter === "customer" && folder.customerName !== "Unknown customer");
      return matchesSearch && matchesHealth && matchesEntity;
    });
  }, [entityFilter, folderHealthFilter, folders, search]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromMs = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
    const toMs = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : null;

    return documentsWithMeta.filter((item) => {
      const matchesSearch = !query || [
        item.displayName,
        item.typeLabel,
        item.customerName,
        item.reference,
        item.linkedTaskLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || item.statusLabel.toLowerCase() === statusFilter;
      const matchesType = typeFilter === "all" || item.typeKey === typeFilter;
      const matchesKind = kindFilter === "all" || item.kind === kindFilter;
      const matchesEntity = entityFilter === "all"
        || item.owner_type === entityFilter
        || (entityFilter === "task" && item.linkedTasks.length)
        || (entityFilter === "customer" && item.customerName !== "Unknown customer");

      const folder = folderByKey.get(item.folderKey);
      const matchesFolderHealth = folderHealthFilter === "all" || folder?.health === folderHealthFilter;
      const matchesFolder = !selectedFolderKey || item.folderKey === selectedFolderKey;

      const createdMs = item.created_at ? new Date(item.created_at).getTime() : null;
      const matchesFrom = !fromMs || (createdMs && createdMs >= fromMs);
      const matchesTo = !toMs || (createdMs && createdMs <= toMs);

      return matchesSearch && matchesStatus && matchesType && matchesKind && matchesEntity && matchesFolderHealth && matchesFolder && matchesFrom && matchesTo;
    }).sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [dateRange.from, dateRange.to, documentsWithMeta, entityFilter, folderByKey, folderHealthFilter, kindFilter, search, selectedFolderKey, statusFilter, typeFilter]);

  const selectedFolder = selectedFolderKey ? folderByKey.get(selectedFolderKey) || null : null;
  const selectedDocument = selectedDocumentId
    ? filteredRows.find((item) => item.id === selectedDocumentId) || documentsWithMeta.find((item) => item.id === selectedDocumentId) || null
    : null;

  const storageSummary = useMemo(() => {
    const totalBytes = documentsWithMeta
      .filter((item) => item.kind === "document")
      .reduce((sum, item) => sum + Number(item.file_size || 0), 0);

    return {
      totalDocuments: documentsWithMeta.length,
      totalBytes,
      pendingReview: documentsWithMeta.filter((item) => item.statusLabel === "Pending review").length,
      approved: documentsWithMeta.filter((item) => item.statusLabel === "Approved").length,
      missing: folders.filter((folder) => folder.health === "missing documents").length,
      rejected: documentsWithMeta.filter((item) => item.statusLabel === "Rejected").length,
      replacementRequested: documentsWithMeta.filter((item) => item.statusLabel === "Replacement requested").length,
      passport: documentsWithMeta.filter((item) => item.typeKey === "passport").length,
      boarding: documentsWithMeta.filter((item) => item.typeKey === "boarding_pass").length,
      booking: documentsWithMeta.filter((item) => item.typeKey === "booking").length,
      signature: documentsWithMeta.filter((item) => item.typeKey === "signature").length,
      other: documentsWithMeta.filter((item) => item.typeKey === "other").length,
    };
  }, [documentsWithMeta, folders]);

  const previewCandidates = useMemo(() => {
    const candidates = new Map();
    filteredRows.slice(0, 18).forEach((item) => {
      if (canLoadPreview(item)) candidates.set(item.id, item);
    });
    recentTaskFolders.forEach((folder) => {
      folder.documents.slice(0, 3).forEach((item) => {
        if (canLoadPreview(item)) candidates.set(item.id, item);
      });
    });
    recentCaseFolders.forEach((folder) => {
      folder.documents.slice(0, 3).forEach((item) => {
        if (canLoadPreview(item)) candidates.set(item.id, item);
      });
    });
    recentLeadFolders.forEach((folder) => {
      folder.documents.slice(0, 3).forEach((item) => {
        if (canLoadPreview(item)) candidates.set(item.id, item);
      });
    });
    selectedFolder?.documents.forEach((item) => {
      if (canLoadPreview(item)) candidates.set(item.id, item);
    });
    selectedDocument && canLoadPreview(selectedDocument) && candidates.set(selectedDocument.id, selectedDocument);
    return Array.from(candidates.values());
  }, [filteredRows, recentCaseFolders, recentLeadFolders, recentTaskFolders, selectedDocument, selectedFolder]);

  useEffect(() => {
    const nextItems = previewCandidates.filter((item) => item.kind !== "signature" && !previewUrls[item.id]);
    if (!nextItems.length) return;

    let cancelled = false;
    Promise.all(nextItems.map(async (item) => {
      try {
        const url = await getDocumentDownloadUrl(item);
        return [item.id, url];
      } catch {
        return [item.id, ""];
      }
    })).then((entries) => {
      if (cancelled) return;
      setPreviewUrls((current) => {
        const next = { ...current };
        entries.forEach(([id, url]) => {
          if (url) next[id] = url;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [previewCandidates, previewUrls]);

  const openFolder = (folderKey) => {
    setSelectedFolderKey(folderKey);
    setSelectedDocumentId("");
    setDrawerMode("folder");
    setDrawerOpen(true);
  };

  const openDocument = (documentId) => {
    setSelectedDocumentId(documentId);
    setDrawerMode("document");
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerMode("");
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setEntityFilter("all");
    setKindFilter("all");
    setFolderHealthFilter("all");
    setDateRange({ from: "", to: "" });
    setSelectedFolderKey("");
  };

  const handleDownload = async (item) => {
    setError("");
    setActiveDownloadId(item.id);

    try {
      if (item.kind === "signature") {
        downloadSignaturePng(item.signature_data_url, `${item.displayName}-${item.reference}.png`);
      } else {
        const url = await getDocumentDownloadUrl(item);
        const link = document.createElement("a");
        link.href = url;
        link.download = item.file_name || "document";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      void logAdminActivity("download_document", item.kind === "signature" ? "lead_signature" : "document", item.id, {
        module: "documents",
        owner_type: item.owner_type || null,
        owner_id: item.owner_id || null,
        document_type: item.document_type || null,
        kind: item.kind || null,
      });
    } catch (nextError) {
      setError(nextError.message || "Could not open this document.");
    } finally {
      setActiveDownloadId("");
    }
  };

  const handleTrash = async (item) => {
    if (!item || !hasPermission("documents.manage")) return;
    const confirmed = window.confirm(`Move "${item.displayName}" to trash? It will be purged after 30 days unless restored.`);
    if (!confirmed) return;

    setError("");
    setActiveTrashId(item.id);

    try {
      await moveDocumentToTrash(item);
      await loadDocuments();
      setSelectedDocumentId("");
      setDrawerMode(selectedFolderKey ? "folder" : "");
    } catch (nextError) {
      setError(nextError.message || "Could not move the document to trash.");
    } finally {
      setActiveTrashId("");
    }
  };

  const quickSections = [
    { title: "Recent task folders", rows: recentTaskFolders },
    { title: "Recent case folders", rows: recentCaseFolders },
    { title: "Recent lead folders", rows: recentLeadFolders },
  ].filter((section) => section.rows.length);

  const activeFolder = drawerMode === "folder" ? selectedFolder : selectedDocument ? folderByKey.get(selectedDocument.folderKey) || null : null;
  const activePreviewDocument = drawerMode === "document" ? selectedDocument : null;

  return (
    <div className="admin-page admin-documents-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsDocumentsCenterV1 ? (
        <p className="admin-message">
          Cases documents schema is not fully available yet. Run `007_cases_module_v1.sql` in Supabase to unlock full case document coverage.
        </p>
      ) : null}

      <section className="admin-documents-page__header admin-card admin-card-compact">
        <div>
          <span className="admin-documents-page__eyebrow">Operations</span>
          <h2>Documents</h2>
          <p>Review customer files linked to leads, cases, and tasks.</p>
        </div>
        <div className="admin-documents-page__header-actions">
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => exportDocumentsCsv(filteredRows)} disabled={!filteredRows.length}>
            <Download size={14} />
            <span>Export list</span>
          </button>
        </div>
      </section>

      <section className="admin-documents-page__toolbar admin-card admin-card-compact">
        <label className="admin-documents-page__search">
          <Search size={16} />
          <input
            className="admin-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, reference, document name, type"
          />
        </label>

        <select className="admin-select admin-filter-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending review">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="missing">Missing</option>
          <option value="replacement requested">Replacement requested</option>
        </select>

        <select className="admin-select admin-filter-control" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          <option value="passport">Passport / ID</option>
          <option value="boarding_pass">Boarding Pass</option>
          <option value="booking">Booking Confirmation / Ticket</option>
          <option value="signature">Signature / Consent</option>
          <option value="delay_proof">Delay Proof</option>
          <option value="cancellation_proof">Cancellation Proof</option>
          <option value="airline_communication">Airline Communication</option>
          <option value="other">Other</option>
        </select>

        <select className="admin-select admin-filter-control" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
          <option value="all">All entities</option>
          <option value="lead">Lead</option>
          <option value="case">Case</option>
          <option value="task">Task</option>
          <option value="customer">Customer</option>
          <option value="claim">Claim</option>
        </select>

        <select className="admin-select admin-filter-control" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
          <option value="all">All file kinds</option>
          <option value="document">Documents</option>
          <option value="signature">Signatures</option>
        </select>

        <label className="admin-documents-page__date-field">
          <span>From</span>
          <input className="admin-input" type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} />
        </label>

        <label className="admin-documents-page__date-field">
          <span>To</span>
          <input className="admin-input" type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} />
        </label>

        <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm admin-documents-page__clear" onClick={clearFilters}>
          <FilterX size={15} />
          <span>Clear</span>
        </button>
      </section>

      {quickSections.length ? (
        <section className="admin-documents-page__quick-access">
          {quickSections.map((section) => (
            <div key={section.title} className="admin-documents-page__quick-group">
              <header>
                <h3>{section.title}</h3>
                <span>{section.rows.length}</span>
              </header>
              <div className="admin-documents-page__folder-strip">
                {section.rows.map((folder) => (
                  <button key={`${section.title}-${folder.key}-${folder.quickKind || folder.entityType}`} type="button" className="admin-documents-page__folder-card admin-card-compact" onClick={() => openFolder(folder.key)}>
                    <div className="admin-documents-page__folder-top">
                      <FolderOpen size={16} />
                      <AdminStatusBadge tone={getFolderHealthTone(folder.health)}>{getFolderHealthLabel(folder.health)}</AdminStatusBadge>
                    </div>
                    <strong>{folder.title}</strong>
                    <p>{normalizeLabel(folder.quickKind || folder.entityType)}{folder.quickLabel ? ` • ${folder.quickLabel}` : ""}</p>
                    <div className="admin-documents-page__folder-previews">
                      {folder.documents.slice(0, 3).map((item) => (
                        <DocumentPreviewThumb key={item.id} item={item} previewUrl={getPreviewSource(item, previewUrls)} compact />
                      ))}
                    </div>
                    <div className="admin-documents-page__folder-meta">
                      <span>{folder.docCount} documents</span>
                      <span>{formatDate(folder.lastUpdated)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="admin-documents-page__empty-copy">No recent document folders</p>
      )}

      <section className="admin-documents-page__workspace">
        <div className="admin-documents-page__main admin-card">
          <header className="admin-documents-page__list-header">
            <div>
              <span className="admin-documents-page__eyebrow">File manager</span>
              <h3>{filteredRows.length} documents</h3>
            </div>
            {selectedFolderKey ? (
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setSelectedFolderKey("")}>
                Clear folder
              </button>
            ) : null}
          </header>

          {isLoading ? (
            <div className="admin-documents-page__state">Loading documents...</div>
          ) : !filteredRows.length ? (
            <div className="admin-documents-page__state">No documents uploaded yet</div>
          ) : (
            <div className="admin-documents-page__list admin-table">
              <div className="admin-documents-page__list-head">
                <span>Document</span>
                <span>Type</span>
                <span>Customer</span>
                <span>Reference</span>
                <span>Linked task</span>
                <span>Status</span>
                <span>Uploaded</span>
                <span>Size</span>
                <span>Actions</span>
              </div>

              {filteredRows.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  className={`admin-documents-page__row admin-list-row${selectedDocument?.id === item.id ? " is-active" : ""}`}
                  onClick={() => openDocument(item.id)}
                >
                  <span className="admin-documents-page__document-cell is-name" data-label="Document">
                    <DocumentPreviewThumb item={item} previewUrl={getPreviewSource(item, previewUrls)} compact />
                    <span className="admin-documents-page__document-copy">
                      <strong>{item.displayName}</strong>
                      <small>{item.kind === "signature" ? "Signature file" : item.file_name || item.typeLabel}</small>
                    </span>
                  </span>
                  <span data-label="Type">{item.typeLabel}</span>
                  <span data-label="Customer">{item.customerName}</span>
                  <span data-label="Reference">{item.reference}</span>
                  <span data-label="Linked task">{item.linkedTaskLabel}</span>
                  <span data-label="Status"><AdminStatusBadge tone={item.statusTone}>{item.statusLabel}</AdminStatusBadge></span>
                  <span data-label="Uploaded">{formatDateTime(item.created_at)}</span>
                  <span data-label="Size">{item.kind === "signature" ? "PNG" : formatSize(item.file_size)}</span>
                  <span className="admin-documents-page__row-actions" data-label="Actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => handleDownload(item)} disabled={!hasPermission("documents.download") || activeDownloadId === item.id}>
                      {activeDownloadId === item.id ? "Opening..." : "Open"}
                    </button>
                    <button type="button" className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleTrash(item)} disabled={!hasPermission("documents.manage") || activeTrashId === item.id}>
                      {activeTrashId === item.id ? "Moving..." : "Trash"}
                    </button>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="admin-documents-page__status-panel">
          <section className="admin-documents-page__panel-card admin-panel-card">
            <header>
              <h3>Storage summary</h3>
            </header>
            <div className="admin-documents-page__stats-grid">
              <article><strong>{storageSummary.totalDocuments}</strong><span>Total documents</span></article>
              <article><strong>{formatSize(storageSummary.totalBytes)}</strong><span>Storage used</span></article>
            </div>
            <p className="admin-documents-page__muted">Storage limit not configured</p>
          </section>

          <section className="admin-documents-page__panel-card admin-panel-card">
            <header>
              <h3>Document type breakdown</h3>
            </header>
            <div className="admin-documents-page__breakdown">
              <article><span>Passport / ID</span><strong>{storageSummary.passport}</strong></article>
              <article><span>Boarding pass</span><strong>{storageSummary.boarding}</strong></article>
              <article><span>Booking confirmation</span><strong>{storageSummary.booking}</strong></article>
              <article><span>Signature / Consent</span><strong>{storageSummary.signature}</strong></article>
              <article><span>Other documents</span><strong>{storageSummary.other}</strong></article>
            </div>
          </section>

          <section className="admin-documents-page__panel-card admin-panel-card">
            <header>
              <h3>Document health</h3>
            </header>
            <div className="admin-documents-page__breakdown">
              <article><span>Pending review</span><strong>{storageSummary.pendingReview}</strong></article>
              <article><span>Approved</span><strong>{storageSummary.approved}</strong></article>
              <article><span>Missing</span><strong>{storageSummary.missing}</strong></article>
              <article><span>Rejected</span><strong>{storageSummary.rejected}</strong></article>
            </div>
          </section>

          <section className="admin-documents-page__panel-card admin-panel-card">
            <header>
              <h3>Quick actions</h3>
            </header>
            <div className="admin-documents-page__panel-actions">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setFolderHealthFilter("missing documents")}>Open missing queue</button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setStatusFilter("pending review")}>Open pending review</button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => exportDocumentsCsv(filteredRows)} disabled={!filteredRows.length}>Export document list</button>
            </div>
          </section>
        </aside>
      </section>

      {drawerOpen ? (
        <button type="button" className="admin-documents-page__overlay" onClick={closeDrawer} aria-label="Close drawer" />
      ) : null}

      {drawerMode === "folder" && activeFolder ? (
        <AdminSidePanel
          open={drawerOpen}
          className="admin-documents-page__drawer"
          eyebrow={normalizeLabel(activeFolder.entityType)}
          title={activeFolder.reference}
          subtitle={activeFolder.customerName}
          onClose={closeDrawer}
        >
          <section className="admin-documents-page__summary">
            <article><strong>Reference</strong><span>{activeFolder.reference}</span></article>
            <article><strong>Customer</strong><span>{activeFolder.customerName}</span></article>
            <article><strong>Linked entity</strong><span>{normalizeLabel(activeFolder.entityType)}</span></article>
            <article><strong>Document health</strong><span>{getFolderHealthLabel(activeFolder.health)}</span></article>
          </section>

          <section className="admin-documents-page__section">
            <div className="admin-documents-page__section-title">
              <h4>Required documents</h4>
            </div>
            <div className="admin-documents-page__checklist">
              {activeFolder.requiredChecklist.map((item) => (
                <article key={item.key} className={item.document ? "is-complete" : "is-missing"}>
                  <div className="admin-documents-page__checklist-head">
                    <DocumentPreviewThumb item={item.document || { typeKey: item.key, displayName: item.label }} previewUrl={getPreviewSource(item.document, previewUrls)} compact />
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.document ? item.document.displayName : "No file uploaded yet"}</span>
                    </div>
                  </div>
                  <div className="admin-documents-page__checklist-meta">
                    <AdminStatusBadge tone={item.statusTone}>{item.statusLabel}</AdminStatusBadge>
                    <span>{item.document ? formatDate(item.document.created_at) : "—"}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-documents-page__section">
            <div className="admin-documents-page__section-title">
              <h4>Uploaded documents</h4>
            </div>
            <div className="admin-documents-page__drawer-list">
              {activeFolder.documents.map((item) => (
                <button key={item.id} type="button" className="admin-documents-page__drawer-item admin-list-card" onClick={() => openDocument(item.id)}>
                  <div className="admin-documents-page__drawer-item-main">
                    <DocumentPreviewThumb item={item} previewUrl={getPreviewSource(item, previewUrls)} compact />
                    <div>
                      <strong>{item.displayName}</strong>
                      <p>{item.typeLabel} • {item.statusLabel}</p>
                    </div>
                  </div>
                  <span>{formatDateTime(item.created_at)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="admin-documents-page__section">
            <div className="admin-documents-page__section-title">
              <h4>Missing documents</h4>
            </div>
            {activeFolder.missingDocuments.length ? (
              <div className="admin-documents-page__missing-list">
                {activeFolder.missingDocuments.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : (
              <p className="admin-documents-page__empty-copy">Required documents look complete.</p>
            )}
          </section>
        </AdminSidePanel>
      ) : null}

      {drawerMode === "document" && activePreviewDocument ? (
        <AdminSidePanel
          open={drawerOpen}
          className="admin-documents-page__drawer"
          eyebrow="Document"
          title={activePreviewDocument.displayName}
          subtitle={`${activePreviewDocument.reference} • ${activePreviewDocument.customerName}`}
          onClose={closeDrawer}
        >
          <section className="admin-documents-page__preview-card admin-card-compact">
            <DocumentPreviewThumb item={activePreviewDocument} previewUrl={getPreviewSource(activePreviewDocument, previewUrls)} large />
          </section>

          <section className="admin-documents-page__summary">
            <article><strong>Type</strong><span>{activePreviewDocument.typeLabel}</span></article>
            <article><strong>Status</strong><span>{activePreviewDocument.statusLabel}</span></article>
            <article><strong>Uploaded</strong><span>{formatDateTime(activePreviewDocument.created_at)}</span></article>
            <article><strong>Size</strong><span>{activePreviewDocument.kind === "signature" ? "PNG" : formatSize(activePreviewDocument.file_size)}</span></article>
          </section>

          <section className="admin-documents-page__section">
            <div className="admin-documents-page__section-title">
              <h4>Linked work</h4>
            </div>
            <div className="admin-documents-page__meta-grid">
              <article><strong>Customer</strong><span>{activePreviewDocument.customerName}</span></article>
              <article><strong>Reference</strong><span>{activePreviewDocument.reference}</span></article>
              <article><strong>Entity</strong><span>{activePreviewDocument.entityLabel}</span></article>
              <article><strong>Linked task</strong><span>{activePreviewDocument.linkedTaskLabel}</span></article>
            </div>
          </section>

          <section className="admin-documents-page__section">
            <div className="admin-documents-page__section-title">
              <h4>Actions</h4>
            </div>
            <div className="admin-documents-page__drawer-actions">
              <button type="button" className="admin-btn admin-btn-primary" onClick={() => handleDownload(activePreviewDocument)} disabled={!hasPermission("documents.download") || activeDownloadId === activePreviewDocument.id}>
                <span>{activeDownloadId === activePreviewDocument.id ? "Opening..." : activePreviewDocument.kind === "signature" ? "Download PNG" : "Open / Download"}</span>
              </button>
              <button type="button" className="admin-btn admin-btn-secondary" disabled title="Document review workflow is not configured in the current backend.">Mark reviewed</button>
              <button type="button" className="admin-btn admin-btn-secondary" disabled title="Replacement request workflow is not configured in the current backend.">Request replacement</button>
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => handleTrash(activePreviewDocument)} disabled={!hasPermission("documents.manage") || activeTrashId === activePreviewDocument.id}>
                <Trash2 size={14} />
                <span>{activeTrashId === activePreviewDocument.id ? "Moving..." : "Move to trash"}</span>
              </button>
            </div>
          </section>
        </AdminSidePanel>
      ) : null}
    </div>
  );
}
