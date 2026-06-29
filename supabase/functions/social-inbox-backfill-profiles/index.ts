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
  conversation_ids?: string[];
  limit?: number;
};

type InstagramUserProfile = {
  id?: string;
  name?: string | null;
  username?: string | null;
  profile_pic?: string | null;
  follower_count?: number | null;
  is_user_follow_business?: boolean | null;
  is_business_follow_user?: boolean | null;
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

function instagramAccessToken() {
  return getEnv("META_INSTAGRAM_ACCESS_TOKEN") || getEnv("META_PAGE_ACCESS_TOKEN");
}

function normalizeSocialHandle(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("@")) return normalized;
  if (/^[a-z0-9._]+$/i.test(normalized) && /[a-z]/i.test(normalized)) {
    return `@${normalized}`;
  }
  return normalized;
}

function isGenericSocialParticipantName(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return /^(instagram|facebook|messenger|meta)\s+user\s+\d+$/i.test(normalized);
}

function isNumericParticipantLabel(value: unknown) {
  return /^\d{6,}$/.test(String(value || "").trim());
}

function isConversationMissingReadableName(conversation: Record<string, unknown>) {
  const participantName = String(conversation.participant_name || "").trim();
  const participantHandle = String(conversation.participant_handle || "").trim();
  const meta = (conversation.meta && typeof conversation.meta === "object") ? conversation.meta as Record<string, unknown> : {};
  const profileLookup = (meta.profile_lookup && typeof meta.profile_lookup === "object") ? meta.profile_lookup as Record<string, unknown> : {};
  const username = String(profileLookup.username || "").trim();

  if (username) {
    return false;
  }

  if (participantHandle.startsWith("@")) {
    return false;
  }

  return !participantName
    || isGenericSocialParticipantName(participantName)
    || isNumericParticipantLabel(participantName)
    || isNumericParticipantLabel(participantHandle);
}

async function fetchInstagramUserProfile(igsid: string): Promise<{ profile: InstagramUserProfile | null; error: string | null; status: number | null }> {
  const accessToken = instagramAccessToken();
  if (!igsid) {
    return { profile: null, error: "Missing Instagram sender ID.", status: null };
  }
  if (!accessToken) {
    return { profile: null, error: "Missing META_INSTAGRAM_ACCESS_TOKEN secret.", status: null };
  }

  const url = new URL(`https://graph.facebook.com/${graphApiVersion()}/${igsid}`);
  url.searchParams.set("fields", "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url).catch((error) => {
    throw new Error(`Instagram profile lookup network error: ${errorMessage(error)}`);
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } } | null;
    const error = errorBody?.error?.message || JSON.stringify(body) || "Instagram profile lookup failed.";
    return { profile: null, error, status: response.status };
  }

  return { profile: body as InstagramUserProfile, error: null, status: response.status };
}

function getParticipantId(conversation: Record<string, unknown>) {
  const meta = (conversation.meta && typeof conversation.meta === "object") ? conversation.meta as Record<string, unknown> : {};
  const metaParticipantId = String(meta.participant_id || "").trim();
  if (metaParticipantId) {
    return metaParticipantId;
  }

  const participantHandle = String(conversation.participant_handle || "").trim().replace(/^@/, "");
  if (isNumericParticipantLabel(participantHandle)) {
    return participantHandle;
  }

  const participantName = String(conversation.participant_name || "").trim();
  if (isNumericParticipantLabel(participantName)) {
    return participantName;
  }

  const externalConversationId = String(conversation.external_conversation_id || "").trim();
  const lastSegment = externalConversationId.split(":").filter(Boolean).at(-1) || "";
  if (isNumericParticipantLabel(lastSegment)) {
    return lastSegment;
  }

  return "";
}

