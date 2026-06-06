const RECORD_CODE_MIN_LENGTH = 4;
const LEAD_CODE_PATTERN = /^FF-(\d{4,})$/i;
const CASE_CODE_PATTERN = /^CASE-(\d{4,})$/i;

function normalizeRecordSuffix(value = "") {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  if (/^\d+$/.test(normalized)) {
    return normalized.padStart(RECORD_CODE_MIN_LENGTH, "0");
  }

  return normalized;
}

export function buildLeadCode(suffix = "") {
  const normalized = normalizeRecordSuffix(suffix);
  return normalized ? `FF-${normalized}` : "";
}

export function buildCaseCode(suffix = "") {
  const normalized = normalizeRecordSuffix(suffix);
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

export function normalizeLeadCode(value = "") {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^FF-(\d+)$/i);

  if (!match?.[1]) {
    return "";
  }

  return buildLeadCode(match[1]);
}

export function deriveCaseCodeFromLeadCode(leadCode = "") {
  const normalizedLeadCode = normalizeLeadCode(leadCode) || String(leadCode || "").trim();

  if (!isModernLeadCode(normalizedLeadCode)) {
    throw new Error("Claim-flow lead has invalid lead_code. Expected FF-0001 format.");
  }

  return buildCaseCode(extractRecordSuffix(normalizedLeadCode));
}
