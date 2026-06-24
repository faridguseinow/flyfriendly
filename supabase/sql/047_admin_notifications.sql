create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'admin',
  severity text not null default 'info',
  title text not null,
  body text,
  module text,
  entity_type text,
  entity_id text,
  action_url text,
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_role text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_notifications_title_check check (length(btrim(title)) > 0),
  constraint admin_notifications_severity_check check (severity = any (array['info', 'warning', 'critical']))
);

create index if not exists admin_notifications_created_at_idx
  on public.admin_notifications(created_at desc);

create index if not exists admin_notifications_recipient_profile_idx
  on public.admin_notifications(recipient_profile_id, read_at, created_at desc);

create index if not exists admin_notifications_recipient_role_idx
  on public.admin_notifications(recipient_role, read_at, created_at desc);

create index if not exists admin_notifications_module_idx
  on public.admin_notifications(module, created_at desc);

alter table public.admin_notifications enable row level security;

grant select, insert, update on public.admin_notifications to authenticated;

drop policy if exists "admins read admin notifications" on public.admin_notifications;
create policy "admins read admin notifications"
on public.admin_notifications for select
to authenticated
using (public.is_admin());

drop policy if exists "admins create admin notifications" on public.admin_notifications;
create policy "admins create admin notifications"
on public.admin_notifications for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins update admin notifications" on public.admin_notifications;
create policy "admins update admin notifications"
on public.admin_notifications for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

