import { requireSupabase } from "../lib/supabase.js";
import { getCurrentAdminActor } from "./adminAccessService.js";

const NOTIFICATION_LIMIT = 80;

function isMissingNotificationTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("admin_notifications");
}

function normalizeSeverity(value) {
  return ["info", "warning", "critical"].includes(value) ? value : "info";
}

function normalizeNotification(row) {
  return {
    id: row.id,
    type: row.type || "admin",
    severity: normalizeSeverity(row.severity),
    title: row.title || "Notification",
    body: row.body || "",
    module: row.module || "",
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    actionUrl: row.action_url || "",
    readAt: row.read_at || null,
    createdAt: row.created_at,
    recipientProfileId: row.recipient_profile_id || "",
    recipientRole: row.recipient_role || "",
  };
}

export async function createAdminNotification(input = {}) {
  const title = String(input.title || "").trim();
  if (!title) {
    return null;
  }

  const client = requireSupabase();
  const payload = {
    type: String(input.type || "admin").trim() || "admin",
    severity: normalizeSeverity(input.severity),
    title,
    body: String(input.body || "").trim() || null,
    module: String(input.module || "").trim() || null,
    entity_type: String(input.entityType || "").trim() || null,
    entity_id: input.entityId ? String(input.entityId) : null,
    action_url: String(input.actionUrl || "").trim() || null,
    recipient_profile_id: input.recipientProfileId || null,
    recipient_role: input.recipientRole || null,
  };

  const { data, error } = await client
    .from("admin_notifications")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (isMissingNotificationTable(error)) {
      return null;
    }
    throw error;
  }

  return data;
}

export async function fetchAdminNotifications() {
  const actor = await getCurrentAdminActor();
  if (!actor?.isAdminUser || !actor?.user?.id) {
    return {
      notifications: [],
      unreadCount: 0,
      supportsNotifications: false,
    };
  }

  const client = requireSupabase();
  const roles = (actor.roles || []).filter(Boolean);
  const roleFilters = roles.map((role) => `recipient_role.eq.${role}`);
  const filters = [
    `recipient_profile_id.eq.${actor.user.id}`,
    "and(recipient_profile_id.is.null,recipient_role.is.null)",
    ...roleFilters,
  ];

  const { data, error } = await client
    .from("admin_notifications")
    .select("id, type, severity, title, body, module, entity_type, entity_id, action_url, recipient_profile_id, recipient_role, read_at, created_at")
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_LIMIT);

  if (error) {
    if (isMissingNotificationTable(error)) {
      return {
        notifications: [],
        unreadCount: 0,
        supportsNotifications: false,
      };
    }
    throw error;
  }

  const notifications = (data || []).map(normalizeNotification);
  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
    supportsNotifications: true,
  };
}

export async function markAdminNotificationRead(notificationId) {
  if (!notificationId) {
    return false;
  }

  const client = requireSupabase();
  const { error } = await client
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) {
    if (isMissingNotificationTable(error)) return false;
    throw error;
  }

  return true;
}

export async function markAllAdminNotificationsRead() {
  const actor = await getCurrentAdminActor();
  if (!actor?.isAdminUser || !actor?.user?.id) {
    return false;
  }

  const client = requireSupabase();
  const roles = (actor.roles || []).filter(Boolean);
  const roleFilters = roles.map((role) => `recipient_role.eq.${role}`);
  const filters = [
    `recipient_profile_id.eq.${actor.user.id}`,
    "and(recipient_profile_id.is.null,recipient_role.is.null)",
    ...roleFilters,
  ];

  const { error } = await client
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .or(filters.join(","));

  if (error) {
    if (isMissingNotificationTable(error)) return false;
    throw error;
  }

  return true;
}

