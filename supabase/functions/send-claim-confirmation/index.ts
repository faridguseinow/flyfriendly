import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadRecord = {
  id: string;
  lead_code: string;
  full_name: string | null;
  email: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  airline: string | null;
  status: string | null;
  eligibility_status: string | null;
  submitted_at: string | null;
  customer_confirmation_sent_at: string | null;
};

type ResendResponsePayload = {
  id?: string;
  message?: string;
  error?: string;
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function routeLabel(lead: LeadRecord) {
  const from = lead.departure_airport?.trim();
  const to = lead.arrival_airport?.trim();

  if (from && to) return `${from} -> ${to}`;
  return from || to || "Route details pending";
}

function buildEmailHtml(lead: LeadRecord, siteUrl: string) {
  const greetingName = escapeHtml(lead.full_name || "there");
  const claimId = escapeHtml(lead.lead_code);
  const route = escapeHtml(routeLabel(lead));
  const airline = escapeHtml(lead.airline || "your airline");
  const safeSiteUrl = escapeHtml(siteUrl);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fly Friendly claim confirmation</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef4ff;font-family:Arial,sans-serif;color:#172033;">
    <div style="padding:32px 16px;background:linear-gradient(180deg,#eef6ff 0%,#f7fbff 100%);">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;">
        <tr>
          <td style="padding-bottom:16px;text-align:center;">
            <div style="display:inline-block;padding:10px 18px;border-radius:999px;background:#ffffff;border:1px solid #d9e7ff;color:#1f7ae0;font-size:14px;font-weight:700;letter-spacing:0.02em;">
              Fly Friendly
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:28px;padding:40px 32px;box-shadow:0 20px 50px rgba(32,85,165,0.12);">
            <p style="margin:0 0 12px;font-size:18px;line-height:1.6;color:#172033;">Hi ${greetingName},</p>
            <h1 style="margin:0 0 16px;font-size:34px;line-height:1.15;color:#19b84a;font-weight:700;">Your compensation claim is safely in our hands.</h1>
            <p style="margin:0 0 24px;font-size:18px;line-height:1.7;color:#55627a;">
              Thank you for trusting Fly Friendly. We have successfully received your application and our team has started reviewing your case.
            </p>

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px;background:#f8fbff;border:1px solid #dce9ff;border-radius:20px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6f7e96;">Claim reference</p>
                  <p style="margin:0 0 18px;font-size:28px;line-height:1.2;font-weight:700;color:#172033;">${claimId}</p>
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6f7e96;">Route</p>
                  <p style="margin:0 0 18px;font-size:18px;line-height:1.5;color:#172033;">${route}</p>
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6f7e96;">Airline</p>
                  <p style="margin:0;font-size:18px;line-height:1.5;color:#172033;">${airline}</p>
                </td>
              </tr>
            </table>

            <h2 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#172033;">What happens next</h2>

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px;">
              <tr>
                <td style="padding:0 0 18px;">
                  <div style="padding:20px 22px;border-radius:20px;background:#f7fbff;border:1px solid #ddeaff;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#172033;">1. Case review and preparation</p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#55627a;">We review your claim, check the details, and prepare the submission. If we need anything else from you, we will contact you by email.</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 0 18px;">
                  <div style="padding:20px 22px;border-radius:20px;background:#f7fbff;border:1px solid #ddeaff;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#172033;">2. Communication with the airline</p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#55627a;">We handle correspondence with ${airline} on your behalf. Airline responses can take several weeks or months, but we will keep you informed when something important changes.</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="padding:20px 22px;border-radius:20px;background:#f7fbff;border:1px solid #ddeaff;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#172033;">3. Compensation payment</p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#55627a;">Once your claim succeeds, we will contact you to arrange the payment. Our service fee is charged only after you receive your compensation.</p>
                  </div>
                </td>
              </tr>
            </table>

            <div style="padding:22px 24px;border-radius:20px;background:#172033;color:#ffffff;">
              <p style="margin:0 0 10px;font-size:20px;line-height:1.4;font-weight:700;">At Fly Friendly, our goal is simple.</p>
              <p style="margin:0;font-size:16px;line-height:1.7;color:#d5def0;">We stand by your side when your flight does not go as planned.</p>
            </div>

            <p style="margin:28px 0 0;font-size:16px;line-height:1.7;color:#55627a;">
              If you have any questions, just reply to this email or visit
              <a href="${safeSiteUrl}" style="color:#1f7ae0;text-decoration:none;"> Fly Friendly</a>.
            </p>
            <p style="margin:24px 0 0;font-size:16px;line-height:1.7;color:#172033;">
              Best regards,<br />
              The Fly Friendly Team
            </p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
  `.trim();
}

function buildEmailText(lead: LeadRecord) {
  const name = lead.full_name || "there";
  const claimId = lead.lead_code;
  const route = routeLabel(lead);
  const airline = lead.airline || "your airline";

  return [
    `Hi ${name},`,
    "",
    "Thank you for trusting Fly Friendly with your compensation claim.",
    "We have successfully received your application and started working on your case.",
    "",
    `Your claim reference: ${claimId}`,
    `Route: ${route}`,
    `Airline: ${airline}`,
    "",
    "What happens next?",
    "",
    "1. Case review and preparation",
    "Our team reviews your claim and prepares it for submission. If we need additional documents or information, we will contact you by email.",
    "",
    "2. Communication with the airline",
    `We handle all correspondence with ${airline} on your behalf. This process can take several weeks or months, and we will keep you informed about important updates.`,
    "",
    "3. Compensation payment",
    "Once your claim is successful, we will contact you to arrange payment of your compensation. We charge our service fee only after you receive your money.",
    "",
    "If you have any questions, simply reply to this email.",
    "",
    "Best regards,",
    "The Fly Friendly Team",
  ].join("\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const siteUrl = Deno.env.get("SITE_URL") || "https://fly-friendly.com";
  const mailFrom = Deno.env.get("MAIL_FROM") || "Fly Friendly <info@fly-friendly.com>";
  const replyTo = Deno.env.get("MAIL_REPLY_TO") || "info@fly-friendly.com";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server environment is not configured." }, { status: 500 });
  }

  if (!resendApiKey) {
    return json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
  }

  let body: { leadId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const leadId = body.leadId?.trim();
  if (!leadId) {
    return json({ error: "leadId is required." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error: leadError } = await supabase
    .from("leads")
    .select("id, lead_code, full_name, email, departure_airport, arrival_airport, airline, status, eligibility_status, submitted_at, customer_confirmation_sent_at")
    .eq("id", leadId)
    .maybeSingle();

  const lead = data as LeadRecord | null;

  if (leadError) {
    return json({ error: leadError.message }, { status: 500 });
  }

  if (!lead) {
    return json({ error: "Lead not found." }, { status: 404 });
  }

  if (lead.customer_confirmation_sent_at) {
    return json({ sent: true, already_sent: true, leadCode: lead.lead_code });
  }

  if (lead.status !== "submitted" || lead.eligibility_status !== "eligible") {
    return json({ error: "Lead is not ready for confirmation email." }, { status: 409 });
  }

  if (!lead.email) {
    return json({ error: "Lead email is missing." }, { status: 400 });
  }

  const subject = `Thank you for submitting your claim - ${lead.lead_code}`;
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [lead.email],
      reply_to: replyTo,
      subject,
      html: buildEmailHtml(lead, siteUrl),
      text: buildEmailText(lead),
    }),
  });

  const resendPayload = await resendResponse.json() as ResendResponsePayload;

  if (!resendResponse.ok) {
    const message = resendPayload?.message || resendPayload?.error || "Failed to send email.";
    await supabase
      .from("leads")
      .update({
        customer_confirmation_error: String(message).slice(0, 1000),
      })
      .eq("id", lead.id);
    return json({ error: message }, { status: 502 });
  }

  await supabase
    .from("leads")
    .update({
      customer_confirmation_sent_at: new Date().toISOString(),
      customer_confirmation_message_id: resendPayload?.id || null,
      customer_confirmation_error: null,
    })
    .eq("id", lead.id);

  return json({
    sent: true,
    already_sent: false,
    leadCode: lead.lead_code,
    messageId: resendPayload?.id || null,
  });
});
