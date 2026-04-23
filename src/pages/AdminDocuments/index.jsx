import { useEffect, useMemo, useState } from "react";
import { Download, FileCheck2, FileText, Search, Signature, ShieldCheck } from "lucide-react";
import { downloadSignaturePng, fetchDocumentsCenterData, getDocumentDownloadUrl } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

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

function formatSize(value) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function exportDocumentsCsv(rows) {
  const headers = ["Kind", "Owner Type", "Owner", "Document Type", "File", "Status", "Created At"];
  const lines = rows.map((item) => [
    item.kind,
    item.owner_type,
    item.ownerLabel,
    item.document_type || "signature",
    item.file_name || item.signer_name,
    item.status,
    item.created_at,
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

function AdminDocuments() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeDownloadId, setActiveDownloadId] = useState("");

  const loadDocuments = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchDocumentsCenterData();
      setModuleData(next);
      if (!selectedDocumentId && next.documents[0]) {
        setSelectedDocumentId(next.documents[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load documents center.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const documentsWithMeta = useMemo(() => {
    const leads = new Map((moduleData?.leads || []).map((item) => [item.id, item]));
    const cases = new Map((moduleData?.cases || []).map((item) => [item.id, item]));
    const claims = new Map((moduleData?.claims || []).map((item) => [item.id, item]));

    return (moduleData?.documents || []).map((item) => ({
      ...item,
      ownerLabel: item.owner_type === "lead"
        ? leads.get(item.owner_id)?.lead_code || item.owner_id
        : item.owner_type === "case"
          ? cases.get(item.owner_id)?.case_code || item.owner_id
          : claims.get(item.owner_id)?.claim_code || item.owner_id,
    }));
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documentsWithMeta.filter((item) => {
      const matchesSearch = !query || [
        item.file_name,
        item.document_type,
        item.ownerLabel,
        item.signer_name,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesOwner = ownerFilter === "all" || item.owner_type === ownerFilter;
      const matchesKind = kindFilter === "all" || item.kind === kindFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesOwner && matchesKind && matchesStatus;
    });
  }, [documentsWithMeta, search, ownerFilter, kindFilter, statusFilter]);

  const selectedDocument = useMemo(
    () => filteredRows.find((item) => item.id === selectedDocumentId)
      || documentsWithMeta.find((item) => item.id === selectedDocumentId)
      || filteredRows[0]
      || null,
    [filteredRows, documentsWithMeta, selectedDocumentId],
  );

  const metrics = useMemo(() => ({
    total: documentsWithMeta.length,
    leadDocs: documentsWithMeta.filter((item) => item.owner_type === "lead" && item.kind === "document").length,
    caseDocs: documentsWithMeta.filter((item) => item.owner_type === "case" && item.kind === "document").length,
    claimDocs: documentsWithMeta.filter((item) => item.owner_type === "claim" && item.kind === "document").length,
    signatures: documentsWithMeta.filter((item) => item.kind === "signature").length,
    pending: documentsWithMeta.filter((item) => item.status === "uploaded" || item.status === "pending").length,
  }), [documentsWithMeta]);

  const statuses = useMemo(
    () => Array.from(new Set(documentsWithMeta.map((item) => item.status).filter(Boolean))).sort(),
    [documentsWithMeta],
  );

  const handleDownload = async (item) => {
    setError("");
    setActiveDownloadId(item.id);

    try {
      if (item.kind === "signature") {
        downloadSignaturePng(item.signature_data_url, `${item.signer_name || "signature"}-${item.ownerLabel || item.id}.png`);
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
    } catch (nextError) {
      setError(nextError.message || "Could not download file.");
    } finally {
      setActiveDownloadId("");
    }
  };

  return (
    <div className="admin-page admin-documents-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><FileText size={16} /> Core Operations</span>
          <h1>Documents Center</h1>
          <p>
            Central document workspace for lead files, case files, legacy claim files, and electronic signatures.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsDocumentsCenterV1 && (
        <p className="admin-message">
          Cases documents schema is not fully available yet. Run `007_cases_module_v1.sql` in Supabase to unlock full case document coverage.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading documents...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={FileText} label="Total files" value={metrics.total} />
            <MetricCard icon={ShieldCheck} label="Lead documents" value={metrics.leadDocs} />
            <MetricCard icon={FileCheck2} label="Case documents" value={metrics.caseDocs} />
            <MetricCard icon={FileCheck2} label="Claim documents" value={metrics.claimDocs} />
            <MetricCard icon={Signature} label="Signatures" value={metrics.signatures} />
            <MetricCard icon={ShieldCheck} label="Pending review" value={metrics.pending} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Document registry</h2>
                <p>Browse uploaded documents and signatures across all operational entities.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportDocumentsCsv(filteredRows)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="admin-documents__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search file, type, owner, signer" />
              </label>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">All owner types</option>
                <option value="lead">Lead</option>
                <option value="case">Case</option>
                <option value="claim">Claim</option>
              </select>
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option value="all">All kinds</option>
                <option value="document">Document</option>
                <option value="signature">Signature</option>
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="admin-documents__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Owner</th>
                        <th>Type</th>
                        <th>File</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((item) => (
                        <tr key={`${item.kind}-${item.id}`} className={selectedDocument?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedDocumentId(item.id)}>
                          <td>{item.kind}</td>
                          <td>{item.owner_type} · {item.ownerLabel}</td>
                          <td>{item.document_type || "signature"}</td>
                          <td>{item.file_name || item.signer_name || "signature.png"}</td>
                          <td>{item.status || "-"}</td>
                          <td>{formatDate(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-documents__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Document detail</h2>
                    <p>{selectedDocument ? selectedDocument.file_name || selectedDocument.signer_name || selectedDocument.id : "Select a document to inspect."}</p>
                  </div>
                </div>

                {selectedDocument ? (
                  <div className="admin-documents__detail-body">
                    <div className="admin-documents__summary">
                      <article><strong>Owner</strong><span>{selectedDocument.owner_type} · {selectedDocument.ownerLabel}</span></article>
                      <article><strong>Status</strong><span>{selectedDocument.status || "-"}</span></article>
                      <article><strong>Type</strong><span>{selectedDocument.document_type || "signature"}</span></article>
                      <article><strong>Size</strong><span>{selectedDocument.kind === "signature" ? "PNG" : formatSize(selectedDocument.file_size)}</span></article>
                    </div>

                    <section className="admin-documents__section">
                      <h3>Metadata</h3>
                      <div className="admin-documents__meta">
                        <article><strong>Created</strong><span>{formatDate(selectedDocument.created_at)}</span></article>
                        <article><strong>Mime</strong><span>{selectedDocument.mime_type || (selectedDocument.kind === "signature" ? "image/png" : "-")}</span></article>
                        <article><strong>Owner ID</strong><span>{selectedDocument.owner_id}</span></article>
                        <article><strong>Path</strong><span>{selectedDocument.file_path || "Embedded signature"}</span></article>
                      </div>
                    </section>

                    <div className="admin-documents__actions">
                      <button className="admin-link-button" type="button" onClick={() => handleDownload(selectedDocument)} disabled={!hasPermission("documents.download") || activeDownloadId === selectedDocument.id}>
                        <Download size={14} />
                        <span>{activeDownloadId === selectedDocument.id ? "Loading..." : selectedDocument.kind === "signature" ? "Download PNG" : "Download file"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No document selected</h2>
                    <p>Select a file or signature to inspect and download it.</p>
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminDocuments;
