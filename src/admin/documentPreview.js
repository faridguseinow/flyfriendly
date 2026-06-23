export const MIN_DOCUMENT_ZOOM = 0.5;
export const MAX_DOCUMENT_ZOOM = 3;
export const DOCUMENT_ZOOM_STEP = 0.25;

export function createClosedDocumentPreviewState() {
  return {
    item: null,
    url: "",
    isLoading: false,
    error: "",
    zoom: 1,
  };
}

export function clampDocumentZoom(value) {
  return Math.min(Math.max(value, MIN_DOCUMENT_ZOOM), MAX_DOCUMENT_ZOOM);
}

export function getFileExtension(name) {
  const value = String(name || "").toLowerCase();
  const parts = value.split(".");
  return parts.length > 1 ? parts.pop() : "";
}

export function isImageDocument(item) {
  if (!item) return false;
  if (item.kind === "signature") return true;
  const mime = String(item.mime_type || "").toLowerCase();
  const ext = getFileExtension(item.file_name);
  return mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
}

export function isPdfDocument(item) {
  if (!item) return false;
  const mime = String(item.mime_type || "").toLowerCase();
  const ext = getFileExtension(item.file_name);
  return mime.includes("pdf") || ext === "pdf";
}

export function getDocumentTitle(item, fallback = "Document") {
  return item?.displayName || item?.file_name || item?.document_type || fallback;
}

export async function downloadDocumentFromUrl(url, fileName = "document") {
  if (!url) {
    throw new Error("Document URL is missing.");
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Could not fetch document.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch {
    const link = window.document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  }

  return url;
}
