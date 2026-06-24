import { requireSupabase } from "../lib/supabase.js";
import { getCurrentUser, resetPassword } from "./authService.js";
import { assertCurrentAdminPermission, assertCurrentOwnerAdmin } from "./adminAccessService.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { ADMIN_ROLE_CODES, normalizeRoleCode } from "../admin/rbac.js";
import { adminNavigation, adminNavigationByPath, adminNavigationGroupOrder, adminNavigationSections, buildAdminNavigationGroups } from "../admin/navigation.js";
import { calculatePartnerCommissionFromRevenue, getPartnerCommissionRate } from "../lib/partnerCommission.js";
import {
  deriveCaseCodeFromLeadCode,
  isModernLeadCode,
  normalizeLeadCode,
} from "../lib/recordCodes.js";
import { buildReferralPath, generateRandomReferralCode } from "../../shared/referral-code.js";

function notifyAdmin(input = {}) {
  void createAdminNotification(input).catch(() => null);
}

function isMissingOptionalTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("schema cache");
}

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.message?.includes("column") || error?.message?.includes("schema cache");
}

const TRASH_MODULE_ACCESS_PERMISSIONS = ["trash.manage", "users.manage"];
const REFERRAL_MODULE_READ_PERMISSIONS = ["partners.view", "partner_applications.view", "referrals.view"];
const REPORTS_MODULE_READ_PERMISSIONS = ["reports.view", "reports.export", "finance.view", "finance.edit"];

async function assertAdminAnyPermission(anyPermissions, message) {
  return assertCurrentAdminPermission(null, {
    anyPermissions,
    message,
  });
}

async function assertLeadsModuleReadAccess(message = "You do not have access to leads.") {
  return assertCurrentAdminPermission("leads.view", { message });
}

async function assertLeadsEditAccess(message = "You do not have access to update leads.") {
  return assertCurrentAdminPermission("leads.edit", { message });
}

async function assertCasesModuleReadAccess(message = "You do not have access to cases.") {
  return assertCurrentAdminPermission("cases.view", { message });
}

async function assertCasesEditAccess(message = "You do not have access to update cases.") {
  return assertCurrentAdminPermission("cases.edit", { message });
}

async function assertCustomersModuleReadAccess(message = "You do not have access to customers.") {
  return assertCurrentAdminPermission("customers.view", { message });
}

async function assertCustomersEditAccess(message = "You do not have access to update customers.") {
  return assertCurrentAdminPermission("customers.edit", { message });
}

async function assertTasksModuleReadAccess(message = "You do not have access to tasks.") {
  return assertCurrentAdminPermission("tasks.view", { message });
}

async function assertTasksEditAccess(message = "You do not have access to update tasks.") {
  return assertCurrentAdminPermission("tasks.edit", { message });
}

async function assertCommunicationsModuleReadAccess(message = "You do not have access to communications.") {
  return assertCurrentAdminPermission("communications.view", { message });
}

async function assertCommunicationsEditAccess(message = "You do not have access to update communications.") {
  return assertCurrentAdminPermission("communications.edit", { message });
}

async function assertDocumentsModuleReadAccess(message = "You do not have access to documents.") {
  return assertCurrentAdminPermission("documents.view", { message });
}

async function assertDocumentsManageAccess(message = "You do not have access to manage documents.") {
  return assertCurrentAdminPermission("documents.manage", { message });
}

async function assertTrashModuleAccess(message = "You do not have access to the trash module.") {
  return assertAdminAnyPermission(TRASH_MODULE_ACCESS_PERMISSIONS, message);
}

async function assertReferralModuleReadAccess(message = "You do not have access to referral admin data.") {
  return assertAdminAnyPermission(REFERRAL_MODULE_READ_PERMISSIONS, message);
}

async function assertReportsModuleReadAccess(message = "You do not have access to reports.") {
  return assertAdminAnyPermission(REPORTS_MODULE_READ_PERMISSIONS, message);
}

async function assertTrashItemMutationAccess(item, action = "manage") {
  if (item?.entity_type === "profile") {
    return assertCurrentAdminPermission("users.manage", {
      message: action === "restore"
        ? "You do not have access to restore deleted users."
        : "You do not have access to manage deleted users.",
    });
  }

  return assertDocumentsManageAccess(
    action === "restore"
      ? "You do not have access to restore deleted documents."
      : "You do not have access to manage deleted documents.",
  );
}

function getTrashPurgeAfterDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function getDocumentEntityType(document) {
  if (document.kind === "signature") {
    return "lead_signature";
  }

  if (document.owner_type === "case") {
    return "case_document";
  }

  if (document.owner_type === "claim") {
    return "claim_document";
  }

  return "lead_document";
}

function getTrashSourceConfig(entityType) {
  if (entityType === "lead_document") {
    return { table: "lead_documents", statusField: "status" };
  }

  if (entityType === "case_document") {
    return { table: "case_documents", statusField: "status" };
  }

  if (entityType === "claim_document") {
    return { table: "documents", statusField: "status" };
  }

  if (entityType === "lead_signature") {
    return { table: "lead_signatures", statusField: null };
  }

  if (entityType === "profile") {
    return { table: "profiles", statusField: "status" };
  }

  return null;
}

const AIRPORTS_REFRESH_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const AIRLINES_REFRESH_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat";
const regionNames = typeof Intl !== "undefined"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
const countryAliases = {
  RU: ["Russian Federation"],
  KR: ["Republic of Korea", "South Korea"],
  KP: ["Democratic People's Republic of Korea", "North Korea"],
  IR: ["Islamic Republic of Iran"],
  MD: ["Republic of Moldova"],
  TZ: ["United Republic of Tanzania"],
  VN: ["Viet Nam"],
  LA: ["Lao People's Democratic Republic"],
  BO: ["Plurinational State of Bolivia"],
  VE: ["Bolivarian Republic of Venezuela"],
  SY: ["Syrian Arab Republic"],
};
const adminMenuCache = new Map();
const adminModuleCache = new Map();
const adminModulePending = new Map();
const ADMIN_MENU_CACHE_PREFIX = "admin-menu:";
const ADMIN_MENU_CACHE_VERSION = "v6-role-visibility-fix";
const ADMIN_WORK_SESSION_STORAGE_KEY = "fly-friendly-admin-work-session";
const ADMIN_ACTIVITY_SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "signature",
  "content",
  "html",
  "body",
  "base64",
  "raw",
  "file_path",
  "signed_url",
  "signedurl",
  "email",
  "phone",
  "full_name",
  "fullName",
  "customer_email",
  "customer_phone",
  "customer_name",
];

function stableSerializeCacheValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeCacheValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerializeCacheValue(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildAdminModuleCacheKey(scope, params = null) {
  return params === null ? scope : `${scope}:${stableSerializeCacheValue(params)}`;
}

async function withAdminModuleCache(cacheKey, loader, { force = false } = {}) {
  if (!force && adminModuleCache.has(cacheKey)) {
    return adminModuleCache.get(cacheKey);
  }

  if (!force && adminModulePending.has(cacheKey)) {
    return adminModulePending.get(cacheKey);
  }

  const pending = Promise.resolve()
    .then(loader)
    .then((result) => {
      adminModuleCache.set(cacheKey, result);
      return result;
    })
    .finally(() => {
      adminModulePending.delete(cacheKey);
    });

  adminModulePending.set(cacheKey, pending);
  return pending;
}

export function clearAdminModuleCache(prefixes = []) {
  if (!Array.isArray(prefixes) || !prefixes.length) {
    adminModuleCache.clear();
    adminModulePending.clear();
    return;
  }

  const normalizedPrefixes = prefixes.filter(Boolean);
  [...adminModuleCache.keys()].forEach((key) => {
    if (normalizedPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) {
      adminModuleCache.delete(key);
    }
  });
  [...adminModulePending.keys()].forEach((key) => {
    if (normalizedPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) {
      adminModulePending.delete(key);
    }
  });
}

function generateClientUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function isSensitiveActivityKey(key) {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) return false;
  return ADMIN_ACTIVITY_SENSITIVE_KEYS.some((fragment) => normalized.includes(fragment));
}

function sanitizeActivityMetadata(value, depth = 0) {
  if (value === null || value === undefined) {
    return null;
  }

  if (depth > 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeActivityMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, nestedValue]) => {
      if (isSensitiveActivityKey(key)) {
        return acc;
      }

      acc[key] = sanitizeActivityMetadata(nestedValue, depth + 1);
      return acc;
    }, {});
  }

  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  }

  return value;
}

async function fetchAssignableAdminProfiles(client) {
  const teamMembersResponse = await client
    .from("admin_team_members")
    .select("profile_id, email, full_name, status")
    .eq("status", "active");

  if (teamMembersResponse.error) {
    if (isMissingOptionalTable(teamMembersResponse.error) || isMissingColumnError(teamMembersResponse.error)) {
      return [];
    }
    throw teamMembersResponse.error;
  }

  const teamMembers = (teamMembersResponse.data || []).filter((item) => item.profile_id);
  if (!teamMembers.length) {
    return [];
  }

  const profileIds = [...new Set(teamMembers.map((item) => item.profile_id))];
  const profilesResponse = await client
    .from("profiles")
    .select("id, full_name, email, role, status")
    .in("id", profileIds);

  if (profilesResponse.error) {
    if (isMissingOptionalTable(profilesResponse.error) || isMissingColumnError(profilesResponse.error)) {
      return teamMembers
        .map((item) => ({
          id: item.profile_id,
          full_name: item.full_name || null,
          email: item.email || null,
          role: "employee",
          status: item.status || "active",
        }))
        .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), undefined, { sensitivity: "base" }));
    }
    throw profilesResponse.error;
  }

  const profileById = new Map((profilesResponse.data || []).map((profile) => [profile.id, profile]));

  return teamMembers
    .map((item) => {
      const profile = profileById.get(item.profile_id);
      return {
        id: item.profile_id,
        full_name: profile?.full_name || item.full_name || null,
        email: profile?.email || item.email || null,
        role: profile?.role || "employee",
        status: profile?.status || item.status || "active",
      };
    })
    .filter((item) => item.id)
    .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), undefined, { sensitivity: "base" }));
}

function toLegacyAdminRoleCodes(roleCodes = []) {
  return Array.from(
    new Set(
      (roleCodes || [])
        .map((roleCode) => String(roleCode || "").trim())
        .filter((roleCode) => ADMIN_ROLE_CODES.has(roleCode)),
    ),
  );
}

function splitCsvLine(line) {
  const parts = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function searchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAirportName(value) {
  return (value || "").replace(/^\(Duplicate\)\s*/i, "").trim();
}

function getCountryName(code) {
  return code ? regionNames?.of(code) || code : "";
}

function getCountryTerms(code) {
  const primary = getCountryName(code);
  return [primary, ...(countryAliases[code] || [])].filter(Boolean);
}

function buildAirportCatalogRows(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  const seen = new Set();

  return lines
    .slice(1)
    .map((line) => {
      const values = splitCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));
      const countryTerms = getCountryTerms(row.iso_country);
      const cleanName = normalizeAirportName(row.name);
      const preferredCode = row.iata_code || row.icao_code || row.ident;
      const dedupeKey = [cleanName.toLowerCase(), (row.municipality || "").toLowerCase(), row.iso_country, preferredCode].join("|");

      if (!cleanName || row.name.startsWith("(Duplicate)") || seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);

      return {
        id: Number(row.id),
        ident: row.ident || null,
        type: row.type || null,
        name: cleanName,
        latitude_deg: row.latitude_deg ? Number(row.latitude_deg) : null,
        longitude_deg: row.longitude_deg ? Number(row.longitude_deg) : null,
        elevation_ft: row.elevation_ft ? Number(row.elevation_ft) : null,
        continent: row.continent || null,
        iso_country: row.iso_country || null,
        iso_region: row.iso_region || null,
        municipality: row.municipality || null,
        scheduled_service: row.scheduled_service === "yes",
        icao_code: row.icao_code || null,
        iata_code: row.iata_code || null,
        gps_code: row.gps_code || null,
        local_code: row.local_code || null,
        home_link: row.home_link || null,
        wikipedia_link: row.wikipedia_link || null,
        keywords: [...countryTerms, row.keywords].filter(Boolean).join(" | ") || null,
      };
    })
    .filter((row) => row && row.name && (row.iata_code || row.scheduled_service || row.type === "large_airport" || row.type === "medium_airport"));
}

function buildAirlineCatalogRows(raw) {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, name, alias, iataCode, icaoCode, callsign, country, active] = splitCsvLine(line);

      return {
        id: Number(id),
        name: name || null,
        iata_code: iataCode && iataCode !== "\\N" && iataCode !== "-" ? iataCode : null,
        icao_code: icaoCode && icaoCode !== "\\N" && icaoCode !== "-" ? icaoCode : null,
        country: country && country !== "\\N" ? country : null,
        active: active === "Y",
      };
    })
    .filter((row) => row.name);
}

async function upsertInChunks(client, table, rows, chunkSize = 500) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const { error } = await client.from(table).upsert(chunk, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }
}

export async function getAdminContext() {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, profile: null, isAdmin: false };
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return { user, profile, isAdmin: profile?.role === "admin" };
}

async function recordActivity(client, payload) {
  const { error } = await client
    .from("activity_logs")
    .insert({
      user_id: payload.userId || null,
      action: payload.action,
      module: payload.module,
      target_entity_type: payload.targetEntityType,
      target_entity_id: payload.targetEntityId || null,
      previous_value: payload.previousValue || null,
      new_value: payload.newValue || null,
      meta: payload.meta || {},
    });

  if (error && !isMissingOptionalTable(error) && !isMissingColumnError(error)) {
    throw error;
  }
}

export async function logAdminActivity(action, entityType, entityId, metadata = {}) {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) {
    return false;
  }

  const client = requireSupabase();
  const currentUser = await getCurrentUser().catch(() => null);
  const sanitizedMetadata = sanitizeActivityMetadata(metadata);

  const insertPayload = {
    admin_profile_id: metadata?.adminProfileId || currentUser?.id || null,
    action: normalizedAction,
    entity_type: entityType ? String(entityType) : null,
    entity_id: entityId === null || entityId === undefined ? null : String(entityId),
    metadata: sanitizedMetadata && typeof sanitizedMetadata === "object"
      ? Object.fromEntries(Object.entries(sanitizedMetadata).filter(([key]) => key !== "adminProfileId"))
      : {},
  };

  const { error } = await client
    .from("admin_activity_logs")
    .insert(insertPayload);

  if (error) {
    if (!isMissingOptionalTable(error) && !isMissingColumnError(error)) {
      console.warn("admin activity logging failed", {
        action: normalizedAction,
        entityType: insertPayload.entity_type,
        entityId: insertPayload.entity_id,
        code: error.code,
        message: error.message,
      });
    }
    return false;
  }

  return true;
}

export function logAdminMenuVisibilityChange(roleId, menuItemId, isVisible, sortOrder = null) {
  return logAdminActivity("change_menu_visibility", "admin_menu_item", menuItemId, {
    module: "menu",
    role_id: roleId || null,
    is_visible: Boolean(isVisible),
    sort_order: sortOrder === null || sortOrder === undefined ? null : Number(sortOrder),
  });
}

