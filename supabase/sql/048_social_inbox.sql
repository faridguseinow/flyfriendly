create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  display_name text not null,
  handle text,
  external_account_id text,
  status text not null default 'active',
  connected_by uuid references public.profiles(id) on delete set null,
  last_sync_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_platform_check check (
    platform = any (array['instagram', 'facebook', 'messenger', 'whatsapp', 'email', 'manual'])
  ),
  constraint social_accounts_status_check check (
    status = any (array['active', 'paused', 'disconnected', 'needs_reauth'])
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.social_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.social_accounts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  external_conversation_id text,
  participant_name text,
  participant_handle text,
  participant_email text,
  participant_phone text,
  avatar_url text,
  subject text,
  status text not null default 'open',
  priority text not null default 'normal',
  unread_count integer not null default 0,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  archived_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_conversations_status_check check (
    status = any (array['open', 'pending', 'replied', 'archived', 'blocked'])
  ),
  constraint social_conversations_priority_check check (
    priority = any (array['low', 'normal', 'high', 'urgent'])
  )
);

create table if not exists public.social_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.social_conversations(id) on delete cascade,
  external_message_id text,
  direction text not null,
  sender_type text not null default 'customer',
  sender_name text,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint social_messages_direction_check check (
    direction = any (array['inbound', 'outbound', 'internal'])
  ),
  constraint social_messages_sender_type_check check (
    sender_type = any (array['customer', 'admin', 'system'])
  )
);

create table if not exists public.social_webhook_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  event_type text not null,
  external_event_id text,
  account_id uuid references public.social_accounts(id) on delete set null,
  conversation_id uuid references public.social_conversations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received',
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint social_webhook_events_processing_status_check check (
    processing_status = any (array['received', 'processed', 'ignored', 'failed'])
  )
);

create unique index if not exists social_accounts_platform_external_uidx
  on public.social_accounts(platform, external_account_id)
  where external_account_id is not null;

create index if not exists social_accounts_status_idx
  on public.social_accounts(status, platform);

create unique index if not exists social_conversations_account_external_uidx
  on public.social_conversations(account_id, external_conversation_id)
  where account_id is not null and external_conversation_id is not null;

create index if not exists social_conversations_last_message_idx
  on public.social_conversations(last_message_at desc nulls last);

create index if not exists social_conversations_status_idx
  on public.social_conversations(status, assigned_user_id, last_message_at desc nulls last);

create index if not exists social_conversations_customer_idx
  on public.social_conversations(customer_id);

create index if not exists social_conversations_lead_idx
  on public.social_conversations(lead_id);

create index if not exists social_conversations_case_idx
  on public.social_conversations(case_id);

create unique index if not exists social_messages_conversation_external_uidx
  on public.social_messages(conversation_id, external_message_id)
  where external_message_id is not null;

create index if not exists social_messages_conversation_sent_idx
  on public.social_messages(conversation_id, sent_at asc);

create index if not exists social_webhook_events_platform_external_uidx
  on public.social_webhook_events(platform, external_event_id)
  where external_event_id is not null;

create index if not exists social_webhook_events_status_idx
  on public.social_webhook_events(processing_status, received_at desc);

create or replace function public.update_social_conversation_from_message()
returns trigger
language plpgsql
as $$
declare
  preview text;
begin
  preview := left(coalesce(new.body, ''), 240);

  update public.social_conversations
  set
    last_message_at = coalesce(new.sent_at, new.created_at, now()),
    last_message_preview = nullif(preview, ''),
    last_inbound_at = case when new.direction = 'inbound' then coalesce(new.sent_at, new.created_at, now()) else last_inbound_at end,
    last_outbound_at = case when new.direction = 'outbound' then coalesce(new.sent_at, new.created_at, now()) else last_outbound_at end,
    unread_count = case
      when new.direction = 'inbound' then coalesce(unread_count, 0) + 1
      when new.direction = 'outbound' then 0
      else coalesce(unread_count, 0)
    end,
    status = case
      when new.direction = 'outbound' and status = 'open' then 'replied'
      when new.direction = 'inbound' and status = 'replied' then 'open'
      else status
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists update_social_conversation_on_message on public.social_messages;
create trigger update_social_conversation_on_message
after insert on public.social_messages
for each row execute function public.update_social_conversation_from_message();

drop trigger if exists set_updated_at_on_social_accounts on public.social_accounts;
create trigger set_updated_at_on_social_accounts
before update on public.social_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_social_conversations on public.social_conversations;
create trigger set_updated_at_on_social_conversations
before update on public.social_conversations
for each row execute function public.set_updated_at();

alter table public.social_accounts enable row level security;
alter table public.social_conversations enable row level security;
alter table public.social_messages enable row level security;
alter table public.social_webhook_events enable row level security;

grant select, insert, update on public.social_accounts to authenticated;
grant select, insert, update on public.social_conversations to authenticated;
grant select, insert, update on public.social_messages to authenticated;
grant select, insert, update on public.social_webhook_events to authenticated;

drop policy if exists "admins read social accounts" on public.social_accounts;
create policy "admins read social accounts"
on public.social_accounts for select
to authenticated
using (
  public.has_admin_permission('communications.view')
  or public.has_admin_permission('communications.edit')
);

drop policy if exists "admins manage social accounts" on public.social_accounts;
create policy "admins manage social accounts"
on public.social_accounts for all
to authenticated
using (public.has_admin_permission('communications.edit'))
with check (public.has_admin_permission('communications.edit'));

drop policy if exists "admins read social conversations" on public.social_conversations;
create policy "admins read social conversations"
on public.social_conversations for select
to authenticated
using (
  public.has_admin_permission('communications.view')
  or public.has_admin_permission('communications.edit')
);

drop policy if exists "admins manage social conversations" on public.social_conversations;
create policy "admins manage social conversations"
on public.social_conversations for all
to authenticated
using (public.has_admin_permission('communications.edit'))
with check (public.has_admin_permission('communications.edit'));

drop policy if exists "admins read social messages" on public.social_messages;
create policy "admins read social messages"
on public.social_messages for select
to authenticated
using (
  public.has_admin_permission('communications.view')
  or public.has_admin_permission('communications.edit')
);

drop policy if exists "admins manage social messages" on public.social_messages;
create policy "admins manage social messages"
on public.social_messages for all
to authenticated
using (public.has_admin_permission('communications.edit'))
with check (public.has_admin_permission('communications.edit'));

drop policy if exists "admins read social webhook events" on public.social_webhook_events;
create policy "admins read social webhook events"
on public.social_webhook_events for select
to authenticated
using (
  public.has_admin_permission('communications.view')
  or public.has_admin_permission('communications.edit')
);

drop policy if exists "admins manage social webhook events" on public.social_webhook_events;
create policy "admins manage social webhook events"
on public.social_webhook_events for all
to authenticated
using (public.has_admin_permission('communications.edit'))
with check (public.has_admin_permission('communications.edit'));
