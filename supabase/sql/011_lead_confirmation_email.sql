alter table public.leads
  add column if not exists customer_confirmation_sent_at timestamptz,
  add column if not exists customer_confirmation_message_id text,
  add column if not exists customer_confirmation_error text;