function readAdminWorkSessionState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ADMIN_WORK_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeAdminWorkSessionState(payload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!payload) {
      window.sessionStorage.removeItem(ADMIN_WORK_SESSION_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(ADMIN_WORK_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export async function startAdminWorkSession() {
  try {
    const client = requireSupabase();
    const currentUser = await getCurrentUser().catch(() => null);
    if (!currentUser?.id) {
      return null;
    }

    const existing = readAdminWorkSessionState();
    if (existing?.sessionId && existing?.profileId === currentUser.id) {
      await heartbeatAdminWorkSession(existing.sessionId);
      return existing.sessionId;
    }

    const now = new Date().toISOString();
    const payload = {
      admin_profile_id: currentUser.id,
      started_at: now,
      last_seen_at: now,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };

    const { data, error } = await client
      .from("admin_work_sessions")
      .insert(payload)
      .select("id, admin_profile_id, started_at, last_seen_at")
      .single();

    if (error) {
      if (!isMissingOptionalTable(error) && !isMissingColumnError(error)) {
        console.warn("admin work session start failed", { code: error.code, message: error.message });
      }
      return null;
    }

    writeAdminWorkSessionState({
      sessionId: data.id,
      profileId: currentUser.id,
    });

    await client
      .from("admin_team_members")
      .update({ last_login_at: now })
      .eq("profile_id", currentUser.id)
      .then(() => null)
      .catch(() => null);

    return data.id;
  } catch {
    return null;
  }
}

export async function heartbeatAdminWorkSession(sessionId = null) {
  try {
    const client = requireSupabase();
    const currentUser = await getCurrentUser().catch(() => null);
    const stored = readAdminWorkSessionState();
    const activeSessionId = sessionId || stored?.sessionId || null;

    if (!currentUser?.id || !activeSessionId) {
      return false;
    }

    const now = new Date().toISOString();
    const { error } = await client
      .from("admin_work_sessions")
      .update({
        last_seen_at: now,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      .eq("id", activeSessionId)
      .eq("admin_profile_id", currentUser.id);

    if (error) {
      if (!isMissingOptionalTable(error) && !isMissingColumnError(error)) {
        console.warn("admin work session heartbeat failed", { code: error.code, message: error.message });
      }
      return false;
    }

    writeAdminWorkSessionState({
      sessionId: activeSessionId,
      profileId: currentUser.id,
    });

    return true;
  } catch {
    return false;
  }
}

export async function endAdminWorkSession(sessionId = null) {
  try {
    const client = requireSupabase();
    const currentUser = await getCurrentUser().catch(() => null);
    const stored = readAdminWorkSessionState();
    const activeSessionId = sessionId || stored?.sessionId || null;
    const profileId = currentUser?.id || stored?.profileId || null;

    if (!activeSessionId || !profileId) {
      writeAdminWorkSessionState(null);
      return false;
    }

    const currentSession = await client
      .from("admin_work_sessions")
      .select("id, started_at, duration_seconds")
      .eq("id", activeSessionId)
      .eq("admin_profile_id", profileId)
      .maybeSingle();

    if (currentSession.error) {
      if (!isMissingOptionalTable(currentSession.error) && !isMissingColumnError(currentSession.error)) {
        console.warn("admin work session load before end failed", {
          code: currentSession.error.code,
          message: currentSession.error.message,
        });
      }
      writeAdminWorkSessionState(null);
      return false;
    }

    const now = new Date();
    const startedAt = currentSession.data?.started_at ? new Date(currentSession.data.started_at) : null;
    const durationSeconds = startedAt && Number.isFinite(startedAt.getTime())
      ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000))
      : Number(currentSession.data?.duration_seconds || 0);

    const { error } = await client
      .from("admin_work_sessions")
      .update({
        ended_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        duration_seconds: durationSeconds,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      .eq("id", activeSessionId)
      .eq("admin_profile_id", profileId);

    if (error) {
      if (!isMissingOptionalTable(error) && !isMissingColumnError(error)) {
        console.warn("admin work session end failed", { code: error.code, message: error.message });
      }
      writeAdminWorkSessionState(null);
      return false;
    }

    writeAdminWorkSessionState(null);
    return true;
  } catch {
    writeAdminWorkSessionState(null);
    return false;
  }
}

export async function fetchAdminOverview() {
  const client = requireSupabase();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayIso = startOfToday.toISOString();
  const activeCaseStatuses = [
    "draft",
    "documents_pending",
    "ready_to_submit",
    "submitted_to_airline",
    "awaiting_response",
    "airline_replied",
    "escalated",
  ];
  const pendingPayoutStatuses = ["awaiting_payment", "payment_received"];

  const [
    leadsResponse,
    cases,
    pipelineCases,
    finance,
    caseDocuments,
    partnerApplications,
    partnerPayouts,
    profiles,
    newLeadsToday,
    claimsUnderReview,
    documentsNeeded,
    pendingPartnerApplications,
    pendingPayouts,
    casesWithoutOwner,
    recentActivity,
  ] = await Promise.all([
    fetchLeadsWithFallback(client),
    client
      .from("cases")
      .select("id, case_code, lead_id, customer_id, airline, route_from, route_to, status, payout_status, estimated_compensation, assigned_manager_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(160),
    client
      .from("cases")
      .select("estimated_compensation, status")
      .in("status", activeCaseStatuses)
      .limit(2000),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, customer_payout, payment_status, currency, updated_at, payment_received_at, customer_paid_at")
      .order("updated_at", { ascending: false })
      .limit(160),
    client
      .from("case_documents")
      .select("id, case_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(600),
    client
      .from("partner_applications")
      .select("id, full_name, email, country, primary_platform, audience_size, niche, status, rejection_reason, reviewed_by, reviewed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(120),
    client
      .from("referral_partner_payouts")
      .select("id, partner_id, case_id, amount, currency, status, paid_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(120),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(300),
    client
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfTodayIso),
    client
      .from("cases")
      .select("id", { count: "exact", head: true })
      .in("status", activeCaseStatuses),
    client
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "documents_pending"),
    client
      .from("partner_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    client
      .from("case_finance")
      .select("id", { count: "exact", head: true })
      .in("payment_status", pendingPayoutStatuses),
    client
      .from("cases")
      .select("id", { count: "exact", head: true })
      .in("status", activeCaseStatuses)
      .is("assigned_manager_id", null),
    client
      .from("activity_logs")
      .select("id, module, action, target_entity_type, target_entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (leadsResponse.error) {
    throw leadsResponse.error;
  }

  const requiredErrors = [cases, pipelineCases, finance, profiles].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  const optionalResults = [
    caseDocuments,
    partnerApplications,
    partnerPayouts,
    newLeadsToday,
    claimsUnderReview,
    documentsNeeded,
    pendingPartnerApplications,
    pendingPayouts,
    casesWithoutOwner,
    recentActivity,
  ];

  for (const result of optionalResults) {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }

  return {
    leads: leadsResponse.data || [],
    cases: cases.data || [],
    pipelineCases: pipelineCases.data || [],
    finance: finance.data || [],
    caseDocuments: caseDocuments.data || [],
    partnerApplications: partnerApplications.data || [],
    partnerPayouts: partnerPayouts.data || [],
    profiles: profiles.data || [],
    metrics: {
      newLeadsToday: newLeadsToday.count ?? null,
      claimsUnderReview: claimsUnderReview.count ?? null,
      documentsNeeded: documentsNeeded.count ?? null,
      pendingPartnerApplications: pendingPartnerApplications.count ?? null,
      pendingPayouts: pendingPayouts.count ?? null,
      casesWithoutOwner: casesWithoutOwner.count ?? null,
      estimatedCompensationPipeline: (pipelineCases.data || []).reduce(
        (sum, item) => sum + Number(item.estimated_compensation || 0),
        0,
      ),
    },
    health: {
      failedEmailsSupported: false,
      failedEmails: null,
    },
    activityLogs: recentActivity.data || [],
    supportsCoreSchemaV1: leadsResponse.supportsCoreSchemaV1,
    supportsCaseDocuments: !caseDocuments.error,
    supportsPartnerApplications: !partnerApplications.error,
    supportsPartnerPayouts: !partnerPayouts.error,
    supportsActivityLogs: !recentActivity.error,
  };
}

async function fetchLeadsWithFallback(client) {
  const extended = await client
    .from("leads")
    .select("id, lead_code, source, source_details, status, stage, eligibility_status, profile_id, referral_partner_id, departure_airport, arrival_airport, airline, scheduled_departure_date, delay_duration, disruption_type, is_direct, full_name, email, phone, city, country, preferred_language, has_whatsapp, issue_type, assigned_user_id, customer_id, duplicate_of_lead_id, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation, reason, payload, created_at, updated_at, submitted_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!extended.error) {
    return { data: extended.data || [], supportsCoreSchemaV1: true };
  }

  if (!isMissingColumnError(extended.error)) {
    throw extended.error;
  }

  const fallback = await client
    .from("leads")
    .select("id, lead_code, source, source_details, status, stage, eligibility_status, profile_id, referral_partner_id, departure_airport, arrival_airport, airline, scheduled_departure_date, delay_duration, disruption_type, is_direct, full_name, email, phone, city, reason, payload, created_at, updated_at, submitted_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (fallback.error) {
    throw fallback.error;
  }

  return { data: fallback.data || [], supportsCoreSchemaV1: false };
}

async function fetchCaseLeadsWithEstimateFallback(client) {
  const extended = await client
    .from("leads")
    .select("id, lead_code, full_name, email, phone, departure_airport, arrival_airport, disruption_type, referral_partner_id, source_details, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!extended.error) {
    return { data: extended.data || [] };
  }

  if (!isMissingColumnError(extended.error)) {
    throw extended.error;
  }

  const partial = await client
    .from("leads")
    .select("id, lead_code, full_name, email, phone, departure_airport, arrival_airport, disruption_type, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!partial.error) {
    return { data: partial.data || [] };
  }

  if (!isMissingColumnError(partial.error)) {
    throw partial.error;
  }

  const fallback = await client
    .from("leads")
    .select("id, lead_code, full_name, email, phone, departure_airport, arrival_airport")
    .order("created_at", { ascending: false })
    .limit(500);

  if (fallback.error) {
    throw fallback.error;
  }

  return { data: fallback.data || [] };
}

export async function fetchLeadsModuleData(options = {}) {
  await assertLeadsModuleReadAccess();

  return withAdminModuleCache("leads-module", async () => {
    const client = requireSupabase();

    const [leadsResponse, assignableUsers, leadNotes, leadStatusHistory, leadDocuments, leadSignatures] = await Promise.all([
      fetchLeadsWithFallback(client),
      fetchAssignableAdminProfiles(client),
      client
        .from("lead_notes")
        .select("id, lead_id, body, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("lead_status_history")
        .select("id, lead_id, previous_status, next_status, changed_by, note, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("lead_documents")
        .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
        .order("created_at", { ascending: false })
        .limit(800),
      client
        .from("lead_signatures")
        .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (leadNotes.error && !isMissingOptionalTable(leadNotes.error)) {
      throw leadNotes.error;
    }

    if (leadStatusHistory.error && !isMissingOptionalTable(leadStatusHistory.error)) {
      throw leadStatusHistory.error;
    }

    if (leadDocuments.error && !isMissingOptionalTable(leadDocuments.error) && !isMissingColumnError(leadDocuments.error)) {
      throw leadDocuments.error;
    }

    if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error)) {
      throw leadSignatures.error;
    }

    return {
      leads: leadsResponse.data,
      assignableUsers,
      notes: leadNotes.data || [],
      statusHistory: leadStatusHistory.data || [],
      documents: (leadDocuments.data || []).map((item) => ({
        ...item,
        bucket: "claim-lead-documents",
        kind: "document",
      })),
      signatures: leadSignatures.data || [],
      supportsCoreSchemaV1: leadsResponse.supportsCoreSchemaV1,
      supportsNotes: !leadNotes.error,
      supportsHistory: !leadStatusHistory.error,
      supportsLeadDocuments: !leadDocuments.error,
      supportsLeadSignatures: !leadSignatures.error,
    };
  }, options);
}

async function fetchCasesWithFallback(client, page, pageSize, filters = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const baseQuery = client
    .from("cases")
    .select("id, case_code, lead_id, customer_id, airline, route_from, route_to, flight_date, issue_type, legal_basis, estimated_compensation, company_fee, status, payout_status, priority, assigned_manager_id, submission_date, response_date, deadline_at, referral_partner_id, referral_partner_label, created_at, updated_at, approved_at, rejected_at, paid_at, closed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const query = applyCaseFilters(baseQuery, filters);
  const response = await query;

  if (!response.error) {
    return { data: response.data || [], count: response.count || 0, supportsCaseModuleV1: true };
  }

  if (!isMissingColumnError(response.error) && !isMissingOptionalTable(response.error)) {
    throw response.error;
  }

  const fallbackQuery = client
    .from("cases")
    .select("id, case_code, lead_id, customer_id, airline, route_from, route_to, flight_date, issue_type, legal_basis, estimated_compensation, company_fee, status, payout_status, priority, assigned_manager_id, submission_date, response_date, deadline_at, referral_partner_label, created_at, updated_at, approved_at, rejected_at, paid_at, closed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const fallbackResponse = await applyCaseFilters(fallbackQuery, filters);
  if (!fallbackResponse.error) {
    return { data: fallbackResponse.data || [], count: fallbackResponse.count || 0, supportsCaseModuleV1: true };
  }

  if (!isMissingColumnError(fallbackResponse.error) && !isMissingOptionalTable(fallbackResponse.error)) {
    throw fallbackResponse.error;
  }

  return { data: [], count: 0, supportsCaseModuleV1: false, missingTable: true };
}

function applyCaseFilters(query, filters) {
  let nextQuery = query;

  if (filters.status && filters.status !== "all") {
    nextQuery = nextQuery.eq("status", filters.status);
  }

  if (filters.payoutStatus && filters.payoutStatus !== "all") {
    nextQuery = nextQuery.eq("payout_status", filters.payoutStatus);
  }

  if (filters.managerId && filters.managerId !== "all") {
    nextQuery = nextQuery.eq("assigned_manager_id", filters.managerId);
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    nextQuery = nextQuery.or(`case_code.ilike.%${q}%,airline.ilike.%${q}%,route_from.ilike.%${q}%,route_to.ilike.%${q}%`);
  }

  return nextQuery;
}

export async function fetchCasesModuleData({ page = 1, pageSize = 12, filters = {}, force = false } = {}) {
  await assertCasesModuleReadAccess();

  return withAdminModuleCache(buildAdminModuleCacheKey("cases-module", { page, pageSize, filters }), async () => {
    const client = requireSupabase();

    const [casesResponse, managers, leads, customers, finance, statusHistory, documents, tasks, caseTasks, communications, caseCommunications] = await Promise.all([
      fetchCasesWithFallback(client, page, pageSize, filters),
      fetchAssignableAdminProfiles(client),
      fetchCaseLeadsWithEstimateFallback(client),
      client
        .from("customers")
        .select("id, full_name, email, phone, country, preferred_language, total_cases, total_compensation")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("case_finance")
        .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, agent_bonus, payment_status, payment_method, currency, notes, payment_received_at, customer_paid_at, referral_paid_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      client
        .from("case_status_history")
        .select("id, case_id, previous_status, next_status, changed_by, note, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("case_documents")
        .select("id, case_id, document_type, file_path, file_name, mime_type, file_size, status, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("tasks")
        .select("id, title, status, priority, due_date, assigned_user_id, related_entity_type, related_entity_id")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("case_tasks")
        .select("id, case_id, task_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("communications")
        .select("id, entity_type, entity_id, channel, direction, subject, body, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("case_communications")
        .select("id, case_id, communication_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const requiredErrors = [leads].map((result) => result.error).filter(Boolean);
    if (requiredErrors.length) {
      throw requiredErrors[0];
    }

    const optional = { customers, finance, statusHistory, documents, tasks, caseTasks, communications, caseCommunications };
    for (const result of Object.values(optional)) {
      if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
        throw result.error;
      }
    }

    const metricsQuery = await client
      .from("cases")
      .select("id, status, estimated_compensation, created_at, approved_at, rejected_at, paid_at, closed_at");

    const metricsRows = metricsQuery.error ? [] : metricsQuery.data || [];

    return {
      cases: casesResponse.data,
      totalCount: casesResponse.count,
      page,
      pageSize,
      managers,
      leads: leads.data || [],
      customers: customers.data || [],
      finance: finance.data || [],
      statusHistory: statusHistory.data || [],
      documents: documents.data || [],
      tasks: tasks.data || [],
      caseTasks: caseTasks.data || [],
      communications: communications.data || [],
      caseCommunications: caseCommunications.data || [],
      metricsRows,
      supportsCaseModuleV1: casesResponse.supportsCaseModuleV1,
    };
  }, { force });
}

async function syncCustomerStats(client, customerId) {
  if (!customerId) return;

  const [leadsCount, casesRows, approvedRows] = await Promise.all([
    client.from("leads").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    client.from("cases").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    client
      .from("cases")
      .select("estimated_compensation, status")
      .eq("customer_id", customerId)
      .in("status", ["approved", "paid", "closed"]),
  ]);

  const approvedCases = (approvedRows.data || []).length;
  const totalCompensation = (approvedRows.data || []).reduce(
    (sum, row) => sum + Number(row.estimated_compensation || 0),
    0,
  );

  const { error } = await client
    .from("customers")
    .update({
      total_leads: leadsCount.count || 0,
      total_cases: casesRows.count || 0,
      total_approved_cases: approvedCases,
      total_compensation: totalCompensation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    throw error;
  }
}

function deriveIssueType(lead) {
  if (lead.issue_type) return lead.issue_type;
  if (lead.disruption_type === "cancellation") return "Cancellation";
  if (lead.delay_duration === "cancelled") return "Cancellation";
  if (lead.delay_duration === "more_than_3") return "Delay";
  if (lead.delay_duration === "less_than_3") return "Delay";
  return "Other";
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function deriveReferralLifecycleStatus(caseRow, financeRow) {
  const caseStatus = String(caseRow?.status || "").toLowerCase();
  const payoutStatus = String(caseRow?.payout_status || "").toLowerCase();
  const paymentStatus = String(financeRow?.payment_status || "").toLowerCase();

  if (caseStatus === "rejected") {
    return "cancelled";
  }

  if (
    ["approved", "paid", "closed"].includes(caseStatus)
    || ["customer_paid", "referral_paid", "completed"].includes(payoutStatus)
    || ["customer_paid", "referral_paid", "completed"].includes(paymentStatus)
  ) {
    return "converted";
  }

  return caseRow?.id ? "case_created" : "lead_created";
}

function deriveCommissionStatus(caseRow, financeRow) {
  const caseStatus = String(caseRow?.status || "").toLowerCase();
  const payoutStatus = String(caseRow?.payout_status || "").toLowerCase();
  const paymentStatus = String(financeRow?.payment_status || "").toLowerCase();

  if (caseStatus === "rejected") {
    return "cancelled";
  }

  if (financeRow?.referral_paid_at || ["referral_paid", "completed"].includes(payoutStatus) || ["referral_paid", "completed"].includes(paymentStatus)) {
    return "paid";
  }

  if (["approved", "paid", "closed"].includes(caseStatus)) {
    return "approved";
  }

  return "pending";
}

function isCommissionTriggerState(caseRow, financeRow) {
  return deriveCommissionStatus(caseRow, financeRow) !== "pending"
    || Number(financeRow?.referral_commission || 0) > 0;
}

function calculateCommissionAmount(partner, caseRow, financeRow, commissionRate = null) {
  const explicitAmount = Number(financeRow?.referral_commission || 0);
  if (explicitAmount > 0) {
    return roundMoney(explicitAmount);
  }

  if (partner?.commission_type === "fixed") {
    return roundMoney(Number(partner?.commission_rate || 0));
  }

  const sourceAmount = Number(financeRow?.company_fee || caseRow?.company_fee || 0);
  if (!sourceAmount) {
    return 0;
  }

  const rate = Number(commissionRate ?? partner?.commission_rate ?? 0);
  if (!rate) {
    return 0;
  }

  return calculatePartnerCommissionFromRevenue(sourceAmount, rate).partnerCommission;
}

async function findReferralPartnerByField(client, field, value) {
  if (!value) {
    return null;
  }

  const result = await client
    .from("referral_partners")
    .select("id, name, public_name, referral_code, commission_type, commission_rate")
    .eq(field, value)
    .limit(1)
    .maybeSingle();

  if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
    throw result.error;
  }

  return result.data || null;
}

async function findReferralPartnerForContext(client, lead, caseRow) {
  const directPartnerId = lead?.referral_partner_id || caseRow?.referral_partner_id || null;
  const referralCode = lead?.source_details?.referral_code || null;
  const label = lead?.source_details?.referral_partner || lead?.payload?.referralPartner || caseRow?.referral_partner_label || null;

  if (directPartnerId) {
    const result = await findReferralPartnerByField(client, "id", directPartnerId);
    if (result?.id) {
      return result;
    }
  }

  if (referralCode) {
    const result = await findReferralPartnerByField(client, "referral_code", referralCode);
    if (result?.id) {
      return result;
    }
  }

  if (label) {
    const byCode = await findReferralPartnerByField(client, "referral_code", label);
    if (byCode?.id) {
      return byCode;
    }

    const byName = await findReferralPartnerByField(client, "name", label);
    if (byName?.id) {
      return byName;
    }
  }

  return null;
}

async function getPartnerTierRateForCurrentState(client, partnerId) {
  if (!partnerId) {
    return getPartnerCommissionRate(0);
  }

  const paidCommissions = await client
    .from("partner_commissions")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("status", "paid");

  if (paidCommissions.error && !isMissingOptionalTable(paidCommissions.error) && !isMissingColumnError(paidCommissions.error)) {
    throw paidCommissions.error;
  }

  return getPartnerCommissionRate(Number(paidCommissions.count || 0));
}

async function syncPartnerTotals(client, partnerId) {
  if (!partnerId) return;

  const [commissions, payouts] = await Promise.all([
    client
      .from("partner_commissions")
      .select("amount, status")
      .eq("partner_id", partnerId),
    client
      .from("referral_partner_payouts")
      .select("amount, status")
      .eq("partner_id", partnerId),
  ]);

  if (commissions.error && !isMissingOptionalTable(commissions.error) && !isMissingColumnError(commissions.error)) {
    throw commissions.error;
  }

  if (payouts.error && !isMissingOptionalTable(payouts.error) && !isMissingColumnError(payouts.error)) {
    throw payouts.error;
  }

  const totalEarned = roundMoney((commissions.data || [])
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const totalPaid = roundMoney((payouts.data || [])
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));

  await client
    .from("referral_partners")
    .update({
      total_earned: totalEarned,
      total_paid: totalPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);
}

async function syncCaseReferralAttribution(client, { lead, caseRow, financeRow }) {
  const partner = await findReferralPartnerForContext(client, lead, caseRow);
  if (!partner?.id) {
    return null;
  }

  const referralStatus = deriveReferralLifecycleStatus(caseRow, financeRow);
  const commissionStatus = deriveCommissionStatus(caseRow, financeRow);
  const tierRate = partner?.commission_type === "fixed"
    ? Number(partner?.commission_rate || 0)
    : await getPartnerTierRateForCurrentState(client, partner.id);
  const commissionAmount = calculateCommissionAmount(partner, caseRow, financeRow, tierRate);
  const existingReferral = lead?.id
    ? await client.from("referrals").select("id, attribution_meta").eq("lead_id", lead.id).maybeSingle()
    : caseRow?.id
      ? await client.from("referrals").select("id, attribution_meta").eq("case_id", caseRow.id).maybeSingle()
      : { data: null, error: null };

  if (existingReferral.error && !isMissingOptionalTable(existingReferral.error) && !isMissingColumnError(existingReferral.error)) {
    throw existingReferral.error;
  }

  const previousMeta = existingReferral.data?.attribution_meta || {};
  const attributionMeta = {
    ...previousMeta,
    partner_name: partner.public_name || partner.name || null,
    partner_referral_code: partner.referral_code || null,
    lead_code: lead?.lead_code || null,
    case_code: caseRow?.case_code || null,
    client_name: lead?.full_name || null,
    client_email: lead?.email || null,
    client_phone: lead?.phone || null,
    airline: caseRow?.airline || lead?.airline || null,
    route_from: caseRow?.route_from || lead?.departure_airport || null,
    route_to: caseRow?.route_to || lead?.arrival_airport || null,
    issue_type: caseRow?.issue_type || lead?.issue_type || lead?.disruption_type || null,
    flight_date: caseRow?.flight_date || lead?.scheduled_departure_date || null,
    case_status: caseRow?.status || null,
    payout_status: caseRow?.payout_status || null,
    finance_payment_status: financeRow?.payment_status || null,
    compensation_amount: Number(financeRow?.compensation_amount || caseRow?.estimated_compensation || lead?.estimated_compensation_eur || 0) || 0,
    compensation_currency: financeRow?.currency || lead?.compensation_currency || "EUR",
    company_fee: Number(financeRow?.company_fee || caseRow?.company_fee || 0) || 0,
    referral_commission_rate: tierRate,
    referral_commission_amount: commissionAmount,
    referral_commission_status: commissionStatus,
  };

  if (lead?.id || caseRow?.id) {
    const referralPayload = {
      id: existingReferral.data?.id || undefined,
      partner_id: partner.id,
      client_profile_id: lead?.profile_id || null,
      customer_id: caseRow?.customer_id || lead?.customer_id || null,
      lead_id: lead?.id || null,
      case_id: caseRow?.id || null,
      referral_code: lead?.source_details?.referral_code || partner.referral_code || null,
      source_url: lead?.source_details?.referral_source_url || null,
      source_path: lead?.source_details?.referral_source_path || null,
      status: referralStatus,
      attribution_meta: attributionMeta,
      updated_at: new Date().toISOString(),
    };

    const result = existingReferral.data?.id
      ? await client
      .from("referrals")
      .update(referralPayload)
      .eq("id", existingReferral.data.id)
      : await client
      .from("referrals")
      .insert({
        id: existingReferral.data?.id || undefined,
        partner_id: partner.id,
        client_profile_id: lead?.profile_id || null,
        customer_id: caseRow?.customer_id || lead?.customer_id || null,
        lead_id: lead?.id || null,
        case_id: caseRow?.id || null,
        referral_code: lead?.source_details?.referral_code || partner.referral_code || null,
        source_url: lead?.source_details?.referral_source_url || null,
        source_path: lead?.source_details?.referral_source_path || null,
        status: referralStatus,
        attribution_meta: attributionMeta,
        updated_at: new Date().toISOString(),
      });

    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }

  const updatePayload = {
    referral_partner_id: partner.id,
    referral_partner_label: partner.referral_code || partner.public_name || partner.name || null,
    updated_at: new Date().toISOString(),
  };

  if (caseRow?.id) {
    await client
      .from("cases")
      .update(updatePayload)
      .eq("id", caseRow.id);
  }

  if (lead?.id) {
    await client
      .from("leads")
      .update({
        referral_partner_id: partner.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  }

  return partner;
}

async function syncPartnerCommissionForCase(client, { lead, caseRow, financeRow }) {
  const partner = await syncCaseReferralAttribution(client, { lead, caseRow, financeRow });
  if (!partner?.id || !caseRow?.id) {
    return null;
  }

  const nextStatus = deriveCommissionStatus(caseRow, financeRow);
  const existing = await client
    .from("partner_commissions")
    .select("*")
    .eq("partner_id", partner.id)
    .eq("case_id", caseRow.id)
    .maybeSingle();

  if (existing.error && !isMissingOptionalTable(existing.error) && !isMissingColumnError(existing.error)) {
    throw existing.error;
  }

  const previous = existing.data || null;
  const nextRate = partner?.commission_type === "fixed"
    ? Number(partner?.commission_rate || 0)
    : Number(previous?.commission_rate || await getPartnerTierRateForCurrentState(client, partner.id));
  const nextAmount = calculateCommissionAmount(partner, caseRow, financeRow, nextRate);

  if (!existing.data && !isCommissionTriggerState(caseRow, financeRow) && nextAmount <= 0) {
    return null;
  }

  const approvedAt = nextStatus === "approved" || nextStatus === "paid"
    ? previous?.approved_at || new Date().toISOString()
    : null;
  const paidAt = nextStatus === "paid"
    ? previous?.paid_at || financeRow?.referral_paid_at || new Date().toISOString()
    : null;

  const payload = {
    partner_id: partner.id,
    lead_id: lead?.id || null,
    case_id: caseRow.id,
    amount: nextAmount,
    currency: financeRow?.currency || "EUR",
    commission_rate: nextRate,
    source_amount: Number(financeRow?.company_fee || caseRow?.company_fee || 0) || null,
    status: nextStatus,
    approved_at: approvedAt,
    paid_at: paidAt,
    notes: existing.data?.notes || null,
  };

  const result = existing.data
    ? await client.from("partner_commissions").update(payload).eq("id", existing.data.id)
    : await client.from("partner_commissions").insert({ id: crypto.randomUUID(), ...payload });

  if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
    throw result.error;
  }

  await syncPartnerTotals(client, partner.id);
  return partner.id;
}

export async function convertLeadToCase(leadId) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, lead_code, status, customer_id, profile_id, referral_partner_id, source, source_details, departure_airport, arrival_airport, airline, scheduled_departure_date, issue_type, disruption_type, full_name, email, phone, country, preferred_language, city, reason, payload, estimated_compensation_eur, compensation_currency")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    throw leadError;
  }

  if (!lead) {
    throw new Error("Lead not found.");
  }

  const existingCase = await client
    .from("cases")
    .select("id, case_code")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existingCase.error && !isMissingOptionalTable(existingCase.error) && !isMissingColumnError(existingCase.error)) {
    throw existingCase.error;
  }

  if (existingCase.data?.id) {
    return { caseId: existingCase.data.id, caseCode: existingCase.data.case_code, alreadyExists: true };
  }

  let customerId = lead.customer_id || null;

  if (!customerId) {
    let existingCustomer = null;

    if (lead.email) {
      const byEmail = await client
        .from("customers")
        .select("id")
        .eq("email", lead.email)
        .limit(1)
        .maybeSingle();

      if (byEmail.error && !isMissingOptionalTable(byEmail.error) && !isMissingColumnError(byEmail.error)) {
        throw byEmail.error;
      }

      existingCustomer = byEmail.data;
    }

    if (!existingCustomer && lead.phone) {
      const byPhone = await client
        .from("customers")
        .select("id")
        .eq("phone", lead.phone)
        .limit(1)
        .maybeSingle();

      if (byPhone.error && !isMissingOptionalTable(byPhone.error) && !isMissingColumnError(byPhone.error)) {
        throw byPhone.error;
      }

      existingCustomer = byPhone.data;
    }

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
      const { error: customerUpdateError } = await client
        .from("customers")
        .update({
          full_name: lead.full_name || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          country: lead.country || undefined,
          preferred_language: lead.preferred_language || undefined,
          profile_id: lead.profile_id || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (customerUpdateError) {
        throw customerUpdateError;
      }
    } else {
      customerId = crypto.randomUUID();
      const { error: customerCreateError } = await client
        .from("customers")
        .insert({
          id: customerId,
          full_name: lead.full_name || lead.email || lead.phone || "Unknown customer",
          email: lead.email || null,
          phone: lead.phone || null,
          country: lead.country || null,
          preferred_language: lead.preferred_language || null,
          profile_id: lead.profile_id || null,
          notes: lead.reason || null,
        });

      if (customerCreateError) {
        if (isMissingOptionalTable(customerCreateError) || isMissingColumnError(customerCreateError)) {
          throw new Error("Apply Core Operations schema V1 in Supabase to enable customer and case conversion.");
        }

        throw customerCreateError;
      }
    }
  }

  const normalizedSource = String(lead.source || "").trim().toLowerCase();
  const rawLeadCode = String(lead.lead_code || "").trim();
  const normalizedLeadCode = normalizeLeadCode(rawLeadCode);
  const isModernClaimFlow = normalizedSource === "claim_flow" && isModernLeadCode(rawLeadCode);
  const isClaimFlow = normalizedSource === "claim_flow";
  if (isClaimFlow && !isModernClaimFlow) {
    throw new Error("Claim-flow lead has invalid lead_code. Expected FF-0001 format.");
  }

  const caseCode = isModernClaimFlow
    ? deriveCaseCodeFromLeadCode(rawLeadCode)
    : (rawLeadCode || null);

  if (!caseCode) {
    throw new Error("Lead reference is missing. Deterministic case conversion requires an existing lead code.");
  }

  if (isModernClaimFlow) {
    const conflictingCase = await client
      .from("cases")
      .select("id, lead_id, case_code")
      .eq("case_code", caseCode)
      .maybeSingle();

    if (conflictingCase.error && !isMissingOptionalTable(conflictingCase.error) && !isMissingColumnError(conflictingCase.error)) {
      throw conflictingCase.error;
    }

    if (conflictingCase.data?.id && conflictingCase.data.lead_id !== lead.id) {
      throw new Error(`Case code collision for ${caseCode}. Do not generate another suffix automatically.`);
    }
  }

  const caseId = crypto.randomUUID();
  const now = new Date().toISOString();
  const partner = await findReferralPartnerForContext(client, lead, null).catch(() => null);
  const estimatedCompensation = roundMoney(lead.estimated_compensation_eur || 0);
  const compensationCurrency = lead.compensation_currency || "EUR";

  const { error: caseError } = await client
    .from("cases")
    .insert({
      id: caseId,
      case_code: caseCode,
      lead_id: lead.id,
      customer_id: customerId,
      profile_id: lead.profile_id || null,
      airline: lead.airline || null,
      route_from: lead.departure_airport || null,
      route_to: lead.arrival_airport || null,
      flight_date: lead.scheduled_departure_date || null,
      issue_type: deriveIssueType(lead),
      status: "documents_pending",
      payout_status: "not_started",
      priority: "normal",
      estimated_compensation: estimatedCompensation,
      notes: lead.reason || lead.payload?.reason || null,
      referral_partner_id: partner?.id || lead.referral_partner_id || null,
      referral_partner_label: partner?.referral_code || lead.source_details?.referral_partner || lead.payload?.referralPartner || lead.source || null,
      created_by: user?.id || null,
    });

  if (caseError) {
    if (isMissingOptionalTable(caseError) || isMissingColumnError(caseError)) {
      throw new Error("Apply Core Operations schema V1 and Cases Module V1 in Supabase to enable case conversion.");
    }

    throw caseError;
  }

  const { error: leadUpdateError } = await client
    .from("leads")
    .update({
      status: "converted",
      customer_id: customerId,
      referral_partner_id: partner?.id || lead.referral_partner_id || null,
      updated_at: now,
      ...(
        isModernClaimFlow
          && normalizedLeadCode
          && normalizedLeadCode !== rawLeadCode
          ? { lead_code: normalizedLeadCode }
          : {}
      ),
    })
    .eq("id", lead.id);

  if (leadUpdateError) {
    throw leadUpdateError;
  }

  const [historyResult, financeResult, leadDocumentsResult] = await Promise.all([
    client.from("case_status_history").insert({
      case_id: caseId,
      previous_status: null,
      next_status: "documents_pending",
      changed_by: user?.id || null,
      note: "Case created from lead conversion.",
    }),
    client.from("case_finance").insert({
      case_id: caseId,
      compensation_amount: estimatedCompensation,
      company_fee: 0,
      customer_payout: 0,
      referral_commission: 0,
      agent_bonus: 0,
      payment_status: "not_started",
      currency: compensationCurrency,
    }),
    client
      .from("lead_documents")
      .select("id, document_type, file_path, file_name, mime_type, file_size, status")
      .eq("lead_id", lead.id),
  ]);

  if (historyResult.error && !isMissingOptionalTable(historyResult.error)) {
    throw historyResult.error;
  }

  if (financeResult.error && !isMissingOptionalTable(financeResult.error)) {
    throw financeResult.error;
  }

  if (leadDocumentsResult.error && !isMissingOptionalTable(leadDocumentsResult.error)) {
    throw leadDocumentsResult.error;
  }

  const leadDocuments = leadDocumentsResult.data || [];
  if (leadDocuments.length) {
    const { error: caseDocsError } = await client
      .from("case_documents")
      .insert(
        leadDocuments.map((document) => ({
          case_id: caseId,
          document_type: document.document_type,
          file_path: document.file_path,
          file_name: document.file_name,
          mime_type: document.mime_type,
          file_size: document.file_size,
          status: document.status || "uploaded",
          source_document_id: document.id,
          created_by: user?.id || null,
        })),
      );

    if (caseDocsError && !isMissingOptionalTable(caseDocsError)) {
      throw caseDocsError;
    }
  }

  const historyLead = await client
    .from("lead_status_history")
    .insert({
      lead_id: lead.id,
      previous_status: lead.status || null,
      next_status: "converted",
      changed_by: user?.id || null,
      note: `Converted to case ${caseCode}.`,
    });

  if (historyLead.error && !isMissingOptionalTable(historyLead.error)) {
    throw historyLead.error;
  }

  await syncPartnerCommissionForCase(client, {
    lead,
    caseRow: {
      id: caseId,
      case_code: caseCode,
      customer_id: customerId,
      company_fee: 0,
      status: "documents_pending",
      payout_status: "not_started",
      referral_partner_id: partner?.id || lead.referral_partner_id || null,
      referral_partner_label: partner?.referral_code || null,
    },
    financeRow: {
      case_id: caseId,
      company_fee: 0,
      referral_commission: 0,
      currency: "EUR",
      payment_status: "not_started",
    },
  }).catch(() => null);

  await syncCustomerStats(client, customerId);
  await recordActivity(client, {
    userId: user?.id,
    action: "convert",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: lead.id,
    previousValue: { status: lead.status, customer_id: lead.customer_id || null },
    newValue: { status: "converted", customer_id: customerId, case_id: caseId, case_code: caseCode },
    meta: { case_code: caseCode, lead_code: lead.lead_code },
  });
  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "cases",
    targetEntityType: "case",
    targetEntityId: caseId,
    newValue: { case_code: caseCode, lead_id: lead.id, customer_id: customerId, status: "documents_pending" },
    meta: { source: "lead_conversion", lead_code: lead.lead_code },
  });

  notifyAdmin({
    type: "lead_converted",
    severity: "info",
    title: "Lead converted to case",
    body: `${lead.lead_code || "Lead"} became ${caseCode}.`,
    module: "cases",
    entityType: "case",
    entityId: caseId,
    actionUrl: `/admin/operations/cases?case=${caseId}`,
    recipientRole: "owner",
  });

  return { caseId, caseCode, customerId, alreadyExists: false };
}

export async function fetchCustomersModuleData(options = {}) {
  await assertCustomersModuleReadAccess();

  return withAdminModuleCache("customers-module", async () => {
    const client = requireSupabase();
    const activeCustomerCaseStatuses = ["documents_pending", "ready_to_submit", "submitted_to_airline", "awaiting_response", "approved", "payment_processing"];
    const fetchProfiles = async () => {
      const primary = await client
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at, status, last_login_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (primary.error && isMissingColumnError(primary.error)) {
        return client
          .from("profiles")
          .select("id, full_name, email, phone, role, created_at")
          .order("created_at", { ascending: false })
          .limit(500);
      }

      return primary;
    };

    const [customers, leads, cases, communications, profiles, finance, leadDocuments, caseDocuments, leadSignatures, referrals] = await Promise.all([
      client
        .from("customers")
        .select("id, full_name, email, phone, country, preferred_language, notes, total_leads, total_cases, total_approved_cases, total_compensation, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(300),
      client
        .from("leads")
        .select("id, lead_code, customer_id, status, stage, full_name, email, phone, departure_airport, arrival_airport, airline, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      client
        .from("cases")
        .select("id, case_code, customer_id, status, payout_status, airline, route_from, route_to, estimated_compensation, created_at, updated_at, paid_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      client
        .from("communications")
        .select("id, customer_id, entity_type, entity_id, channel, direction, subject, body, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      fetchProfiles(),
      client
        .from("case_finance")
        .select("id, case_id, compensation_amount, customer_payout, payment_status, currency, updated_at, customer_paid_at")
        .order("updated_at", { ascending: false })
        .limit(600),
      client
        .from("lead_documents")
        .select("id, lead_id, document_type, status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(800),
      client
        .from("case_documents")
        .select("id, case_id, document_type, status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(800),
      client
        .from("lead_signatures")
        .select("id, lead_id, terms_accepted, signed_at, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("referrals")
        .select("id, partner_id, customer_id, lead_id, case_id, referral_code, attribution_meta, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(600),
    ]);

    const requiredErrors = [customers, leads, cases].map((result) => result.error).filter(Boolean);
    if (requiredErrors.length) {
      if (requiredErrors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
        return {
          customers: [],
          leads: leads.data || [],
          cases: cases.data || [],
          communications: communications.data || [],
          profiles: [],
          finance: [],
          leadDocuments: [],
          caseDocuments: [],
          leadSignatures: [],
          supportsCustomersModuleV1: false,
          supportsCustomerProfiles: false,
          supportsCustomerFinance: false,
          supportsCustomerDocuments: false,
        };
      }
      throw requiredErrors[0];
    }

    if (communications.error && !isMissingOptionalTable(communications.error)) {
      throw communications.error;
    }

    if (profiles.error && !isMissingOptionalTable(profiles.error) && !isMissingColumnError(profiles.error)) {
      throw profiles.error;
    }

    if (finance.error && !isMissingOptionalTable(finance.error) && !isMissingColumnError(finance.error)) {
      throw finance.error;
    }

    if (leadDocuments.error && !isMissingOptionalTable(leadDocuments.error) && !isMissingColumnError(leadDocuments.error)) {
      throw leadDocuments.error;
    }

    if (caseDocuments.error && !isMissingOptionalTable(caseDocuments.error) && !isMissingColumnError(caseDocuments.error)) {
      throw caseDocuments.error;
    }

    if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error) && !isMissingColumnError(leadSignatures.error)) {
      throw leadSignatures.error;
    }

    if (referrals.error && !isMissingOptionalTable(referrals.error) && !isMissingColumnError(referrals.error)) {
      throw referrals.error;
    }

    return {
      customers: customers.data || [],
      leads: leads.data || [],
      cases: (cases.data || []).map((item) => ({
        ...item,
        is_active_customer_case: activeCustomerCaseStatuses.includes(String(item.status || "").toLowerCase()),
      })),
      communications: communications.data || [],
      profiles: profiles.data || [],
      finance: finance.data || [],
      leadDocuments: leadDocuments.data || [],
      caseDocuments: caseDocuments.data || [],
      leadSignatures: leadSignatures.data || [],
      referrals: referrals.data || [],
      supportsCustomersModuleV1: true,
      supportsCustomerProfiles: !profiles.error,
      supportsCustomerFinance: !finance.error,
      supportsCustomerDocuments: !leadDocuments.error && !caseDocuments.error,
      supportsCustomerReferrals: !referrals.error,
    };
  }, options);
}

export async function updateCustomerProfile(customerId, updates) {
  await assertCustomersEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("customers").select("*").eq("id", customerId).maybeSingle();
  const { error } = await client
    .from("customers")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "customers",
    targetEntityType: "customer",
    targetEntityId: customerId,
    previousValue: current.data || null,
    newValue: updates,
  });
}

export async function fetchTasksModuleData() {
  await assertTasksModuleReadAccess();

  const client = requireSupabase();

  const [tasks, assignableUsers, leads, cases, customers, documents, finance, partners, activityLogs] = await Promise.all([
    client
      .from("tasks")
      .select("id, title, description, related_entity_type, related_entity_id, assigned_user_id, priority, status, task_type, due_date, reminder_at, created_by, completed_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(400),
    fetchAssignableAdminProfiles(client),
    client
      .from("leads")
      .select("id, lead_code, full_name, email, departure_airport, arrival_airport, airline, distance_km, distance_band, estimated_compensation_eur, compensation_currency, estimate_status, estimate_explanation")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("cases")
      .select("id, case_code, lead_id, customer_id, airline, route_from, route_to, status, estimated_compensation, payout_status")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("case_documents")
      .select("id, case_id, document_type, file_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, customer_payout, company_fee, payment_status, currency, updated_at")
      .order("updated_at", { ascending: false })
      .limit(400),
    client
      .from("referral_partners")
      .select("id, name, public_name, referral_code, status")
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("activity_logs")
      .select("id, user_id, action, module, target_entity_type, target_entity_id, previous_value, new_value, meta, created_at")
      .eq("module", "tasks")
      .order("created_at", { ascending: false })
      .limit(800),
  ]);

  const errors = [leads, cases, customers].map((result) => result.error).filter(Boolean);
  if (errors.length) {
    if (errors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        tasks: [],
        assignableUsers: [],
        leads: [],
        cases: [],
        customers: [],
        documents: [],
        finance: [],
        partners: [],
        activityLogs: [],
        supportsTasksModuleV1: false,
        supportsTaskActivity: false,
      };
    }
    throw errors[0];
  }

  if (tasks.error) {
    if (isMissingOptionalTable(tasks.error) || isMissingColumnError(tasks.error)) {
      return {
        tasks: [],
        assignableUsers,
        leads: leads.data || [],
        cases: cases.data || [],
        customers: customers.data || [],
        documents: [],
        finance: [],
        partners: [],
        activityLogs: [],
        supportsTasksModuleV1: false,
        supportsTaskActivity: false,
      };
    }
    throw tasks.error;
  }

  const optionalErrors = [documents, finance, partners, activityLogs].map((result) => result.error).filter(Boolean);
  if (optionalErrors.some((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error))) {
    throw optionalErrors.find((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error));
  }

  return {
    tasks: tasks.data || [],
    assignableUsers,
    leads: leads.data || [],
    cases: cases.data || [],
    customers: customers.data || [],
    documents: documents.data || [],
    finance: finance.data || [],
    partners: partners.data || [],
    activityLogs: activityLogs.data || [],
    supportsTasksModuleV1: true,
    supportsTaskActivity: !activityLogs.error,
  };
}

export async function createTask(taskInput) {
  await assertTasksEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    title: taskInput.title,
    description: taskInput.description || null,
    related_entity_type: taskInput.related_entity_type,
    related_entity_id: taskInput.related_entity_id,
    assigned_user_id: taskInput.assigned_user_id || null,
    priority: taskInput.priority || "medium",
    status: taskInput.status || "todo",
    task_type: taskInput.task_type || null,
    due_date: taskInput.due_date || null,
    reminder_at: taskInput.reminder_at || null,
    created_by: user?.id || null,
    completed_at: taskInput.status === "done" ? new Date().toISOString() : null,
  };

  const { data, error } = await client
    .from("tasks")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (taskInput.related_entity_type === "case") {
    const rel = await client
      .from("case_tasks")
      .insert({ case_id: taskInput.related_entity_id, task_id: payload.id });

    if (rel.error && !isMissingOptionalTable(rel.error)) {
      throw rel.error;
    }
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "tasks",
    targetEntityType: "task",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { related_entity_type: taskInput.related_entity_type, related_entity_id: taskInput.related_entity_id },
  });

  notifyAdmin({
    type: "task_created",
    severity: payload.priority === "urgent" || payload.priority === "high" ? "warning" : "info",
    title: payload.assigned_user_id ? "New task assigned" : "New task created",
    body: payload.title,
    module: "tasks",
    entityType: "task",
    entityId: payload.id,
    actionUrl: `/admin/operations/tasks?task=${payload.id}`,
    recipientProfileId: payload.assigned_user_id || null,
  });

  return data;
}

export async function updateTask(taskId, updates) {
  await assertTasksEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("tasks").select("*").eq("id", taskId).maybeSingle();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.status === "done") {
    payload.completed_at = new Date().toISOString();
  } else if (updates.status && updates.status !== "done") {
    payload.completed_at = null;
  }

  const { error } = await client
    .from("tasks")
    .update(payload)
    .eq("id", taskId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "tasks",
    targetEntityType: "task",
    targetEntityId: taskId,
    previousValue: current.data || null,
    newValue: payload,
  });

  const previous = current.data || {};
  if (updates.status && updates.status !== previous.status) {
    notifyAdmin({
      type: "task_status_changed",
      severity: updates.status === "cancelled" ? "warning" : "info",
      title: "Task status changed",
      body: `${previous.title || "Task"} moved to ${updates.status}.`,
      module: "tasks",
      entityType: "task",
      entityId: taskId,
      actionUrl: `/admin/operations/tasks?task=${taskId}`,
      recipientProfileId: previous.assigned_user_id || updates.assigned_user_id || null,
    });
  }

  if (updates.assigned_user_id && updates.assigned_user_id !== previous.assigned_user_id) {
    notifyAdmin({
      type: "task_assigned",
      severity: ["urgent", "high"].includes(updates.priority || previous.priority) ? "warning" : "info",
      title: "Task assigned to you",
      body: previous.title || updates.title || "Task assignment updated.",
      module: "tasks",
      entityType: "task",
      entityId: taskId,
      actionUrl: `/admin/operations/tasks?task=${taskId}`,
      recipientProfileId: updates.assigned_user_id,
    });
  }
}

export async function fetchCommunicationsModuleData() {
  await assertCommunicationsModuleReadAccess();

  const client = requireSupabase();

  const [communications, profiles, leads, cases, customers] = await Promise.all([
    client
      .from("communications")
      .select("id, entity_type, entity_id, customer_id, channel, direction, subject, body, meta, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
    client
      .from("leads")
      .select("id, lead_code, customer_id, full_name, email, airline, departure_airport, arrival_airport")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("cases")
      .select("id, case_code, customer_id, airline, route_from, route_to, status")
      .order("created_at", { ascending: false })
      .limit(400),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const requiredErrors = [profiles, leads, cases, customers].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    if (requiredErrors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        communications: [],
        assignableUsers: [],
        leads: [],
        cases: [],
        customers: [],
        supportsCommunicationsModuleV1: false,
      };
    }
    throw requiredErrors[0];
  }

  if (communications.error) {
    if (isMissingOptionalTable(communications.error) || isMissingColumnError(communications.error)) {
      return {
        communications: [],
        assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
        leads: leads.data || [],
        cases: cases.data || [],
        customers: customers.data || [],
        supportsCommunicationsModuleV1: false,
      };
    }
    throw communications.error;
  }

  return {
    communications: communications.data || [],
    assignableUsers: (profiles.data || []).filter((profile) => profile.role !== "customer"),
    leads: leads.data || [],
    cases: cases.data || [],
    customers: customers.data || [],
    supportsCommunicationsModuleV1: true,
  };
}

export async function createCommunication(input) {
  await assertCommunicationsEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);

  let customerId = input.customer_id || null;

  if (!customerId && input.entity_type === "lead") {
    const response = await client.from("leads").select("customer_id").eq("id", input.entity_id).maybeSingle();
    if (!response.error) {
      customerId = response.data?.customer_id || null;
    }
  }

  if (!customerId && input.entity_type === "case") {
    const response = await client.from("cases").select("customer_id").eq("id", input.entity_id).maybeSingle();
    if (!response.error) {
      customerId = response.data?.customer_id || null;
    }
  }

  if (!customerId && input.entity_type === "customer") {
    customerId = input.entity_id;
  }

  const payload = {
    id: crypto.randomUUID(),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    customer_id: customerId,
    channel: input.channel,
    direction: input.direction || "internal",
    subject: input.subject || null,
    body: input.body || null,
    meta: input.meta || {},
    created_by: user?.id || null,
  };

  const { data, error } = await client
    .from("communications")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (input.entity_type === "case") {
    const relation = await client
      .from("case_communications")
      .insert({
        case_id: input.entity_id,
        communication_id: payload.id,
      });

    if (relation.error && !isMissingOptionalTable(relation.error)) {
      throw relation.error;
    }
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "communications",
    targetEntityType: "communication",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { linked_entity_type: input.entity_type, linked_entity_id: input.entity_id },
  });

  return data;
}

export async function fetchDocumentsCenterData() {
  await assertDocumentsModuleReadAccess();

  const client = requireSupabase();

  const [leadDocuments, caseDocuments, claimDocuments, leadSignatures, leads, cases, claims, customers, tasks] = await Promise.all([
    client
      .from("lead_documents")
      .select("id, lead_id, document_type, file_path, file_name, mime_type, file_size, status, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_documents")
      .select("id, case_id, document_type, file_path, file_name, mime_type, file_size, status, source_document_id, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("documents")
      .select("id, claim_id, user_id, document_type, file_path, file_name, mime_type, file_size, status, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("lead_signatures")
      .select("id, lead_id, signer_name, signer_email, terms_accepted, signed_at, signature_data_url, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("leads")
      .select("id, lead_code, customer_id, full_name, email, departure_airport, arrival_airport, airline, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("cases")
      .select("id, case_code, customer_id, route_from, route_to, airline, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("claims")
      .select("id, claim_code, user_id")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("tasks")
      .select("id, title, status, priority, related_entity_type, related_entity_id, assigned_user_id, due_date, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  const requiredErrors = [leadDocuments, claimDocuments, leads, cases, claims, customers].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  if (caseDocuments.error && !isMissingOptionalTable(caseDocuments.error) && !isMissingColumnError(caseDocuments.error)) {
    throw caseDocuments.error;
  }

  if (leadSignatures.error && !isMissingOptionalTable(leadSignatures.error)) {
    throw leadSignatures.error;
  }

  if (tasks.error && !isMissingOptionalTable(tasks.error) && !isMissingColumnError(tasks.error)) {
    throw tasks.error;
  }

  const documents = [
    ...(leadDocuments.data || []).map((item) => ({ ...item, owner_type: "lead", owner_id: item.lead_id, bucket: "claim-lead-documents", kind: "document" })),
    ...(caseDocuments.data || []).map((item) => ({
      ...item,
      owner_type: "case",
      owner_id: item.case_id,
      bucket: String(item.file_path || "").startsWith("leads/") ? "claim-lead-documents" : "case-documents",
      kind: "document",
    })),
    ...(claimDocuments.data || []).map((item) => ({ ...item, owner_type: "claim", owner_id: item.claim_id, bucket: "claim-documents", kind: "document" })),
    ...(leadSignatures.data || []).map((item) => ({ ...item, owner_type: "lead", owner_id: item.lead_id, kind: "signature", status: item.terms_accepted ? "signed" : "pending" })),
  ];

  return {
    documents,
    leads: leads.data || [],
    cases: cases.data || [],
    claims: claims.data || [],
    customers: customers.data || [],
    tasks: tasks.data || [],
    supportsDocumentsCenterV1: !caseDocuments.error,
    supportsSignatures: !leadSignatures.error,
    supportsTasksLinking: !tasks.error,
  };
}

export async function fetchFinanceModuleData(options = {}) {
  return withAdminModuleCache("finance-module", async () => {
    const client = requireSupabase();

  const [finance, cases, customers, profiles] = await Promise.all([
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, agent_bonus, payment_status, payment_method, currency, notes, payment_received_at, customer_paid_at, referral_paid_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("cases")
      .select("id, case_code, customer_id, airline, route_from, route_to, status, payout_status, referral_partner_label, assigned_manager_id, estimated_compensation, created_at, updated_at, approved_at, paid_at, closed_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("customers")
      .select("id, full_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
  ]);

  const errors = [cases, customers, profiles].map((result) => result.error).filter(Boolean);
  if (errors.length) {
    if (errors.some((error) => isMissingOptionalTable(error) || isMissingColumnError(error))) {
      return {
        finance: [],
        cases: [],
        customers: [],
        profiles: [],
        supportsFinanceModuleV1: false,
      };
    }
    throw errors[0];
  }

  if (finance.error) {
    if (isMissingOptionalTable(finance.error) || isMissingColumnError(finance.error)) {
      return {
        finance: [],
        cases: cases.data || [],
        customers: customers.data || [],
        profiles: profiles.data || [],
        supportsFinanceModuleV1: false,
      };
    }
    throw finance.error;
  }

    return {
      finance: finance.data || [],
      cases: cases.data || [],
      customers: customers.data || [],
      profiles: profiles.data || [],
      supportsFinanceModuleV1: true,
    };
  }, options);
}

export async function updateCaseFinance(financeId, updates) {
  await assertCurrentAdminPermission("finance.edit", {
    message: "You do not have access to update finance data.",
  });

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("case_finance").select("*").eq("id", financeId).maybeSingle();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("case_finance")
    .update(payload)
    .eq("id", financeId);

  if (error) {
    throw error;
  }

  if (current.data?.case_id) {
    const [caseResponse, updatedFinance] = await Promise.all([
      client.from("cases").select("*").eq("id", current.data.case_id).maybeSingle(),
      client.from("case_finance").select("*").eq("id", financeId).maybeSingle(),
    ]);

    const caseRow = caseResponse.data || null;
    const leadId = caseRow?.lead_id || null;
    const leadRow = leadId
      ? (await client.from("leads").select("*").eq("id", leadId).maybeSingle()).data || null
      : null;

    await syncPartnerCommissionForCase(client, {
      lead: leadRow,
      caseRow,
      financeRow: updatedFinance.data || { ...current.data, ...payload },
    }).catch(() => null);
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "finance",
    targetEntityType: "case_finance",
    targetEntityId: financeId,
    previousValue: current.data || null,
    newValue: payload,
  });

  void logAdminActivity("update_finance_record", "case_finance", financeId, {
    module: "finance",
    case_id: current.data?.case_id || null,
    fields: Object.keys(updates || {}),
    payment_status: payload.payment_status || current.data?.payment_status || null,
  });
}

function matchPartnerForRow(row, partners = []) {
  return partners.find((partner) => {
    const label = String(row.referral_partner_label || "").toLowerCase();
    return row.referral_partner_id === partner.id
      || (label && (label === String(partner.name || "").toLowerCase()
        || label === String(partner.referral_code || "").toLowerCase()));
  }) || null;
}

export async function fetchReferralPartnersModuleData(options = {}) {
  await assertReferralModuleReadAccess();

  return withAdminModuleCache("referral-partners-module", async () => {
    const client = requireSupabase();

  const [partners, payouts, leads, cases, finance, commissions, referrals] = await Promise.all([
    client
      .from("referral_partners")
      .select("id, profile_id, name, public_name, contact_name, contact_email, contact_phone, referral_code, referral_link, commission_type, commission_rate, status, portal_status, application_reason, website_url, instagram_url, tiktok_url, youtube_url, total_earned, total_paid, notes, created_at, updated_at, approved_at, rejected_at, suspended_at")
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("referral_partner_payouts")
      .select("id, partner_id, case_id, amount, currency, status, payout_method, payment_reference, note, paid_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("leads")
      .select("id, lead_code, customer_id, referral_partner_id, source, source_details, payload, status, stage, full_name, email, phone, country, preferred_language, departure_airport, arrival_airport, airline, disruption_type, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(600),
    client
      .from("cases")
      .select("id, case_code, lead_id, customer_id, referral_partner_id, referral_partner_label, status, payout_status, estimated_compensation, airline, route_from, route_to, created_at, updated_at, paid_at")
      .order("updated_at", { ascending: false })
      .limit(600),
    client
      .from("case_finance")
      .select("id, case_id, referral_commission, payment_status, referral_paid_at, currency, updated_at")
      .order("updated_at", { ascending: false })
      .limit(600),
    client
      .from("partner_commissions")
      .select("id, partner_id, lead_id, case_id, amount, currency, commission_rate, source_amount, status, created_at, approved_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(600),
    client
      .from("referrals")
      .select("id, partner_id, client_profile_id, customer_id, lead_id, case_id, referral_code, source_url, source_path, status, attribution_meta, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  const baseErrors = [leads, cases].map((result) => result.error).filter(Boolean);
  if (baseErrors.length) {
    throw baseErrors[0];
  }

  const optionalErrors = [partners, payouts, finance, commissions, referrals].map((result) => result.error).filter(Boolean);
  if (optionalErrors.some((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error))) {
    throw optionalErrors.find((error) => !isMissingOptionalTable(error) && !isMissingColumnError(error));
  }

    return {
      partners: partners.data || [],
      payouts: payouts.data || [],
      leads: leads.data || [],
      cases: cases.data || [],
      finance: finance.data || [],
      commissions: commissions.data || [],
      referrals: referrals.data || [],
      supportsPartnersModuleV1: !partners.error,
      supportsReferralsModuleV1: !referrals.error,
    };
  }, options);
}

export async function fetchReferralControlCenterData(options = {}) {
  await assertReferralModuleReadAccess();

  return withAdminModuleCache("referral-control-center-module", async () => {
    const client = requireSupabase();

  const [partnerModule, applicationsModule, referrals, customers] = await Promise.all([
    fetchReferralPartnersModuleData(),
    fetchPartnerApplicationsModuleData(),
    client
      .from("referrals")
      .select("id, partner_id, client_profile_id, customer_id, lead_id, case_id, referral_code, source_url, source_path, status, attribution_meta, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(800),
    client
      .from("customers")
      .select("id, full_name, email, phone, country, preferred_language, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  if (referrals.error && !isMissingOptionalTable(referrals.error) && !isMissingColumnError(referrals.error)) {
    throw referrals.error;
  }

  if (customers.error && !isMissingOptionalTable(customers.error) && !isMissingColumnError(customers.error)) {
    throw customers.error;
  }

    return {
      ...partnerModule,
      ...applicationsModule,
      referrals: referrals.data || [],
      customers: customers.data || [],
      supportsReferralsModuleV1: !referrals.error,
      supportsReferralCustomersV1: !customers.error,
    };
  }, options);
}

export async function fetchPartnerApplicationsModuleData(options = {}) {
  await assertReferralModuleReadAccess();

  return withAdminModuleCache("partner-applications-module", async () => {
    const client = requireSupabase();

  const { data, error } = await client
    .from("partner_applications")
    .select("id, profile_id, email, full_name, phone, country, preferred_language, public_name, website_url, instagram_url, tiktok_url, youtube_url, primary_platform, audience_size, audience_countries, niche, content_links, motivation, consent_accepted, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  const reviewerIds = Array.from(new Set((data || []).map((item) => item.reviewed_by).filter(Boolean)));
  let reviewersById = new Map();

  if (reviewerIds.length) {
    const reviewers = await client
      .from("profiles")
      .select("id, full_name, email")
      .in("id", reviewerIds);

    if (reviewers.error && !isMissingColumnError(reviewers.error)) {
      throw reviewers.error;
    }

    reviewersById = new Map((reviewers.data || []).map((item) => [item.id, item]));
  }

  const normalizePartnerApplicationStatus = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "pending";
    if (["pending", "pending_review", "under_review", "submitted", "received"].includes(normalized)) {
      return "pending";
    }
    if (["approved", "rejected", "cancelled"].includes(normalized)) {
      return normalized;
    }
    return normalized;
  };

    return {
      applications: (data || []).map((item) => ({
        ...item,
        status: normalizePartnerApplicationStatus(item.status),
        reviewer: item.reviewed_by ? reviewersById.get(item.reviewed_by) || null : null,
      })),
    };
  }, options);
}

export async function reviewPartnerApplication(applicationId, input = {}) {
  await assertCurrentAdminPermission("partner_applications.manage", {
    message: "You do not have access to review partner applications.",
  });

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const nextStatus = String(input.status || "").trim().toLowerCase();

  if (!["approved", "rejected"].includes(nextStatus)) {
    throw new Error("A valid review status is required.");
  }

  if (nextStatus === "rejected" && !String(input.rejection_reason || "").trim()) {
    throw new Error("Rejection reason is required.");
  }

  const current = await client
    .from("partner_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (current.error) {
    throw current.error;
  }

  const payload = {
    status: nextStatus,
    rejection_reason: nextStatus === "rejected" ? String(input.rejection_reason || "").trim() : null,
    reviewed_by: user?.id || null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("partner_applications")
    .update(payload)
    .eq("id", applicationId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "review",
    module: "partners",
    targetEntityType: "partner_application",
    targetEntityId: applicationId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

async function invokePartnerApplicationReviewFunction(functionName, body) {
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

async function invokeAdminTeamFunction(functionName, body) {
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

export async function approvePartnerApplication(applicationId, input = {}) {
  const result = await invokePartnerApplicationReviewFunction("approve-partner-application", {
    application_id: applicationId,
    commission_rate: input.commission_rate,
    referral_code: input.referral_code,
    notes: input.notes,
  });

  void logAdminActivity("approve_partner_application", "partner_application", applicationId, {
    module: "partner_program",
    partner_id: result?.partner?.id || result?.referralPartner?.id || null,
    referral_code: result?.partner?.referral_code || result?.referralPartner?.referral_code || null,
  });

  return result;
}

export async function rejectPartnerApplication(applicationId, rejectionReason) {
  const normalizedReason = String(rejectionReason || "").trim();
  if (!normalizedReason) {
    throw new Error("Rejection reason is required.");
  }

  const result = await invokePartnerApplicationReviewFunction("reject-partner-application", {
    application_id: applicationId,
    rejection_reason: normalizedReason,
  });

  void logAdminActivity("reject_partner_application", "partner_application", applicationId, {
    module: "partner_program",
    rejection_reason: normalizedReason,
  });

  return result;
}

export async function updatePartnerPortalStatus(partnerId, portalStatus, notes) {
  const normalizedStatus = String(portalStatus || "").trim().toLowerCase();
  if (!["pending", "approved", "rejected", "suspended"].includes(normalizedStatus)) {
    throw new Error("A valid portal status is required.");
  }

  const result = await invokePartnerApplicationReviewFunction("update-partner-portal-status", {
    partner_id: partnerId,
    portal_status: normalizedStatus,
    notes: String(notes || "").trim() || null,
  });

  if (normalizedStatus === "suspended") {
    void logAdminActivity("suspend_partner", "referral_partner", partnerId, {
      module: "partner_program",
      portal_status: normalizedStatus,
    });
  }

  if (normalizedStatus === "approved") {
    void logAdminActivity("reactivate_partner", "referral_partner", partnerId, {
      module: "partner_program",
      portal_status: normalizedStatus,
    });
  }

  return result;
}

export async function deletePartnerAccount(partnerId) {
  const normalizedPartnerId = String(partnerId || "").trim();
  if (!normalizedPartnerId) {
    throw new Error("partner_id is required.");
  }

  const result = await invokePartnerApplicationReviewFunction("delete-partner-account", {
    partner_id: normalizedPartnerId,
  });

  void logAdminActivity("delete_partner", "referral_partner", normalizedPartnerId, {
    module: "partner_program",
    profile_id: result?.profile?.id || null,
    application_id: result?.application?.id || null,
  });

  return result;
}

async function generateUniqueReferralPartnerCode(client) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const referralCode = generateRandomReferralCode();
    const existing = await client
      .from("referral_partners")
      .select("id")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (existing.error && existing.error.code !== "PGRST116") {
      throw existing.error;
    }

    if (!existing.data?.id) {
      return referralCode;
    }
  }

  throw new Error("Could not generate a unique referral code.");
}

export async function createReferralPartner(input) {
  await assertCurrentAdminPermission("partners.edit", {
    message: "You do not have access to create referral partners.",
  });

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const referralCode = await generateUniqueReferralPartnerCode(client);

  const payload = {
    id: crypto.randomUUID(),
    name: input.name,
    public_name: input.public_name || input.name,
    contact_name: input.contact_name || null,
    contact_email: input.contact_email || null,
    contact_phone: input.contact_phone || null,
    referral_code: referralCode,
    referral_link: buildReferralPath(referralCode),
    commission_type: input.commission_type || "percentage",
    commission_rate: Number(input.commission_rate || 0),
    status: input.status || "active",
    portal_status: input.portal_status || "approved",
    profile_id: input.profile_id || null,
    application_reason: input.application_reason || null,
    notes: input.notes || null,
  };

  const { data, error } = await client
    .from("referral_partners")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "partners",
    targetEntityType: "referral_partner",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateReferralPartner(partnerId, updates) {
  await assertCurrentAdminPermission("partners.edit", {
    message: "You do not have access to update referral partners.",
  });

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("referral_partners").select("*").eq("id", partnerId).maybeSingle();
  const { error } = await client
    .from("referral_partners")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "partners",
    targetEntityType: "referral_partner",
    targetEntityId: partnerId,
    previousValue: current.data || null,
    newValue: updates,
  });
}

export async function createReferralPartnerPayout(input) {
  await assertCurrentAdminPermission("partners.edit", {
    anyPermissions: ["partner_payouts.manage", "finance.edit"],
    message: "You do not have access to create partner payouts.",
  });

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    partner_id: input.partner_id,
    case_id: input.case_id || null,
    amount: Number(input.amount || 0),
    currency: input.currency || "EUR",
    status: input.status || "pending",
    payout_method: input.payout_method || null,
    payment_reference: input.payment_reference || null,
    note: input.note || null,
    paid_at: input.status === "paid" ? new Date().toISOString() : null,
  };

  const { data, error } = await client
    .from("referral_partner_payouts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "partners",
    targetEntityType: "referral_partner_payout",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { partner_id: input.partner_id, case_id: input.case_id || null },
  });

  await syncPartnerTotals(client, input.partner_id).catch(() => null);

  return data;
}

export async function fetchActivityLogsData(options = {}) {
  await assertCurrentAdminPermission("activity.view", {
    message: "You do not have access to activity logs.",
  });

  return withAdminModuleCache("activity-logs-module", async () => {
    const client = requireSupabase();

  const [logs, profiles] = await Promise.all([
    client
      .from("activity_logs")
      .select("id, user_id, action, module, target_entity_type, target_entity_id, previous_value, new_value, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true })
      .limit(200),
  ]);

  if (profiles.error) {
    throw profiles.error;
  }

  if (logs.error) {
    if (isMissingOptionalTable(logs.error) || isMissingColumnError(logs.error)) {
      return {
        logs: [],
        users: profiles.data || [],
        supportsActivityLogsV1: false,
      };
    }
    throw logs.error;
  }

    return {
      logs: logs.data || [],
      users: profiles.data || [],
      supportsActivityLogsV1: true,
    };
  }, options);
}

export async function fetchReportsModuleData() {
  await assertReportsModuleReadAccess();

  const client = requireSupabase();

  const [leads, cases, finance, tasks, communications, partners, documents, customers] = await Promise.all([
    client
      .from("leads")
      .select("id, lead_code, status, stage, source, airline, departure_airport, arrival_airport, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("cases")
      .select("id, case_code, status, payout_status, airline, route_from, route_to, estimated_compensation, referral_partner_id, referral_partner_label, assigned_manager_id, created_at, approved_at, rejected_at, paid_at, closed_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("case_finance")
      .select("id, case_id, compensation_amount, company_fee, customer_payout, referral_commission, payment_status, currency, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1000),
    client
      .from("tasks")
      .select("id, status, priority, related_entity_type, related_entity_id, assigned_user_id, due_date, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("communications")
      .select("id, entity_type, entity_id, channel, direction, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("referral_partners")
      .select("id, name, referral_code, status")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("case_documents")
      .select("id, case_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("customers")
      .select("id, total_leads, total_cases, total_approved_cases, total_compensation, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const requiredErrors = [leads, cases, finance, tasks, communications, customers].map((result) => result.error).filter(Boolean);
  if (requiredErrors.length) {
    throw requiredErrors[0];
  }

  if (partners.error && !isMissingOptionalTable(partners.error) && !isMissingColumnError(partners.error)) {
    throw partners.error;
  }

  if (documents.error && !isMissingOptionalTable(documents.error) && !isMissingColumnError(documents.error)) {
    throw documents.error;
  }

  return {
    leads: leads.data || [],
    cases: cases.data || [],
    finance: finance.data || [],
    tasks: tasks.data || [],
    communications: communications.data || [],
    partners: partners.data || [],
    documents: documents.data || [],
    customers: customers.data || [],
    supportsReportsV1: true,
  };
}

function slugifyText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export async function fetchSettingsModuleData() {
  const client = requireSupabase();

  const response = await client
    .from("system_settings")
    .select("id, group_key, setting_key, label, value, value_type, description, is_public, created_at, updated_at, updated_by")
    .order("group_key", { ascending: true })
    .order("setting_key", { ascending: true })
    .limit(500);

  if (response.error) {
    if (isMissingOptionalTable(response.error) || isMissingColumnError(response.error)) {
      return { settings: [], supportsSettingsModuleV1: false };
    }
    throw response.error;
  }

  return { settings: response.data || [], supportsSettingsModuleV1: true };
}

export async function upsertSystemSetting(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const now = new Date().toISOString();
  const payload = {
    group_key: input.group_key,
    setting_key: input.setting_key,
    label: input.label,
    value: input.value,
    value_type: input.value_type || "string",
    description: input.description || null,
    is_public: Boolean(input.is_public),
    updated_at: now,
    updated_by: user?.id || null,
  };

  const current = input.id
    ? await client.from("system_settings").select("*").eq("id", input.id).maybeSingle()
    : { data: null };

  const query = input.id
    ? client.from("system_settings").update(payload).eq("id", input.id).select("id").single()
    : client.from("system_settings").insert({ id: crypto.randomUUID(), ...payload }).select("id").single();

  const { data, error } = await query;
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: input.id ? "update" : "create",
    module: "settings",
    targetEntityType: "system_setting",
    targetEntityId: data.id,
    previousValue: current.data || null,
    newValue: payload,
  });

  return data;
}

export async function fetchFaqModuleData() {
  const client = requireSupabase();
  const response = await client
    .from("faq_items")
    .select("id, question, answer, category, sort_order, status, locale, created_at, updated_at, created_by, updated_by")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (response.error) {
    if (isMissingOptionalTable(response.error) || isMissingColumnError(response.error)) {
      return { items: [], supportsFaqModuleV1: false };
    }
    throw response.error;
  }

  return { items: response.data || [], supportsFaqModuleV1: true };
}

export async function createFaqItem(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    question: input.question,
    answer: input.answer,
    category: input.category || "general",
    sort_order: Number(input.sort_order || 0),
    status: input.status || "draft",
    locale: input.locale || "en",
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("faq_items").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "faq",
    targetEntityType: "faq_item",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateFaqItem(faqId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("faq_items").select("*").eq("id", faqId).maybeSingle();
  const payload = {
    ...updates,
    sort_order: updates.sort_order === undefined ? undefined : Number(updates.sort_order || 0),
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("faq_items").update(payload).eq("id", faqId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "faq",
    targetEntityType: "faq_item",
    targetEntityId: faqId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function fetchBlogModuleData() {
  const client = requireSupabase();
  const response = await client
    .from("blog_posts")
    .select("id, title, slug, excerpt, content, content_sections, cover_image, categories, tags, author_name, status, published_at, locale, read_time, seo_title, seo_description, created_at, updated_at, created_by, updated_by")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (response.error) {
    if (isMissingOptionalTable(response.error) || isMissingColumnError(response.error)) {
      return { posts: [], supportsBlogModuleV1: false };
    }
    throw response.error;
  }

  return { posts: response.data || [], supportsBlogModuleV1: true };
}

export async function createBlogPost(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    title: input.title,
    slug: slugifyText(input.slug || input.title) || `post-${Date.now().toString(36)}`,
    excerpt: input.excerpt || null,
    content: input.content || "",
    cover_image: input.cover_image || null,
    content_sections: input.content_sections || [],
    categories: input.categories || [],
    tags: input.tags || [],
    author_name: input.author_name || null,
    status: input.status || "draft",
    published_at: input.published_at || null,
    locale: input.locale || "en",
    read_time: input.read_time || null,
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("blog_posts").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "blog",
    targetEntityType: "blog_post",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateBlogPost(postId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("blog_posts").select("*").eq("id", postId).maybeSingle();
  const payload = {
    ...updates,
    slug: updates.slug ? slugifyText(updates.slug) : undefined,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("blog_posts").update(payload).eq("id", postId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "blog",
    targetEntityType: "blog_post",
    targetEntityId: postId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function fetchCmsModuleData() {
  const client = requireSupabase();

  const [pages, blocks] = await Promise.all([
    client
      .from("cms_pages")
      .select("id, page_key, title, slug, status, seo_title, seo_description, locale, created_at, updated_at, created_by, updated_by")
      .order("page_key", { ascending: true })
      .limit(300),
    client
      .from("cms_blocks")
      .select("id, page_id, block_type, block_key, title, body, image_url, cta_label, cta_link, sort_order, status, payload, created_at, updated_at, created_by, updated_by")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(1000),
  ]);

  if (pages.error) {
    if (isMissingOptionalTable(pages.error) || isMissingColumnError(pages.error)) {
      return { pages: [], blocks: [], supportsCmsModuleV1: false };
    }
    throw pages.error;
  }

  if (blocks.error && !isMissingOptionalTable(blocks.error) && !isMissingColumnError(blocks.error)) {
    throw blocks.error;
  }

  return { pages: pages.data || [], blocks: blocks.data || [], supportsCmsModuleV1: true };
}

export async function refreshAviationCatalog() {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const [airportsRaw, airlinesRaw] = await Promise.all([
    fetch(AIRPORTS_REFRESH_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not fetch airports catalog (${response.status}).`);
      }

      return response.text();
    }),
    fetch(AIRLINES_REFRESH_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not fetch airlines catalog (${response.status}).`);
      }

      return response.text();
    }),
  ]);

  const airports = buildAirportCatalogRows(airportsRaw);
  const airlines = buildAirlineCatalogRows(airlinesRaw);

  await upsertInChunks(client, "airports", airports);
  await upsertInChunks(client, "airlines", airlines);

  await recordActivity(client, {
    userId: user?.id,
    action: "refresh_catalog",
    module: "cms",
    targetEntityType: "aviation_catalog",
    newValue: {
      airports: airports.length,
      airlines: airlines.length,
      airportsSource: AIRPORTS_REFRESH_URL,
      airlinesSource: AIRLINES_REFRESH_URL,
    },
  });

  return {
    airports: airports.length,
    airlines: airlines.length,
  };
}

export async function fetchAccessModuleData() {
  const client = requireSupabase();

  const [profiles, roles, permissions, userRoles, rolePermissions] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, email, phone, role, status, deleted_at, purge_after, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("admin_roles")
      .select("code, label, rank, is_system, created_at")
      .order("rank", { ascending: false })
      .limit(100),
    client
      .from("admin_permissions")
      .select("code, module, action, label, created_at")
      .order("module", { ascending: true })
      .limit(500),
    client
      .from("user_admin_roles")
      .select("id, user_id, role_code, assigned_by, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("admin_role_permissions")
      .select("role_code, permission_code, created_at")
      .limit(2000),
  ]);

  if (profiles.error) {
    throw profiles.error;
  }

  const optional = [roles, permissions, userRoles, rolePermissions];
  for (const result of optional) {
    if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
      throw result.error;
    }
  }

  return {
    profiles: profiles.data || [],
    roles: roles.data || [],
    permissions: permissions.data || [],
    userRoles: userRoles.data || [],
    rolePermissions: rolePermissions.data || [],
    supportsAccessModuleV1: !roles.error && !permissions.error && !userRoles.error && !rolePermissions.error,
  };
}

function slugifyRoleCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function roleLabelFromRecord(role) {
  return role?.name || role?.label || role?.code || "Role";
}

function buildStaticAdminMenuItemsCatalog() {
  return adminNavigationSections.flatMap((section) => section.pages.map((page, index) => ({
    id: page.key,
    key: page.key,
    label: page.label,
    route: page.path,
    icon: page.icon?.name || null,
    group_key: section.key,
    group_label: section.label,
    sort_order: (index + 1) * 10,
    is_enabled: true,
    required_permissions: [
      ...(page.permission ? [page.permission] : []),
      ...((page.requiredPermissions || []).filter(Boolean)),
      ...((page.anyPermissions || []).filter(Boolean)),
    ],
    is_critical: ["/admin", "/admin/people/users-roles", "/admin/settings"].includes(page.path),
  })));
}

async function syncAdminMenuCatalog(client) {
  const staticItems = buildStaticAdminMenuItemsCatalog();
  const payload = staticItems.map((item) => ({
    key: item.key,
    label: item.label,
    route: item.route,
    icon: item.icon,
    group_key: item.group_key,
    group_label: item.group_label,
    sort_order: item.sort_order,
    is_enabled: item.is_enabled,
    required_permissions: item.required_permissions,
    is_critical: item.is_critical,
    updated_at: new Date().toISOString(),
  }));

  const result = await client
    .from("admin_menu_items")
    .upsert(payload, { onConflict: "key" })
    .select("id, key, label, route, icon, group_key, group_label, sort_order, is_enabled, required_permissions, is_critical, created_at, updated_at");

  if (result.error) {
    if (isMissingOptionalTable(result.error) || isMissingColumnError(result.error)) {
      return staticItems;
    }
    throw result.error;
  }

  return result.data || staticItems;
}

async function fetchAdminMenuAccessCatalog(client) {
  let menuItemsResponse = await client
    .from("admin_menu_items")
    .select("id, key, label, route, icon, group_key, group_label, sort_order, is_enabled, required_permissions, is_critical, created_at, updated_at")
    .order("sort_order", { ascending: true });

  if (menuItemsResponse.error && !isMissingOptionalTable(menuItemsResponse.error) && !isMissingColumnError(menuItemsResponse.error)) {
    throw menuItemsResponse.error;
  }

  if (menuItemsResponse.error || !(menuItemsResponse.data || []).length) {
    const synced = await syncAdminMenuCatalog(client).catch(() => buildStaticAdminMenuItemsCatalog());
    menuItemsResponse = { data: synced, error: null };
  }

  const visibilityResponse = await client
    .from("admin_role_menu_visibility")
    .select("id, role_id, menu_item_id, is_visible, sort_order, created_at, updated_at")
    .limit(5000);

  if (visibilityResponse.error && !isMissingOptionalTable(visibilityResponse.error) && !isMissingColumnError(visibilityResponse.error)) {
    throw visibilityResponse.error;
  }

  return {
    menuItems: menuItemsResponse.data || buildStaticAdminMenuItemsCatalog(),
    roleMenuVisibility: visibilityResponse.error ? [] : (visibilityResponse.data || []),
    supportsMenuAccessV1: !visibilityResponse.error,
  };
}

function normalizeRoleRecord(role) {
  if (!role) {
    return null;
  }

  return {
    id: role.id || role.code,
    code: role.code,
    name: role.name || role.label || role.code,
    label: role.label || role.name || role.code,
    slug: role.slug || role.code,
    description: role.description || "",
    isSystemRole: role.is_system_role ?? role.is_system ?? true,
    isOwnerRole: role.is_owner_role ?? (role.code === "owner" || role.code === "super_admin"),
    isActive: role.is_active ?? true,
    rank: role.rank ?? 0,
    createdAt: role.created_at || null,
    updatedAt: role.updated_at || null,
  };
}

function normalizePermissionRecord(permission) {
  if (!permission) {
    return null;
  }

  return {
    id: permission.id || permission.code,
    code: permission.code || permission.key,
    key: permission.key || permission.code,
    module: permission.group_key || permission.module || "general",
    action: permission.action || permission.code?.split(".")?.[1] || "view",
    label: permission.label || permission.code,
    description: permission.description || "",
  };
}

async function fetchRolesCatalog(client) {
  const expanded = await client
    .from("admin_roles")
    .select("id, code, label, rank, is_system, created_at, name, slug, description, is_system_role, is_owner_role, is_active, updated_at")
    .order("rank", { ascending: false })
    .limit(200);

  if (!expanded.error) {
    return expanded.data || [];
  }

  if (!isMissingOptionalTable(expanded.error) && !isMissingColumnError(expanded.error)) {
    throw expanded.error;
  }

  const legacy = await client
    .from("admin_roles")
    .select("code, label, rank, is_system, created_at")
    .order("rank", { ascending: false })
    .limit(200);

  if (legacy.error) {
    throw legacy.error;
  }

  return legacy.data || [];
}

async function fetchPermissionsCatalog(client) {
  const expanded = await client
    .from("admin_permissions")
    .select("id, code, module, action, label, created_at, key, description, group_key")
    .order("group_key", { ascending: true })
    .limit(1000);

  if (!expanded.error) {
    return expanded.data || [];
  }

  if (!isMissingOptionalTable(expanded.error) && !isMissingColumnError(expanded.error)) {
    throw expanded.error;
  }

  const legacy = await client
    .from("admin_permissions")
    .select("code, module, action, label, created_at")
    .order("module", { ascending: true })
    .limit(1000);

  if (legacy.error) {
    throw legacy.error;
  }

  return legacy.data || [];
}

async function fetchRolePermissionsCatalog(client) {
  const expanded = await client
    .from("admin_role_permissions")
    .select("id, role_id, permission_id, is_allowed, role_code, permission_code, created_at")
    .limit(5000);

  if (!expanded.error) {
    return expanded.data || [];
  }

  if (!isMissingOptionalTable(expanded.error) && !isMissingColumnError(expanded.error)) {
    throw expanded.error;
  }

  const legacy = await client
    .from("admin_role_permissions")
    .select("role_code, permission_code, created_at")
    .limit(5000);

  if (legacy.error) {
    throw legacy.error;
  }

  return legacy.data || [];
}

async function fetchRoleMemberStats(client) {
  const [teamMembers, userRoles] = await Promise.all([
    client
      .from("admin_team_members")
      .select("id, role_id, status"),
    client
      .from("user_admin_roles")
      .select("user_id, role_code"),
  ]);

  if (teamMembers.error && !isMissingOptionalTable(teamMembers.error) && !isMissingColumnError(teamMembers.error)) {
    throw teamMembers.error;
  }

  if (userRoles.error && !isMissingOptionalTable(userRoles.error)) {
    throw userRoles.error;
  }

  return {
    teamMembers: teamMembers.error ? [] : (teamMembers.data || []),
    userRoles: userRoles.error ? [] : (userRoles.data || []),
    supportsTeamMembers: !teamMembers.error,
  };
}

export async function fetchAdminRolesModuleData(options = {}) {
  await assertCurrentOwnerAdmin();

  return withAdminModuleCache("admin-roles-module", async () => {
    const client = requireSupabase();

  const [rolesRaw, permissionsRaw, rolePermissionsRaw, memberStats, menuAccess] = await Promise.all([
    fetchRolesCatalog(client),
    fetchPermissionsCatalog(client),
    fetchRolePermissionsCatalog(client),
    fetchRoleMemberStats(client),
    fetchAdminMenuAccessCatalog(client).catch(() => ({
      menuItems: buildStaticAdminMenuItemsCatalog(),
      roleMenuVisibility: [],
      supportsMenuAccessV1: false,
    })),
  ]);

  const roles = rolesRaw.map(normalizeRoleRecord).filter(Boolean);
  const permissions = permissionsRaw.map(normalizePermissionRecord).filter(Boolean);
  const permissionIdsByCode = new Map(permissions.map((item) => [item.code, item.id]));
  const roleIdsByCode = new Map(roles.map((item) => [item.code, item.id]));

  const rolePermissions = (rolePermissionsRaw || []).map((item) => ({
    id: item.id || `${item.role_code}:${item.permission_code}`,
    roleId: item.role_id || roleIdsByCode.get(item.role_code) || null,
    permissionId: item.permission_id || permissionIdsByCode.get(item.permission_code) || null,
    roleCode: item.role_code || roles.find((role) => role.id === item.role_id)?.code || null,
    permissionCode: item.permission_code || permissions.find((permission) => permission.id === item.permission_id)?.code || null,
    isAllowed: item.is_allowed ?? true,
    createdAt: item.created_at || null,
  })).filter((item) => item.roleCode && item.permissionCode && item.isAllowed);

  const memberCountByRoleId = new Map();
  memberStats.teamMembers
    .filter((item) => item.status !== "archived")
    .forEach((item) => {
      if (!item.role_id) return;
      memberCountByRoleId.set(item.role_id, (memberCountByRoleId.get(item.role_id) || 0) + 1);
    });

  const memberCountByRoleCode = new Map();
  memberStats.userRoles.forEach((item) => {
    memberCountByRoleCode.set(item.role_code, (memberCountByRoleCode.get(item.role_code) || 0) + 1);
  });

    return {
      roles: roles.map((role) => ({
        ...role,
        memberCount: memberStats.supportsTeamMembers
          ? (memberCountByRoleId.get(role.id) || 0)
          : (memberCountByRoleCode.get(role.code) || 0),
      })),
      permissions,
      rolePermissions,
      menuItems: (menuAccess.menuItems || []).map((item) => ({
        id: item.id || item.key,
        key: item.key,
        label: item.label,
        route: item.route,
        icon: item.icon || null,
        groupKey: item.group_key || item.groupKey || null,
        groupLabel: item.group_label || item.groupLabel || null,
        sortOrder: item.sort_order ?? item.sortOrder ?? 0,
        requiredPermissions: Array.isArray(item.required_permissions)
          ? item.required_permissions
          : Array.isArray(item.requiredPermissions)
            ? item.requiredPermissions
            : [],
        isCritical: Boolean(item.is_critical ?? item.isCritical),
        isEnabled: item.is_enabled ?? item.isEnabled ?? true,
      })),
      roleMenuVisibility: menuAccess.roleMenuVisibility || [],
      supportsDynamicRolesV1: roles.length > 0 && permissions.length > 0,
      supportsTeamMembersV1: memberStats.supportsTeamMembers,
      supportsMenuAccessV1: menuAccess.supportsMenuAccessV1,
    };
  }, options);
}

function buildRolePayload(input = {}) {
  const roleName = String(input.name || input.label || "").trim();
  const roleCode = slugifyRoleCode(input.code || input.slug || input.name);

  if (!roleName) {
    throw new Error("Role name is required.");
  }

  if (!roleCode) {
    throw new Error("Role slug is required.");
  }

  return {
    code: roleCode,
    label: roleName,
    name: roleName,
    slug: String(input.slug || roleCode).trim() || roleCode,
    description: String(input.description || "").trim() || null,
    is_active: input.isActive ?? true,
    is_system_role: input.isSystemRole ?? false,
    is_owner_role: input.isOwnerRole ?? false,
    is_system: input.isSystemRole ?? false,
    rank: Number.isFinite(input.rank) ? input.rank : 0,
    updated_at: new Date().toISOString(),
  };
}

async function replaceRolePermissions(client, role, permissionCodes = []) {
  const normalizedPermissionCodes = Array.from(new Set(permissionCodes.filter(Boolean)));

  const currentAssignments = await client
    .from("admin_role_permissions")
    .select("id, role_code, permission_code")
    .eq("role_code", role.code);

  if (currentAssignments.error && !isMissingOptionalTable(currentAssignments.error) && !isMissingColumnError(currentAssignments.error)) {
    throw currentAssignments.error;
  }

  const permissionsLookup = await client
    .from("admin_permissions")
    .select("id, code")
    .in("code", normalizedPermissionCodes);

  if (permissionsLookup.error && !isMissingOptionalTable(permissionsLookup.error) && !isMissingColumnError(permissionsLookup.error)) {
    throw permissionsLookup.error;
  }

  const permissionsByCode = new Map((permissionsLookup.data || []).map((item) => [item.code, item]));
  const existingCodes = new Set((currentAssignments.data || []).map((item) => item.permission_code));
  const toDelete = Array.from(existingCodes).filter((code) => !normalizedPermissionCodes.includes(code));
  const toInsert = normalizedPermissionCodes.filter((code) => !existingCodes.has(code));

  if ((role.isOwnerRole || role.code === "owner" || role.code === "super_admin") && toDelete.length) {
    const criticalPermissions = ["dashboard.view", "team.manage", "roles.manage", "menu.manage", "settings.manage"];
    const removingCritical = toDelete.some((code) => criticalPermissions.includes(code));
    if (removingCritical) {
      const teamMembersResponse = await client
        .from("admin_team_members")
        .select("id, role_id, status");

      const activeOwners = !teamMembersResponse.error
        ? (teamMembersResponse.data || []).filter((item) => item.role_id === role.id && item.status === "active").length
        : 1;

      if (activeOwners <= 1) {
        throw new Error("Cannot remove critical permissions from the last owner role.");
      }
    }
  }

  if (toDelete.length) {
    const deleteResponse = await client
      .from("admin_role_permissions")
      .delete()
      .eq("role_code", role.code)
      .in("permission_code", toDelete);

    if (deleteResponse.error) {
      throw deleteResponse.error;
    }
  }

  if (toInsert.length) {
    const insertPayload = toInsert.map((permissionCode) => ({
      role_code: role.code,
      permission_code: permissionCode,
      role_id: role.id || null,
      permission_id: permissionsByCode.get(permissionCode)?.id || null,
      is_allowed: true,
    }));

    const insertResponse = await client
      .from("admin_role_permissions")
      .upsert(insertPayload, { onConflict: "role_code,permission_code" });

    if (insertResponse.error) {
      throw insertResponse.error;
    }
  }
}

async function replaceRoleMenuVisibility(client, role, menuVisibility = {}) {
  const menuCatalog = await fetchAdminMenuAccessCatalog(client);
  const menuItems = (menuCatalog.menuItems || []).filter((item) => item.route);
  const visibilityByPath = new Map(Object.entries(menuVisibility || {}));
  const itemsByRoute = new Map(menuItems.map((item) => [item.route, item]));
  const existingResponse = await client
    .from("admin_role_menu_visibility")
    .select("id, menu_item_id, is_visible")
    .eq("role_id", role.id);

  if (existingResponse.error && !isMissingOptionalTable(existingResponse.error) && !isMissingColumnError(existingResponse.error)) {
    throw existingResponse.error;
  }

  const existingByMenuId = new Map((existingResponse.data || []).map((item) => [item.menu_item_id, item]));
  const criticalOwnerRoutes = new Set(["/admin", "/admin/people/users-roles", "/admin/settings"]);
  const upsertPayload = [];

  menuItems.forEach((item) => {
    const explicit = visibilityByPath.has(item.route) ? visibilityByPath.get(item.route) : null;
    const forcedVisible = role.isOwnerRole || role.code === "owner" || role.code === "super_admin";
    const isVisible = forcedVisible ? true : (explicit ?? true);
    const current = existingByMenuId.get(item.id);
    if (!current || current.is_visible !== isVisible) {
      const nextVisibility = {
        id: current?.id || generateClientUuid(),
        role_id: role.id,
        menu_item_id: item.id,
        is_visible: isVisible,
        sort_order: item.sort_order ?? current?.sort_order ?? null,
        updated_at: new Date().toISOString(),
      };
      upsertPayload.push(nextVisibility);
    }
  });

  if (upsertPayload.length) {
    const response = await client
      .from("admin_role_menu_visibility")
      .upsert(upsertPayload, { onConflict: "role_id,menu_item_id" });

    if (response.error) {
      throw response.error;
    }
  }

  const unknownRoutes = Array.from(visibilityByPath.keys()).filter((route) => !itemsByRoute.has(route));
  if (unknownRoutes.length) {
    await syncAdminMenuCatalog(client).catch(() => null);
  }
}

export async function createAdminRole({ role, permissionCodes = [], menuVisibility = {} }) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const payload = buildRolePayload(role);

  const insertResponse = await client
    .from("admin_roles")
    .insert(payload)
    .select("id, code, label, rank, is_system, created_at, name, slug, description, is_system_role, is_owner_role, is_active, updated_at")
    .single();

  if (insertResponse.error) {
    throw insertResponse.error;
  }

  const nextRole = normalizeRoleRecord(insertResponse.data);
  await replaceRolePermissions(client, nextRole, permissionCodes);
  await replaceRoleMenuVisibility(client, nextRole, menuVisibility);
  clearAdminMenuCache();
  void logAdminActivity("create_role", "admin_role", nextRole.id, {
    module: "roles",
    role_code: nextRole.code,
    role_slug: nextRole.slug,
    permissions_count: permissionCodes.length,
    is_system_role: nextRole.isSystemRole,
    is_owner_role: nextRole.isOwnerRole,
  });
  return nextRole;
}

export async function updateAdminRoleDefinition(roleId, { role, permissionCodes = [], menuVisibility = {} }) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const existingResponse = await client
    .from("admin_roles")
    .select("id, code, label, rank, is_system, created_at, name, slug, description, is_system_role, is_owner_role, is_active, updated_at")
    .eq("id", roleId)
    .maybeSingle();

  if (existingResponse.error) {
    throw existingResponse.error;
  }

  const existingRole = normalizeRoleRecord(existingResponse.data);
  if (!existingRole) {
    throw new Error("Role not found.");
  }

  const payload = buildRolePayload({
    ...existingRole,
    ...role,
    code: existingRole.code,
    slug: role?.slug || existingRole.slug,
  });

  if (existingRole.isSystemRole) {
    payload.is_system_role = true;
    payload.is_system = true;
  }

  if (existingRole.isOwnerRole) {
    payload.is_owner_role = true;
    payload.is_active = true;
  }

  const updateResponse = await client
    .from("admin_roles")
    .update(payload)
    .eq("id", roleId)
    .select("id, code, label, rank, is_system, created_at, name, slug, description, is_system_role, is_owner_role, is_active, updated_at")
    .single();

  if (updateResponse.error) {
    throw updateResponse.error;
  }

  const nextRole = normalizeRoleRecord(updateResponse.data);
  await replaceRolePermissions(client, nextRole, permissionCodes);
  await replaceRoleMenuVisibility(client, nextRole, menuVisibility);
  clearAdminMenuCache();
  void logAdminActivity("update_role", "admin_role", roleId, {
    module: "roles",
    role_code: nextRole.code,
    role_slug: nextRole.slug,
    permissions_count: permissionCodes.length,
    is_active: nextRole.isActive,
  });
  return nextRole;
}

export async function duplicateAdminRole(roleId) {
  await assertCurrentOwnerAdmin();

  const moduleData = await fetchAdminRolesModuleData();
  const sourceRole = moduleData.roles.find((role) => role.id === roleId);
  if (!sourceRole) {
    throw new Error("Role not found.");
  }

  const sourcePermissions = moduleData.rolePermissions
    .filter((item) => item.roleCode === sourceRole.code)
    .map((item) => item.permissionCode);
  const sourceMenuVisibility = Object.fromEntries(
    (moduleData.roleMenuVisibility || [])
      .filter((item) => item.role_id === sourceRole.id)
      .map((item) => {
        const menuItem = (moduleData.menuItems || []).find((entry) => entry.id === item.menu_item_id);
        return [menuItem?.route, item.is_visible !== false];
      })
      .filter(([route]) => Boolean(route)),
  );

  return createAdminRole({
    role: {
      name: `${roleLabelFromRecord(sourceRole)} Copy`,
      slug: `${sourceRole.slug || sourceRole.code}-copy`,
      description: sourceRole.description || "",
      isActive: sourceRole.isActive,
      isSystemRole: false,
      isOwnerRole: false,
      rank: sourceRole.rank,
    },
    permissionCodes: sourcePermissions,
    menuVisibility: sourceMenuVisibility,
  });
}

export async function deactivateAdminRole(roleId, isActive = false) {
  const client = requireSupabase();
  const existingResponse = await client
    .from("admin_roles")
    .select("id, code, name, label, is_system_role, is_owner_role, is_active")
    .eq("id", roleId)
    .maybeSingle();

  if (existingResponse.error) {
    throw existingResponse.error;
  }

  const role = normalizeRoleRecord(existingResponse.data);
  if (!role) {
    throw new Error("Role not found.");
  }

  if (role.isOwnerRole && !isActive) {
    throw new Error("Owner role cannot be deactivated.");
  }

  const updateResponse = await client
    .from("admin_roles")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", roleId)
    .select("id")
    .single();

  if (updateResponse.error) {
    throw updateResponse.error;
  }

  return true;
}

export async function deleteAdminRole(roleId) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const [roleResponse, teamMembersResponse, userRolesResponse] = await Promise.all([
    client
      .from("admin_roles")
      .select("id, code, name, label, is_system_role, is_owner_role")
      .eq("id", roleId)
      .maybeSingle(),
    client
      .from("admin_team_members")
      .select("id")
      .eq("role_id", roleId)
      .limit(1),
    client
      .from("user_admin_roles")
      .select("id, role_code")
      .limit(5000),
  ]);

  if (roleResponse.error) {
    throw roleResponse.error;
  }

  if (teamMembersResponse.error && !isMissingOptionalTable(teamMembersResponse.error) && !isMissingColumnError(teamMembersResponse.error)) {
    throw teamMembersResponse.error;
  }

  if (userRolesResponse.error && !isMissingOptionalTable(userRolesResponse.error)) {
    throw userRolesResponse.error;
  }

  const role = normalizeRoleRecord(roleResponse.data);
  if (!role) {
    throw new Error("Role not found.");
  }

  if (role.isSystemRole) {
    throw new Error("System roles cannot be deleted.");
  }

  if (role.isOwnerRole || role.code === "owner" || role.code === "super_admin") {
    throw new Error("Owner role cannot be deleted.");
  }

  const hasAssignedTeamMembers = (teamMembersResponse.data || []).length > 0;
  const hasAssignedLegacyUsers = (userRolesResponse.data || []).some((item) => item.role_code === role.code);

  if (hasAssignedTeamMembers || hasAssignedLegacyUsers) {
    throw new Error("Cannot delete a role that still has team members assigned.");
  }

  const deleteResponse = await client
    .from("admin_roles")
    .delete()
    .eq("id", roleId);

  if (deleteResponse.error) {
    throw deleteResponse.error;
  }

  return true;
}

function sortRolesByRank(roles = []) {
  return [...roles].sort((left, right) => (right.rank || 0) - (left.rank || 0));
}

function normalizeTeamStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (["active", "invited", "inactive", "suspended", "archived"].includes(normalized)) {
    return normalized;
  }
  return "active";
}

function summarizeRecentActivity(rows = [], profileId) {
  const recentRows = rows.filter((item) => item.admin_profile_id === profileId || item.user_id === profileId);
  const last7d = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentCount = recentRows.filter((item) => {
    const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0;
    return Number.isFinite(createdAt) && createdAt >= last7d;
  }).length;

  return {
    recentCount,
    rows: recentRows
      .slice()
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
      .slice(0, 8),
  };
}

function summarizeWorkSessions(rows = [], profileId) {
  const recentRows = rows
    .filter((item) => item.admin_profile_id === profileId)
    .slice()
    .sort((left, right) => new Date(right.last_seen_at || right.started_at || 0).getTime() - new Date(left.last_seen_at || left.started_at || 0).getTime());

  const last7d = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentSessions = recentRows.filter((item) => {
    const createdAt = item.started_at ? new Date(item.started_at).getTime() : 0;
    return Number.isFinite(createdAt) && createdAt >= last7d;
  });

  return {
    lastLoginAt: recentRows[0]?.last_seen_at || recentRows[0]?.started_at || null,
    recentSessionCount: recentSessions.length,
    recentDurationSeconds: recentSessions.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0),
    rows: recentRows.slice(0, 8),
  };
}

function parseDateInput(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getSessionDurationSeconds(session) {
  const explicit = Number(session?.duration_seconds || 0);
  if (explicit > 0) {
    return explicit;
  }

  const startedAt = parseDateInput(session?.started_at || session?.created_at);
  const endedAt = parseDateInput(session?.ended_at || session?.last_seen_at);
  if (!startedAt || !endedAt || endedAt <= startedAt) {
    return 0;
  }

  return Math.round((endedAt - startedAt) / 1000);
}

function toDateRangeBounds(range = {}) {
  const from = range?.from ? `${range.from}T00:00:00.000Z` : null;
  const to = range?.to ? `${range.to}T23:59:59.999Z` : null;
  return { from, to };
}

function buildAdminActivityMetadataSummary(metadata = {}) {
  const safe = sanitizeActivityMetadata(metadata);
  const entries = Object.entries(safe)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => {
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
      const normalizedValue = Array.isArray(value)
        ? `${value.length} items`
        : typeof value === "object"
          ? "details"
          : String(value);
      return `${label}: ${normalizedValue}`;
    });

  return entries.join(" • ");
}

function getActivityEntityReference(entry = {}) {
  const metadata = sanitizeActivityMetadata(entry.metadata || {});
  return (
    metadata.lead_code
    || metadata.case_code
    || metadata.document_id
    || metadata.role_code
    || metadata.status
    || entry.entity_id
    || "—"
  );
}

function filterTimelineRows(rows = [], filters = {}) {
  const fromMs = parseDateInput(filters?.dateRange?.from);
  const toMs = parseDateInput(filters?.dateRange?.to)
    ? parseDateInput(filters?.dateRange?.to) + (24 * 60 * 60 * 1000) - 1
    : null;
  const actionType = String(filters?.actionType || "all");
  const entityType = String(filters?.entityType || "all");

  return rows.filter((item) => {
    const createdAt = parseDateInput(item.created_at);
    if (fromMs && (!createdAt || createdAt < fromMs)) return false;
    if (toMs && (!createdAt || createdAt > toMs)) return false;
    if (actionType !== "all" && item.action !== actionType) return false;
    if (entityType !== "all" && (item.entity_type || "unknown") !== entityType) return false;
    return true;
  });
}

function countAdminActions(rows = [], allowedActions = []) {
  const allow = new Set(allowedActions);
  return rows.filter((item) => allow.has(item.action)).length;
}

export async function fetchAdminTeamMemberActivity(profileId, filters = {}) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) {
    throw new Error("Team member id is required.");
  }

  const [profileResponse, teamMemberResponse, allRolesResponse, activityResponse, sessionsResponse, legacyRolesResponse] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, email, role, created_at, deleted_at")
      .eq("id", normalizedProfileId)
      .maybeSingle(),
    client
      .from("admin_team_members")
      .select("id, profile_id, email, full_name, role_id, status, invited_by, last_login_at, created_at, updated_at")
      .eq("profile_id", normalizedProfileId)
      .maybeSingle(),
    client
      .from("admin_roles")
      .select("id, code, label, rank, is_system, created_at, name, slug, description, is_system_role, is_owner_role, is_active, updated_at"),
    client
      .from("admin_activity_logs")
      .select("id, admin_profile_id, action, entity_type, entity_id, metadata, created_at")
      .eq("admin_profile_id", normalizedProfileId)
      .order("created_at", { ascending: false })
      .limit(2000),
    client
      .from("admin_work_sessions")
      .select("id, admin_profile_id, started_at, ended_at, last_seen_at, duration_seconds, created_at")
      .eq("admin_profile_id", normalizedProfileId)
      .order("started_at", { ascending: false })
      .limit(2000),
    client
      .from("user_admin_roles")
      .select("user_id, role_code, created_at")
      .eq("user_id", normalizedProfileId),
  ]);

  if (profileResponse.error) throw profileResponse.error;
  if (!profileResponse.data) throw new Error("Team member profile not found.");

  if (teamMemberResponse.error && !isMissingOptionalTable(teamMemberResponse.error) && !isMissingColumnError(teamMemberResponse.error)) {
    throw teamMemberResponse.error;
  }
  if (allRolesResponse.error && !isMissingOptionalTable(allRolesResponse.error) && !isMissingColumnError(allRolesResponse.error)) {
    throw allRolesResponse.error;
  }
  if (activityResponse.error && !isMissingOptionalTable(activityResponse.error) && !isMissingColumnError(activityResponse.error)) {
    throw activityResponse.error;
  }
  if (sessionsResponse.error && !isMissingOptionalTable(sessionsResponse.error) && !isMissingColumnError(sessionsResponse.error)) {
    throw sessionsResponse.error;
  }
  if (legacyRolesResponse.error && !isMissingOptionalTable(legacyRolesResponse.error)) {
    throw legacyRolesResponse.error;
  }

  const profile = profileResponse.data;
  const teamMember = teamMemberResponse.error ? null : teamMemberResponse.data;
  const allRoles = (allRolesResponse.error ? [] : (allRolesResponse.data || [])).map(normalizeRoleRecord);
  const rolesById = new Map(allRoles.map((item) => [item.id, item]));
  const rolesByCode = new Map(allRoles.map((item) => [item.code, item]));
  const legacyRoleCodes = Array.from(new Set((legacyRolesResponse.error ? [] : legacyRolesResponse.data || [])
    .map((item) => normalizeRoleCode(item.role_code))
    .filter(Boolean)));
  const resolvedRole =
    (teamMember?.role_id ? rolesById.get(teamMember.role_id) : null)
    || sortRolesByRank(legacyRoleCodes.map((code) => rolesByCode.get(code)).filter(Boolean))[0]
    || null;

  const status = teamMember
    ? normalizeTeamStatus(teamMember.status)
    : profile.deleted_at ? "archived" : legacyRoleCodes.length ? "active" : "inactive";

  const sessions = sessionsResponse.error ? [] : (sessionsResponse.data || []);
  const totalActiveSeconds = sessions.reduce((sum, item) => sum + getSessionDurationSeconds(item), 0);
  const now = Date.now();
  const weekStart = now - (7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  const activeTimeThisWeek = sessions.reduce((sum, item) => {
    const startedAt = parseDateInput(item.started_at || item.created_at);
    return startedAt && startedAt >= weekStart ? sum + getSessionDurationSeconds(item) : sum;
  }, 0);
  const activeTimeThisMonth = sessions.reduce((sum, item) => {
    const startedAt = parseDateInput(item.started_at || item.created_at);
    return startedAt && startedAt >= monthStartMs ? sum + getSessionDurationSeconds(item) : sum;
  }, 0);

  const allActivityRows = (activityResponse.error ? [] : (activityResponse.data || [])).map((item) => {
    const metadata = sanitizeActivityMetadata(item.metadata || {});
    return {
      id: item.id,
      createdAt: item.created_at,
      action: item.action,
      entityType: item.entity_type || "unknown",
      entityId: item.entity_id || "",
      entityReference: getActivityEntityReference(item),
      metadata,
      metadataSummary: buildAdminActivityMetadataSummary(metadata),
    };
  });

  const filteredActivityRows = filterTimelineRows(
    allActivityRows.map((item) => ({
      created_at: item.createdAt,
      action: item.action,
      entity_type: item.entityType,
      ...item,
    })),
    filters,
  ).map((item) => ({
    id: item.id,
    createdAt: item.createdAt || item.created_at,
    action: item.action,
    entityType: item.entityType || item.entity_type,
    entityId: item.entityId || item.entity_id,
    entityReference: item.entityReference,
    metadata: item.metadata,
    metadataSummary: item.metadataSummary,
  }));

  return {
    member: {
      profileId: normalizedProfileId,
      fullName: teamMember?.full_name || profile.full_name || "",
      email: teamMember?.email || profile.email || "",
      roleLabel: resolvedRole?.name || resolvedRole?.label || "No role",
      roleCode: resolvedRole?.code || legacyRoleCodes[0] || normalizeRoleCode(profile.role) || null,
      status,
      lastLoginAt: teamMember?.last_login_at || sessions[0]?.last_seen_at || sessions[0]?.started_at || null,
      isOwner: !!resolvedRole?.isOwnerRole,
      isSystemRole: !!resolvedRole?.isSystemRole,
    },
    workStats: {
      totalSessions: sessions.length,
      totalActiveSeconds,
      activeTimeThisWeek,
      activeTimeThisMonth,
    },
    operationalStats: {
      leadsReviewed: countAdminActions(allActivityRows, ["view_lead", "update_lead"]),
      casesUpdated: countAdminActions(allActivityRows, ["update_case"]),
      documentsChecked: countAdminActions(allActivityRows, ["download_document"]),
      partnerApplicationsReviewed: countAdminActions(allActivityRows, ["approve_partner_application", "reject_partner_application"]),
      payoutsUpdated: countAdminActions(allActivityRows, ["update_finance_record"]),
    },
    timeline: filteredActivityRows,
    filterOptions: {
      actionTypes: Array.from(new Set(allActivityRows.map((item) => item.action).filter(Boolean))).sort(),
      entityTypes: Array.from(new Set(allActivityRows.map((item) => item.entityType).filter(Boolean))).sort(),
    },
    supportsAdminActivityLogsV1: !activityResponse.error,
    supportsWorkSessionsV1: !sessionsResponse.error,
  };
}

export async function fetchAdminTeamModuleData(options = {}) {
  await assertCurrentOwnerAdmin();

  return withAdminModuleCache("admin-team-module", async () => {
    const client = requireSupabase();

  const [rolesModule, teamMembersResponse, legacyRolesResponse, activityResponse, adminActivityResponse, sessionsResponse] = await Promise.all([
    fetchAdminRolesModuleData(),
    client
      .from("admin_team_members")
      .select("id, profile_id, email, full_name, role_id, status, invited_by, last_login_at, created_at, updated_at"),
    client
      .from("user_admin_roles")
      .select("user_id, role_code, created_at"),
    client
      .from("activity_logs")
      .select("id, user_id, action, module, target_entity_type, target_entity_id, previous_value, new_value, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(3000),
    client
      .from("admin_activity_logs")
      .select("id, admin_profile_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(3000),
    client
      .from("admin_work_sessions")
      .select("id, admin_profile_id, started_at, ended_at, last_seen_at, duration_seconds, created_at")
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);

  if (teamMembersResponse.error && !isMissingOptionalTable(teamMembersResponse.error) && !isMissingColumnError(teamMembersResponse.error)) {
    throw teamMembersResponse.error;
  }

  if (legacyRolesResponse.error && !isMissingOptionalTable(legacyRolesResponse.error)) {
    throw legacyRolesResponse.error;
  }

  if (activityResponse.error && !isMissingOptionalTable(activityResponse.error) && !isMissingColumnError(activityResponse.error)) {
    throw activityResponse.error;
  }

  if (adminActivityResponse.error && !isMissingOptionalTable(adminActivityResponse.error) && !isMissingColumnError(adminActivityResponse.error)) {
    throw adminActivityResponse.error;
  }

  if (sessionsResponse.error && !isMissingOptionalTable(sessionsResponse.error) && !isMissingColumnError(sessionsResponse.error)) {
    throw sessionsResponse.error;
  }

  const teamMembers = teamMembersResponse.error ? [] : (teamMembersResponse.data || []);
  const legacyRoles = legacyRolesResponse.error ? [] : (legacyRolesResponse.data || []);
  const activityLogs = activityResponse.error ? [] : (activityResponse.data || []);
  const adminActivityLogs = adminActivityResponse.error ? [] : (adminActivityResponse.data || []);
  const sessions = sessionsResponse.error ? [] : (sessionsResponse.data || []);
  const combinedActivityLogs = [
    ...activityLogs.map((item) => ({
      id: item.id,
      admin_profile_id: item.user_id || null,
      action: item.action,
      module: item.module || "general",
      entity_type: item.target_entity_type || "unknown",
      entity_id: item.target_entity_id || "",
      metadata: sanitizeActivityMetadata(item.meta || {}),
      created_at: item.created_at,
      source: "activity_logs",
    })),
    ...adminActivityLogs.map((item) => {
      const metadata = sanitizeActivityMetadata(item.metadata || {});
      return {
        id: item.id,
        admin_profile_id: item.admin_profile_id || null,
        action: item.action,
        module: metadata.module || "team",
        entity_type: item.entity_type || "unknown",
        entity_id: item.entity_id || "",
        metadata,
        created_at: item.created_at,
        source: "admin_activity_logs",
      };
    }),
  ];

  const profileIds = new Set([
    ...teamMembers.map((item) => item.profile_id).filter(Boolean),
    ...legacyRoles.map((item) => item.user_id).filter(Boolean),
  ]);

  const profilesResponse = profileIds.size
    ? await client
      .from("profiles")
      .select("id, full_name, email, phone, role, created_at, deleted_at")
      .in("id", Array.from(profileIds))
    : { data: [], error: null };

  if (profilesResponse.error) {
    throw profilesResponse.error;
  }

  const profilesById = new Map((profilesResponse.data || []).map((item) => [item.id, item]));
  const rolesById = new Map(rolesModule.roles.map((item) => [item.id, item]));
  const rolesByCode = new Map(rolesModule.roles.map((item) => [item.code, item]));
  const legacyRolesByUserId = legacyRoles.reduce((acc, item) => {
    acc[item.user_id] ||= [];
    acc[item.user_id].push(normalizeRoleCode(item.role_code));
    return acc;
  }, {});
  const teamMembersByProfileId = new Map(teamMembers.map((item) => [item.profile_id, item]));

  const members = Array.from(profileIds).map((profileId) => {
    const profile = profilesById.get(profileId) || null;
    const teamMember = teamMembersByProfileId.get(profileId) || null;
    const legacyRoleCodes = Array.from(new Set((legacyRolesByUserId[profileId] || []).filter(Boolean)));
    const role =
      (teamMember?.role_id ? rolesById.get(teamMember.role_id) : null)
      || sortRolesByRank(legacyRoleCodes.map((code) => rolesByCode.get(code)).filter(Boolean))[0]
      || null;

    const activitySummary = summarizeRecentActivity(
      combinedActivityLogs,
      profileId,
    );
    const workSummary = summarizeWorkSessions(sessions, profileId);
    const memberSessions = sessions.filter((item) => item.admin_profile_id === profileId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const weekStartMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const activeTimeToday = memberSessions.reduce((sum, item) => {
      const startedAt = parseDateInput(item.started_at || item.created_at);
      return startedAt && startedAt >= todayStartMs ? sum + getSessionDurationSeconds(item) : sum;
    }, 0);
    const activeTimeThisWeek = memberSessions.reduce((sum, item) => {
      const startedAt = parseDateInput(item.started_at || item.created_at);
      return startedAt && startedAt >= weekStartMs ? sum + getSessionDurationSeconds(item) : sum;
    }, 0);
    const currentSession = memberSessions.find((item) => !item.ended_at) || null;
    const lastLogoutAt = memberSessions.find((item) => item.ended_at)?.ended_at || null;
    const status = teamMember
      ? normalizeTeamStatus(teamMember.status)
      : profile?.deleted_at ? "archived" : legacyRoleCodes.length ? "active" : "inactive";

    return {
      id: teamMember?.id || `legacy:${profileId}`,
      profileId,
      email: teamMember?.email || profile?.email || "",
      phone: profile?.phone || "",
      fullName: teamMember?.full_name || profile?.full_name || "",
      roleId: teamMember?.role_id || role?.id || null,
      roleCode: role?.code || legacyRoleCodes[0] || null,
      roleLabel: role?.name || role?.label || "No role",
      status,
      invitedBy: teamMember?.invited_by || null,
      createdAt: teamMember?.created_at || profile?.created_at || null,
      updatedAt: teamMember?.updated_at || null,
      lastLoginAt: teamMember?.last_login_at || workSummary.lastLoginAt || null,
      lastLogoutAt,
      currentSession,
      totalSessionCount: memberSessions.length,
      activeTimeTodaySeconds: activeTimeToday,
      activeTimeThisWeekSeconds: activeTimeThisWeek,
      recentActivityCount: activitySummary.recentCount,
      recentActivity: activitySummary.rows,
      recentSessionCount: workSummary.recentSessionCount,
      recentSessionDurationSeconds: workSummary.recentDurationSeconds,
      recentSessions: workSummary.rows,
      isOwner: !!role?.isOwnerRole,
      isSystemRole: !!role?.isSystemRole,
      source: teamMember ? "team_member" : "legacy",
    };
  }).sort((left, right) => {
    if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;
    return String(left.fullName || left.email).localeCompare(String(right.fullName || right.email));
  });

    return {
      members,
      roles: sortRolesByRank(rolesModule.roles).filter((role) => role.isActive),
      permissions: rolesModule.permissions || [],
      rolePermissions: rolesModule.rolePermissions || [],
      menuItems: rolesModule.menuItems || [],
      roleMenuVisibility: rolesModule.roleMenuVisibility || [],
      activityTimeline: combinedActivityLogs
        .filter((item) => item.admin_profile_id)
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()),
      workSessions: sessions,
      supportsTeamMembersV1: !teamMembersResponse.error,
      supportsAdminActivityLogsV1: !adminActivityResponse.error,
      supportsCoreActivityLogsV1: !activityResponse.error,
      supportsWorkSessionsV1: !sessionsResponse.error,
      supportsMenuAccessV1: rolesModule.supportsMenuAccessV1,
      supportsInviteEmailFlow: false,
    };
  }, options);
}

async function getRoleById(client, roleId) {
  const response = await client
    .from("admin_roles")
    .select("id, code, label, name, is_system_role, is_owner_role, is_active")
    .eq("id", roleId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (!response.data) {
    throw new Error("Role not found.");
  }

  return normalizeRoleRecord(response.data);
}

async function getAdminTeamMemberByProfileId(client, profileId) {
  const response = await client
    .from("admin_team_members")
    .select("id, profile_id, email, full_name, role_id, status, invited_by, last_login_at, created_at, updated_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (response.error && !isMissingOptionalTable(response.error) && !isMissingColumnError(response.error)) {
    throw response.error;
  }

  return response.error ? null : response.data;
}

async function fetchAssignedAdminRoleCodesForUser(client, profileId) {
  const response = await client
    .from("user_admin_roles")
    .select("role_code")
    .eq("user_id", profileId);

  if (response.error && !isMissingOptionalTable(response.error)) {
    throw response.error;
  }

  return response.error ? [] : (response.data || []).map((item) => normalizeRoleCode(item.role_code)).filter(Boolean);
}

async function assertOwnerTeamAccessCanChange(client, actorId, profileId, teamMember) {
  const roleCodes = await fetchAssignedAdminRoleCodesForUser(client, profileId);
  const targetIsOwner = !!teamMember?.role_id
    ? !!(await getRoleById(client, teamMember.role_id)).isOwnerRole
    : roleCodes.includes("owner") || roleCodes.includes("super_admin");

  if (!targetIsOwner) {
    return;
  }

  if (actorId && actorId === profileId) {
    throw new Error("Owner cannot remove or suspend their own access.");
  }

  const [rolesResponse, teamMembersResponse, legacyOwnersResponse] = await Promise.all([
    client.from("admin_roles").select("id, code, is_owner_role, is_active"),
    client.from("admin_team_members").select("profile_id, role_id, status"),
    client.from("user_admin_roles").select("user_id, role_code").in("role_code", ["owner", "super_admin"]),
  ]);

  if (rolesResponse.error) {
    throw rolesResponse.error;
  }

  if (teamMembersResponse.error && !isMissingOptionalTable(teamMembersResponse.error) && !isMissingColumnError(teamMembersResponse.error)) {
    throw teamMembersResponse.error;
  }

  if (legacyOwnersResponse.error && !isMissingOptionalTable(legacyOwnersResponse.error)) {
    throw legacyOwnersResponse.error;
  }

  const ownerRoleIds = new Set((rolesResponse.data || [])
    .filter((item) => item.is_owner_role && item.is_active)
    .map((item) => item.id));

  const activeOwnerProfiles = new Set([
    ...(teamMembersResponse.error ? [] : (teamMembersResponse.data || [])
      .filter((item) => item.status === "active" && ownerRoleIds.has(item.role_id))
      .map((item) => item.profile_id)),
    ...((legacyOwnersResponse.error ? [] : legacyOwnersResponse.data || []).map((item) => item.user_id)),
  ]);

  if (activeOwnerProfiles.has(profileId) && activeOwnerProfiles.size <= 1) {
    throw new Error("Cannot remove or suspend the last owner.");
  }
}

export async function createAdminTeamMember(input = {}) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const email = String(input.email || "").trim().toLowerCase();
  const fullName = String(input.fullName || "").trim();
  const phone = String(input.phone || "").trim();
  const password = String(input.password || "");
  const roleId = input.roleId || null;
  const status = normalizeTeamStatus(input.status || "active");
  const sendSetupLink = Boolean(input.sendSetupLink);

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!roleId) {
    throw new Error("Role is required.");
  }

  if (!password) {
    throw new Error("Password is required when creating an employee.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const [profileResponse, role] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, email, phone, role")
      .eq("email", email)
      .maybeSingle(),
    getRoleById(client, roleId),
  ]);

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  if (password || !profileResponse.data) {
    const result = await invokeAdminTeamFunction("create-admin-employee", {
      email,
      password,
      full_name: fullName || null,
      phone: phone || null,
      role_id: role.id,
      status,
      send_setup_link: sendSetupLink,
    });

    const profileId = result?.profile?.id || result?.profile_id || null;

    await recordActivity(client, {
      userId: actor?.id,
      action: "upsert_team_member",
      module: "team",
      targetEntityType: "profile",
      targetEntityId: profileId,
      previousValue: null,
      newValue: {
        email,
        role_code: role.code,
        status,
        source: "edge_function",
      },
    });

    void logAdminActivity("invite_team_member", "admin_team_member", profileId || email, {
      module: "team",
      role_id: role.id,
      role_code: role.code,
      status,
      source: "edge_function",
    });

    clearAdminMenuCache();

    return {
      id: result?.team_member?.id || null,
      profile_id: profileId,
      email,
      full_name: fullName || result?.profile?.full_name || null,
      role_id: role.id,
      status,
    };
  }

  const profile = profileResponse.data;
  const payload = {
    profile_id: profile.id,
    email,
    full_name: fullName || profile.full_name || null,
    role_id: role.id,
    status,
    invited_by: actor?.id || null,
  };

  const upsertResponse = await client
    .from("admin_team_members")
    .upsert(payload, { onConflict: "profile_id" })
    .select("id, profile_id, email, full_name, role_id, status")
    .single();

  if (upsertResponse.error) {
    throw upsertResponse.error;
  }

  if ((payload.full_name && payload.full_name !== profile.full_name) || (phone && phone !== String(profile.phone || ""))) {
    const profileUpdate = await client
      .from("profiles")
      .update({
        full_name: payload.full_name || profile.full_name || null,
        ...(phone ? { phone } : {}),
      })
      .eq("id", profile.id);
    if (profileUpdate.error) {
      throw profileUpdate.error;
    }
  }

  await updateUserAdminRoles(profile.id, status === "active" ? [role.code] : []);

  await recordActivity(client, {
    userId: actor?.id,
    action: "upsert_team_member",
    module: "team",
    targetEntityType: "profile",
    targetEntityId: profile.id,
    previousValue: null,
    newValue: {
      email,
      role_code: role.code,
      status,
    },
  });

  void logAdminActivity("invite_team_member", "admin_team_member", profile.id, {
    module: "team",
    role_id: role.id,
    role_code: role.code,
    status,
  });

  clearAdminMenuCache();

  return upsertResponse.data;
}

export async function updateAdminTeamMemberProfile(profileId, input = {}) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) {
    throw new Error("Employee id is required.");
  }

  const currentProfile = await client
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", normalizedProfileId)
    .maybeSingle();

  if (currentProfile.error) {
    throw currentProfile.error;
  }

  if (!currentProfile.data) {
    throw new Error("Employee profile not found.");
  }

  const nextFullName = String(input.fullName || "").trim() || currentProfile.data.full_name || null;
  const nextPhone = String(input.phone || "").trim() || null;
  const nextEmail = String(input.email || currentProfile.data.email || "").trim().toLowerCase();

  const profileUpdate = await client
    .from("profiles")
    .update({
      full_name: nextFullName,
      phone: nextPhone,
      ...(nextEmail ? { email: nextEmail } : {}),
    })
    .eq("id", normalizedProfileId);

  if (profileUpdate.error) {
    throw profileUpdate.error;
  }

  const teamUpdate = await client
    .from("admin_team_members")
    .update({
      full_name: nextFullName,
      ...(nextEmail ? { email: nextEmail } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", normalizedProfileId);

  if (teamUpdate.error && !isMissingOptionalTable(teamUpdate.error) && !isMissingColumnError(teamUpdate.error)) {
    throw teamUpdate.error;
  }

  await recordActivity(client, {
    userId: actor?.id,
    action: "update_team_member_profile",
    module: "team",
    targetEntityType: "profile",
    targetEntityId: normalizedProfileId,
    previousValue: currentProfile.data,
    newValue: {
      full_name: nextFullName,
      phone: nextPhone,
      email: nextEmail || currentProfile.data.email || null,
    },
  });

  return true;
}

export async function sendAdminEmployeeSetupLink({ email, profileId = null } = {}) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Employee email is required.");
  }

  let targetProfileId = String(profileId || "").trim() || null;
  if (!targetProfileId) {
    const profileResponse = await client
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (profileResponse.error) {
      throw profileResponse.error;
    }

    targetProfileId = profileResponse.data?.id || null;
  }

  await resetPassword(normalizedEmail);

  await recordActivity(client, {
    userId: actor?.id,
    action: "send_team_setup_link",
    module: "team",
    targetEntityType: "profile",
    targetEntityId: targetProfileId,
    newValue: {
      email: normalizedEmail,
    },
  });

  void logAdminActivity("send_team_setup_link", "admin_team_member", targetProfileId || normalizedEmail, {
    module: "team",
    email: normalizedEmail,
  });

  return true;
}

export async function updateAdminTeamMemberRole(profileId, roleId) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const [teamMember, role] = await Promise.all([
    getAdminTeamMemberByProfileId(client, profileId),
    getRoleById(client, roleId),
  ]);

  if (!teamMember) {
    throw new Error("Team member not found.");
  }

  const updateResponse = await client
    .from("admin_team_members")
    .update({ role_id: role.id })
    .eq("profile_id", profileId)
    .select("id, profile_id, role_id, status")
    .single();

  if (updateResponse.error) {
    throw updateResponse.error;
  }

  if (teamMember.status === "active") {
    await updateUserAdminRoles(profileId, [role.code]);
  }

  clearAdminMenuCache();

  await recordActivity(client, {
    userId: actor?.id,
    action: "change_team_role",
    module: "team",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: {
      role_id: teamMember.role_id,
    },
    newValue: {
      role_id: role.id,
      role_code: role.code,
    },
  });

  return updateResponse.data;
}

export async function updateAdminTeamMemberStatus(profileId, nextStatus) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const teamMember = await getAdminTeamMemberByProfileId(client, profileId);

  const status = normalizeTeamStatus(nextStatus);
  if (["inactive", "suspended", "archived"].includes(status)) {
    await assertOwnerTeamAccessCanChange(client, actor?.id || null, profileId, teamMember);
  }

  if (!teamMember) {
    if (status === "active") {
      throw new Error("This legacy admin user must be added to the team registry before reactivation.");
    }

    await updateUserAdminRoles(profileId, []);
    await recordActivity(client, {
      userId: actor?.id,
      action: "change_team_status",
      module: "team",
      targetEntityType: "profile",
      targetEntityId: profileId,
      previousValue: {
        status: "legacy_active",
      },
      newValue: {
        status,
      },
    });
    if (status === "suspended") {
      void logAdminActivity("suspend_team_member", "admin_team_member", profileId, {
        module: "team",
        status,
        source: "legacy",
      });
    }
    return { profile_id: profileId, status };
  }

  const updateResponse = await client
    .from("admin_team_members")
    .update({ status })
    .eq("profile_id", profileId)
    .select("id, profile_id, role_id, status")
    .single();

  if (updateResponse.error) {
    throw updateResponse.error;
  }

  if (status === "active") {
    const role = teamMember.role_id ? await getRoleById(client, teamMember.role_id) : null;
    if (role) {
      await updateUserAdminRoles(profileId, [role.code]);
    }
  } else if (["inactive", "suspended", "archived"].includes(status)) {
    await updateUserAdminRoles(profileId, []);
  }

  clearAdminMenuCache();

  await recordActivity(client, {
    userId: actor?.id,
    action: "change_team_status",
    module: "team",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: {
      status: teamMember.status,
    },
    newValue: {
      status,
    },
  });

  if (status === "suspended") {
    void logAdminActivity("suspend_team_member", "admin_team_member", profileId, {
      module: "team",
      status,
      role_id: teamMember.role_id || null,
    });
  }

  return updateResponse.data;
}

export async function removeAdminTeamMember(profileId) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const teamMember = await getAdminTeamMemberByProfileId(client, profileId);

  await assertOwnerTeamAccessCanChange(client, actor?.id || null, profileId, teamMember);

  if (!teamMember) {
    await updateUserAdminRoles(profileId, []);
    await recordActivity(client, {
      userId: actor?.id,
      action: "remove_team_member",
      module: "team",
      targetEntityType: "profile",
      targetEntityId: profileId,
      previousValue: {
        source: "legacy",
      },
      newValue: null,
    });
    return true;
  }

  const deleteResponse = await client
    .from("admin_team_members")
    .delete()
    .eq("profile_id", profileId);

  if (deleteResponse.error) {
    throw deleteResponse.error;
  }

  await updateUserAdminRoles(profileId, []);

  await recordActivity(client, {
    userId: actor?.id,
    action: "remove_team_member",
    module: "team",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: {
      team_member_id: teamMember.id,
      role_id: teamMember.role_id,
      status: teamMember.status,
    },
    newValue: null,
  });
}

export async function updateUserAdminRoles(userId, roleCodes = []) {
  await assertCurrentOwnerAdmin();

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);

  const [currentRoles, currentProfile] = await Promise.all([
    client.from("user_admin_roles").select("*").eq("user_id", userId),
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);

  if (currentRoles.error && !isMissingOptionalTable(currentRoles.error)) {
    throw currentRoles.error;
  }

  const normalized = toLegacyAdminRoleCodes(roleCodes);

  const removeQuery = client.from("user_admin_roles").delete().eq("user_id", userId);
  const { error: removeError } = await removeQuery;
  if (removeError && !isMissingOptionalTable(removeError)) {
    throw removeError;
  }

  if (normalized.length) {
    const { error: insertError } = await client.from("user_admin_roles").insert(
      normalized.map((roleCode) => ({
        user_id: userId,
        role_code: roleCode,
        assigned_by: actor?.id || null,
      })),
    );
    if (insertError) {
      throw insertError;
    }
  }

  const orderedRoles = [...normalized].sort((left, right) => {
    const rankMap = {
      owner: 110,
      super_admin: 100,
      admin: 90,
      partner_manager: 58,
      operations_manager: 70,
      case_manager: 60,
      customer_support_agent: 50,
      finance_manager: 45,
      content_manager: 40,
      read_only: 10,
    };
    return (rankMap[right] || 0) - (rankMap[left] || 0);
  });
  const primaryRole = orderedRoles[0] || "read_only";

  await recordActivity(client, {
    userId: actor?.id,
    action: "update_roles",
    module: "users",
    targetEntityType: "profile",
    targetEntityId: userId,
    previousValue: {
      profile_role: currentProfile.data?.role || null,
      admin_roles: (currentRoles.data || []).map((item) => item.role_code),
    },
    newValue: {
      profile_role: currentProfile.data?.role || null,
      primary_role: primaryRole,
      admin_roles: normalized,
    },
  });
}

export async function moveDocumentToTrash(document, note = "") {
  await assertDocumentsManageAccess("You do not have access to move documents to trash.");

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const entityType = getDocumentEntityType(document);
  const source = getTrashSourceConfig(entityType);

  if (!source?.table || !document?.id) {
    throw new Error("Trash action is not available for this document.");
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = getTrashPurgeAfterDate();
  const updatePayload = {
    deleted_at: deletedAt,
    deleted_by: actor?.id || null,
    purge_after: purgeAfter,
  };

  if (source.statusField) {
    updatePayload[source.statusField] = "deleted";
  }

  const updateResult = await client
    .from(source.table)
    .update(updatePayload)
    .eq("id", document.id);

  if (updateResult.error) {
    throw updateResult.error;
  }

  const trashPayload = {
    entity_type: entityType,
    entity_id: document.id,
    label: document.file_name || document.signer_name || document.id,
    owner_type: document.owner_type || null,
    owner_id: document.owner_id || null,
    storage_bucket: document.kind === "document" ? document.bucket || null : null,
    storage_path: document.kind === "document" ? document.file_path || null : null,
    deleted_by: actor?.id || null,
    deleted_at: deletedAt,
    purge_after: purgeAfter,
    metadata: {
      kind: document.kind || "document",
      document_type: document.document_type || null,
      owner_label: document.ownerLabel || null,
      signer_name: document.signer_name || null,
      signer_email: document.signer_email || null,
      note: note || null,
      status: document.status || null,
    },
  };

  const trashResult = await client
    .from("trash_items")
    .upsert(trashPayload, { onConflict: "entity_type,entity_id" })
    .select("id")
    .single();

  if (trashResult.error) {
    throw trashResult.error;
  }

  await recordActivity(client, {
    userId: actor?.id,
    action: "trash",
    module: "documents",
    targetEntityType: entityType,
    targetEntityId: document.id,
    newValue: trashPayload,
  });

  return trashResult.data;
}

export async function moveUserToTrash(profileId, note = "") {
  const client = requireSupabase();
  const actorState = await assertCurrentOwnerAdmin("Only the owner can delete users.");
  const actor = actorState?.user || null;

  if (!actor?.id) {
    throw new Error("You need to be signed in.");
  }

  if (profileId === actor.id) {
    throw new Error("You cannot delete your own account.");
  }

  const currentProfile = await client
    .from("profiles")
    .select("id, full_name, email, phone, role, status, deleted_at")
    .eq("id", profileId)
    .maybeSingle();

  if (currentProfile.error) {
    throw currentProfile.error;
  }

  if (!currentProfile.data?.id) {
    throw new Error("User profile was not found.");
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = getTrashPurgeAfterDate();

  const updateProfile = await client
    .from("profiles")
    .update({
      deleted_at: deletedAt,
      deleted_by: actor.id,
      purge_after: purgeAfter,
      deletion_note: note || null,
      status: "blocked",
    })
    .eq("id", profileId);

  if (updateProfile.error) {
    throw updateProfile.error;
  }

  await client
    .from("user_admin_roles")
    .delete()
    .eq("user_id", profileId);

  const trashPayload = {
    entity_type: "profile",
    entity_id: profileId,
    label: currentProfile.data.full_name || currentProfile.data.email || profileId,
    owner_type: "profile",
    owner_id: profileId,
    deleted_by: actor.id,
    deleted_at: deletedAt,
    purge_after: purgeAfter,
    metadata: {
      email: currentProfile.data.email || null,
      phone: currentProfile.data.phone || null,
      role: currentProfile.data.role || null,
      previous_status: currentProfile.data.status || null,
      note: note || null,
    },
  };

  const trashResult = await client
    .from("trash_items")
    .upsert(trashPayload, { onConflict: "entity_type,entity_id" })
    .select("id")
    .single();

  if (trashResult.error) {
    throw trashResult.error;
  }

  await recordActivity(client, {
    userId: actor.id,
    action: "trash_user",
    module: "users",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: currentProfile.data,
    newValue: trashPayload,
  });

  return trashResult.data;
}

export async function fetchTrashModuleData() {
  await assertTrashModuleAccess();

  const client = requireSupabase();
  const { data, error } = await client
    .from("trash_items")
    .select("id, entity_type, entity_id, label, owner_type, owner_id, storage_bucket, storage_path, deleted_by, deleted_at, purge_after, metadata")
    .order("deleted_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  return {
    items: data || [],
  };
}

export async function restoreTrashItem(item) {
  await assertTrashItemMutationAccess(item, "restore");

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const source = getTrashSourceConfig(item?.entity_type);

  if (!source?.table || !item?.entity_id) {
    throw new Error("Restore is not available for this trash item.");
  }

  const payload = {
    deleted_at: null,
    deleted_by: null,
    purge_after: null,
  };

  if (item.entity_type === "profile") {
    payload.deletion_note = null;
    payload.status = "active";
  } else if (source.statusField) {
    payload[source.statusField] = item?.metadata?.status || "uploaded";
  }

  const restoreResult = await client
    .from(source.table)
    .update(payload)
    .eq("id", item.entity_id);

  if (restoreResult.error) {
    throw restoreResult.error;
  }

  const deleteTrashResult = await client
    .from("trash_items")
    .delete()
    .eq("id", item.id);

  if (deleteTrashResult.error) {
    throw deleteTrashResult.error;
  }

  await recordActivity(client, {
    userId: actor?.id || null,
    action: "restore",
    module: "trash",
    targetEntityType: item.entity_type,
    targetEntityId: item.entity_id,
    previousValue: item,
    newValue: payload,
  });
}

async function removeStorageAsset(client, item) {
  if (!item?.storage_bucket || !item?.storage_path) {
    return;
  }

  const result = await client.storage
    .from(item.storage_bucket)
    .remove([item.storage_path]);

  if (result.error) {
    throw result.error;
  }
}

export async function permanentlyDeleteTrashItem(item) {
  if (item.entity_type === "profile") {
    const actorState = await assertCurrentOwnerAdmin("Only the owner can permanently delete user accounts.");
    const client = requireSupabase();
    const actor = actorState?.user || null;
    const rpcResult = await client.rpc("admin_permanently_delete_user", {
      target_user_id: item.entity_id,
    });

    if (rpcResult.error) {
      throw rpcResult.error;
    }

    await recordActivity(client, {
      userId: actor?.id || null,
      action: "purge_user",
      module: "trash",
      targetEntityType: item.entity_type,
      targetEntityId: item.entity_id,
      previousValue: item,
      newValue: rpcResult.data || null,
    });

    return rpcResult.data;
  }

  await assertTrashItemMutationAccess(item, "purge");

  const client = requireSupabase();
  const actor = await getCurrentUser().catch(() => null);
  const source = getTrashSourceConfig(item.entity_type);
  if (!source?.table) {
    throw new Error("Permanent deletion is not supported for this trash item.");
  }

  await removeStorageAsset(client, item);

  const deleteSourceResult = await client
    .from(source.table)
    .delete()
    .eq("id", item.entity_id);

  if (deleteSourceResult.error) {
    throw deleteSourceResult.error;
  }

  const deleteTrashResult = await client
    .from("trash_items")
    .delete()
    .eq("id", item.id);

  if (deleteTrashResult.error) {
    throw deleteTrashResult.error;
  }

  await recordActivity(client, {
    userId: actor?.id || null,
    action: "purge",
    module: "trash",
    targetEntityType: item.entity_type,
    targetEntityId: item.entity_id,
    previousValue: item,
  });

  return { deleted: true };
}

export async function purgeExpiredTrashItems() {
  await assertTrashModuleAccess();

  const client = requireSupabase();
  const { data, error } = await client
    .from("trash_items")
    .select("id, entity_type, entity_id, label, owner_type, owner_id, storage_bucket, storage_path, deleted_by, deleted_at, purge_after, metadata")
    .lte("purge_after", new Date().toISOString())
    .order("purge_after", { ascending: true })
    .limit(100);

  if (error) {
    throw error;
  }

  let purged = 0;
  for (const item of data || []) {
    try {
      await permanentlyDeleteTrashItem(item);
      purged += 1;
    } catch (nextError) {
      const message = String(nextError?.message || "");
      if (message.startsWith("You do not have access") || message.startsWith("Only the owner")) {
        continue;
      }
      throw nextError;
    }
  }

  return { purged };
}

function getAdminMenuCacheKey(profileId, roleCodes = []) {
  return `${ADMIN_MENU_CACHE_PREFIX}${ADMIN_MENU_CACHE_VERSION}:${profileId || "guest"}:${[...roleCodes].sort().join(",")}`;
}

function clearAdminMenuCache() {
  adminMenuCache.clear();

  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.startsWith(ADMIN_MENU_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {}
}

function reviveAdminMenuPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const routeAliases = new Map([
    ["/admin/finance", "/admin/finances/finance"],
    ["/admin/finance/payments", "/admin/finances/payments"],
    ["/admin/finance/revenue", "/admin/dashboard/revenue"],
    ["/admin/payments", "/admin/finances/payments"],
    ["/admin/revenue", "/admin/dashboard/revenue"],
    ["/admin/reports", "/admin/dashboard/revenue"],
    ["/admin/finances/revenue", "/admin/dashboard/revenue"],
  ]);

  const reviveItem = (item) => {
    if (!item?.path) {
      return item;
    }

    const normalizedPath = routeAliases.get(item.path) || item.path;
    const staticItem = adminNavigationByPath.get(normalizedPath);
    return staticItem
      ? {
        ...staticItem,
        ...item,
        path: normalizedPath,
        icon: staticItem.icon,
      }
      : {
        ...item,
        path: normalizedPath,
      };
  };

  const items = Array.isArray(payload.items) ? payload.items.map(reviveItem) : [];
  const groups = Array.isArray(payload.groups)
    ? payload.groups.map((group) => ({
      ...group,
      items: Array.isArray(group.items) ? group.items.map(reviveItem) : [],
    }))
    : [];

  return {
    ...payload,
    items,
    groups,
  };
}

function readAdminMenuCache(cacheKey) {
  if (typeof window === "undefined") {
    return reviveAdminMenuPayload(adminMenuCache.get(cacheKey)) || null;
  }

  if (adminMenuCache.has(cacheKey)) {
    return reviveAdminMenuPayload(adminMenuCache.get(cacheKey));
  }

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const revived = reviveAdminMenuPayload(parsed);
    adminMenuCache.set(cacheKey, revived);
    return revived;
  } catch {
    return null;
  }
}

function writeAdminMenuCache(cacheKey, payload) {
  adminMenuCache.set(cacheKey, payload);
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {}
}

export async function fetchAdminSidebarMenu(profileId, roleCodes = []) {
  const normalizedRoleCodes = Array.from(new Set((roleCodes || []).map((role) => normalizeRoleCode(role)).filter(Boolean)));
  const cacheKey = getAdminMenuCacheKey(profileId, normalizedRoleCodes);
  const cached = readAdminMenuCache(cacheKey);
  if (cached) {
    return cached;
  }

  const client = requireSupabase();
  const staticItemsByPath = new Map(adminNavigation.map((item) => [item.path, item]));

  const teamMemberResponse = profileId
    ? await client
      .from("admin_team_members")
      .select("id, profile_id, role_id, status")
      .eq("profile_id", profileId)
      .maybeSingle()
    : { data: null, error: null };

  if (teamMemberResponse.error && !isMissingOptionalTable(teamMemberResponse.error) && !isMissingColumnError(teamMemberResponse.error)) {
    throw teamMemberResponse.error;
  }

  let resolvedRole = null;

  if (teamMemberResponse.data?.role_id) {
    const roleResponse = await client
      .from("admin_roles")
      .select("id, code, name, label, is_active, rank, is_owner_role, is_system_role")
      .eq("id", teamMemberResponse.data.role_id)
      .maybeSingle();

    if (roleResponse.error && !isMissingOptionalTable(roleResponse.error) && !isMissingColumnError(roleResponse.error)) {
      throw roleResponse.error;
    }

    resolvedRole = roleResponse.data
      ? normalizeRoleRecord(roleResponse.data)
      : null;
  }

  if (!resolvedRole && normalizedRoleCodes.length) {
    const rolesResponse = await client
      .from("admin_roles")
      .select("id, code, name, label, is_active, rank, is_owner_role, is_system_role")
      .in("code", normalizedRoleCodes);

    if (rolesResponse.error && !isMissingOptionalTable(rolesResponse.error) && !isMissingColumnError(rolesResponse.error)) {
      throw rolesResponse.error;
    }

    resolvedRole = sortRolesByRank((rolesResponse.data || []).map(normalizeRoleRecord).filter((role) => role?.isActive))[0] || null;
  }

  if (!resolvedRole) {
    const fallback = {
      source: "static",
      roleId: null,
      roleCode: normalizedRoleCodes[0] || null,
      items: adminNavigation,
      groups: buildAdminNavigationGroups(adminNavigation),
    };
    writeAdminMenuCache(cacheKey, fallback);
    return fallback;
  }

  if (resolvedRole.isOwnerRole || resolvedRole.code === "owner" || resolvedRole.code === "super_admin") {
    const ownerPayload = {
      source: "static",
      roleId: resolvedRole.id,
      roleCode: resolvedRole.code,
      items: adminNavigation,
      groups: buildAdminNavigationGroups(adminNavigation),
    };
    writeAdminMenuCache(cacheKey, ownerPayload);
    return ownerPayload;
  }

  const [menuItemsResponse, visibilityResponse] = await Promise.all([
    client
      .from("admin_menu_items")
      .select("id, key, label, route, icon, group_key, group_label, sort_order, is_enabled, required_permissions")
      .eq("is_enabled", true),
    client
      .from("admin_role_menu_visibility")
      .select("menu_item_id, is_visible, sort_order")
      .eq("role_id", resolvedRole.id),
  ]);

  if (menuItemsResponse.error && !isMissingOptionalTable(menuItemsResponse.error) && !isMissingColumnError(menuItemsResponse.error)) {
    throw menuItemsResponse.error;
  }

  if (visibilityResponse.error && !isMissingOptionalTable(visibilityResponse.error) && !isMissingColumnError(visibilityResponse.error)) {
    throw visibilityResponse.error;
  }

  const visibilityByMenuItemId = new Map((visibilityResponse.data || []).map((item) => [item.menu_item_id, item]));

  const dynamicItems = (menuItemsResponse.data || [])
    .map((item) => {
      const visibility = visibilityByMenuItemId.get(item.id);
      if (visibility && visibility.is_visible === false) {
        return null;
      }

      const staticItem = staticItemsByPath.get(item.route);
      if (!staticItem) {
        return null;
      }

      return {
        ...staticItem,
        label: item.label || staticItem.label,
        path: item.route,
        groupKey: item.group_key || null,
        groupLabel: item.group_label || null,
        sortOrder: visibility?.sort_order ?? item.sort_order ?? 0,
        requiredPermissions: Array.isArray(item.required_permissions) ? item.required_permissions : [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const groupCompare = String(left.groupLabel || "").localeCompare(String(right.groupLabel || ""));
      if (groupCompare !== 0) return groupCompare;
      const orderCompare = (left.sortOrder || 0) - (right.sortOrder || 0);
      if (orderCompare !== 0) return orderCompare;
      return String(left.label || "").localeCompare(String(right.label || ""));
    });

  const mergedItems = dynamicItems.length
    ? dynamicItems
    : adminNavigation.map((item) => {
      const fallbackGroup = buildAdminNavigationGroups([item])[0] || null;
      return {
        ...item,
        groupKey: item.groupKey || fallbackGroup?.key || null,
        groupLabel: item.groupLabel || fallbackGroup?.label || null,
        sortOrder: item.sortOrder ?? 999,
        requiredPermissions: Array.isArray(item.requiredPermissions) ? item.requiredPermissions : [],
      };
    });

  const dynamicGroupsMap = new Map();
  mergedItems.forEach((item) => {
    const groupKey = item.groupKey || "other";
    const existing = dynamicGroupsMap.get(groupKey) || {
      key: groupKey,
      label: item.groupLabel || buildAdminNavigationGroups([item])[0]?.label || "Other",
      items: [],
    };
    existing.items.push(item);
    dynamicGroupsMap.set(groupKey, existing);
  });

  const dynamicGroups = Array.from(dynamicGroupsMap.values());
  dynamicGroups.sort((left, right) => {
    const leftIndex = adminNavigationGroupOrder.indexOf(left.key);
    const rightIndex = adminNavigationGroupOrder.indexOf(right.key);
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return String(left.label || "").localeCompare(String(right.label || ""));
  });
  const payload = {
    source: "dynamic",
    roleId: resolvedRole.id,
    roleCode: resolvedRole.code,
    items: mergedItems,
    groups: dynamicGroups.length ? dynamicGroups : buildAdminNavigationGroups(adminNavigation),
  };

  writeAdminMenuCache(cacheKey, payload);
  return payload;
}

export async function fetchAdminSearchData(options = {}) {
  return withAdminModuleCache("admin-search-index", async () => {
    const client = requireSupabase();

    const [leads, cases, customers, tasks, partners, blogPosts, faqItems, cmsPages, settings] = await Promise.all([
      client.from("leads").select("id, lead_code, full_name, email, airline, departure_airport, arrival_airport, status").order("created_at", { ascending: false }).limit(250),
      client.from("cases").select("id, case_code, airline, route_from, route_to, status").order("created_at", { ascending: false }).limit(100),
      client.from("customers").select("id, full_name, email, phone, country").order("created_at", { ascending: false }).limit(100),
      client.from("tasks").select("id, title, status, related_entity_type").order("created_at", { ascending: false }).limit(100),
      client.from("referral_partners").select("id, name, referral_code, status").order("created_at", { ascending: false }).limit(100),
      client.from("blog_posts").select("id, title, slug, status").order("updated_at", { ascending: false }).limit(100),
      client.from("faq_items").select("id, question, category, status").order("updated_at", { ascending: false }).limit(100),
      client.from("cms_pages").select("id, page_key, title, slug, status").order("updated_at", { ascending: false }).limit(100),
      client.from("system_settings").select("id, setting_key, label, group_key").order("updated_at", { ascending: false }).limit(100),
    ]);

    const tolerate = [partners, blogPosts, faqItems, cmsPages, settings];
    for (const result of [leads, cases, customers, tasks]) {
      if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
        throw result.error;
      }
    }
    for (const result of tolerate) {
      if (result.error && !isMissingOptionalTable(result.error) && !isMissingColumnError(result.error)) {
        throw result.error;
      }
    }

    return {
      leads: leads.data || [],
      cases: cases.data || [],
      customers: customers.data || [],
      tasks: tasks.data || [],
      partners: partners.data || [],
      blogPosts: blogPosts.data || [],
      faqItems: faqItems.data || [],
      cmsPages: cmsPages.data || [],
      settings: settings.data || [],
    };
  }, options);
}

export function preloadAdminWorkspaceData({ force = false } = {}) {
  return Promise.allSettled([
    fetchAdminSearchData({ force }),
    fetchLeadsModuleData({ force }),
    fetchCasesModuleData({ page: 1, pageSize: 500, force }),
    fetchCustomersModuleData({ force }),
    fetchFinanceModuleData({ force }),
    fetchReferralControlCenterData({ force }),
    fetchActivityLogsData({ force }),
    fetchAdminRolesModuleData({ force }),
    fetchAdminTeamModuleData({ force }),
  ]).then(() => undefined);
}

export async function createCmsPage(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    page_key: input.page_key,
    title: input.title,
    slug: input.slug || "/",
    status: input.status || "draft",
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    locale: input.locale || "en",
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("cms_pages").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "cms",
    targetEntityType: "cms_page",
    targetEntityId: payload.id,
    newValue: payload,
  });

  return data;
}

export async function updateCmsPage(pageId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("cms_pages").select("*").eq("id", pageId).maybeSingle();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("cms_pages").update(payload).eq("id", pageId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "cms",
    targetEntityType: "cms_page",
    targetEntityId: pageId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

export async function createCmsBlock(input) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const payload = {
    id: crypto.randomUUID(),
    page_id: input.page_id,
    block_type: input.block_type,
    block_key: input.block_key,
    title: input.title || null,
    body: input.body || null,
    image_url: input.image_url || null,
    cta_label: input.cta_label || null,
    cta_link: input.cta_link || null,
    sort_order: Number(input.sort_order || 0),
    status: input.status || "draft",
    payload: input.payload || {},
    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await client.from("cms_blocks").insert(payload).select("id").single();
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "create",
    module: "cms",
    targetEntityType: "cms_block",
    targetEntityId: payload.id,
    newValue: payload,
    meta: { page_id: input.page_id },
  });

  return data;
}

export async function updateCmsBlock(blockId, updates) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("cms_blocks").select("*").eq("id", blockId).maybeSingle();
  const payload = {
    ...updates,
    sort_order: updates.sort_order === undefined ? undefined : Number(updates.sort_order || 0),
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { error } = await client.from("cms_blocks").update(payload).eq("id", blockId);
  if (error) throw error;

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "cms",
    targetEntityType: "cms_block",
    targetEntityId: blockId,
    previousValue: current.data || null,
    newValue: payload,
  });
}

function getDocumentBucketCandidates(document) {
  const primaryBucket = String(document?.bucket || "").trim();
  const filePath = String(document?.file_path || "");
  const buckets = [primaryBucket];

  if (primaryBucket === "case-documents" && filePath.startsWith("leads/")) {
    buckets.push("claim-lead-documents");
  }

  return buckets.filter(Boolean);
}

export async function getDocumentDownloadUrl(document) {
  const client = requireSupabase();
  let lastError = null;

  for (const bucket of getDocumentBucketCandidates(document)) {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(document.file_path, 60);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    lastError = error || lastError;
  }

  throw lastError || new Error("Could not create document download URL.");
}

export function downloadSignaturePng(signatureDataUrl, fileName = "signature.png") {
  if (!signatureDataUrl) {
    throw new Error("Signature file is missing.");
  }

  const link = document.createElement("a");
  link.href = signatureDataUrl;
  link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function updateLeadStatus(leadId, status) {
  await assertLeadsEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const currentLead = await client
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();
  const { error } = await client
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    throw error;
  }

  const historyInsert = await client
    .from("lead_status_history")
    .insert({
      lead_id: leadId,
      previous_status: currentLead.data?.status || null,
      next_status: status,
      changed_by: user?.id || null,
    });

  if (historyInsert.error && !isMissingOptionalTable(historyInsert.error)) {
    throw historyInsert.error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update_status",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: leadId,
    previousValue: { status: currentLead.data?.status || null },
    newValue: { status },
  });

  notifyAdmin({
    type: "lead_status_changed",
    severity: status === "not_eligible" || status === "archived" ? "warning" : "info",
    title: "Lead status changed",
    body: `Lead moved to ${status}.`,
    module: "leads",
    entityType: "lead",
    entityId: leadId,
    actionUrl: `/admin/operations/leads?lead=${leadId}`,
    recipientRole: "owner",
  });

  void logAdminActivity("update_lead", "lead", leadId, {
    module: "leads",
    fields: ["status"],
    status,
  });
}

export async function updateCaseWorkflow(caseId, updates) {
  await assertCasesEditAccess();

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("cases").select("*").eq("id", caseId).maybeSingle();
  const now = new Date().toISOString();
  const payload = {
    ...updates,
    updated_at: now,
  };

  if (updates.status === "approved") payload.approved_at = now;
  if (updates.status === "rejected") payload.rejected_at = now;
  if (updates.status === "paid") payload.paid_at = now;
  if (updates.status === "closed") payload.closed_at = now;

  const { error } = await client
    .from("cases")
    .update(payload)
    .eq("id", caseId);

  if (error) {
    throw error;
  }

  if (updates.status && updates.status !== current.data?.status) {
    const history = await client
      .from("case_status_history")
      .insert({
        case_id: caseId,
        previous_status: current.data?.status || null,
        next_status: updates.status,
        changed_by: user?.id || null,
      });

    if (history.error && !isMissingOptionalTable(history.error)) {
      throw history.error;
    }
  }

  const [updatedCase, financeResponse] = await Promise.all([
    client.from("cases").select("*").eq("id", caseId).maybeSingle(),
    client.from("case_finance").select("*").eq("case_id", caseId).maybeSingle(),
  ]);
  const leadId = updatedCase.data?.lead_id || current.data?.lead_id || null;
  const leadRow = leadId
    ? (await client.from("leads").select("*").eq("id", leadId).maybeSingle()).data || null
    : null;

  await syncPartnerCommissionForCase(client, {
    lead: leadRow,
    caseRow: updatedCase.data || { ...current.data, ...payload },
    financeRow: financeResponse.data || null,
  }).catch(() => null);

  await recordActivity(client, {
    userId: user?.id,
    action: "update",
    module: "cases",
    targetEntityType: "case",
    targetEntityId: caseId,
    previousValue: current.data || null,
    newValue: payload,
  });

  void logAdminActivity("update_case", "case", caseId, {
    module: "cases",
    fields: Object.keys(updates || {}),
    status: payload.status || current.data?.status || null,
    payout_status: payload.payout_status || current.data?.payout_status || null,
  });

  if (updates.status && updates.status !== current.data?.status) {
    notifyAdmin({
      type: "case_status_changed",
      severity: ["rejected", "escalated", "documents_pending"].includes(updates.status) ? "warning" : "info",
      title: "Case status changed",
      body: `${updatedCase.data?.case_code || "Case"} moved to ${updates.status}.`,
      module: "cases",
      entityType: "case",
      entityId: caseId,
      actionUrl: `/admin/operations/cases?case=${caseId}`,
      recipientProfileId: updatedCase.data?.assigned_manager_id || current.data?.assigned_manager_id || null,
    });
  }
}

export async function assignLeadOwner(leadId, assignedUserId) {
  await assertCurrentAdminPermission("leads.assign", {
    message: "You do not have access to assign leads.",
  });

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("leads").select("assigned_user_id").eq("id", leadId).maybeSingle();
  const { error } = await client
    .from("leads")
    .update({
      assigned_user_id: assignedUserId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Apply Core Operations schema V1 in Supabase to enable lead assignment.");
    }

    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "assign",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: leadId,
    previousValue: current.data || null,
    newValue: { assigned_user_id: assignedUserId || null },
  });

  void logAdminActivity("update_lead", "lead", leadId, {
    module: "leads",
    fields: ["assigned_user_id"],
    assigned_user_id: assignedUserId || null,
  });
}

export async function createLeadNote(leadId, body) {
  await assertLeadsEditAccess("You do not have access to add lead notes.");

  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const { error } = await client
    .from("lead_notes")
    .insert({
      lead_id: leadId,
      body,
      created_by: user?.id || null,
    });

  if (error) {
    if (isMissingOptionalTable(error)) {
      throw new Error("Apply Core Operations schema V1 in Supabase to enable internal lead notes.");
    }

    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "create_note",
    module: "leads",
    targetEntityType: "lead",
    targetEntityId: leadId,
    newValue: { body },
  });
}

export async function updateClaimStatus(claimId, status) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("claims").select("status").eq("id", claimId).maybeSingle();
  const { error } = await client
    .from("claims")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update_status",
    module: "claims",
    targetEntityType: "claim",
    targetEntityId: claimId,
    previousValue: current.data || null,
    newValue: { status },
  });
}

export async function updateProfileRole(profileId, role) {
  const client = requireSupabase();
  const user = await getCurrentUser().catch(() => null);
  const current = await client.from("profiles").select("role").eq("id", profileId).maybeSingle();
  const { error } = await client
    .from("profiles")
    .update({ role })
    .eq("id", profileId);

  if (error) {
    throw error;
  }

  await recordActivity(client, {
    userId: user?.id,
    action: "update_role",
    module: "users",
    targetEntityType: "profile",
    targetEntityId: profileId,
    previousValue: current.data || null,
    newValue: { role },
  });
}
