import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser } from "./authService.js";
import { assertCurrentAdminPermission } from "./adminAccessService.js";

function isMissingOptionalTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.message?.includes("column") || error?.message?.includes("schema cache");
}

async function assertSocialInboxReadAccess(message = "You do not have access to the inbox.") {
  return assertCurrentAdminPermission("communications.view", { message });
}

async function assertSocialInboxEditAccess(message = "You do not have access to update the inbox.") {
  return assertCurrentAdminPermission("communications.edit", { message });
}

const ADMIN_INBOX_MEDIA_BUCKET = "admin-inbox-media";
const ADMIN_INBOX_MEDIA_MAX_FILE_SIZE = 25 * 1024 * 1024;
const ADMIN_INBOX_ATTACHMENT_URL_TTL_SECONDS = 60 * 60;
const ADMIN_INBOX_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
]);
const MIME_EXTENSION_MAP = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

function missingInboxSchemaResponse() {
  return {
    accounts: [],
    conversations: [],
    assignableUsers: [],
    customers: [],
    leads: [],
    cases: [],
    supportsSocialInbox: false,
  };
}

async function invokeSocialInboxFunction(functionName, body) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(functionName, {
    body,
  });

  if (error) {
    const context = error.context;
    if (context && typeof context.json === "function") {
      let message = "";
      try {
        const payload = await context.json();
        message = payload?.error?.message || payload?.message || "";
      } catch {}
      if (message) {
        throw new Error(message);
      }
    }
    throw error;
  }

  if (data?.error?.message) {
    throw new Error(data.error.message);
  }

  return data;
}

function normalizeAttachmentStorageLocation(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const bucket = [
    attachment.bucket,
    attachment.bucket_id,
    attachment.storage_bucket,
    attachment.storageBucket,
  ].find((value) => typeof value === "string" && value.trim());
  const path = [
    attachment.path,
    attachment.file_path,
    attachment.storage_path,
    attachment.storagePath,
  ].find((value) => typeof value === "string" && value.trim());

  if (!bucket || !path) {
    return null;
  }

  return { bucket, path };
}

function hasDirectAttachmentUrl(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return false;
  }

  return Boolean([
    attachment.url,
    attachment.href,
    attachment.file_url,
    attachment.publicUrl,
    attachment.public_url,
    attachment.signedUrl,
    attachment.signed_url,
    attachment.downloadUrl,
    attachment.download_url,
  ].find((value) => typeof value === "string" && value.trim()));
}

async function hydrateSocialInboxAttachment(client, attachment) {
  if (!attachment || typeof attachment !== "object" || hasDirectAttachmentUrl(attachment)) {
    return attachment;
  }

  const location = normalizeAttachmentStorageLocation(attachment);
  if (!location) {
    return attachment;
  }

  const { data, error } = await client.storage
    .from(location.bucket)
    .createSignedUrl(location.path, ADMIN_INBOX_ATTACHMENT_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return attachment;
  }

  return {
    ...attachment,
    signed_url: data.signedUrl,
    signedUrl: data.signedUrl,
    url: data.signedUrl,
  };
}

async function hydrateSocialInboxMessages(client, messages = []) {
  return Promise.all(
    (messages || []).map(async (message) => ({
      ...message,
      attachments: Array.isArray(message.attachments)
        ? await Promise.all(message.attachments.map((attachment) => hydrateSocialInboxAttachment(client, attachment)))
        : [],
    })),
  );
}

function validateSocialInboxAttachmentFile(file) {
  if (!file) {
    throw new Error("Please choose a file to upload.");
  }

  const mimeType = String(file.type || "").toLowerCase();
  if (!ADMIN_INBOX_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Only images, PDF/DOC/TXT documents, and audio files are supported in the admin inbox.");
  }

  if (Number(file.size || 0) > ADMIN_INBOX_MEDIA_MAX_FILE_SIZE) {
    throw new Error("Inbox uploads must be 25MB or smaller.");
  }

  return file;
}

function buildSocialInboxAttachmentPath(conversationId, file) {
  const safeConversationId = String(conversationId || "").trim();
  if (!safeConversationId) {
    throw new Error("Conversation id is required.");
  }

  const extension = MIME_EXTENSION_MAP[String(file?.type || "").toLowerCase()]
    || String(file?.name || "").split(".").pop()
    || "bin";
  const safeName = String(file?.name || `attachment.${extension}`)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  return `conversations/${safeConversationId}/${crypto.randomUUID()}-${safeName}`;
}

