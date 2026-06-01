const RECORD_CODE_LENGTH = 5;
const RECORD_CODE_ALPHABET = "0123456789";
const LEAD_CODE_PATTERN = /^FF-(\d{5})$/i;
const CASE_CODE_PATTERN = /^CASE-(\d{5})$/i;

function getCrypto() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    return globalThis.crypto;
  }

  return null;
}

function randomIndex(max) {
  const crypto = getCrypto();
  if (crypto) {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] % max;
  }

  return Math.floor(Math.random() * max);
}

export function generateRandomRecordSuffix(length = RECORD_CODE_LENGTH) {
  const size = Number(length) > 0 ? Number(length) : RECORD_CODE_LENGTH;
  let suffix = "";

  for (let index = 0; index < size; index += 1) {
    suffix += RECORD_CODE_ALPHABET[randomIndex(RECORD_CODE_ALPHABET.length)];
  }

  return suffix;
}

export function buildLeadCode(suffix = "") {
  const normalized = String(suffix || "").trim();
  return normalized ? `FF-${normalized}` : "";
}

export function buildCaseCode(suffix = "") {
  const normalized = String(suffix || "").trim();
  return normalized ? `CASE-${normalized}` : "";
}

export function extractRecordSuffix(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const leadMatch = normalized.match(LEAD_CODE_PATTERN);
  if (leadMatch?.[1]) {
    return leadMatch[1];
  }

  const caseMatch = normalized.match(CASE_CODE_PATTERN);
  if (caseMatch?.[1]) {
    return caseMatch[1];
  }

  return "";
}

export function isModernLeadCode(value = "") {
  return LEAD_CODE_PATTERN.test(String(value || "").trim());
}

export function isModernCaseCode(value = "") {
  return CASE_CODE_PATTERN.test(String(value || "").trim());
}
