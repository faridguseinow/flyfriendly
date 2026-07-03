import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGER_ROLE_CODES = new Set([
  "owner",
  "super_admin",
  "admin",
  "customer_support_agent",
  "operations_manager",
  "case_manager",
  "manager",
]);

const REQUIRED_PERMISSION = "communications.edit";

type RequestBody = {
  conversation_id?: string;
  body?: string | null;
  attachments?: Array<Record<string, unknown>>;
  sender_name?: string | null;
};

type AttachmentInput = Record<string, unknown>;

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const source = error as { message?: string; error?: string; details?: string };
    return source.message || source.error || source.details || JSON.stringify(error);
  }
  return String(error || "Unknown error");
}

function getEnv(name: string) {
  return Deno.env.get(name) || "";
}

function graphApiVersion() {
  return getEnv("META_GRAPH_API_VERSION") || "v21.0";
}

function metaAccessToken() {
  return getEnv("META_PAGE_ACCESS_TOKEN") || getEnv("META_INSTAGRAM_ACCESS_TOKEN");
}

function isMetaAuthError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("invalid oauth access token")
    || message.includes("cannot parse access token")
    || message.includes("error validating access token")
    || message.includes("session has expired")
    || message.includes("access token has expired");
}

async function markAccountNeedsReauth(
  serviceRoleClient: ReturnType<typeof createClient>,
  accountId: string,
  platform: string,
  reason: string,
) {
  if (!accountId) return;

  const accountResponse = await serviceRoleClient
    .from("social_accounts")
    .select("meta")
    .eq("id", accountId)
    .maybeSingle();

  if (accountResponse.error) {
    throw accountResponse.error;
  }

  const currentMeta = (accountResponse.data?.meta && typeof accountResponse.data.meta === "object")
    ? accountResponse.data.meta as Record<string, unknown>
    : {};

  const { error } = await serviceRoleClient
    .from("social_accounts")
    .update({
      status: "needs_reauth",
      meta: {
        ...currentMeta,
        last_send_error: reason,
        last_send_error_code: "META_AUTH_INVALID",
        last_send_error_at: new Date().toISOString(),
        last_send_error_platform: platform,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (error) {
    throw error;
  }
}

async function clearAccountSendError(
  serviceRoleClient: ReturnType<typeof createClient>,
  accountId: string,
) {
  if (!accountId) return;

  const accountResponse = await serviceRoleClient
    .from("social_accounts")
    .select("meta")
    .eq("id", accountId)
    .maybeSingle();

  if (accountResponse.error) {
    throw accountResponse.error;
  }

  const currentMeta = (accountResponse.data?.meta && typeof accountResponse.data.meta === "object")
    ? accountResponse.data.meta as Record<string, unknown>
    : {};
  const nextMeta = { ...currentMeta };
  delete nextMeta.last_send_error;
  delete nextMeta.last_send_error_code;
  delete nextMeta.last_send_error_at;
  delete nextMeta.last_send_error_platform;

  const { error } = await serviceRoleClient
    .from("social_accounts")
    .update({
      status: "active",
      meta: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (error) {
    throw error;
  }
}

function normalizeAttachmentUrl(attachment: AttachmentInput) {
  return [
    attachment.url,
    attachment.href,
    attachment.file_url,
    attachment.publicUrl,
    attachment.public_url,
    attachment.signedUrl,
    attachment.signed_url,
    attachment.downloadUrl,
    attachment.download_url,
    attachment.preview_url,
    attachment.previewUrl,
  ].find((value) => typeof value === "string" && value.trim()) || "";
}

function normalizeAttachmentType(attachment: AttachmentInput) {
  const type = String(
    attachment.type
    || attachment.mime_type
    || attachment.mimeType
    || attachment.kind
    || "",
  )
    .toLowerCase()
    .split(";")[0]
    .trim();

  if (type.includes("image")) return "image";
  if (type.includes("audio")) return "audio";
  if (type.includes("video")) return "video";
  return "file";
}

async function requireAuthorizedEditor(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleClient: ReturnType<typeof createClient>,
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: { message: "Missing authorization header." } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const authUser = await authedClient.auth.getUser();
  if (authUser.error || !authUser.data.user) {
    throw new Response(JSON.stringify({ error: { message: "Unauthorized request." } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = authUser.data.user.id;
  const [rolesResponse, profileResponse, teamMemberResponse] = await Promise.all([
    serviceRoleClient.from("user_admin_roles").select("role_code").eq("user_id", userId),
    serviceRoleClient.from("profiles").select("id, full_name, email, role").eq("id", userId).maybeSingle(),
    serviceRoleClient.from("admin_team_members").select("role_id, status").eq("profile_id", userId).maybeSingle(),
  ]);

  if (rolesResponse.error) throw rolesResponse.error;
  if (profileResponse.error) throw profileResponse.error;
  if (teamMemberResponse.error) throw teamMemberResponse.error;

  let teamRoleCode = "";
  if (teamMemberResponse.data?.role_id && teamMemberResponse.data?.status === "active") {
    const roleResponse = await serviceRoleClient
      .from("admin_roles")
      .select("code")
      .eq("id", teamMemberResponse.data.role_id)
      .maybeSingle();

    if (roleResponse.error) throw roleResponse.error;
    teamRoleCode = String(roleResponse.data?.code || "").trim().toLowerCase();
  }

  const assignedRoles = (rolesResponse.data || [])
    .map((item) => String(item.role_code || "").trim().toLowerCase())
    .filter(Boolean);
  const profileRoleCode = String(profileResponse.data?.role || "").trim().toLowerCase();
  const effectiveRoles = Array.from(new Set([profileRoleCode, ...assignedRoles, teamRoleCode].filter(Boolean)));
  let isAuthorized = effectiveRoles.some((role) => MANAGER_ROLE_CODES.has(role));

  if (!isAuthorized && effectiveRoles.length) {
    const permissionsResponse = await serviceRoleClient
      .from("admin_role_permissions")
      .select("role_code, permission_code, is_allowed")
      .in("role_code", effectiveRoles)
      .eq("permission_code", REQUIRED_PERMISSION);

    if (permissionsResponse.error) throw permissionsResponse.error;
    isAuthorized = (permissionsResponse.data || []).some((item) => item.is_allowed !== false);
  }

  if (!isAuthorized) {
    throw new Response(JSON.stringify({ error: { message: "You are not allowed to send inbox messages." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return {
    userId,
    senderName: String(profileResponse.data?.full_name || profileResponse.data?.email || "Fly Friendly"),
  };
}

async function sendMetaTextMessage({
  accountExternalId,
  participantId,
  text,
  accessToken,
}: {
  accountExternalId: string;
  participantId: string;
  text: string;
  accessToken: string;
}) {
  const url = new URL(`https://graph.facebook.com/${graphApiVersion()}/${accountExternalId}/messages`);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: participantId },
      messaging_type: "RESPONSE",
      message: { text },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || JSON.stringify(payload) || "Meta text message send failed.";
    throw new Error(message);
  }

  return payload;
}

async function sendMetaAttachmentMessage({
  accountExternalId,
  participantId,
  attachment,
  accessToken,
}: {
  accountExternalId: string;
  participantId: string;
  attachment: AttachmentInput;
  accessToken: string;
}) {
  const url = new URL(`https://graph.facebook.com/${graphApiVersion()}/${accountExternalId}/messages`);
  url.searchParams.set("access_token", accessToken);

  const assetUrl = normalizeAttachmentUrl(attachment);
  if (!assetUrl) {
    throw new Error("Attachment URL is missing.");
  }

  const attachmentType = normalizeAttachmentType(attachment);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: participantId },
      messaging_type: "RESPONSE",
      message: {
        attachment: {
          type: attachmentType,
          payload: {
            url: assetUrl,
            is_reusable: false,
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || JSON.stringify(payload) || "Meta attachment send failed.";
    throw new Error(message);
  }

  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, { status: 405 });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const accessToken = metaAccessToken();

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured.");
    }

    if (!accessToken) {
      throw new Error("Missing META_PAGE_ACCESS_TOKEN or META_INSTAGRAM_ACCESS_TOKEN secret.");
    }

    const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { userId, senderName: currentSenderName } = await requireAuthorizedEditor(req, supabaseUrl, anonKey, serviceRoleClient);
    const body = await req.json().catch(() => ({})) as RequestBody;
    const conversationId = String(body.conversation_id || "").trim();
    const textBody = String(body.body || "").trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments.filter((item) => item && typeof item === "object") : [];
    const senderName = String(body.sender_name || currentSenderName || "Fly Friendly").trim() || "Fly Friendly";

    if (!conversationId) {
      return json({ error: { message: "Conversation id is required." } }, { status: 400 });
    }

    if (!textBody && !attachments.length) {
      return json({ error: { message: "Message body or attachment is required." } }, { status: 400 });
    }

    const conversationResponse = await serviceRoleClient
      .from("social_conversations")
      .select("id, account_id, participant_handle, participant_name, external_conversation_id, meta, social_accounts(id, platform, external_account_id)")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationResponse.error) {
      throw conversationResponse.error;
    }

    const conversation = conversationResponse.data as Record<string, unknown> | null;
    if (!conversation) {
      return json({ error: { message: "Conversation not found." } }, { status: 404 });
    }

    const account = conversation.social_accounts as Record<string, unknown> | null;
    const accountId = String(conversation.account_id || account?.id || "").trim();
    const accountExternalId = String(account?.external_account_id || "").trim();
    const platform = String(account?.platform || "").trim().toLowerCase();
    const meta = (conversation.meta && typeof conversation.meta === "object") ? conversation.meta as Record<string, unknown> : {};
    const participantId = String(meta.participant_id || "").trim()
      || String(conversation.participant_handle || "").trim().replace(/^@/, "");

    if (!accountExternalId || !participantId) {
      return json({ error: { message: "This conversation is missing the external account or participant id needed to send a message." } }, { status: 400 });
    }

    if (!["instagram", "messenger", "facebook"].includes(platform)) {
      return json({ error: { message: `Sending is not configured for ${platform || "this"} channel.` } }, { status: 400 });
    }

    const createdMessages: Array<Record<string, unknown>> = [];
    const nowIso = new Date().toISOString();

    try {
      if (textBody) {
        const metaResponse = await sendMetaTextMessage({
          accountExternalId,
          participantId,
          text: textBody,
          accessToken,
        });

        const insertText = await serviceRoleClient
          .from("social_messages")
          .insert({
            conversation_id: conversationId,
            external_message_id: String(metaResponse?.message_id || crypto.randomUUID()),
            direction: "outbound",
            sender_type: "admin",
            sender_name: senderName,
            body: textBody,
            attachments: [],
            sent_at: nowIso,
            created_by: userId,
            meta: {
              source: "admin_inbox_send",
              platform,
              meta_response: metaResponse,
            },
          })
          .select("id")
          .single();

        if (insertText.error) {
          throw insertText.error;
        }

        createdMessages.push({
          id: insertText.data?.id || "",
          body: textBody,
          attachments: [],
        });
      }

      for (const attachment of attachments) {
        const metaResponse = await sendMetaAttachmentMessage({
          accountExternalId,
          participantId,
          attachment,
          accessToken,
        });

        const insertAttachment = await serviceRoleClient
          .from("social_messages")
          .insert({
            conversation_id: conversationId,
            external_message_id: String(metaResponse?.message_id || crypto.randomUUID()),
            direction: "outbound",
            sender_type: "admin",
            sender_name: senderName,
            body: null,
            attachments: [attachment],
            sent_at: new Date().toISOString(),
            created_by: userId,
            meta: {
              source: "admin_inbox_send",
              platform,
              meta_response: metaResponse,
            },
          })
          .select("id")
          .single();

        if (insertAttachment.error) {
          throw insertAttachment.error;
        }

        createdMessages.push({
          id: insertAttachment.data?.id || "",
          body: null,
          attachments: [attachment],
        });
      }
    } catch (sendError) {
      if (isMetaAuthError(sendError)) {
        await markAccountNeedsReauth(serviceRoleClient, accountId, platform, errorMessage(sendError));
        return json({
          error: {
            code: "META_AUTH_INVALID",
            message: "Instagram connection expired. Update META_PAGE_ACCESS_TOKEN or META_INSTAGRAM_ACCESS_TOKEN in Supabase secrets.",
            details: errorMessage(sendError),
          },
        }, { status: 401 });
      }

      throw sendError;
    }

    await clearAccountSendError(serviceRoleClient, accountId).catch(() => null);

    return json({
      ok: true,
      sent: createdMessages.length,
      messages: createdMessages,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return json({
      error: {
        message: errorMessage(error),
      },
    }, { status: 500 });
  }
});
