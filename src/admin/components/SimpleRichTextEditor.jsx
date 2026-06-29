import { useEffect, useMemo, useRef } from "react";
import { convertPlainTextToRichHtml, sanitizeRichTextHtml } from "../../lib/richText.js";

const TOOLBAR_ACTIONS = [
  { label: "P", action: () => document.execCommand("formatBlock", false, "<p>"), title: "Paragraph" },
  { label: "H2", action: () => document.execCommand("formatBlock", false, "<h2>"), title: "Heading 2" },
  { label: "H3", action: () => document.execCommand("formatBlock", false, "<h3>"), title: "Heading 3" },
  { label: "B", action: () => document.execCommand("bold", false), title: "Bold" },
  { label: "I", action: () => document.execCommand("italic", false), title: "Italic" },
  { label: "U", action: () => document.execCommand("underline", false), title: "Underline" },
  { label: "OL", action: () => document.execCommand("insertOrderedList", false), title: "Ordered list" },
  { label: "UL", action: () => document.execCommand("insertUnorderedList", false), title: "Unordered list" },
  { label: "Quote", action: () => document.execCommand("formatBlock", false, "<blockquote>"), title: "Quote" },
  { label: "Link", title: "Insert link" },
  { label: "Image", title: "Insert image" },
  { label: "Left", action: () => document.execCommand("justifyLeft", false), title: "Align left" },
  { label: "Center", action: () => document.execCommand("justifyCenter", false), title: "Align center" },
  { label: "Right", action: () => document.execCommand("justifyRight", false), title: "Align right" },
  { label: "Undo", action: () => document.execCommand("undo", false), title: "Undo" },
  { label: "Redo", action: () => document.execCommand("redo", false), title: "Redo" },
];

function promptForSafeUrl(label) {
  const value = window.prompt(label, "https://");
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export default function SimpleRichTextEditor({
  value,
  onChange,
  placeholder = "Write the article body...",
  disabled = false,
}) {
  const editorRef = useRef(null);
  const normalizedValue = useMemo(() => convertPlainTextToRichHtml(value), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (typeof document !== "undefined" && document.activeElement === editor) {
      return;
    }

    if (editor.innerHTML !== normalizedValue) {
      editor.innerHTML = normalizedValue;
    }
  }, [normalizedValue]);

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const emitCurrentHtml = () => {
    if (!editorRef.current) {
      return;
    }

    onChange(editorRef.current.innerHTML || "");
  };

  const normalizeEditorValue = () => {
    if (!editorRef.current) {
      return;
    }

    const sanitized = sanitizeRichTextHtml(editorRef.current.innerHTML || "");
    editorRef.current.innerHTML = sanitized;
    onChange(sanitized);
  };

  const handleToolbarAction = (item) => {
    if (disabled) {
      return;
    }

    focusEditor();

    if (item.label === "Link") {
      const href = promptForSafeUrl("Paste a full https:// link");
      if (!href) {
        return;
      }
      document.execCommand("createLink", false, href);
      document.execCommand("styleWithCSS", false, false);
      emitCurrentHtml();
      return;
    }

    if (item.label === "Image") {
      const src = promptForSafeUrl("Paste a full https:// image URL");
      if (!src) {
        return;
      }
      document.execCommand("insertImage", false, src);
      emitCurrentHtml();
      return;
    }

    item.action?.();
    emitCurrentHtml();
  };

  return (
    <div className="admin-rich-text-editor">
      <div className="admin-rich-text-editor__toolbar">
        {TOOLBAR_ACTIONS.map((item) => (
          <button
            key={item.label}
            className="admin-rich-text-editor__tool"
            type="button"
            title={item.title}
            disabled={disabled}
            onClick={() => handleToolbarAction(item)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        ref={editorRef}
        className="admin-rich-text-editor__surface"
        suppressContentEditableWarning
        data-placeholder={placeholder}
        aria-disabled={disabled}
        contentEditable={!disabled}
        onInput={emitCurrentHtml}
        onBlur={normalizeEditorValue}
      />
    </div>
  );
}
