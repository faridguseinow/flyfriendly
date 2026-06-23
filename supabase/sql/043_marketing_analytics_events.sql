create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  event_name text not null,
  page_path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  referral_code text,
  created_at timestamptz not null default now(),
  constraint analytics_events_anonymous_id_check check (length(btrim(anonymous_id)) > 0),
  constraint analytics_events_event_name_check check (
    event_name = any (array['page_view', 'claim_submitted', 'partner_referral_opened'])
  ),
  constraint analytics_events_device_type_check check (
    device_type is null or device_type = any (array['mobile', 'tablet', 'desktop'])
  )
);

create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events(event_name);
create index if not exists analytics_events_anonymous_id_idx on public.analytics_events(anonymous_id);
create index if not exists analytics_events_referral_code_idx on public.analytics_events(referral_code);
create index if not exists analytics_events_utm_source_idx on public.analytics_events(utm_source);
create index if not exists analytics_events_device_type_idx on public.analytics_events(device_type);

alter table public.analytics_events enable row level security;

grant select on public.analytics_events to authenticated;

drop policy if exists "admins read analytics events" on public.analytics_events;
create policy "admins read analytics events"
on public.analytics_events for select
to authenticated
using (public.is_admin());
