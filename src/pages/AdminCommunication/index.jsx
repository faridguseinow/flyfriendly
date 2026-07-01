import { useEffect, useMemo, useState } from "react";
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
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Tag,
  Users,
  Video,
} from "lucide-react";
import { createCommunication, fetchCommunicationsModuleData } from "../../services/adminService.js";
import {
  createSocialInboxMessage,
  fetchSocialConversationMessages,
  fetchSocialInboxModuleData,
  markSocialConversationRead,
} from "../../services/adminSocialInboxService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const channels = ["email", "whatsapp", "instagram", "facebook", "messenger", "phone", "airline", "internal_note", "manual"];
const channelLabels = {
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

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "now";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return date.toLocaleDateString();
}

function formatDateDivider(value) {
  if (!value) return "Messages";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Messages";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function normalizeSocialMessage(message, { channel, subject, displayName, profiles }) {
  return {
    ...message,
    channel,
    subject,
    created_at: message.sent_at || message.created_at,
    authorLabel: message.direction === "inbound"
      ? message.sender_name || displayName
      : message.sender_name || profiles.get(message.created_by)?.full_name || profiles.get(message.created_by)?.email || "Fly Friendly",
  };
}

function buildConversations(moduleData, socialMessagesByConversation = {}) {
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
      const displayName = customer?.full_name
        || conversation.participant_name
        || conversation.participant_handle
        || customer?.email
        || "Unknown customer";
      const entityType = conversation.case_id ? "case" : conversation.lead_id ? "lead" : "customer";
      const entityId = conversation.case_id || conversation.lead_id || conversation.customer_id || conversation.id;
      const entityLabel = linkedCase?.case_code || linkedLead?.lead_code || customer?.full_name || conversation.participant_handle || conversation.id;
      const sortedMessages = [...(socialMessagesByConversation[conversation.id] || [])]
        .sort((left, right) => new Date(left.sent_at || left.created_at) - new Date(right.sent_at || right.created_at));

      return {
        id: conversation.id,
        source: "social",
        channel,
        subject: conversation.subject || account?.display_name || channelLabels[channel] || "Conversation",
        customer: customer || {
          email: conversation.participant_email,
          phone: conversation.participant_phone,
        },
        displayName,
        avatarUrl: conversation.avatar_url || null,
        entityLabel,
        entityType,
        entityId,
        customerId: conversation.customer_id,
        latestAt: conversation.last_message_at || conversation.updated_at || conversation.created_at,
        latestBody: conversation.last_message_preview || sortedMessages.at(-1)?.body || conversation.subject || "No message body",
        unreadCount: conversation.unread_count || 0,
        status: conversation.status,
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
    const key = getConversationKey(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([id, messages]) => {
      const sortedMessages = [...messages].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
      const latest = sortedMessages[sortedMessages.length - 1];
      const customer = maps.customers.get(latest.customer_id) || maps.customers.get(latest.entity_id);
      const displayName = customer?.full_name || customer?.email || getEntityLabel(latest, maps) || "Unknown customer";
      const inboundCount = sortedMessages.filter((item) => item.direction === "inbound").length;
      const outboundCount = sortedMessages.filter((item) => item.direction === "outbound").length;

      return {
        id,
        source: moduleData?.communications?.length ? "legacy" : "demo",
        channel: latest.channel,
        subject: latest.subject || channelLabels[latest.channel] || "Conversation",
        customer,
        displayName,
        entityLabel: getEntityLabel(latest, maps),
        entityType: latest.entity_type,
        entityId: latest.entity_id,
        customerId: latest.customer_id,
        latestAt: latest.created_at,
        latestBody: latest.body || latest.subject || "No message body",
        unreadCount: Math.max(0, inboundCount - outboundCount),
        messages: sortedMessages.map((message) => ({
          ...message,
          authorLabel: message.direction === "inbound"
            ? displayName
            : maps.profiles.get(message.created_by)?.full_name || maps.profiles.get(message.created_by)?.email || "Fly Friendly",
        })),
      };
    })
    .sort((left, right) => new Date(right.latestAt) - new Date(left.latestAt));
}

function Avatar({ label, imageUrl, tone = "blue", status = true }) {
  return (
    <span className={`admin-inbox-avatar is-${tone}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <span>{getInitials(label)}</span>
      {status ? <i /> : null}
    </span>
  );
}

function ChannelPill({ channel }) {
  const Icon = channelIcons[channel] || MessageSquareText;
  return (
    <span className="admin-inbox-channel">
      <Icon size={13} strokeWidth={2} />
      {channelLabels[channel] || channel}
    </span>
  );
}

function exportConversationCsv(conversation) {
  if (!conversation) return;
  const headers = ["Time", "Channel", "Direction", "Author", "Subject", "Body"];
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
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [socialMessagesByConversation, setSocialMessagesByConversation] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [reply, setReply] = useState("");

  const loadCommunications = async () => {
    setError("");
    setIsLoading(true);

    try {
      const socialInbox = await fetchSocialInboxModuleData();
      if (socialInbox.supportsSocialInbox) {
        setModuleData(socialInbox);
        return;
      }

      const legacyCommunications = await fetchCommunicationsModuleData();
      setModuleData({ ...legacyCommunications, supportsSocialInbox: false });
    } catch (nextError) {
      setError(nextError.message || "Could not load inbox.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCommunications();
  }, []);

  const conversations = useMemo(() => buildConversations(moduleData, socialMessagesByConversation), [moduleData, socialMessagesByConversation]);
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
          setError(nextError.message || "Could not load conversation messages.");
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

  const metrics = useMemo(() => ({
    total: conversations.length,
    unread: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    instagram: conversations.filter((item) => item.channel === "instagram").length,
    whatsapp: conversations.filter((item) => item.channel === "whatsapp").length,
  }), [conversations]);

  const sendReply = async (event) => {
    event.preventDefault();
    if (!selectedConversation || !reply.trim()) return;

    if (String(selectedConversation.entityId).startsWith("demo-")) {
      setError("This is demo inbox data. Run the social inbox migration or connect Supabase communications data to send real replies.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      if (selectedConversation.source === "social") {
        const created = await createSocialInboxMessage({
          conversation_id: selectedConversation.id,
          direction: "outbound",
          sender_type: "admin",
          body: reply.trim(),
          meta: { source: "admin_inbox" },
        });
        await markSocialConversationRead(selectedConversation.id).catch(() => null);
        const nextMessages = await fetchSocialConversationMessages(selectedConversation.id, { limit: 50 });
        setSocialMessagesByConversation((current) => ({
          ...current,
          [selectedConversation.id]: nextMessages.length ? nextMessages : [
            ...(current[selectedConversation.id] || []),
            {
              id: created?.id || crypto.randomUUID(),
              conversation_id: selectedConversation.id,
              direction: "outbound",
              sender_type: "admin",
              body: reply.trim(),
              sent_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
          ],
        }));
      } else {
        await createCommunication({
          entity_type: selectedConversation.entityType,
          entity_id: selectedConversation.entityId,
          customer_id: selectedConversation.customerId,
          channel: selectedConversation.channel,
          direction: "outbound",
          subject: selectedConversation.subject,
          body: reply.trim(),
          meta: { source: "admin_inbox" },
        });
      }
      setReply("");
      await loadCommunications();
    } catch (nextError) {
      setError(nextError.message || "Could not send reply.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-communication-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsSocialInbox && !moduleData.supportsCommunicationsModuleV1 ? (
        <p className="admin-message">
          Inbox schema is not available yet. Run `048_social_inbox.sql` in Supabase to unlock the social inbox.
        </p>
      ) : null}

      {isLoading ? (
        <p className="admin-message">Loading inbox...</p>
      ) : (
        <section className="admin-inbox-shell" aria-label="Social inbox">
          <aside className="admin-inbox-sidebar">
            <div className="admin-inbox-search">
              <Search size={17} strokeWidth={1.9} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                placeholder="Search inbox"
              />
            </div>

            <div className="admin-inbox-tabs" role="tablist" aria-label="Inbox filters">
              <button type="button" className={channelFilter === "all" ? "is-active" : ""} onClick={() => setChannelFilter("all")}>
                <Users size={15} />
                Inbox
                <span>{metrics.unread}</span>
              </button>
              <button type="button" className={channelFilter === "instagram" ? "is-active" : ""} onClick={() => setChannelFilter("instagram")}>
                <MessageSquareText size={15} />
                Instagram
                <span>{metrics.instagram}</span>
              </button>
              <button type="button" className={channelFilter === "whatsapp" ? "is-active" : ""} onClick={() => setChannelFilter("whatsapp")}>
                <MessageCircle size={15} />
                WhatsApp
                <span>{metrics.whatsapp}</span>
              </button>
            </div>

            <div className="admin-inbox-sidebar__heading">
              <div>
                <h2>Messages</h2>
                <p>{metrics.total} conversations</p>
              </div>
              <button type="button" aria-label="New inbox item">
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
                  <Avatar label={conversation.displayName} imageUrl={conversation.avatarUrl} tone={index % 3 === 0 ? "green" : index % 3 === 1 ? "orange" : "blue"} />
                  <span className="admin-inbox-thread__body">
                    <span className="admin-inbox-thread__top">
                      <strong>{conversation.displayName}</strong>
                      <time>{formatTime(conversation.latestAt)}</time>
                    </span>
                    <span className="admin-inbox-thread__preview">{conversation.latestBody}</span>
                    <span className="admin-inbox-thread__meta">
                      <ChannelPill channel={conversation.channel} />
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
                    <Avatar label={selectedConversation.displayName} imageUrl={selectedConversation.avatarUrl} tone="orange" />
                    <div>
                      <h1>{selectedConversation.displayName}</h1>
                      <p><Circle size={8} fill="currentColor" /> {channelLabels[selectedConversation.channel]} conversation</p>
                    </div>
                  </div>
                  <div className="admin-inbox-chat__actions">
                    <button type="button" aria-label="Call"><Phone size={17} /></button>
                    <button type="button" aria-label="Video call"><Video size={17} /></button>
                    <button type="button" aria-label="Archive"><Archive size={17} /></button>
                    <button type="button" aria-label="More options"><MoreHorizontal size={18} /></button>
                  </div>
                </header>

                <div className="admin-inbox-chat__messages">
                  <div className="admin-inbox-divider"><span>{formatDateDivider(selectedConversation.messages[0]?.created_at)}</span></div>
                  {isMessagesLoading && selectedConversation.source === "social" ? (
                    <p className="admin-inbox-loading">Loading messages...</p>
                  ) : null}
                  {selectedConversation.messages.map((message) => (
                    <article key={message.id} className={`admin-inbox-message is-${message.direction}`}>
                      {message.direction === "inbound" ? <Avatar label={message.authorLabel} imageUrl={selectedConversation.avatarUrl} tone="green" /> : null}
                      <div className="admin-inbox-message__content">
                        <div className="admin-inbox-message__meta">
                          <strong>{message.authorLabel}</strong>
                          <time>{formatTime(message.created_at)}</time>
                        </div>
                        <p>{message.body || message.subject || "No message body."}</p>
                        {message.direction === "outbound" ? (
                          <span className="admin-inbox-message__status"><CheckCheck size={13} /> Sent</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <form className="admin-inbox-composer" onSubmit={sendReply}>
                  <button type="button" aria-label="Formatting"><span>Aa</span></button>
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={`Reply to ${selectedConversation.displayName}`}
                    rows={1}
                  />
                  <button type="button" aria-label="Attach file"><Paperclip size={17} /></button>
                  <button type="button" aria-label="Add emoji"><Smile size={17} /></button>
                  <button className="is-primary" type="submit" disabled={!hasPermission("communications.edit") || isSaving || !reply.trim()} aria-label="Send reply">
                    <Send size={17} />
                  </button>
                </form>
              </>
            ) : (
              <div className="admin-empty admin-empty--module">
                <h2>No conversations found</h2>
                <p>Try another search or channel filter.</p>
              </div>
            )}
          </main>

          <aside className="admin-inbox-info">
            {selectedConversation ? (
              <>
                <section className="admin-inbox-profile">
                  <Avatar label={selectedConversation.displayName} imageUrl={selectedConversation.avatarUrl} tone="orange" status={false} />
                  <h2>{selectedConversation.displayName}</h2>
                  <ChannelPill channel={selectedConversation.channel} />
                </section>

                <section className="admin-inbox-quick-actions" aria-label="Conversation actions">
                  <button type="button"><Bell size={16} /><span>Notify</span></button>
                  <button type="button"><Tag size={16} /><span>Assign</span></button>
                  <button type="button"><Plus size={16} /><span>Task</span></button>
                  <button type="button"><Settings size={16} /><span>Rules</span></button>
                </section>

                <section className="admin-inbox-info-block">
                  <div className="admin-inbox-info-block__head">
                    <h3>Customer</h3>
                    <Info size={15} />
                  </div>
                  <dl>
                    <div><dt>Email</dt><dd>{selectedConversation.customer?.email || "-"}</dd></div>
                    <div><dt>Phone</dt><dd>{selectedConversation.customer?.phone || "-"}</dd></div>
                    <div><dt>Entity</dt><dd>{selectedConversation.entityType} · {selectedConversation.entityLabel}</dd></div>
                  </dl>
                </section>

                <section className="admin-inbox-info-block">
                  <div className="admin-inbox-info-block__head">
                    <h3>Shared media</h3>
                    <button type="button">View all</button>
                  </div>
                  <div className="admin-inbox-media-grid">
                    {["is-red", "is-blue", "is-green", "is-violet", "is-cyan", "is-ink"].map((tone) => (
                      <span key={tone} className={tone}><Image size={18} /></span>
                    ))}
                  </div>
                </section>

                <section className="admin-inbox-info-block">
                  <div className="admin-inbox-info-block__head">
                    <h3>Files</h3>
                    <button type="button" onClick={() => exportConversationCsv(selectedConversation)}>Export</button>
                  </div>
                  <div className="admin-inbox-file-list">
                    <article>
                      <FileText size={17} />
                      <div><strong>conversation.csv</strong><span>{selectedConversation.messages.length} messages</span></div>
                      <Download size={15} />
                    </article>
                    <article>
                      <FileText size={17} />
                      <div><strong>{selectedConversation.entityLabel}</strong><span>Linked record</span></div>
                      <MoreHorizontal size={15} />
                    </article>
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
