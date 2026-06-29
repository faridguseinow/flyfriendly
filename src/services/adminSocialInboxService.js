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

  return [...(data || [])].reverse();
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

export async function backfillInstagramInboxProfiles(input = {}) {
  await assertSocialInboxEditAccess();
  return invokeSocialInboxFunction("social-inbox-backfill-profiles", input);
}
