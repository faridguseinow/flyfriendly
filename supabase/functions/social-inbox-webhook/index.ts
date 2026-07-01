import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FALLBACK_VERIFY_TOKEN = "flyfriendly_meta_inbox_2026";
const WEBHOOK_CODE_VERSION = "social-inbox-webhook-profile-debug-2026-06-26";

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: unknown[];
  };
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
};

type SupabaseClient = ReturnType<typeof createClient>;

type InstagramUserProfile = {
  id?: string;
  name?: string | null;
  username?: string | null;
  profile_pic?: string | null;
  follower_count?: number | null;
  is_user_follow_business?: boolean | null;
  is_business_follow_user?: boolean | null;
};

type InstagramProfileLookupResult = {
  profile: InstagramUserProfile | null;
  error: string | null;
  status: number | null;
};

const SOCIAL_AVATAR_BUCKET = "social-profile-avatars";

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
  return getEnv("META_GRAPH_API_VERSION") || "v25.0";
}

function normalizePlatform(objectValue: unknown) {
  const value = String(objectValue || "").toLowerCase();
  if (value.includes("instagram")) return "instagram";
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("page") || value.includes("messenger")) return "messenger";
  return "facebook";
}

function eventText(event: MessagingEvent) {
  if (event.message?.text) return event.message.text;
  if (event.postback?.title) return event.postback.title;
  if (event.postback?.payload) return event.postback.payload;
  if (event.message?.attachments?.length) return "[Attachment]";
  return "";
}

function eventExternalId(event: MessagingEvent) {
  return event.message?.mid || event.postback?.mid || `${event.sender?.id || "unknown"}-${event.timestamp || Date.now()}`;
}

function instagramAccessToken() {
  return (getEnv("META_INSTAGRAM_ACCESS_TOKEN") || getEnv("META_PAGE_ACCESS_TOKEN")).trim();
}

function instagramGraphBaseUrl(accessToken: string) {
  return accessToken.startsWith("IGAA")
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
}

async function fetchInstagramUserProfile(igsid: string): Promise<InstagramProfileLookupResult> {
  const accessToken = instagramAccessToken();
  if (!igsid) {
    return { profile: null, error: "Missing Instagram sender ID.", status: null };
  }
  if (!accessToken) {
    return { profile: null, error: "Missing META_INSTAGRAM_ACCESS_TOKEN secret.", status: null };
  }

  const url = new URL(`${instagramGraphBaseUrl(accessToken)}/${graphApiVersion()}/${igsid}`);
  url.searchParams.set(
    "fields",
    "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user",
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch((error) => {
    throw new Error(`Instagram profile lookup network error: ${errorMessage(error)}`);
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } } | null;
    const error = errorBody?.error?.message || JSON.stringify(body) || "Instagram profile lookup failed.";
    console.warn("Instagram profile lookup failed", {
      status: response.status,
      error,
      igsid,
    });
    return { profile: null, error, status: response.status };
  }

  return { profile: body as InstagramUserProfile, error: null, status: response.status };
}

