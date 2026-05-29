const FINANCE_UI_LOCALE = "en-GB";

export function formatFinanceCurrency(value, currency = "EUR", options = {}) {
  const { emptyLabel = "—" } = options;
  if (value === null || value === undefined || value === "") {
    return emptyLabel;
  }

  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return emptyLabel;
  }

  return new Intl.NumberFormat(FINANCE_UI_LOCALE, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatFinanceDateParts(value) {
  if (!value) {
    return { date: "—", time: "" };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: "—", time: "" };
  }

  return {
    date: parsed.toLocaleDateString(FINANCE_UI_LOCALE, { day: "2-digit", month: "short", year: "numeric" }),
    time: parsed.toLocaleTimeString(FINANCE_UI_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

export function formatFinanceDateTimeLabel(value) {
  const formatted = formatFinanceDateParts(value);
  return formatted.time ? `${formatted.date}, ${formatted.time}` : formatted.date;
}

export function formatFinanceRoute(route) {
  return String(route || "—").replace(/\s*->\s*/g, " → ");
}

export function getFinanceDisplayError(error, options = {}) {
  const { schemaHints = [] } = options;
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  const normalized = message.toLowerCase();
  const defaultHints = [
    "schema cache",
    "column",
    "case_finance",
    "partner_commissions",
    "referral_partner_payouts",
    "finance_audit_logs",
  ];
  const isSchemaError = ["42p01", "42703", "pgrst204", "pgrst205"].includes(code.toLowerCase())
    || [...defaultHints, ...schemaHints].some((hint) => normalized.includes(String(hint).toLowerCase()));

  return isSchemaError
    ? {
      title: "Finance schema is not up to date. Apply latest migration.",
      detail: message,
    }
    : {
      title: "Finance data could not be loaded.",
      detail: message,
    };
}
