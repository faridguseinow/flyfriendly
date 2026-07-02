import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  CheckCheck,
  Circle,
  Download,
  FileText,
  Image,
  Info,
  Mail,
  MessageCircle,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Square,
  Tag,
  Users,
  Video,
  X,
} from "lucide-react";
import { createCommunication, createTask, fetchCommunicationsModuleData } from "../../services/adminService.js";
import { createAdminNotification } from "../../services/adminNotificationService.js";
import {
  backfillInstagramInboxProfiles,
  fetchSocialConversationMessages,
  fetchSocialInboxModuleData,
  markSocialConversationUnread,
  markSocialConversationRead,
  sendSocialInboxMessage,
  subscribeSocialInboxRealtime,
  updateSocialConversation,
  uploadSocialInboxAttachment,
} from "../../services/adminSocialInboxService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const channels = ["email", "whatsapp", "instagram", "facebook", "messenger", "phone", "airline", "internal_note", "manual"];
const fallbackChannelLabels = {
  email: "Email",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  phone: "Phone",
  airline: "Airline",
  internal_note: "Internal",
  manual: "Manual",
};

const channelIcons = {
  email: Mail,
  whatsapp: MessageCircle,
  instagram: MessageSquareText,
  facebook: MessageSquareText,
  messenger: MessageCircle,
  phone: Phone,
  airline: Send,
  internal_note: Tag,
  manual: MessageSquareText,
};

const demoMessages = [
  {
    id: "demo-1",
    entity_type: "case",
    entity_id: "demo-case",
    customer_id: "demo-customer-1",
    channel: "instagram",
    direction: "inbound",
    subject: "Delayed flight claim",
    body: "Hi, my flight was delayed over 4 hours. Can Fly Friendly help me claim compensation?",
    created_at: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    created_by: null,
  },
  {
    id: "demo-2",
    entity_type: "case",
    entity_id: "demo-case",
    customer_id: "demo-customer-1",
    channel: "instagram",
    direction: "outbound",
    subject: "Delayed flight claim",
    body: "Yes, we can review it. Please send the booking reference and route details.",
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    created_by: "demo-agent",
  },
  {
    id: "demo-3",
    entity_type: "lead",
    entity_id: "demo-lead",
    customer_id: "demo-customer-2",
    channel: "whatsapp",
    direction: "inbound",
    subject: "Documents",
    body: "I uploaded my boarding pass. Do you also need passport copy?",
    created_at: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    created_by: null,
  },
  {
    id: "demo-4",
    entity_type: "customer",
    entity_id: "demo-customer-3",
    customer_id: "demo-customer-3",
    channel: "email",
    direction: "inbound",
    subject: "Claim status",
    body: "Could you update me about the airline response? Thanks.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    created_by: null,
  },
];

const demoCustomers = [
  { id: "demo-customer-1", full_name: "Aylin Mammadova", email: "aylin@example.com", phone: "+994 50 000 00 01" },
  { id: "demo-customer-2", full_name: "Nicat Aliyev", email: "nicat@example.com", phone: "+994 55 000 00 02" },
  { id: "demo-customer-3", full_name: "Leyla Karimova", email: "leyla@example.com", phone: "+994 70 000 00 03" },
];

const demoProfiles = [
  { id: "demo-agent", full_name: "Support Team", email: "support@flyfriendly.az", role: "customer_support_agent" },
];

const conversationStatuses = ["open", "pending", "replied", "blocked", "archived"];
const conversationPriorities = ["low", "normal", "high", "urgent"];
const composerEmojiOptions = ["🙂", "👍", "🙏", "✈️", "📎", "✅", "🔥", "❤️"];
const composerFileAccept = "image/*,.pdf,.doc,.docx,.txt,audio/*";
const voiceWaveformBarsCount = 24;

function getChannelLabels(t) {
  return Object.fromEntries(
    channels.map((channel) => [channel, t(`admin.inbox.channels.${channel}`)]),
  );
}

function formatTime(value, { locale, t }) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return t("admin.inbox.now");
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return date.toLocaleDateString(locale);
}

function formatDateDivider(value, { locale, t }) {
  if (!value) return t("admin.inbox.messagesDivider");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("admin.inbox.messagesDivider");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t("admin.inbox.today");
  if (date.toDateString() === yesterday.toDateString()) return t("admin.inbox.yesterday");
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function getInitials(value) {
  const words = String(value || "FF").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "FF";
}

function getConversationKey(item) {
  return `${item.channel}:${item.customer_id || item.entity_type}:${item.customer_id || item.entity_id}`;
}

function getEntityLabel(item, maps) {
  if (item.entity_type === "lead") {
    const lead = maps.leads.get(item.entity_id);
    return lead?.lead_code || lead?.full_name || item.entity_id;
  }

  if (item.entity_type === "case") {
    const caseRow = maps.cases.get(item.entity_id);
    return caseRow?.case_code || item.entity_id;
  }

  const customer = maps.customers.get(item.entity_id) || maps.customers.get(item.customer_id);
  return customer?.full_name || customer?.email || item.entity_id;
}

function isGenericSocialParticipantName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return /^(instagram|facebook|messenger|meta)\s+user\s+\d+$/i.test(normalized);
}

function normalizeSocialHandle(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("@")) return normalized;
  if (/^[a-z0-9._]+$/i.test(normalized) && /[a-z]/i.test(normalized)) {
    return `@${normalized}`;
  }
  return normalized;
}

function getSocialProfileUsername(meta) {
  const username = meta?.profile_lookup?.username;
  return username ? normalizeSocialHandle(username) : "";
}

function getSocialProfileAvatarUrl(meta) {
  const profilePicture = meta?.profile_lookup?.profile_pic;
  return typeof profilePicture === "string" && profilePicture.trim() ? profilePicture.trim() : "";
}

function getAttachmentUrl(attachment) {
  if (typeof attachment === "string") {
    return attachment.trim();
  }

  if (!attachment || typeof attachment !== "object") return "";

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
    attachment.media_url,
    attachment.mediaUrl,
    attachment.thumbnail_url,
    attachment.thumbnailUrl,
    attachment.image_url,
    attachment.imageUrl,
    attachment.audio_url,
    attachment.audioUrl,
    attachment.video_url,
    attachment.videoUrl,
    attachment.payload?.url,
    attachment.payload?.src,
    attachment.data?.url,
    attachment.data?.src,
    attachment.image?.url,
    attachment.image?.src,
    attachment.audio?.url,
    attachment.audio?.src,
    attachment.video?.url,
    attachment.video?.src,
    attachment.asset?.url,
    attachment.asset?.src,
    attachment.meta?.url,
  ].find((value) => typeof value === "string" && value.trim()) || "";
}

function getAttachmentKind(attachment) {
  const kind = String(
    attachment?.type
    || attachment?.mime_type
    || attachment?.mimeType
    || attachment?.kind
    || attachment?.media_type
    || attachment?.payload?.type
    || "",
  ).toLowerCase();
  if (kind.includes("image")) return "image";
  if (kind.includes("video")) return "video";
  if (kind.includes("audio")) return "audio";

  const url = getAttachmentUrl(attachment);
  if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|webm)(\?|$)/i.test(url)) return "audio";

  return "file";
}

function getAttachmentLabel(attachment, index) {
  return String(
    attachment?.title
    || attachment?.name
    || attachment?.filename
    || attachment?.file_name
    || (typeof attachment?.path === "string" ? attachment.path.split("/").pop() : "")
    || attachment?.id
    || `Attachment ${index + 1}`,
  ).trim();
}

function isTechnicalAttachmentLabel(label, kind) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return true;

  if (/^attachment(?:\s+\d+)?(?:\.[a-z0-9]+)?$/i.test(normalized)) {
    return true;
  }

  if (/^default\.[a-z0-9]+$/i.test(normalized)) {
    return true;
  }

  if ((kind === "image" || kind === "video") && /^(image|photo|img)[._-]?\d*(\.[a-z0-9]+)?$/i.test(normalized)) {
    return true;
  }

  return false;
}

function getAttachmentDisplayLabel(attachment, index) {
  const kind = getAttachmentKind(attachment);
  const label = getAttachmentLabel(attachment, index);
  return isTechnicalAttachmentLabel(label, kind) ? "" : label;
}