async function cacheInstagramAvatar(
  supabase: SupabaseClient,
  participantId: string,
  sourceUrl: string | null | undefined,
) {
  if (!sourceUrl) return null;

  const imageResponse = await fetch(sourceUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).catch(() => null);
  if (!imageResponse?.ok) return sourceUrl;

  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
    ? "webp"
    : "jpg";
  const bucketResponse = await supabase.storage.createBucket(SOCIAL_AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (bucketResponse.error && !bucketResponse.error.message.toLowerCase().includes("already exists")) {
    console.warn("Could not create social avatar bucket", bucketResponse.error.message);
    return sourceUrl;
  }

  const path = `${participantId}.${extension}`;
  const upload = await supabase.storage
    .from(SOCIAL_AVATAR_BUCKET)
    .upload(path, await imageResponse.arrayBuffer(), {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });
  if (upload.error) {
    console.warn("Could not cache Instagram avatar", upload.error.message);
    return sourceUrl;
  }

  return supabase.storage.from(SOCIAL_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

function displayNameFromProfile(participantId: string, profile: InstagramUserProfile | null) {
  return profile?.username || profile?.name || `Instagram user ${String(participantId).slice(-6)}`;
}

function handleFromProfile(participantId: string, profile: InstagramUserProfile | null) {
  return profile?.username ? `@${profile.username}` : participantId;
}

async function findOrCreateSocialAccount(
  supabase: SupabaseClient,
  {
    platform,
    externalAccountId,
  }: {
    platform: string;
    externalAccountId: string;
  },
) {
  const existing = await supabase
    .from("social_accounts")
    .select("id")
    .eq("platform", platform)
    .eq("external_account_id", externalAccountId)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }

  if (existing.data?.id) {
    const updateResponse = await supabase
      .from("social_accounts")
      .update({
        status: "active",
        last_sync_at: new Date().toISOString(),
        meta: { source: "meta_webhook" },
      })
      .eq("id", existing.data.id);

    if (updateResponse.error) {
      throw updateResponse.error;
    }

    return existing.data.id;
  }

  const created = await supabase
    .from("social_accounts")
    .insert({
      platform,
      display_name: platform === "instagram" ? "Instagram account" : "Meta account",
      external_account_id: externalAccountId,
      status: "active",
      last_sync_at: new Date().toISOString(),
      meta: { source: "meta_webhook" },
    })
    .select("id")
    .single();

  if (created.error) {
    throw created.error;
  }

  return created.data.id;
}

async function findOrCreateSocialConversation(
  supabase: SupabaseClient,
  {
    accountId,
    platform,
    conversationExternalId,
    participantId,
    profile,
    profileLookupError,
  }: {
    accountId: string;
    platform: string;
    conversationExternalId: string;
    participantId: string;
    profile: InstagramUserProfile | null;
    profileLookupError: string | null;
  },
) {
  const existing = await supabase
    .from("social_conversations")
    .select("id, participant_name, participant_handle, avatar_url, meta")
    .eq("account_id", accountId)
    .eq("external_conversation_id", conversationExternalId)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }

  const existingMeta = existing.data?.meta && typeof existing.data.meta === "object"
    ? existing.data.meta as Record<string, unknown>
    : {};
  const payload = {
    participant_name: profile
      ? displayNameFromProfile(participantId, profile)
      : existing.data?.participant_name || displayNameFromProfile(participantId, null),
    participant_handle: profile
      ? handleFromProfile(participantId, profile)
      : existing.data?.participant_handle || handleFromProfile(participantId, null),
    avatar_url: profile?.profile_pic || existing.data?.avatar_url || null,
    subject: platform === "instagram" ? "Instagram conversation" : "Meta conversation",
    status: "open",
    priority: "normal",
    meta: {
      ...existingMeta,
      participant_id: participantId,
      source: "meta_webhook",
      webhook_code_version: WEBHOOK_CODE_VERSION,
      profile_lookup: profile
        ? {
          username: profile.username || null,
          name: profile.name || null,
          follower_count: profile.follower_count ?? null,
          is_user_follow_business: profile.is_user_follow_business ?? null,
          is_business_follow_user: profile.is_business_follow_user ?? null,
          synced_at: new Date().toISOString(),
        }
        : existingMeta.profile_lookup || null,
      profile_lookup_error: profileLookupError,
    },
  };

  if (existing.data?.id) {
    const updateResponse = await supabase
      .from("social_conversations")
      .update(payload)
      .eq("id", existing.data.id);

    if (updateResponse.error) {
      throw updateResponse.error;
    }

    return existing.data.id;
  }

  const created = await supabase
    .from("social_conversations")
    .insert({
      account_id: accountId,
      external_conversation_id: conversationExternalId,
      ...payload,
    })
    .select("id")
    .single();

  if (created.error) {
    throw created.error;
  }

  return created.data.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const verifyToken = getEnv("META_WEBHOOK_VERIFY_TOKEN") || FALLBACK_VERIFY_TOKEN;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && token === verifyToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain",
        },
      });
    }

    return json({ error: "Webhook verification failed." }, { status: 403 });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const platform = normalizePlatform((payload as { object?: unknown }).object);
  const entries = Array.isArray((payload as { entry?: unknown }).entry)
    ? (payload as { entry: Array<Record<string, unknown>> }).entry
    : [];

  const eventInsert = await supabase
    .from("social_webhook_events")
    .insert({
      platform,
      event_type: "webhook",
      external_event_id: entries[0]?.id ? `${platform}-${entries[0].id}-${entries[0].time || Date.now()}` : null,
      payload,
      processing_status: "received",
    })
    .select("id")
    .single();

  if (eventInsert.error) {
    return json({ error: eventInsert.error.message }, { status: 500 });
  }

  let processedMessages = 0;

  try {
    for (const entry of entries) {
      const accountExternalId = String(entry.id || "");
      if (!accountExternalId) continue;

      const accountId = await findOrCreateSocialAccount(supabase, {
        platform,
        externalAccountId: accountExternalId,
      });
      const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging as MessagingEvent[] : [];

      for (const event of messagingEvents) {
        const senderId = event.sender?.id;
        const recipientId = event.recipient?.id;
        const inbound = senderId && senderId !== accountExternalId;
        const participantId = inbound ? senderId : recipientId;
        const text = eventText(event);

        if (!participantId || (!text && !event.message?.attachments?.length)) {
          continue;
        }

        const conversationExternalId = `${platform}:${accountExternalId}:${participantId}`;
        const profileLookup = platform === "instagram" && inbound
          ? await fetchInstagramUserProfile(participantId)
          : { profile: null, error: null, status: null };
        const profile = profileLookup.profile;
        if (profile?.profile_pic) {
          profile.profile_pic = await cacheInstagramAvatar(
            supabase,
            participantId,
            profile.profile_pic,
          );
        }
        const conversationId = await findOrCreateSocialConversation(supabase, {
          accountId,
          platform,
          conversationExternalId,
          participantId,
          profile,
          profileLookupError: profileLookup.error,
        });

        const sentAt = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
        const senderName = inbound
          ? displayNameFromProfile(participantId, profile)
          : "Instagram account";
        const messageResponse = await supabase
          .from("social_messages")
          .insert({
            conversation_id: conversationId,
            external_message_id: eventExternalId(event),
            direction: inbound ? "inbound" : "outbound",
            sender_type: inbound ? "customer" : "admin",
            sender_name: senderName,
            body: text,
            attachments: event.message?.attachments || [],
            sent_at: sentAt,
            meta: {
              source: "meta_webhook",
              webhook_code_version: WEBHOOK_CODE_VERSION,
              raw_sender_id: senderId,
              raw_recipient_id: recipientId,
              profile_lookup: profile
                ? {
                  username: profile.username || null,
                  name: profile.name || null,
                  profile_pic: profile.profile_pic || null,
                }
                : null,
              profile_lookup_error: profileLookup.error,
              profile_lookup_status: profileLookup.status,
            },
          });

        if (messageResponse.error && messageResponse.error.code !== "23505") {
          throw messageResponse.error;
        }

        processedMessages += 1;
      }
    }

    await supabase
      .from("social_webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventInsert.data.id);

    return json({ ok: true, processedMessages });
  } catch (error) {
    await supabase
      .from("social_webhook_events")
      .update({
        processing_status: "failed",
        processing_error: errorMessage(error),
      })
      .eq("id", eventInsert.data.id);

    return json({ error: errorMessage(error) }, { status: 500 });
  }
});
