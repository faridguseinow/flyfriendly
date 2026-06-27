alter table public.analytics_events
  add column if not exists ab_test text,
  add column if not exists ab_variant text;

create index if not exists analytics_events_ab_test_idx
  on public.analytics_events(ab_test);

create index if not exists analytics_events_ab_variant_idx
  on public.analytics_events(ab_variant);
