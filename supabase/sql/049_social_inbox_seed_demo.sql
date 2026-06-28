with account_row as (
  insert into public.social_accounts (
    platform,
    display_name,
    handle,
    external_account_id,
    status,
    meta
  )
  values (
    'instagram',
    'Fly Friendly Instagram',
    '@flyfriendly',
    'demo-instagram-account',
    'active',
    '{"seed": true}'::jsonb
  )
  on conflict (platform, external_account_id)
  where external_account_id is not null
  do update
  set
    display_name = excluded.display_name,
    handle = excluded.handle,
    status = excluded.status,
    updated_at = now()
  returning id
),
conversation_row as (
  insert into public.social_conversations (
    account_id,
    external_conversation_id,
    participant_name,
    participant_handle,
    participant_email,
    participant_phone,
    subject,
    status,
    priority,
    meta
  )
  select
    id,
    'demo-instagram-conversation-1',
    'Nicat Aliyev',
    '@nicat_aliyev',
    'nicat@example.com',
    '+994 55 000 00 02',
    'Delayed flight claim',
    'open',
    'normal',
    '{"seed": true}'::jsonb
  from account_row
  on conflict (account_id, external_conversation_id)
  where account_id is not null and external_conversation_id is not null
  do update
  set
    participant_name = excluded.participant_name,
    participant_handle = excluded.participant_handle,
    participant_email = excluded.participant_email,
    participant_phone = excluded.participant_phone,
    subject = excluded.subject,
    status = excluded.status,
    updated_at = now()
  returning id
)
insert into public.social_messages (
  conversation_id,
  external_message_id,
  direction,
  sender_type,
  sender_name,
  body,
  sent_at,
  meta
)
select
  id,
  'demo-instagram-message-1',
  'inbound',
  'customer',
  'Nicat Aliyev',
  'Salam, uçuşum 4 saat gecikib. Kompensasiya üçün müraciət edə bilərəm?',
  now() - interval '12 minutes',
  '{"seed": true}'::jsonb
from conversation_row
on conflict (conversation_id, external_message_id)
where external_message_id is not null
do nothing;