function formatAttachmentSize(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAudioExtension(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "webm";
}

function getAttachmentPreviewText(attachments = [], labels = {}) {
  const firstAttachment = Array.isArray(attachments) ? attachments[0] : null;
  const kind = getAttachmentKind(firstAttachment);
  if (kind === "image") return labels.image || "Image";
  if (kind === "video") return labels.video || "Video";
  if (kind === "audio") return labels.audio || "Audio";
  return labels.file || "File";
}

function buildVoiceWaveform(history = [], segments = voiceWaveformBarsCount) {
  const safeSegments = Math.max(1, Number(segments) || voiceWaveformBarsCount);
  if (!history.length) {
    return Array.from({ length: safeSegments }, () => 0.12);
  }

  const chunkSize = Math.max(1, Math.ceil(history.length / safeSegments));
  const levels = [];

  for (let index = 0; index < safeSegments; index += 1) {
    const slice = history.slice(index * chunkSize, (index + 1) * chunkSize);
    const average = slice.length
      ? slice.reduce((sum, value) => sum + Number(value || 0), 0) / slice.length
      : 0;
    levels.push(Math.min(1, Math.max(0.12, average)));
  }

  return levels;
}

function buildConversationMediaItems(conversation) {
  return (conversation?.messages || [])
    .flatMap((message) => (Array.isArray(message.attachments) ? message.attachments : []).map((attachment, index) => ({
      id: `${message.id || "message"}:${attachment?.id || index}`,
      url: getAttachmentUrl(attachment),
      kind: getAttachmentKind(attachment),
      label: getAttachmentDisplayLabel(attachment, index),
      createdAt: message.created_at,
    })))
    .filter((item) => item.kind === "image" || item.kind === "video");
}

function getConversationProfileUrl(conversation) {
  const rawHandle = String(
    conversation?.socialUsername
    || conversation?.participantHandle
    || conversation?.displayName
    || "",
  ).trim().replace(/^@/, "");

  if (!rawHandle) return "";
  if (conversation?.channel === "instagram") return `https://www.instagram.com/${rawHandle}/`;
  if (conversation?.channel === "facebook" || conversation?.channel === "messenger") return `https://www.facebook.com/${rawHandle}`;
  return "";
}

function getConversationEntityRoute(conversation) {
  if (!conversation?.entityId) return "";
  if (conversation.entityType === "lead") return `/admin/operations/leads?lead=${conversation.entityId}`;
  if (conversation.entityType === "case") return `/admin/operations/cases?case=${conversation.entityId}`;
  if (conversation.entityType === "customer") return `/admin/people/customers?customer=${conversation.entityId}`;
  return "";
}

function getConversationDisplayName({ channel, customer, conversation, unknownCustomer }) {
  const participantName = String(conversation?.participant_name || "").trim();
  const participantHandle = normalizeSocialHandle(conversation?.participant_handle);
  const profileUsername = getSocialProfileUsername(conversation?.meta);
  const genericParticipantName = isGenericSocialParticipantName(participantName);
  const isSocialDirectChannel = ["instagram", "facebook", "messenger"].includes(channel);

  if (customer?.full_name) {
    return customer.full_name;
  }

  if (isSocialDirectChannel) {
    if (profileUsername) {
      return profileUsername;
    }

    if (participantHandle && participantHandle !== conversation?.participant_handle) {
      return participantHandle;
    }

    if (participantHandle && participantHandle.startsWith("@")) {
      return participantHandle;
    }
  }

  if (participantName && !genericParticipantName) {
    return participantName;
  }

  if (profileUsername) {
    return profileUsername;
  }

  if (participantHandle) {
    return participantHandle;
  }

  return customer?.email || participantName || unknownCustomer;
}

function isConversationMissingReadableName(conversation, channel) {
  if (!["instagram", "facebook", "messenger"].includes(channel)) {
    return false;
  }

  const participantName = String(conversation?.participant_name || "").trim();
  const participantHandle = String(conversation?.participant_handle || "").trim();
  const profileUsername = getSocialProfileUsername(conversation?.meta);

  if (profileUsername) {
    return false;
  }

  if (participantHandle.startsWith("@")) {
    return false;
  }

  return !participantName
    || isGenericSocialParticipantName(participantName)
    || /^\d{6,}$/.test(participantName)
    || /^\d{6,}$/.test(participantHandle);
}

function normalizeSocialMessage(message, { channel, subject, displayName, profiles }) {
  const inboundUsername = getSocialProfileUsername(message?.meta);
  const inboundAvatarUrl = getSocialProfileAvatarUrl(message?.meta);
  const inboundSenderName = String(message?.sender_name || "").trim();
  return {
    ...message,
    channel,
    subject,
    created_at: message.sent_at || message.created_at,
    authorLabel: message.direction === "inbound"
      ? inboundUsername || (isGenericSocialParticipantName(inboundSenderName) ? displayName : inboundSenderName) || displayName
      : message.sender_name || profiles.get(message.created_by)?.full_name || profiles.get(message.created_by)?.email || "Fly Friendly",
    avatarUrl: message.direction === "inbound" ? inboundAvatarUrl : "",
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
  };
}

function buildConversations(moduleData, socialMessagesByConversation = {}, options = {}) {
  const {
    channelLabels = fallbackChannelLabels,
    unknownCustomer = "Unknown customer",
    conversationFallback = "Conversation",
    noMessageBody = "No message body.",
    attachmentPreviewLabels = {},
  } = options;

  if (moduleData?.supportsSocialInbox) {
    const accounts = new Map((moduleData.accounts || []).map((item) => [item.id, item]));
    const customers = new Map((moduleData.customers || []).map((item) => [item.id, item]));
    const profiles = new Map((moduleData.assignableUsers || []).map((item) => [item.id, item]));
    const leads = new Map((moduleData.leads || []).map((item) => [item.id, item]));
    const cases = new Map((moduleData.cases || []).map((item) => [item.id, item]));
    return (moduleData.conversations || []).map((conversation) => {
      const account = accounts.get(conversation.account_id);
      const customer = customers.get(conversation.customer_id);
      const linkedLead = leads.get(conversation.lead_id);
      const linkedCase = cases.get(conversation.case_id);
      const channel = account?.platform || conversation.meta?.platform || "manual";
      const avatarUrl = conversation.avatar_url || getSocialProfileAvatarUrl(conversation.meta);
      const socialUsername = getSocialProfileUsername(conversation.meta);
      const displayName = getConversationDisplayName({
        channel,
        customer,
        conversation,
        unknownCustomer,
      });
      const entityType = conversation.case_id ? "case" : conversation.lead_id ? "lead" : "customer";
      const entityId = conversation.case_id || conversation.lead_id || conversation.customer_id || conversation.id;
      const entityLabel = linkedCase?.case_code || linkedLead?.lead_code || customer?.full_name || conversation.participant_handle || conversation.id;
      const sortedMessages = [...(socialMessagesByConversation[conversation.id] || [])]
        .sort((left, right) => new Date(left.sent_at || left.created_at) - new Date(right.sent_at || right.created_at));

      return {
        id: conversation.id,
        source: "social",
        channel,
        subject: conversation.subject || account?.display_name || channelLabels[channel] || conversationFallback,
        customer: customer || {
          email: conversation.participant_email,
          phone: conversation.participant_phone,
        },
        displayName,
        entityLabel,
        entityType,
        entityId,
        customerId: conversation.customer_id,
        avatarUrl,
        socialUsername,
        participantHandle: conversation.participant_handle || "",
        participantName: conversation.participant_name || "",
        assignedUserId: conversation.assigned_user_id || "",
        archivedAt: conversation.archived_at || null,
        meta: conversation.meta || {},
        latestAt: conversation.last_message_at || conversation.updated_at || conversation.created_at,
        latestBody: conversation.last_message_preview
          || sortedMessages.at(-1)?.body
          || (sortedMessages.at(-1)?.attachments?.length ? getAttachmentPreviewText(sortedMessages.at(-1)?.attachments, attachmentPreviewLabels) : "")
          || conversation.subject
          || noMessageBody,
        unreadCount: conversation.unread_count || 0,
        status: conversation.status,
        priority: conversation.priority || "normal",
        messages: sortedMessages.map((message) => normalizeSocialMessage(message, {
          channel,
          subject: conversation.subject,
          displayName,
          profiles,
        })),
      };
    });
  }

  const rows = moduleData?.communications?.length || !moduleData?.supportsSocialInbox ? (moduleData?.communications?.length ? moduleData.communications : demoMessages) : [];
  const customers = moduleData?.communications?.length ? moduleData.customers || [] : demoCustomers;
  const profiles = moduleData?.communications?.length ? moduleData.assignableUsers || [] : demoProfiles;
  const maps = {
    customers: new Map(customers.map((item) => [item.id, item])),
    profiles: new Map(profiles.map((item) => [item.id, item])),
    leads: new Map((moduleData?.leads || []).map((item) => [item.id, item])),
    cases: new Map((moduleData?.cases || []).map((item) => [item.id, item])),
  };

  const grouped = rows.reduce((acc, item) => {
    acc[getConversationKey(item)] ||= [];
    acc[getConversationKey(item)].push(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([id, messages]) => {
      const sortedMessages = [...messages].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
      const latest = sortedMessages[sortedMessages.length - 1];
      const customer = maps.customers.get(latest.customer_id) || maps.customers.get(latest.entity_id);
      const displayName = customer?.full_name || customer?.email || getEntityLabel(latest, maps) || unknownCustomer;
      const inboundCount = sortedMessages.filter((item) => item.direction === "inbound").length;
      const outboundCount = sortedMessages.filter((item) => item.direction === "outbound").length;

      return {
        id,
        source: moduleData?.communications?.length ? "legacy" : "demo",
        channel: latest.channel,
        subject: latest.subject || channelLabels[latest.channel] || conversationFallback,
        customer,
        displayName,
        entityLabel: getEntityLabel(latest, maps),
        entityType: latest.entity_type,
        entityId: latest.entity_id,
        customerId: latest.customer_id,
        avatarUrl: "",
        socialUsername: "",
        participantHandle: "",
        participantName: displayName,
        assignedUserId: "",
        archivedAt: null,
        meta: latest.meta || {},
        latestAt: latest.created_at,
        latestBody: latest.body
          || (latest.attachments?.length ? getAttachmentPreviewText(latest.attachments, attachmentPreviewLabels) : "")
          || latest.subject
          || noMessageBody,
        unreadCount: Math.max(0, inboundCount - outboundCount),
        status: "open",
        priority: "normal",
        messages: sortedMessages.map((message) => ({
          ...message,
          authorLabel: message.direction === "inbound"
            ? displayName
            : maps.profiles.get(message.created_by)?.full_name || maps.profiles.get(message.created_by)?.email || "Fly Friendly",
          avatarUrl: "",
          attachments: Array.isArray(message.attachments) ? message.attachments : [],
        })),
      };
    })
    .sort((left, right) => new Date(right.latestAt) - new Date(left.latestAt));
}

function Avatar({ label, tone = "blue", status = true, imageUrl = "" }) {
  return (
    <span className={`admin-inbox-avatar is-${tone}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={label || "Avatar"} loading="lazy" />
      ) : (
        <span>{getInitials(label)}</span>
      )}
      {status ? <i /> : null}
    </span>
  );
}

function ChannelPill({ channel, label }) {
  const Icon = channelIcons[channel] || MessageSquareText;
  return (
    <span className="admin-inbox-channel">
      <Icon size={13} strokeWidth={2} />
      {label || fallbackChannelLabels[channel] || channel}
    </span>
  );
}

function exportConversationCsv(conversation, t) {
  if (!conversation) return;
  const headers = [
    t("admin.inbox.csv.time"),
    t("admin.inbox.csv.channel"),
    t("admin.inbox.csv.direction"),
    t("admin.inbox.csv.author"),
    t("admin.inbox.csv.subject"),
    t("admin.inbox.csv.body"),
  ];
  const lines = conversation.messages.map((item) => [
    item.created_at,
    item.channel,
    item.direction,
    item.authorLabel,
    item.subject,
    item.body,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-inbox-${conversation.displayName.replace(/\W+/g, "-").toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AdminCommunication() {
  const navigate = useNavigate();
  const { hasPermission } = useAdminAuth();
  const { t, i18n } = useTranslation();
  const profileBackfillAttemptedRef = useRef(false);
  const messagesScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioSourceRef = useRef(null);
  const voiceVisualizerFrameRef = useRef(0);
  const voiceFrequencyDataRef = useRef(null);
  const voiceLevelHistoryRef = useRef([]);
  const realtimeRefreshTimeoutRef = useRef(0);
  const voiceChunksRef = useRef([]);
  const voiceStartRef = useRef(0);
  const voiceMimeTypeRef = useRef("");
  const voiceShouldUploadRef = useRef(false);
  const voiceConversationIdRef = useRef("");
  const [moduleData, setModuleData] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState("info");
  const [isLoading, setIsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [socialMessagesByConversation, setSocialMessagesByConversation] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMediaExpanded, setIsMediaExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [voiceWaveform, setVoiceWaveform] = useState(() => buildVoiceWaveform());
  const [pendingVoiceDraft, setPendingVoiceDraft] = useState(null);
  const [mediaViewer, setMediaViewer] = useState(null);
  const [assignmentDraft, setAssignmentDraft] = useState({ assigned_user_id: "", status: "open", priority: "normal" });
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "", assigned_user_id: "", priority: "medium", due_date: "" });
  const [rulesDraft, setRulesDraft] = useState({ status: "open", priority: "normal" });
  const [newDraft, setNewDraft] = useState({ entity_type: "lead", entity_id: "", channel: "manual", subject: "", body: "" });

  const pushNotice = (message, tone = "info") => {
    setNotice(message || "");
    setNoticeTone(tone);
  };

  const loadCommunications = async ({ silent = false } = {}) => {
    if (!silent) {
      setError("");
      setIsLoading(true);
    }

    try {
      let socialInbox = await fetchSocialInboxModuleData();
      const missingConversationCount = (socialInbox.conversations || []).filter((conversation) => {
        const account = (socialInbox.accounts || []).find((item) => item.id === conversation.account_id);
        const channel = account?.platform || conversation.meta?.platform || "manual";
        return isConversationMissingReadableName(conversation, channel);
      }).length;

      if (
        socialInbox.supportsSocialInbox
        && hasPermission("communications.edit")
        && !profileBackfillAttemptedRef.current
        && missingConversationCount > 0
      ) {
        profileBackfillAttemptedRef.current = true;
        try {
          await backfillInstagramInboxProfiles({ limit: Math.min(200, Math.max(40, missingConversationCount)) });
          socialInbox = await fetchSocialInboxModuleData();
        } catch (backfillError) {
          setError(backfillError?.message || t("admin.inbox.profileRefreshError"));
        }
      }

      if (socialInbox.supportsSocialInbox) {
        setModuleData(socialInbox);
        return;
      }

      const legacyCommunications = await fetchCommunicationsModuleData();
      setModuleData({ ...legacyCommunications, supportsSocialInbox: false });
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.loadError"));
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadCommunications();
  }, [hasPermission, t]);

  const channelLabels = useMemo(() => getChannelLabels(t), [t]);

  const conversations = useMemo(
    () => buildConversations(moduleData, socialMessagesByConversation, {
      channelLabels,
      unknownCustomer: t("admin.inbox.unknownCustomer"),
      conversationFallback: t("admin.inbox.conversationFallback"),
      noMessageBody: t("admin.inbox.noMessageBody"),
      attachmentPreviewLabels: {
        image: t("admin.inbox.imageAttachment"),
        video: t("admin.inbox.videoAttachment"),
        audio: t("admin.inbox.voiceMessageLabel"),
        file: t("admin.inbox.documentAttachment"),
      },
    }),
    [channelLabels, moduleData, socialMessagesByConversation, t],
  );
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((item) => {
      const matchesChannel = channelFilter === "all" || item.channel === channelFilter;
      const matchesSearch = !query || [
        item.displayName,
        item.customer?.email,
        item.customer?.phone,
        item.subject,
        item.entityLabel,
        item.latestBody,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      return matchesChannel && matchesSearch;
    });
  }, [conversations, search, channelFilter]);

  useEffect(() => {
    if (!filteredConversations.length) {
      setSelectedConversationId("");
      return;
    }

    if (!filteredConversations.some((item) => item.id === selectedConversationId)) {
      setSelectedConversationId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConversationId]);

  const selectedConversation = useMemo(
    () => filteredConversations.find((item) => item.id === selectedConversationId) || filteredConversations[0] || null,
    [filteredConversations, selectedConversationId],
  );

  const assignableUsers = moduleData?.assignableUsers || [];
  const assignableUsersById = useMemo(
    () => new Map(assignableUsers.map((item) => [item.id, item])),
    [assignableUsers],
  );
  const entityOptions = useMemo(() => ({
    lead: moduleData?.leads || [],
    case: moduleData?.cases || [],
    customer: moduleData?.customers || [],
  }), [moduleData]);
  const selectedAssignee = selectedConversation?.assignedUserId
    ? assignableUsersById.get(selectedConversation.assignedUserId)
    : null;
  const conversationMediaItems = useMemo(
    () => buildConversationMediaItems(selectedConversation),
    [selectedConversation],
  );
  const visibleMediaItems = isMediaExpanded ? conversationMediaItems : conversationMediaItems.slice(0, 6);
  const isSocialComposer = selectedConversation?.source === "social";
  const canSendReply = hasPermission("communications.edit")
    && !isSaving
    && !isUploadingAttachment
    && !isRecordingVoice
    && !pendingVoiceDraft
    && (reply.trim() || composerAttachments.length);

  const releasePendingVoiceDraft = (draft = pendingVoiceDraft) => {
    if (draft?.url) {
      window.URL.revokeObjectURL(draft.url);
    }
  };

  const resetVoiceVisualizer = () => {
    if (voiceVisualizerFrameRef.current) {
      window.cancelAnimationFrame(voiceVisualizerFrameRef.current);
      voiceVisualizerFrameRef.current = 0;
    }

    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch {}
      audioSourceRef.current = null;
    }

    analyserRef.current = null;
    voiceFrequencyDataRef.current = null;
    voiceLevelHistoryRef.current = [];
    setVoiceWaveform(buildVoiceWaveform());

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }
  };

  const cleanupVoiceRecorder = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    mediaRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceMimeTypeRef.current = "";
    voiceShouldUploadRef.current = false;
    voiceConversationIdRef.current = "";
    voiceStartRef.current = 0;
    resetVoiceVisualizer();
    setIsRecordingVoice(false);
    setVoiceRecordingSeconds(0);
  };

  const discardPendingVoiceDraft = () => {
    releasePendingVoiceDraft();
    setPendingVoiceDraft(null);
  };

  const startVoiceVisualizer = async (stream) => {
    if (typeof window.AudioContext === "undefined" && typeof window.webkitAudioContext === "undefined") {
      return;
    }

    resetVoiceVisualizer();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    if (context.state === "suspended") {
      await context.resume().catch(() => null);
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;

    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = context;
    analyserRef.current = analyser;
    audioSourceRef.current = source;
    voiceFrequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    voiceLevelHistoryRef.current = [];

    const updateWaveform = () => {
      const data = voiceFrequencyDataRef.current;
      if (!analyserRef.current || !data) {
        return;
      }

      analyserRef.current.getByteFrequencyData(data);
      const average = data.length
        ? data.reduce((sum, value) => sum + value, 0) / (data.length * 255)
        : 0;

      voiceLevelHistoryRef.current.push(average);
      if (voiceLevelHistoryRef.current.length > 240) {
        voiceLevelHistoryRef.current.shift();
      }

      setVoiceWaveform(buildVoiceWaveform(voiceLevelHistoryRef.current));
      voiceVisualizerFrameRef.current = window.requestAnimationFrame(updateWaveform);
    };

    updateWaveform();
  };

  const queueUploadedAttachments = async (files = []) => {
    if (!selectedConversation || selectedConversation.source !== "social") {
      setError(t("admin.inbox.attachmentsOnlyForSocial"));
      return;
    }

    if (!files.length) {
      return;
    }

    setError("");
    setNotice("");
    setIsUploadingAttachment(true);

    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadSocialInboxAttachment({
          conversationId: selectedConversation.id,
          file,
        }));
      }
      setComposerAttachments((current) => [...current, ...uploaded]);
      pushNotice(t("admin.inbox.attachmentsReady", { count: uploaded.length }), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.attachmentUploadError"));
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const stopVoiceRecording = (shouldUpload = true) => {
    const recorder = mediaRecorderRef.current;
    voiceShouldUploadRef.current = shouldUpload;

    if (!recorder) {
      cleanupVoiceRecorder();
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    cleanupVoiceRecorder();
  };

  const startVoiceRecording = async () => {
    if (!selectedConversation || selectedConversation.source !== "social") {
      setError(t("admin.inbox.attachmentsOnlyForSocial"));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setError(t("admin.inbox.voiceNotSupported"));
      return;
    }

    setError("");
    setNotice("");
    discardPendingVoiceDraft();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ].find((mimeType) => {
        if (typeof window.MediaRecorder?.isTypeSupported !== "function") {
          return false;
        }
        return window.MediaRecorder.isTypeSupported(mimeType);
      }) || "";
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      await startVoiceVisualizer(stream).catch(() => null);
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceMimeTypeRef.current = recorder.mimeType || preferredMimeType || "audio/webm";
      voiceConversationIdRef.current = selectedConversation.id;
      voiceShouldUploadRef.current = true;
      voiceStartRef.current = Date.now();
      setIsRecordingVoice(true);
      setVoiceRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = voiceMimeTypeRef.current || recorder.mimeType || "audio/webm";
        const chunks = [...voiceChunksRef.current];
        const waveform = buildVoiceWaveform(voiceLevelHistoryRef.current);
        const shouldKeepDraft = voiceShouldUploadRef.current;
        const startedAt = voiceStartRef.current;

        cleanupVoiceRecorder();

        if (!shouldKeepDraft || !chunks.length) {
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        const file = new File(
          [blob],
          `voice-note-${Date.now()}.${getAudioExtension(mimeType)}`,
          { type: mimeType },
        );
        const url = window.URL.createObjectURL(blob);

        setPendingVoiceDraft({
          file,
          url,
          mimeType,
          durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          waveform,
          fileSize: file.size,
        });
        pushNotice(t("admin.inbox.voicePreviewReady"), "success");
      };

      recorder.start(250);
    } catch (nextError) {
      cleanupVoiceRecorder();
      setError(nextError.message || t("admin.inbox.voiceMicrophoneError"));
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecordingVoice) {
      stopVoiceRecording(true);
      return;
    }

    await startVoiceRecording();
  };

  const handleComposerFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await queueUploadedAttachments(files);
  };

  const removeComposerAttachment = (attachmentId) => {
    setComposerAttachments((current) => current.filter((item) => item.id !== attachmentId));
  };

  const handleEmojiInsert = (emoji) => {
    setReply((current) => `${current}${emoji}`);
    setIsEmojiPickerOpen(false);
  };

  const scheduleRealtimeRefresh = (delay = 200) => {
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeRefreshTimeoutRef.current = 0;
      void loadCommunications({ silent: true });
    }, delay);
  };

  const refreshConversationMessages = async (conversationId) => {
    if (!conversationId) return;

    try {
      const messages = await fetchSocialConversationMessages(conversationId, { limit: 50 });
      setSocialMessagesByConversation((current) => ({
        ...current,
        [conversationId]: messages,
      }));
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.messageLoadError"));
    }
  };

  const submitReplyDraft = async ({ body, attachments = [] }) => {
    if (!selectedConversation) return;

    const trimmedReply = String(body || "").trim();
    if (!trimmedReply && !attachments.length) return;

    if (String(selectedConversation.entityId).startsWith("demo-")) {
      throw new Error(t("admin.inbox.demoSendError"));
    }

    if (attachments.length && selectedConversation.source !== "social") {
      throw new Error(t("admin.inbox.attachmentsOnlyForSocial"));
    }

    if (selectedConversation.source === "social") {
      await sendSocialInboxMessage({
        conversation_id: selectedConversation.id,
        body: trimmedReply || null,
        attachments,
      });
      await markSocialConversationRead(selectedConversation.id).catch(() => null);
      await refreshConversationMessages(selectedConversation.id);
      scheduleRealtimeRefresh(50);
      return;
    }

    await createCommunication({
      entity_type: selectedConversation.entityType,
      entity_id: selectedConversation.entityId,
      customer_id: selectedConversation.customerId,
      channel: selectedConversation.channel,
      direction: "outbound",
      subject: selectedConversation.subject,
      body: trimmedReply,
      meta: { source: "admin_inbox" },
    });
  };

  const sendPendingVoiceDraft = async () => {
    if (!pendingVoiceDraft || !selectedConversation || selectedConversation.source !== "social") {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const uploaded = await uploadSocialInboxAttachment({
        conversationId: selectedConversation.id,
        file: pendingVoiceDraft.file,
      });

      await submitReplyDraft({
        body: reply,
        attachments: [
          ...composerAttachments,
          {
            ...uploaded,
            title: t("admin.inbox.voiceMessageLabel"),
            file_name: uploaded.file_name || t("admin.inbox.voiceMessageLabel"),
          },
        ],
      });

      setReply("");
      setComposerAttachments([]);
      setIsEmojiPickerOpen(false);
      discardPendingVoiceDraft();
      await loadCommunications();
      pushNotice(t("admin.inbox.voiceSent"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.voiceUploadError"));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedConversation) return;

    setIsMoreMenuOpen(false);
    setActiveAction("");
    setIsMediaExpanded(false);
    setReply("");
    setComposerAttachments([]);
    setIsEmojiPickerOpen(false);
    stopVoiceRecording(false);
    discardPendingVoiceDraft();
    setAssignmentDraft({
      assigned_user_id: selectedConversation.assignedUserId || "",
      status: selectedConversation.status || "open",
      priority: selectedConversation.priority || "normal",
    });
    setTaskDraft({
      title: `Follow up with ${selectedConversation.displayName}`,
      description: selectedConversation.latestBody || "",
      assigned_user_id: selectedConversation.assignedUserId || "",
      priority: selectedConversation.priority === "urgent" ? "urgent" : selectedConversation.priority === "high" ? "high" : "medium",
      due_date: "",
    });
    setRulesDraft({
      status: selectedConversation.status || "open",
      priority: selectedConversation.priority || "normal",
    });
    setNewDraft((current) => ({
      ...current,
      entity_type: selectedConversation.entityType || current.entity_type,
      entity_id: selectedConversation.entityId || current.entity_id,
      channel: selectedConversation.channel || current.channel,
      subject: selectedConversation.subject || current.subject,
    }));
  }, [selectedConversation?.id]);

  useEffect(() => {
    let active = true;

    if (!selectedConversation || selectedConversation.source !== "social") {
      return () => {
        active = false;
      };
    }

    if (socialMessagesByConversation[selectedConversation.id]) {
      return () => {
        active = false;
      };
    }

    setIsMessagesLoading(true);
    fetchSocialConversationMessages(selectedConversation.id, { limit: 50 })
      .then((messages) => {
        if (!active) return;
        setSocialMessagesByConversation((current) => ({
          ...current,
          [selectedConversation.id]: messages,
        }));
      })
        .catch((nextError) => {
        if (active) {
          setError(nextError.message || t("admin.inbox.messageLoadError"));
        }
      })
      .finally(() => {
        if (active) {
          setIsMessagesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedConversation, socialMessagesByConversation]);

  useEffect(() => {
    if (!moduleData?.supportsSocialInbox || !hasPermission("communications.view")) {
      return undefined;
    }

    const unsubscribe = subscribeSocialInboxRealtime({
      onConversationChange: () => {
        scheduleRealtimeRefresh(120);
      },
      onMessageChange: (payload) => {
        const conversationId = payload?.new?.conversation_id || payload?.old?.conversation_id || "";
        scheduleRealtimeRefresh(120);

        if (conversationId && conversationId === selectedConversation?.id) {
          void refreshConversationMessages(conversationId);
        }
      },
      onStatusChange: (status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError(t("admin.inbox.realtimeError"));
        }
      },
    });

    return () => {
      unsubscribe?.();
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = 0;
      }
    };
  }, [moduleData?.supportsSocialInbox, hasPermission, selectedConversation?.id, t]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container || !selectedConversation) return;

    const rafId = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [selectedConversation?.id, selectedConversation?.messages?.length]);

  useEffect(() => {
    if (!isRecordingVoice) return undefined;

    const intervalId = window.setInterval(() => {
      const elapsed = Math.max(0, Math.round((Date.now() - voiceStartRef.current) / 1000));
      setVoiceRecordingSeconds(elapsed);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRecordingVoice]);

  useEffect(() => {
    if (!notice) return undefined;

    const timeoutId = window.setTimeout(() => {
      setNotice("");
      setNoticeTone("info");
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  useEffect(() => () => {
    releasePendingVoiceDraft(pendingVoiceDraft);
  }, [pendingVoiceDraft]);

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {}
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    resetVoiceVisualizer();
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
      realtimeRefreshTimeoutRef.current = 0;
    }
  }, []);

  const metrics = useMemo(() => ({
    total: conversations.length,
    unread: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    instagram: conversations.filter((item) => item.channel === "instagram").length,
    whatsapp: conversations.filter((item) => item.channel === "whatsapp").length,
  }), [conversations]);

  const openLinkedRecord = (conversation = selectedConversation) => {
    const route = getConversationEntityRoute(conversation);
    if (!route) {
      pushNotice(t("admin.inbox.linkedRecordUnavailable"), "error");
      return;
    }
    navigate(route);
  };

  const refreshConversationProfile = async (conversationIds = []) => {
    if (!hasPermission("communications.edit")) {
      pushNotice(t("admin.inbox.editPermissionRequired"), "error");
      return;
    }

    const normalizedConversationIds = conversationIds.filter(Boolean);
    setError("");
    setIsActionSaving(true);

    try {
      const response = await backfillInstagramInboxProfiles({
        limit: normalizedConversationIds.length || Math.min(200, Math.max(40, conversations.length)),
        conversation_ids: normalizedConversationIds.length ? normalizedConversationIds : undefined,
      });
      await loadCommunications();
      const updatedCount = Number(response?.updated || 0);
      pushNotice(
        updatedCount
          ? t("admin.inbox.profileRefreshSuccess", { count: updatedCount })
          : t("admin.inbox.profileRefreshNoChanges"),
        "success",
      );
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.profileRefreshError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const toggleArchiveConversation = async () => {
    if (!selectedConversation?.id || selectedConversation.source !== "social") {
      pushNotice(t("admin.inbox.archiveUnavailable"), "error");
      return;
    }

    setError("");
    setIsActionSaving(true);

    try {
      const isArchived = selectedConversation.status === "archived" || !!selectedConversation.archivedAt;
      await updateSocialConversation(selectedConversation.id, {
        status: isArchived ? "open" : "archived",
        archived_at: isArchived ? null : new Date().toISOString(),
      });
      await loadCommunications();
      pushNotice(isArchived ? t("admin.inbox.unarchivedSuccess") : t("admin.inbox.archivedSuccess"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.archiveError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const handleCallAction = () => {
    const phone = String(selectedConversation?.customer?.phone || "").trim();
    const email = String(selectedConversation?.customer?.email || "").trim();

    if (phone) {
      window.location.href = `tel:${phone}`;
      return;
    }

    if (email) {
      window.location.href = `mailto:${email}`;
      return;
    }

    pushNotice(t("admin.inbox.noDirectContact"), "error");
  };

  const handleVideoAction = () => {
    const profileUrl = getConversationProfileUrl(selectedConversation);
    if (profileUrl) {
      window.open(profileUrl, "_blank", "noopener,noreferrer");
      pushNotice(t("admin.inbox.profileOpened"), "success");
      return;
    }

    pushNotice(t("admin.inbox.videoUnavailable"), "error");
  };

  const handleNotifyAction = async () => {
    if (!selectedConversation) return;

    setError("");
    setIsActionSaving(true);

    try {
      await createAdminNotification({
        type: "inbox_follow_up",
        severity: selectedConversation.unreadCount > 0 ? "warning" : "info",
        title: t("admin.inbox.notifySuccessTitle"),
        body: `${selectedConversation.displayName} · ${selectedConversation.latestBody || selectedConversation.subject || selectedConversation.entityLabel}`,
        module: "communications",
        entityType: selectedConversation.entityType,
        entityId: selectedConversation.entityId,
        actionUrl: "/admin/communication",
        recipientProfileId: selectedConversation.assignedUserId || null,
        recipientRole: selectedConversation.assignedUserId ? null : "owner",
      });
      pushNotice(t("admin.inbox.notifySuccess"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.notifyError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const saveAssignment = async () => {
    if (!selectedConversation?.id || selectedConversation.source !== "social") {
      pushNotice(t("admin.inbox.assignUnavailable"), "error");
      return;
    }

    setError("");
    setIsActionSaving(true);

    try {
      await updateSocialConversation(selectedConversation.id, {
        assigned_user_id: assignmentDraft.assigned_user_id || null,
        status: assignmentDraft.status,
        priority: assignmentDraft.priority,
      });
      await loadCommunications();
      setActiveAction("");
      pushNotice(t("admin.inbox.assignSuccess"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.assignError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const saveRules = async () => {
    if (!selectedConversation?.id || selectedConversation.source !== "social") {
      pushNotice(t("admin.inbox.rulesUnavailable"), "error");
      return;
    }

    setError("");
    setIsActionSaving(true);

    try {
      await updateSocialConversation(selectedConversation.id, {
        status: rulesDraft.status,
        priority: rulesDraft.priority,
        archived_at: rulesDraft.status === "archived" ? (selectedConversation.archivedAt || new Date().toISOString()) : null,
      });
      await loadCommunications();
      setActiveAction("");
      pushNotice(t("admin.inbox.rulesSuccess"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.rulesError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const createInboxTask = async () => {
    if (!selectedConversation) return;
    if (!hasPermission("tasks.edit")) {
      pushNotice(t("admin.inbox.taskPermissionRequired"), "error");
      return;
    }

    setError("");
    setIsActionSaving(true);

    try {
      await createTask({
        title: taskDraft.title.trim(),
        description: taskDraft.description.trim(),
        related_entity_type: selectedConversation.entityType,
        related_entity_id: selectedConversation.entityId,
        assigned_user_id: taskDraft.assigned_user_id || null,
        priority: taskDraft.priority,
        status: "todo",
        due_date: taskDraft.due_date || null,
        task_type: "inbox_follow_up",
      });
      setActiveAction("");
      pushNotice(t("admin.inbox.taskCreated"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.taskCreateError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const createManualInboxItem = async () => {
    if (!newDraft.entity_id || !newDraft.body.trim()) {
      pushNotice(t("admin.inbox.newItemValidation"), "error");
      return;
    }

    setError("");
    setIsActionSaving(true);

    try {
      await createCommunication({
        entity_type: newDraft.entity_type,
        entity_id: newDraft.entity_id,
        channel: newDraft.channel,
        direction: "outbound",
        subject: newDraft.subject.trim(),
        body: newDraft.body.trim(),
        meta: { source: "admin_inbox_manual" },
      });
      setNewDraft((current) => ({ ...current, subject: "", body: "" }));
      setActiveAction("");
      await loadCommunications();
      pushNotice(t("admin.inbox.newItemCreated"), "success");
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.newItemError"));
    } finally {
      setIsActionSaving(false);
    }
  };

  const handleMoreAction = async (actionKey) => {
    setIsMoreMenuOpen(false);

    if (!selectedConversation) return;

    if (actionKey === "refresh-profile") {
      await refreshConversationProfile([selectedConversation.id]);
      return;
    }

    if (actionKey === "copy-username") {
      const value = selectedConversation.socialUsername || selectedConversation.participantHandle || selectedConversation.displayName;
      if (!value) {
        pushNotice(t("admin.inbox.copyUnavailable"), "error");
        return;
      }
      await navigator.clipboard.writeText(String(value));
      pushNotice(t("admin.inbox.copySuccess"), "success");
      return;
    }

    if (actionKey === "mark-unread") {
      try {
        await markSocialConversationUnread(selectedConversation.id, Math.max(1, selectedConversation.unreadCount || 1));
        await loadCommunications();
        pushNotice(t("admin.inbox.markUnreadSuccess"), "success");
      } catch (nextError) {
        setError(nextError.message || t("admin.inbox.markUnreadError"));
      }
      return;
    }

    if (actionKey === "mark-read") {
      try {
        await markSocialConversationRead(selectedConversation.id);
        await loadCommunications();
        pushNotice(t("admin.inbox.markReadSuccess"), "success");
      } catch (nextError) {
        setError(nextError.message || t("admin.inbox.markReadError"));
      }
      return;
    }

    if (actionKey === "open-record") {
      openLinkedRecord(selectedConversation);
    }
  };

  const openActionPanel = (actionKey) => {
    setNotice("");
    setActiveAction((current) => current === actionKey ? "" : actionKey);
    setIsMoreMenuOpen(false);
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!selectedConversation) return;
    if (!reply.trim() && !composerAttachments.length) return;

    setError("");
    setIsSaving(true);

    try {
      await submitReplyDraft({ body: reply, attachments: composerAttachments });
      setReply("");
      setComposerAttachments([]);
      setIsEmojiPickerOpen(false);
      await loadCommunications();
    } catch (nextError) {
      setError(nextError.message || t("admin.inbox.sendError"));
    } finally {
      setIsSaving(false);
    }
  };

  const getEntityTypeLabel = (value) => t(`admin.inbox.entityTypes.${value}`, { defaultValue: value });
  const openImageViewer = (url, label = "") => {
    if (!url) {
      pushNotice(t("admin.inbox.mediaUnavailable"), "error");
      return;
    }

    setMediaViewer({
      url,
      label,
    });
  };

  const openAttachment = (attachment) => {
    const url = getAttachmentUrl(attachment);
    if (!url) {
      pushNotice(t("admin.inbox.mediaUnavailable"), "error");
      return;
    }

    const kind = getAttachmentKind(attachment);
    if (kind === "image") {
      openImageViewer(url, getAttachmentDisplayLabel(attachment, 0) || t("admin.inbox.imageAttachment"));
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const renderMessageAttachment = (attachment, index, direction) => {
    const url = getAttachmentUrl(attachment);
    const kind = getAttachmentKind(attachment);
    const label = getAttachmentLabel(attachment, index);
    const displayLabel = getAttachmentDisplayLabel(attachment, index);
    const sizeLabel = formatAttachmentSize(attachment?.file_size || attachment?.size);
    const previewUrl = getAttachmentUrl({
      preview_url: attachment?.preview_url,
      previewUrl: attachment?.previewUrl,
      thumbnail_url: attachment?.thumbnail_url,
      thumbnailUrl: attachment?.thumbnailUrl,
      url,
    });
    const isOutbound = direction === "outbound";

    if (kind === "image") {
      return (
        <button
          key={`${label}-${index}`}
          type="button"
          className={`admin-inbox-attachment admin-inbox-attachment--image${isOutbound ? " is-outbound" : ""}`}
          onClick={() => openAttachment(attachment)}
        >
          {previewUrl ? <img src={previewUrl} alt={displayLabel || t("admin.inbox.imageAttachment")} loading="lazy" /> : <Image size={18} />}
          {displayLabel ? <span>{displayLabel}</span> : null}
        </button>
      );
    }

    if (kind === "audio") {
      return (
        <div
          key={`${label}-${index}`}
          className={`admin-inbox-attachment admin-inbox-attachment--audio${isOutbound ? " is-outbound" : ""}`}
        >
          <div className="admin-inbox-attachment__file">
            <FileText size={16} />
            <div>
              <strong>{displayLabel || t("admin.inbox.voiceMessageLabel")}</strong>
              <span>{sizeLabel || t("admin.inbox.voiceMessageLabel")}</span>
            </div>
          </div>
          {url ? (
            <audio controls preload="metadata" src={url}>
              {t("admin.inbox.audioUnavailable")}
            </audio>
          ) : (
            <span className="admin-inbox-attachment__fallback">{t("admin.inbox.audioUnavailable")}</span>
          )}
        </div>
      );
    }

    return (
      <button
        key={`${label}-${index}`}
        type="button"
        className={`admin-inbox-attachment admin-inbox-attachment--file${isOutbound ? " is-outbound" : ""}`}
        onClick={() => openAttachment(attachment)}
      >
        <div className="admin-inbox-attachment__file">
          <FileText size={16} />
          <div>
            <strong>{displayLabel || t("admin.inbox.documentAttachment")}</strong>
            <span>{sizeLabel || t("admin.inbox.documentAttachment")}</span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="admin-page admin-communication-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {notice ? <p className={`admin-message${noticeTone === "success" ? " is-success" : ""}`}>{notice}</p> : null}
      {mediaViewer ? (
        <div className="admin-inbox-media-viewer" role="dialog" aria-modal="true" aria-label={mediaViewer.label || t("admin.inbox.imageAttachment")}>
          <button type="button" className="admin-inbox-media-viewer__backdrop" onClick={() => setMediaViewer(null)} aria-label={t("admin.inbox.closeViewer")} />
          <div className="admin-inbox-media-viewer__dialog">
            <button type="button" className="admin-inbox-media-viewer__close" onClick={() => setMediaViewer(null)} aria-label={t("admin.inbox.closeViewer")}>
              <X size={18} />
            </button>
            <img src={mediaViewer.url} alt={mediaViewer.label || t("admin.inbox.imageAttachment")} />
            {mediaViewer.label ? <p>{mediaViewer.label}</p> : null}
          </div>
        </div>
      ) : null}
      {moduleData && !moduleData.supportsSocialInbox && !moduleData.supportsCommunicationsModuleV1 ? (
        <p className="admin-message">
          {t("admin.inbox.schemaMissing")}
        </p>
      ) : null}

      {isLoading ? (
        <p className="admin-message">{t("admin.inbox.loading")}</p>
      ) : (
        <section className="admin-inbox-shell" aria-label={t("admin.inbox.title")}>
          <aside className="admin-inbox-sidebar">
            <div className="admin-inbox-search">
              <Search size={17} strokeWidth={1.9} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                placeholder={t("admin.inbox.searchPlaceholder")}
              />
            </div>

            <div className="admin-inbox-tabs" role="tablist" aria-label={t("admin.inbox.filtersAria")}>
              <button type="button" className={channelFilter === "all" ? "is-active" : ""} onClick={() => setChannelFilter("all")}>
                <Users size={15} />
                {t("admin.inbox.tabLabels.all")}
                <span>{metrics.unread}</span>
              </button>
              <button type="button" className={channelFilter === "instagram" ? "is-active" : ""} onClick={() => setChannelFilter("instagram")}>
                <MessageSquareText size={15} />
                {t("admin.inbox.tabLabels.instagram")}
                <span>{metrics.instagram}</span>
              </button>
              <button type="button" className={channelFilter === "whatsapp" ? "is-active" : ""} onClick={() => setChannelFilter("whatsapp")}>
                <MessageCircle size={15} />
                {t("admin.inbox.tabLabels.whatsapp")}
                <span>{metrics.whatsapp}</span>
              </button>
            </div>

            <div className="admin-inbox-sidebar__heading">
              <div>
                <h2>{t("admin.inbox.messagesTitle")}</h2>
                <p>{t("admin.inbox.conversationsCount", { count: metrics.total })}</p>
              </div>
              <button type="button" aria-label={t("admin.inbox.newInboxItem")} onClick={() => openActionPanel("new")}>
                <Plus size={16} />
              </button>
            </div>

            <div className="admin-inbox-list">
              {filteredConversations.map((conversation, index) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`admin-inbox-thread${selectedConversation?.id === conversation.id ? " is-active" : ""}`}
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <Avatar
                    label={conversation.displayName}
                    tone={index % 3 === 0 ? "green" : index % 3 === 1 ? "orange" : "blue"}
                    imageUrl={conversation.avatarUrl}
                  />
                  <span className="admin-inbox-thread__body">
                    <span className="admin-inbox-thread__top">
                      <strong>{conversation.displayName}</strong>
                      <time>{formatTime(conversation.latestAt, { locale: i18n.language, t })}</time>
                    </span>
                    <span className="admin-inbox-thread__preview">{conversation.latestBody}</span>
                    <span className="admin-inbox-thread__meta">
                      <ChannelPill channel={conversation.channel} label={channelLabels[conversation.channel]} />
                      <span>{conversation.entityLabel}</span>
                    </span>
                  </span>
                  {conversation.unreadCount > 0 ? <span className="admin-inbox-thread__count">{conversation.unreadCount}</span> : null}
                </button>
              ))}
            </div>
          </aside>

          <main className="admin-inbox-chat">
            {selectedConversation ? (
              <>
                <header className="admin-inbox-chat__header">
                  <div className="admin-inbox-chat__title">
                    <Avatar label={selectedConversation.displayName} tone="orange" imageUrl={selectedConversation.avatarUrl} />
                    <div>
                      <h1>{selectedConversation.displayName}</h1>
                      <p><Circle size={8} fill="currentColor" /> {t("admin.inbox.conversationType", { channel: channelLabels[selectedConversation.channel] })}</p>
                    </div>
                  </div>
                  <div className="admin-inbox-chat__actions">
                    <button type="button" aria-label={t("admin.inbox.call")} onClick={handleCallAction}><Phone size={17} /></button>
                    <button type="button" aria-label={t("admin.inbox.videoCall")} onClick={handleVideoAction}><Video size={17} /></button>
                    <button type="button" aria-label={t("admin.inbox.archive")} onClick={() => void toggleArchiveConversation()}><Archive size={17} /></button>
                    <div className="admin-inbox-more">
                      <button type="button" aria-label={t("admin.inbox.moreOptions")} onClick={() => setIsMoreMenuOpen((current) => !current)}><MoreHorizontal size={18} /></button>
                      {isMoreMenuOpen ? (
                        <div className="admin-inbox-more__menu">
                          <button type="button" onClick={() => void handleMoreAction("refresh-profile")}>{t("admin.inbox.refreshProfile")}</button>
                          <button type="button" onClick={() => void handleMoreAction("mark-read")}>{t("admin.inbox.markRead")}</button>
                          <button type="button" onClick={() => void handleMoreAction("mark-unread")}>{t("admin.inbox.markUnread")}</button>
                          <button type="button" onClick={() => void handleMoreAction("copy-username")}>{t("admin.inbox.copyUsername")}</button>
                          <button type="button" onClick={() => void handleMoreAction("open-record")}>{t("admin.inbox.openLinkedRecord")}</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </header>

                <div ref={messagesScrollRef} className="admin-inbox-chat__messages">
                  <div className="admin-inbox-divider"><span>{formatDateDivider(selectedConversation.messages[0]?.created_at, { locale: i18n.language, t })}</span></div>
                  {isMessagesLoading && selectedConversation.source === "social" ? (
                    <p className="admin-inbox-loading">{t("admin.inbox.messagesLoading")}</p>
                  ) : null}
                  {selectedConversation.messages.map((message) => (
                    <article key={message.id} className={`admin-inbox-message is-${message.direction}`}>
                      {message.direction === "inbound" ? <Avatar label={message.authorLabel} tone="green" imageUrl={message.avatarUrl || selectedConversation.avatarUrl} /> : null}
                      <div className="admin-inbox-message__content">
                        <div className="admin-inbox-message__meta">
                          <strong>{message.authorLabel}</strong>
                          <time>{formatTime(message.created_at, { locale: i18n.language, t })}</time>
                        </div>
                        {message.body ? (
                          <p>{message.body}</p>
                        ) : !message.attachments?.length ? (
                          <p>{t("admin.inbox.noMessageBody")}</p>
                        ) : null}
                        {message.attachments?.length ? (
                          <div className="admin-inbox-attachments">
                            {message.attachments.map((attachment, index) => renderMessageAttachment(attachment, index, message.direction))}
                          </div>
                        ) : null}
                        {message.direction === "outbound" ? (
                          <span className="admin-inbox-message__status"><CheckCheck size={13} /> {t("admin.inbox.sent")}</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <form className="admin-inbox-composer" onSubmit={sendReply}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={composerFileAccept}
                    multiple
                    hidden
                    onChange={(event) => { void handleComposerFileChange(event); }}
                  />
                  {pendingVoiceDraft ? (
                    <div className="admin-inbox-voice-draft">
                      <div className="admin-inbox-voice-draft__head">
                        <strong>{t("admin.inbox.voicePreviewTitle")}</strong>
                        <span>
                          {t("admin.inbox.voiceDuration", { seconds: pendingVoiceDraft.durationSeconds })}
                          {" · "}
                          {formatAttachmentSize(pendingVoiceDraft.fileSize) || t("admin.inbox.voiceMessageLabel")}
                        </span>
                      </div>
                      <div className="admin-inbox-voice-waveform is-preview">
                        {(pendingVoiceDraft.waveform || buildVoiceWaveform()).map((level, index) => (
                          <span key={`preview-wave-${index}`} style={{ "--voice-wave-height": `${Math.max(14, Math.round(level * 44))}px` }} />
                        ))}
                      </div>
                      <audio controls preload="metadata" src={pendingVoiceDraft.url}>
                        {t("admin.inbox.audioUnavailable")}
                      </audio>
                      <div className="admin-inbox-voice-draft__actions">
                        <button
                          type="button"
                          className="is-primary"
                          disabled={isSaving || isUploadingAttachment}
                          onClick={() => { void sendPendingVoiceDraft(); }}
                        >
                          {t("admin.inbox.voiceSendNow")}
                        </button>
                        <button type="button" onClick={discardPendingVoiceDraft}>
                          {t("admin.inbox.voiceDeleteDraft")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {composerAttachments.length ? (
                    <div className="admin-inbox-composer__attachments">
                      {composerAttachments.map((attachment, index) => (
                        <span key={attachment.id || `${attachment.file_name || attachment.title}-${index}`} className="admin-inbox-composer__attachment-chip">
                          <span>{getAttachmentDisplayLabel(attachment, index) || t(`admin.inbox.${getAttachmentKind(attachment)}Attachment`, { defaultValue: t("admin.inbox.documentAttachment") })}</span>
                          <button
                            type="button"
                            aria-label={t("admin.inbox.removeAttachment")}
                            onClick={() => removeComposerAttachment(attachment.id)}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="admin-inbox-composer__row">
                    <textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder={t("admin.inbox.replyPlaceholder", { name: selectedConversation.displayName })}
                      rows={1}
                    />
                    <div className="admin-inbox-composer__actions">
                      <div className="admin-inbox-composer__emoji">
                        <button
                          type="button"
                          aria-label={t("admin.inbox.addEmoji")}
                          onClick={() => setIsEmojiPickerOpen((current) => !current)}
                        >
                          <Smile size={17} />
                        </button>
                        {isEmojiPickerOpen ? (
                          <div className="admin-inbox-emoji-picker">
                            {composerEmojiOptions.map((emoji) => (
                              <button key={emoji} type="button" onClick={() => handleEmojiInsert(emoji)}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={t("admin.inbox.attachFile")}
                        disabled={!isSocialComposer || isUploadingAttachment || isRecordingVoice}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip size={17} />
                      </button>
                      <button
                        type="button"
                        aria-label={isRecordingVoice ? t("admin.inbox.voiceStop") : t("admin.inbox.voiceRecord")}
                        className={isRecordingVoice ? "is-recording" : ""}
                        disabled={!isSocialComposer || isUploadingAttachment || Boolean(pendingVoiceDraft)}
                        onClick={() => { void handleVoiceToggle(); }}
                      >
                        {isRecordingVoice ? <Square size={15} /> : <Mic size={17} />}
                      </button>
                      <button className="is-primary" type="submit" disabled={!canSendReply} aria-label={t("admin.inbox.sendReply")}>
                        <Send size={17} />
                      </button>
                    </div>
                  </div>
                  {isUploadingAttachment || isRecordingVoice ? (
                    <div className="admin-inbox-composer__status">
                      {isRecordingVoice
                        ? t("admin.inbox.recordingNow", { seconds: voiceRecordingSeconds })
                        : t("admin.inbox.uploadingAttachment")}
                    </div>
                  ) : null}
                  {isRecordingVoice ? (
                    <div className="admin-inbox-voice-recorder">
                      <div className="admin-inbox-voice-recorder__meta">
                        <strong>{t("admin.inbox.voiceRecordingTitle")}</strong>
                        <span>{t("admin.inbox.voiceDuration", { seconds: voiceRecordingSeconds })}</span>
                      </div>
                      <div className="admin-inbox-voice-waveform">
                        {voiceWaveform.map((level, index) => (
                          <span key={`live-wave-${index}`} style={{ "--voice-wave-height": `${Math.max(12, Math.round(level * 38))}px` }} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </form>
              </>
            ) : (
              <div className="admin-empty admin-empty--module">
                <h2>{t("admin.inbox.emptyTitle")}</h2>
                <p>{t("admin.inbox.emptyDetail")}</p>
              </div>
            )}
          </main>

          <aside className="admin-inbox-info">
            {selectedConversation ? (
              <>
                <section className="admin-inbox-profile">
                  <Avatar label={selectedConversation.displayName} tone="orange" status={false} imageUrl={selectedConversation.avatarUrl} />
                  <h2>{selectedConversation.displayName}</h2>
                  <ChannelPill channel={selectedConversation.channel} label={channelLabels[selectedConversation.channel]} />
                </section>

                <section className="admin-inbox-quick-actions" aria-label={t("admin.inbox.conversationActions")}>
                  <button type="button" onClick={() => void handleNotifyAction()}><Bell size={16} /><span>{t("admin.inbox.notify")}</span></button>
                  <button type="button" onClick={() => openActionPanel("assign")}><Tag size={16} /><span>{t("admin.inbox.assign")}</span></button>
                  <button type="button" onClick={() => openActionPanel("task")}><Plus size={16} /><span>{t("admin.inbox.task")}</span></button>
                  <button type="button" onClick={() => openActionPanel("rules")}><Settings size={16} /><span>{t("admin.inbox.rules")}</span></button>
                </section>

                {activeAction ? (
                  <section className="admin-inbox-action-panel">
                    <div className="admin-inbox-action-panel__head">
                      <h3>
                        {activeAction === "assign" ? t("admin.inbox.assignPanelTitle")
                          : activeAction === "task" ? t("admin.inbox.taskPanelTitle")
                            : activeAction === "rules" ? t("admin.inbox.rulesPanelTitle")
                              : t("admin.inbox.newPanelTitle")}
                      </h3>
                      <button type="button" onClick={() => { setActiveAction(""); }}>{t("admin.inbox.closePanel")}</button>
                    </div>

                    {activeAction === "assign" ? (
                      <div className="admin-inbox-action-panel__body">
                        <label>
                          <span>{t("admin.inbox.assigneeField")}</span>
                          <select
                            value={assignmentDraft.assigned_user_id}
                            onChange={(event) => setAssignmentDraft((current) => ({ ...current, assigned_user_id: event.target.value }))}
                          >
                            <option value="">{t("admin.inbox.unassignedLabel")}</option>
                            {assignableUsers.map((user) => (
                              <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.statusField")}</span>
                          <select
                            value={assignmentDraft.status}
                            onChange={(event) => setAssignmentDraft((current) => ({ ...current, status: event.target.value }))}
                          >
                            {conversationStatuses.map((status) => (
                              <option key={status} value={status}>{t(`admin.inbox.statuses.${status}`, { defaultValue: status })}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.priorityField")}</span>
                          <select
                            value={assignmentDraft.priority}
                            onChange={(event) => setAssignmentDraft((current) => ({ ...current, priority: event.target.value }))}
                          >
                            {conversationPriorities.map((priority) => (
                              <option key={priority} value={priority}>{t(`admin.inbox.priorities.${priority}`, { defaultValue: priority })}</option>
                            ))}
                          </select>
                        </label>
                        <div className="admin-inbox-action-panel__actions">
                          <button type="button" onClick={() => { setActiveAction(""); }}>{t("admin.inbox.cancelAction")}</button>
                          <button type="button" className="is-primary" disabled={isActionSaving} onClick={() => void saveAssignment()}>{t("admin.inbox.saveAssignment")}</button>
                        </div>
                      </div>
                    ) : null}

                    {activeAction === "task" ? (
                      <div className="admin-inbox-action-panel__body">
                        <label>
                          <span>{t("admin.inbox.taskTitleField")}</span>
                          <input
                            value={taskDraft.title}
                            onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                            type="text"
                          />
                        </label>
                        <label>
                          <span>{t("admin.inbox.taskDescriptionField")}</span>
                          <textarea
                            value={taskDraft.description}
                            onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))}
                            rows={3}
                          />
                        </label>
                        <label>
                          <span>{t("admin.inbox.assigneeField")}</span>
                          <select
                            value={taskDraft.assigned_user_id}
                            onChange={(event) => setTaskDraft((current) => ({ ...current, assigned_user_id: event.target.value }))}
                          >
                            <option value="">{t("admin.inbox.unassignedLabel")}</option>
                            {assignableUsers.map((user) => (
                              <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.priorityField")}</span>
                          <select
                            value={taskDraft.priority}
                            onChange={(event) => setTaskDraft((current) => ({ ...current, priority: event.target.value }))}
                          >
                            {["low", "medium", "high", "urgent"].map((priority) => (
                              <option key={priority} value={priority}>{t(`admin.inbox.taskPriorities.${priority}`, { defaultValue: priority })}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.dueDateField")}</span>
                          <input
                            value={taskDraft.due_date}
                            onChange={(event) => setTaskDraft((current) => ({ ...current, due_date: event.target.value }))}
                            type="date"
                          />
                        </label>
                        <div className="admin-inbox-action-panel__actions">
                          <button type="button" onClick={() => { setActiveAction(""); }}>{t("admin.inbox.cancelAction")}</button>
                          <button type="button" className="is-primary" disabled={isActionSaving || !taskDraft.title.trim()} onClick={() => void createInboxTask()}>{t("admin.inbox.createTaskAction")}</button>
                        </div>
                      </div>
                    ) : null}

                    {activeAction === "rules" ? (
                      <div className="admin-inbox-action-panel__body">
                        <label>
                          <span>{t("admin.inbox.statusField")}</span>
                          <select
                            value={rulesDraft.status}
                            onChange={(event) => setRulesDraft((current) => ({ ...current, status: event.target.value }))}
                          >
                            {conversationStatuses.map((status) => (
                              <option key={status} value={status}>{t(`admin.inbox.statuses.${status}`, { defaultValue: status })}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.priorityField")}</span>
                          <select
                            value={rulesDraft.priority}
                            onChange={(event) => setRulesDraft((current) => ({ ...current, priority: event.target.value }))}
                          >
                            {conversationPriorities.map((priority) => (
                              <option key={priority} value={priority}>{t(`admin.inbox.priorities.${priority}`, { defaultValue: priority })}</option>
                            ))}
                          </select>
                        </label>
                        <div className="admin-inbox-action-panel__actions">
                          <button type="button" onClick={() => { setActiveAction(""); }}>{t("admin.inbox.cancelAction")}</button>
                          <button type="button" className="is-primary" disabled={isActionSaving} onClick={() => void saveRules()}>{t("admin.inbox.saveRules")}</button>
                        </div>
                      </div>
                    ) : null}

                    {activeAction === "new" ? (
                      <div className="admin-inbox-action-panel__body">
                        <label>
                          <span>{t("admin.inbox.entityTypeField")}</span>
                          <select
                            value={newDraft.entity_type}
                            onChange={(event) => setNewDraft((current) => ({ ...current, entity_type: event.target.value, entity_id: "" }))}
                          >
                            {["lead", "case", "customer"].map((type) => (
                              <option key={type} value={type}>{t(`admin.inbox.entityTypes.${type}`, { defaultValue: type })}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.entityField")}</span>
                          <select
                            value={newDraft.entity_id}
                            onChange={(event) => setNewDraft((current) => ({ ...current, entity_id: event.target.value }))}
                          >
                            <option value="">{t("admin.inbox.selectEntity")}</option>
                            {(entityOptions[newDraft.entity_type] || []).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.lead_code || item.case_code || item.full_name || item.email || item.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.channelField")}</span>
                          <select
                            value={newDraft.channel}
                            onChange={(event) => setNewDraft((current) => ({ ...current, channel: event.target.value }))}
                          >
                            {channels.map((channel) => (
                              <option key={channel} value={channel}>{channelLabels[channel]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.inbox.subjectField")}</span>
                          <input
                            value={newDraft.subject}
                            onChange={(event) => setNewDraft((current) => ({ ...current, subject: event.target.value }))}
                            type="text"
                          />
                        </label>
                        <label>
                          <span>{t("admin.inbox.bodyField")}</span>
                          <textarea
                            value={newDraft.body}
                            onChange={(event) => setNewDraft((current) => ({ ...current, body: event.target.value }))}
                            rows={4}
                          />
                        </label>
                        <div className="admin-inbox-action-panel__actions">
                          <button type="button" onClick={() => { setActiveAction(""); }}>{t("admin.inbox.cancelAction")}</button>
                          <button type="button" className="is-primary" disabled={isActionSaving} onClick={() => void createManualInboxItem()}>{t("admin.inbox.createNewItem")}</button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section className="admin-inbox-info-block">
                  <div className="admin-inbox-info-block__head">
                    <h3>{t("admin.inbox.customer")}</h3>
                    <Info size={15} />
                  </div>
                  <dl>
                    <div><dt>{t("admin.inbox.emailLabel")}</dt><dd>{selectedConversation.customer?.email || "-"}</dd></div>
                    <div><dt>{t("admin.inbox.phoneLabel")}</dt><dd>{selectedConversation.customer?.phone || "-"}</dd></div>
                    <div><dt>{t("admin.inbox.entityLabel")}</dt><dd>{getEntityTypeLabel(selectedConversation.entityType)} · {selectedConversation.entityLabel}</dd></div>
                    <div><dt>{t("admin.inbox.assignedToField")}</dt><dd>{selectedAssignee?.full_name || selectedAssignee?.email || t("admin.inbox.unassignedLabel")}</dd></div>
                    <div><dt>{t("admin.inbox.statusField")}</dt><dd>{t(`admin.inbox.statuses.${selectedConversation.status || "open"}`, { defaultValue: selectedConversation.status || "open" })}</dd></div>
                    <div><dt>{t("admin.inbox.priorityField")}</dt><dd>{t(`admin.inbox.priorities.${selectedConversation.priority || "normal"}`, { defaultValue: selectedConversation.priority || "normal" })}</dd></div>
                  </dl>
                </section>

                <section className="admin-inbox-info-block">
                  <div className="admin-inbox-info-block__head">
                    <h3>{t("admin.inbox.sharedMedia")}</h3>
                    {conversationMediaItems.length > 6 ? (
                      <button type="button" onClick={() => setIsMediaExpanded((current) => !current)}>
                        {isMediaExpanded ? t("admin.inbox.showLess") : t("admin.inbox.viewAll")}
                      </button>
                    ) : null}
                  </div>
                  {visibleMediaItems.length ? (
                    <div className="admin-inbox-media-grid">
                      {visibleMediaItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`is-${item.kind}`}
                          onClick={() => (
                            item.url
                              ? item.kind === "image"
                                ? openImageViewer(item.url, item.label || t("admin.inbox.imageAttachment"))
                                : window.open(item.url, "_blank", "noopener,noreferrer")
                              : pushNotice(t("admin.inbox.mediaUnavailable"), "error")
                          )}
                        >
                          <Image size={18} />
                          <span>{item.label || t(`admin.inbox.${item.kind}Attachment`, { defaultValue: t("admin.inbox.documentAttachment") })}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-message">{t("admin.inbox.noMedia")}</p>
                  )}
                </section>

                <section className="admin-inbox-info-block">
                  <div className="admin-inbox-info-block__head">
                    <h3>{t("admin.inbox.files")}</h3>
                    <button type="button" onClick={() => exportConversationCsv(selectedConversation, t)}>{t("admin.inbox.export")}</button>
                  </div>
                  <div className="admin-inbox-file-list">
                    <button type="button" onClick={() => exportConversationCsv(selectedConversation, t)}>
                      <FileText size={17} />
                      <div><strong>{t("admin.inbox.csvFile")}</strong><span>{t("admin.inbox.messagesCount", { count: selectedConversation.messages.length })}</span></div>
                      <Download size={15} />
                    </button>
                    <button type="button" onClick={() => openLinkedRecord(selectedConversation)}>
                      <FileText size={17} />
                      <div><strong>{selectedConversation.entityLabel}</strong><span>{t("admin.inbox.linkedRecord")}</span></div>
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                </section>
              </>
            ) : null}
          </aside>
        </section>
      )}
    </div>
  );
}

export default AdminCommunication;