export async function fetchSocialInboxModuleData() {
  await assertSocialInboxReadAccess();

  const client = requireSupabase();
  const [accounts, conversations, profiles, customers, leads, cases] = await Promise.all([
    client
      .from("social_accounts")
      .select("id, platform, display_name, handle, external_account_id, status, last_sync_at, meta, created_at, updated_at")
      .order("display_name", { ascending: true })
      .limit(100),
    client
      .from("social_conversations")
      .select("id, account_id, customer_id, lead_id, case_id, external_conversation_id, participant_name, participant_handle, participant_email, participant_phone, avatar_url, subject, status, priority, unread_count, assigned_user_id, last_message_at, last_message_preview, last_inbound_at, last_outbound_at, archived_at, meta, created_at, updated_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("leads")
      .select("id, lead_code, customer_id, full_name, email, phone, airline, departure_airport, arrival_airport")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("cases")
      .select("id, case_code, customer_id, airline, route_from, route_to, status")
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const requiredErrors = [accounts, conversations].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    if (requiredErrors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return missingInboxSchemaResponse();
    }

    throw requiredErrors[0];
  }

  const optionalErrors = [profiles, customers, leads, cases].map((result) => result.error).filter(Boolean);
  if (optionalErrors.length) {
    if (optionalErrors.some((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error))) {
      throw optionalErrors[0];
    }
  }

  return {
    accounts: accounts.data || [],
    conversations: conversations.data || [],
    assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
    customers: customers.data || [],
    leads: leads.data || [],
    cases: cases.data || [],
    supportsSocialInbox: true,
  };
}

export async function fetchSocialConversationMessages(conversationId, { limit = 50 } = {}) {
  await assertSocialInboxReadAccess();

  if (!conversationId) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("social_messages")
    .select("id, conversation_id, external_message_id, direction, sender_type, sender_name, body, attachments, sent_at, delivered_at, read_at, created_by, meta, created_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingOptionalTable(error) || isMissingColumnError(error)) {
      return [];
    }

    throw error;
  }

  return hydrateSocialInboxMessages(client, [...(data || [])].reverse());
}

export async function createSocialInboxMessage(input) {
  await assertSocialInboxEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    conversation_id: input.conversation_id,
    direction: input.direction || "outbound",
    sender_type: input.sender_type || "admin",
    sender_name: input.sender_name || null,
    body: input.body || null,
    attachments: input.attachments || [],
    sent_at: input.sent_at || new Date().toISOString(),
    created_by: user?.id || null,
    meta: input.meta || {},
  };

  const { data, error } = await client
    .from("social_messages")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function uploadSocialInboxAttachment({ conversationId, file }) {
  await assertSocialInboxEditAccess();

  validateSocialInboxAttachmentFile(file);

  const client = requireSupabase();
  const path = buildSocialInboxAttachmentPath(conversationId, file);
  const mimeType = String(file.type || "").toLowerCase() || "application/octet-stream";
  const fileName = String(file.name || "").trim() || path.split("/").pop() || "attachment";

  const { error: uploadError } = await client.storage
    .from(ADMIN_INBOX_MEDIA_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: mimeType,
      cacheControl: "3600",
    });

  if (uploadError) {
    const message = String(uploadError.message || "").toLowerCase();

    if (
      message.includes("bucket")
      || message.includes("not found")
      || message.includes("policy")
      || message.includes("permission")
      || message.includes("unauthorized")
      || message.includes("row-level security")
    ) {
      throw new Error("Inbox media upload is not configured yet. Apply the latest inbox storage migration and policies.");
    }

    throw uploadError;
  }

  const { data } = await client.storage
    .from(ADMIN_INBOX_MEDIA_BUCKET)
    .createSignedUrl(path, ADMIN_INBOX_ATTACHMENT_URL_TTL_SECONDS);

  return {
    id: crypto.randomUUID(),
    bucket: ADMIN_INBOX_MEDIA_BUCKET,
    path,
    file_path: path,
    file_name: fileName,
    filename: fileName,
    mime_type: mimeType,
    mimeType,
    type: mimeType,
    file_size: Number(file.size || 0) || null,
    title: fileName,
    signed_url: data?.signedUrl || "",
    signedUrl: data?.signedUrl || "",
    url: data?.signedUrl || "",
  };
}

export async function markSocialConversationRead(conversationId) {
  await assertSocialInboxEditAccess();

  const client = requireSupabase();
  const { error } = await client
    .from("social_conversations")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) {
    throw error;
  }
}

export async function markSocialConversationUnread(conversationId, unreadCount = 1) {
  await assertSocialInboxEditAccess();

  const client = requireSupabase();
  const { error } = await client
    .from("social_conversations")
    .update({
      unread_count: Math.max(1, Number(unreadCount) || 1),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) {
    throw error;
  }
}

export async function updateSocialConversation(conversationId, updates = {}) {
  await assertSocialInboxEditAccess();

  if (!conversationId) {
    throw new Error("Conversation id is required.");
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };

  const allowedKeys = [
    "assigned_user_id",
    "status",
    "priority",
    "archived_at",
    "subject",
    "meta",
    "unread_count",
  ];

  allowedKeys.forEach((key) => {
    if (key in updates) {
      payload[key] = updates[key];
    }
  });

  const client = requireSupabase();
  const { error } = await client
    .from("social_conversations")
    .update(payload)
    .eq("id", conversationId);

  if (error) {
    throw error;
  }

  return true;
}

export async function backfillInstagramInboxProfiles(input = {}) {
  await assertSocialInboxEditAccess();
  return invokeSocialInboxFunction("social-inbox-backfill-profiles", input);
}
