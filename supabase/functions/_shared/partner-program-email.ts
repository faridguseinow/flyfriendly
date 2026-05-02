import { buildPublicAuthUrl, getPublicSiteUrl } from "./site-url.ts";

type ApplicationEmailPayload = {
  email: string;
  full_name?: string | null;
  preferred_language?: string | null;
  public_name?: string | null;
  primary_platform?: string | null;
};

type PartnerEmailPayload = {
  referral_code?: string | null;
  referral_link?: string | null;
  public_name?: string | null;
  name?: string | null;
  contact_email?: string | null;
};

type PortalAccountPayload = {
  isNewUser?: boolean;
  accessLink?: string | null;
};

function cleanObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function normalizeString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeLanguage(value: unknown) {
  return String(value || "en").trim().toLowerCase() || "en";
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(value: string | null) {
  return escapeHtml(String(value || "")).replace(/\n/g, "<br />");
}

function buildEmailShell({
  eyebrow = "Fly Friendly Partner Program",
  title,
  intro,
  body,
  footer,
  previewText,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  body: string;
  footer?: string;
  previewText?: string;
}) {
  return `
    <div style="margin:0;padding:32px 0;background:#f5f8fc;font-family:Inter,Arial,sans-serif;color:#1d2433;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;padding:36px 32px;border:1px solid #e5ecf4;">
        <p style="margin:0 0 12px;color:#1ea0ff;font-weight:700;letter-spacing:.02em;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 16px;font-size:34px;line-height:1.15;color:#182033;">${escapeHtml(title)}</h1>
        ${intro ? `<p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#4d5a73;">${intro}</p>` : ""}
        ${body}
        <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#4d5a73;">${footer || "Best regards,<br />The Fly Friendly Team"}</p>
        <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(previewText || "")}</div>
      </div>
    </div>
  `;
}

async function sendResendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const mailFrom = Deno.env.get("MAIL_FROM");

  if (!resendApiKey || !mailFrom) {
    console.warn("partner-program-email skipped_missing_env", {
      hasResendKey: Boolean(resendApiKey),
      hasMailFrom: Boolean(mailFrom),
      to,
      subject,
    });
    return { sent: false, skipped: true, messageId: null };
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cleanObject({
      from: mailFrom,
      to: [to],
      reply_to: Deno.env.get("MAIL_REPLY_TO") || undefined,
      subject,
      html,
      text,
    })),
  });

  const payload = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    throw new Error(
      `Could not send email: ${String((payload as { error?: string; message?: string }).error || (payload as { message?: string }).message || resendResponse.statusText)}`,
    );
  }

  return {
    sent: true,
    skipped: false,
    messageId: (payload as { id?: string }).id || null,
  };
}

export async function sendPartnerApplicationReceivedEmail(application: ApplicationEmailPayload) {
  const language = normalizeLanguage(application.preferred_language);
  const loginUrl = buildPublicAuthUrl(language, "/auth/login");
  const displayName = normalizeString(application.full_name) || "there";
  const publicName = normalizeString(application.public_name) || "your brand";

  const subject = "We received your Fly Friendly partner application";
  const previewText = "Your Fly Friendly partner application is under review.";
  const html = buildEmailShell({
    title: "Application received",
    intro: `Hello ${escapeHtml(displayName)},`,
    previewText,
    body: `
      <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#4d5a73;">
        Thank you for your interest in the Fly Friendly Partner Program. We received your application for <strong>${escapeHtml(publicName)}</strong> and our team will review it.
      </p>
      ${application.primary_platform ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;"><strong>Primary platform:</strong> ${escapeHtml(String(application.primary_platform))}</p>` : ""}
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;">
        We will contact you by email once a decision has been made. Submitting this form does not grant partner portal access yet.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#4d5a73;">
        Client portal login: <a href="${loginUrl}" style="color:#1a7fd6;">${loginUrl}</a>
      </p>
    `,
  });

  const text = [
    `Hello ${displayName},`,
    "",
    "Thank you for your interest in the Fly Friendly Partner Program.",
    `We received your application for ${publicName} and our team will review it.`,
    application.primary_platform ? `Primary platform: ${application.primary_platform}` : "",
    "We will contact you by email once a decision has been made.",
    `Client portal login: ${loginUrl}`,
    "",
    "Best regards,",
    "The Fly Friendly Team",
  ].filter(Boolean).join("\n");

  return sendResendEmail({
    to: application.email,
    subject,
    html,
    text,
  });
}

export async function sendPartnerApprovalEmail({
  application,
  partner,
  account,
  notes,
}: {
  application: ApplicationEmailPayload;
  partner: PartnerEmailPayload;
  account: PortalAccountPayload;
  notes?: string | null;
}) {
  const language = normalizeLanguage(application.preferred_language);
  const siteUrl = getPublicSiteUrl();
  const loginUrl = buildPublicAuthUrl(language, "/auth/login");
  const actionUrl = normalizeString(account.accessLink) || buildPublicAuthUrl(language, "/auth/reset-password");
  const actionLabel = account.isNewUser ? "Create password" : "Reset password";
  const displayName = normalizeString(application.full_name) || "there";
  const partnerName = normalizeString(partner.public_name) || normalizeString(partner.name) || "Fly Friendly Partner";
  const referralPath = normalizeString(partner.referral_link) || "";
  const referralLink = referralPath.startsWith("http") ? referralPath : `${siteUrl}${referralPath}`;
  const safeNotes = normalizeString(notes);

  const subject = "Your Fly Friendly partner application has been approved";
  const previewText = "Your partner application was approved. Access your Partner Portal.";
  const html = buildEmailShell({
    title: "Application approved",
    intro: `Hello ${escapeHtml(displayName)},`,
    previewText,
    body: `
      <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#4d5a73;">
        Your application to join the Fly Friendly Partner Program has been approved. We created partner access for <strong>${escapeHtml(partnerName)}</strong>.
      </p>
      <div style="margin:0 0 24px;">
        <a href="${actionUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#1ea0ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;">${actionLabel}</a>
      </div>
      <div style="margin:0 0 24px;padding:18px;border-radius:18px;background:#f7fbff;border:1px solid #deebfa;">
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4d5a73;"><strong>Referral code:</strong> ${escapeHtml(String(partner.referral_code || "-"))}</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4d5a73;"><strong>Referral link:</strong> <a href="${referralLink}" style="color:#1a7fd6;">${escapeHtml(referralLink)}</a></p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4d5a73;"><strong>Portal login:</strong> <a href="${loginUrl}" style="color:#1a7fd6;">${loginUrl}</a></p>
      </div>
      ${account.isNewUser ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;">Use the button above to create your password before signing in.</p>` : ""}
      ${safeNotes ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;"><strong>Notes from Fly Friendly:</strong><br />${nl2br(safeNotes)}</p>` : ""}
    `,
  });

  const text = [
    `Hello ${displayName},`,
    "",
    "Your application to join the Fly Friendly Partner Program has been approved.",
    `Partner access: ${partnerName}`,
    `Referral code: ${partner.referral_code || "-"}`,
    `Referral link: ${referralLink}`,
    `${actionLabel}: ${actionUrl}`,
    `Portal login: ${loginUrl}`,
    safeNotes ? `Notes from Fly Friendly: ${safeNotes}` : "",
    "",
    "Best regards,",
    "The Fly Friendly Team",
  ].filter(Boolean).join("\n");

  return sendResendEmail({
    to: application.email,
    subject,
    html,
    text,
  });
}

export async function sendPartnerRejectionEmail({
  application,
  rejectionReason,
  notes,
}: {
  application: ApplicationEmailPayload;
  rejectionReason: string;
  notes?: string | null;
}) {
  const language = normalizeLanguage(application.preferred_language);
  const loginUrl = buildPublicAuthUrl(language, "/auth/login");
  const displayName = normalizeString(application.full_name) || "there";
  const safeReason = normalizeString(rejectionReason);
  const safeNotes = normalizeString(notes);

  const subject = "Update on your Fly Friendly partner application";
  const previewText = "We reviewed your Fly Friendly partner application.";
  const html = buildEmailShell({
    title: "Application update",
    intro: `Hello ${escapeHtml(displayName)},`,
    previewText,
    body: `
      <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#4d5a73;">
        Thank you for your interest in the Fly Friendly Partner Program. After reviewing your application, we are not able to approve it at this time.
      </p>
      ${safeReason ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;"><strong>Reason:</strong><br />${nl2br(safeReason)}</p>` : ""}
      ${safeNotes ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;"><strong>Additional notes:</strong><br />${nl2br(safeNotes)}</p>` : ""}
      <p style="margin:0;font-size:15px;line-height:1.7;color:#4d5a73;">Portal login: <a href="${loginUrl}" style="color:#1a7fd6;">${loginUrl}</a></p>
    `,
  });

  const text = [
    `Hello ${displayName},`,
    "",
    "Thank you for your interest in the Fly Friendly Partner Program.",
    "After reviewing your application, we are not able to approve it at this time.",
    safeReason ? `Reason: ${safeReason}` : "",
    safeNotes ? `Additional notes: ${safeNotes}` : "",
    `Portal login: ${loginUrl}`,
    "",
    "Best regards,",
    "The Fly Friendly Team",
  ].filter(Boolean).join("\n");

  return sendResendEmail({
    to: application.email,
    subject,
    html,
    text,
  });
}

export async function sendPartnerSuspendedEmail({
  email,
  fullName,
  preferredLanguage,
  partner,
  notes,
}: {
  email: string;
  fullName?: string | null;
  preferredLanguage?: string | null;
  partner: PartnerEmailPayload;
  notes?: string | null;
}) {
  const language = normalizeLanguage(preferredLanguage);
  const loginUrl = buildPublicAuthUrl(language, "/auth/login");
  const displayName = normalizeString(fullName) || "there";
  const partnerName = normalizeString(partner.public_name) || normalizeString(partner.name) || "Fly Friendly Partner";
  const safeNotes = normalizeString(notes);

  const subject = "Your Fly Friendly partner access is temporarily suspended";
  const previewText = "Your partner tools are temporarily suspended.";
  const html = buildEmailShell({
    title: "Partner access suspended",
    intro: `Hello ${escapeHtml(displayName)},`,
    previewText,
    body: `
      <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#4d5a73;">
        Partner access for <strong>${escapeHtml(partnerName)}</strong> is temporarily suspended. Your regular client account remains available, but partner tools are paused until the account is reactivated.
      </p>
      ${safeNotes ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;"><strong>Notes from Fly Friendly:</strong><br />${nl2br(safeNotes)}</p>` : ""}
      <p style="margin:0;font-size:15px;line-height:1.7;color:#4d5a73;">Portal login: <a href="${loginUrl}" style="color:#1a7fd6;">${loginUrl}</a></p>
    `,
  });

  const text = [
    `Hello ${displayName},`,
    "",
    `Partner access for ${partnerName} is temporarily suspended.`,
    "Your regular client account remains available, but partner tools are paused until the account is reactivated.",
    safeNotes ? `Notes from Fly Friendly: ${safeNotes}` : "",
    `Portal login: ${loginUrl}`,
    "",
    "Best regards,",
    "The Fly Friendly Team",
  ].filter(Boolean).join("\n");

  return sendResendEmail({ to: email, subject, html, text });
}

export async function sendPartnerReactivatedEmail({
  email,
  fullName,
  preferredLanguage,
  partner,
  notes,
}: {
  email: string;
  fullName?: string | null;
  preferredLanguage?: string | null;
  partner: PartnerEmailPayload;
  notes?: string | null;
}) {
  const language = normalizeLanguage(preferredLanguage);
  const siteUrl = getPublicSiteUrl();
  const loginUrl = buildPublicAuthUrl(language, "/auth/login");
  const displayName = normalizeString(fullName) || "there";
  const partnerName = normalizeString(partner.public_name) || normalizeString(partner.name) || "Fly Friendly Partner";
  const referralPath = normalizeString(partner.referral_link) || "";
  const referralLink = referralPath.startsWith("http") ? referralPath : `${siteUrl}${referralPath}`;
  const safeNotes = normalizeString(notes);

  const subject = "Your Fly Friendly partner access has been reactivated";
  const previewText = "Your partner portal access is active again.";
  const html = buildEmailShell({
    title: "Partner access reactivated",
    intro: `Hello ${escapeHtml(displayName)},`,
    previewText,
    body: `
      <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#4d5a73;">
        Partner access for <strong>${escapeHtml(partnerName)}</strong> has been reactivated. You can sign back in to your Partner Portal and resume sharing your referral link.
      </p>
      <div style="margin:0 0 24px;padding:18px;border-radius:18px;background:#f7fbff;border:1px solid #deebfa;">
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4d5a73;"><strong>Referral code:</strong> ${escapeHtml(String(partner.referral_code || "-"))}</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4d5a73;"><strong>Referral link:</strong> <a href="${referralLink}" style="color:#1a7fd6;">${escapeHtml(referralLink)}</a></p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4d5a73;"><strong>Portal login:</strong> <a href="${loginUrl}" style="color:#1a7fd6;">${loginUrl}</a></p>
      </div>
      ${safeNotes ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a73;"><strong>Notes from Fly Friendly:</strong><br />${nl2br(safeNotes)}</p>` : ""}
    `,
  });

  const text = [
    `Hello ${displayName},`,
    "",
    `Partner access for ${partnerName} has been reactivated.`,
    `Referral code: ${partner.referral_code || "-"}`,
    `Referral link: ${referralLink}`,
    `Portal login: ${loginUrl}`,
    safeNotes ? `Notes from Fly Friendly: ${safeNotes}` : "",
    "",
    "Best regards,",
    "The Fly Friendly Team",
  ].filter(Boolean).join("\n");

  return sendResendEmail({ to: email, subject, html, text });
}
