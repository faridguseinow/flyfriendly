const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_TAGS = new Set(["P", "H2", "H3", "STRONG", "EM", "U", "OL", "UL", "LI", "BLOCKQUOTE", "A", "IMG", "BR"]);
const BLOCK_TAGS = new Set(["P", "H2", "H3", "OL", "UL", "BLOCKQUOTE"]);
const TAG_REMAP = {
  B: "STRONG",
  I: "EM",
  DIV: "P",
};

function isSafeUrl(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  try {
    const url = new URL(normalized, "https://fly-friendly.com");
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function getNodeText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function detectAlignment(node) {
  const styleAlignment = String(node?.style?.textAlign || "").trim().toLowerCase();
  const attrAlignment = String(node?.getAttribute?.("align") || "").trim().toLowerCase();
  const value = styleAlignment || attrAlignment;

  if (value === "center" || value === "right" || value === "left") {
    return value;
  }

  return "";
}

function sanitizeNode(node, doc) {
  if (!node) {
    return null;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const rawTag = String(node.tagName || "").toUpperCase();
  if (rawTag === "SCRIPT" || rawTag === "STYLE" || rawTag === "IFRAME" || rawTag === "OBJECT" || rawTag === "EMBED") {
    return null;
  }

  const tag = TAG_REMAP[rawTag] || rawTag;
  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment();
    Array.from(node.childNodes || []).forEach((childNode) => {
      const sanitizedChild = sanitizeNode(childNode, doc);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    });
    return fragment;
  }

  const element = doc.createElement(tag.toLowerCase());

  if (BLOCK_TAGS.has(tag)) {
    const alignment = detectAlignment(node);
    if (alignment) {
      element.style.textAlign = alignment;
    }
  }

  if (tag === "A") {
    const href = String(node.getAttribute("href") || "").trim();
    if (!isSafeUrl(href)) {
      const fallbackText = getNodeText(node);
      return fallbackText ? doc.createTextNode(fallbackText) : null;
    }

    element.setAttribute("href", href);
    if (String(node.getAttribute("target") || "").toLowerCase() === "_blank") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }

  if (tag === "IMG") {
    const src = String(node.getAttribute("src") || "").trim();
    if (!isSafeUrl(src)) {
      return null;
    }

    element.setAttribute("src", src);

    const alt = String(node.getAttribute("alt") || "").trim();
    if (alt) {
      element.setAttribute("alt", alt.slice(0, 180));
    }
  }

  Array.from(node.childNodes || []).forEach((childNode) => {
    const sanitizedChild = sanitizeNode(childNode, doc);
    if (sanitizedChild) {
      element.appendChild(sanitizedChild);
    }
  });

  if (tag !== "BR" && !element.childNodes.length && tag !== "IMG") {
    return null;
  }

  return element;
}

function createBrowserDocument() {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    return null;
  }

  return document.implementation.createHTMLDocument("");
}

export function hasRichTextMarkup(value = "") {
  return /<([a-z][a-z0-9]*)\b[^>]*>/i.test(String(value || ""));
}

export function sanitizeRichTextHtml(value = "") {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return input
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "");
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${input}</body>`, "text/html");
  const doc = createBrowserDocument();
  if (!doc) {
    return input;
  }

  const container = doc.createElement("div");
  Array.from(parsed.body.childNodes || []).forEach((childNode) => {
    const sanitizedChild = sanitizeNode(childNode, doc);
    if (sanitizedChild) {
      container.appendChild(sanitizedChild);
    }
  });

  return container.innerHTML.trim();
}

export function richTextToPlainText(value = "") {
  if (!value) {
    return "";
  }

  if (typeof DOMParser === "undefined") {
    return String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const parsed = new DOMParser().parseFromString(`<body>${String(value || "")}</body>`, "text/html");
  return String(parsed.body.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function convertPlainTextToRichHtml(value = "") {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  if (hasRichTextMarkup(input)) {
    return sanitizeRichTextHtml(input);
  }

  if (typeof document === "undefined") {
    return input
      .split(/\n{2,}/)
      .map((chunk) => `<p>${chunk.replace(/\n/g, "<br />")}</p>`)
      .join("");
  }

  const doc = createBrowserDocument();
  if (!doc) {
    return input;
  }

  const container = doc.createElement("div");
  input
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const paragraph = doc.createElement("p");
      chunk.split("\n").forEach((line, index) => {
        if (index > 0) {
          paragraph.appendChild(doc.createElement("br"));
        }
        paragraph.appendChild(doc.createTextNode(line));
      });
      container.appendChild(paragraph);
    });

  return container.innerHTML.trim();
}
