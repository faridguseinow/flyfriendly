import { contactEmail } from "../constants/site.js";

export function openMailClient({ to = contactEmail, subject = "", lines = [] }) {
  if (typeof window === "undefined") return;

  const body = lines.filter(Boolean).join("\n");
  const params = [];

  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);

  window.location.href = `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`;
}
