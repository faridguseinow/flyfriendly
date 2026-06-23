import { useEffect } from "react";
import { Download, ExternalLink, FileText, LoaderCircle, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
  getDocumentTitle,
  isImageDocument,
  isPdfDocument,
} from "../documentPreview.js";

export default function AdminDocumentPreviewModal({
  document,
  url = "",
  isLoading = false,
  error = "",
  zoom = 1,
  isSaving = false,
  subtitle = "",
  saveLabel = "Save",
  openInNewTabLabel = "Open in new tab",
  unavailableLabel = "Preview is not available.",
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSave,
  onOpenInNewTab,
  onClose,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!document) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [document, onClose]);

  if (!document) {
    return null;
  }

  const title = getDocumentTitle(document);
  const imageDocument = isImageDocument(document);
  const pdfDocument = isPdfDocument(document);
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div className="admin-document-preview-modal-layer" role="presentation">
      <button
        type="button"
        className="admin-document-preview-modal-backdrop"
        onClick={onClose}
        aria-label={t("admin.common.close")}
      />
      <section
        className="admin-document-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-document-preview-modal-title"
      >
        <header className="admin-document-preview-modal__header">
          <div className="admin-document-preview-modal__title">
            <h3 id="admin-document-preview-modal-title">{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <div className="admin-document-preview-modal__tools">
            {imageDocument ? (
              <>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-link-button"
                  onClick={onZoomOut}
                  disabled={isLoading || zoom <= MIN_DOCUMENT_ZOOM}
                  aria-label="Zoom out"
                >
                  <Minus size={14} />
                </button>
                <span className="admin-document-preview-modal__zoom">{zoomLabel}</span>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-link-button"
                  onClick={onZoomIn}
                  disabled={isLoading || zoom >= MAX_DOCUMENT_ZOOM}
                  aria-label="Zoom in"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-link-button"
                  onClick={onZoomReset}
                  disabled={isLoading || zoom === 1}
                >
                  <RotateCcw size={14} />
                  <span>{t("common.reset", { defaultValue: "Reset" })}</span>
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-link-button"
              onClick={onSave}
              disabled={isLoading || isSaving}
            >
              {isSaving ? <LoaderCircle size={14} className="is-spinning" /> : <Download size={14} />}
              <span>{isSaving ? t("admin.common.saving") : saveLabel}</span>
            </button>

            {url ? (
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-link-button"
                onClick={onOpenInNewTab}
              >
                <ExternalLink size={14} />
                <span>{openInNewTabLabel}</span>
              </button>
            ) : null}

            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-link-button"
              onClick={onClose}
              aria-label={t("admin.common.close")}
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="admin-document-preview-modal__body">
          {isLoading ? (
            <div className="admin-document-preview-modal__placeholder">
              <LoaderCircle size={24} className="is-spinning" />
              <span>{t("admin.common.loading")}</span>
            </div>
          ) : error ? (
            <div className="admin-document-preview-modal__placeholder is-error">
              <FileText size={24} />
              <span>{error}</span>
            </div>
          ) : imageDocument && url ? (
            <div className="admin-document-preview-modal__image">
              <img src={url} alt={title} style={{ transform: `scale(${zoom})` }} />
            </div>
          ) : (pdfDocument || url) && url ? (
            <iframe
              title={title}
              src={url}
              className="admin-document-preview-modal__frame"
            />
          ) : (
            <div className="admin-document-preview-modal__placeholder">
              <FileText size={24} />
              <span>{unavailableLabel}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
