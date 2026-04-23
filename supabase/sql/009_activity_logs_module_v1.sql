-- Activity Logs Module V1
-- Central audit trail for admin actions across operational and business modules.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  module text not null,
  target_entity_type text not null,
  target_entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_module_idx on public.activity_logs(module, created_at desc);
create index if not exists activity_logs_target_idx on public.activity_logs(target_entity_type, target_entity_id, created_at desc);
create index if not exists activity_logs_user_idx on public.activity_logs(user_id, created_at desc);

alter table public.activity_logs enable row level security;

grant select, insert on public.activity_logs to authenticated;

drop policy if exists "admins read activity logs" on public.activity_logs;
create policy "admins read activity logs"
on public.activity_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "admins create activity logs" on public.activity_logs;
create policy "admins create activity logs"
on public.activity_logs for insert
to authenticated
with check (public.is_admin());