async function requireAuthorizedReviewer(
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
    serviceRoleClient.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
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
    throw new Response(JSON.stringify({ error: { message: "You are not allowed to refresh inbox profiles." } }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, { status: 405 });
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json({ error: { message: "Supabase environment variables are missing." } }, { status: 500 });
  }

  if (!instagramAccessToken()) {
    return json({ error: { message: "Instagram access token is missing." } }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    await requireAuthorizedReviewer(req, supabaseUrl, supabaseAnonKey, supabase);
    const body = await req.json().catch(() => ({})) as RequestBody;
    const limit = Math.max(1, Math.min(100, Number(body.limit || 20)));
    const conversationIds = Array.isArray(body.conversation_ids)
      ? body.conversation_ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    const accountsResponse = await supabase
      .from("social_accounts")
      .select("id, platform")
      .eq("platform", "instagram")
      .limit(200);

    if (accountsResponse.error) {
      throw accountsResponse.error;
    }

    const instagramAccountIds = (accountsResponse.data || []).map((item) => item.id);
    if (!instagramAccountIds.length) {
      return json({ ok: true, updated: 0, scanned: 0, skipped: 0 });
    }

    let query = supabase
      .from("social_conversations")
      .select("id, account_id, external_conversation_id, participant_name, participant_handle, avatar_url, meta")
      .in("account_id", instagramAccountIds)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (conversationIds.length) {
      query = query.in("id", conversationIds);
    }

    const conversationsResponse = await query;
    if (conversationsResponse.error) {
      throw conversationsResponse.error;
    }

    const conversations = (conversationsResponse.data || []).filter(isConversationMissingReadableName);
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ conversation_id: string; message: string }> = [];

    for (const conversation of conversations) {
      const participantId = getParticipantId(conversation);
      if (!participantId) {
        skipped += 1;
        continue;
      }

      try {
        const lookup = await fetchInstagramUserProfile(participantId);
        if (!lookup.profile) {
          const nextMeta = {
            ...(conversation.meta && typeof conversation.meta === "object" ? conversation.meta : {}),
            profile_lookup: null,
            profile_lookup_error: lookup.error,
            participant_id: participantId,
          };
          const failureUpdate = await supabase
            .from("social_conversations")
            .update({ meta: nextMeta })
            .eq("id", conversation.id);

          if (failureUpdate.error) {
            throw failureUpdate.error;
          }

          skipped += 1;
          continue;
        }

        const username = String(lookup.profile.username || "").trim();
        const fullName = String(lookup.profile.name || "").trim();
        const displayName = username || fullName || String(conversation.participant_name || "").trim();
        const handle = username ? `@${username}` : normalizeSocialHandle(conversation.participant_handle);
        const nextMeta = {
          ...(conversation.meta && typeof conversation.meta === "object" ? conversation.meta : {}),
          participant_id: participantId,
          profile_lookup: {
            username: username || null,
            name: fullName || null,
            follower_count: lookup.profile.follower_count ?? null,
            is_user_follow_business: lookup.profile.is_user_follow_business ?? null,
            is_business_follow_user: lookup.profile.is_business_follow_user ?? null,
            synced_at: new Date().toISOString(),
          },
          profile_lookup_error: null,
        };

        const updateConversation = await supabase
          .from("social_conversations")
          .update({
            participant_name: displayName || conversation.participant_name,
            participant_handle: handle || conversation.participant_handle,
            avatar_url: lookup.profile.profile_pic || conversation.avatar_url || null,
            meta: nextMeta,
          })
          .eq("id", conversation.id);

        if (updateConversation.error) {
          throw updateConversation.error;
        }

        const messagesResponse = await supabase
          .from("social_messages")
          .select("id, sender_name, meta")
          .eq("conversation_id", conversation.id)
          .eq("direction", "inbound");

        if (messagesResponse.error) {
          throw messagesResponse.error;
        }

        for (const message of messagesResponse.data || []) {
          const senderName = String(message.sender_name || "").trim();
          const shouldUpdateSenderName = !senderName || isGenericSocialParticipantName(senderName) || isNumericParticipantLabel(senderName);
          const nextMessageMeta = {
            ...(message.meta && typeof message.meta === "object" ? message.meta : {}),
            profile_lookup: {
              username: username || null,
              name: fullName || null,
              profile_pic: lookup.profile.profile_pic || null,
            },
          };

          const updateMessage = await supabase
            .from("social_messages")
            .update({
              sender_name: shouldUpdateSenderName ? displayName : message.sender_name,
              meta: nextMessageMeta,
            })
            .eq("id", message.id);

          if (updateMessage.error) {
            throw updateMessage.error;
          }
        }

        updated += 1;
      } catch (error) {
        errors.push({
          conversation_id: String(conversation.id || ""),
          message: errorMessage(error),
        });
      }
    }

    return json({
      ok: true,
      scanned: conversations.length,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return json({ error: { message: errorMessage(error) } }, { status: 500 });
  }
});
