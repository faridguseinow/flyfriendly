-- Dynamic Admin Team Management Foundation V1
-- Adds a forward-compatible foundation for dynamic roles, team members,
-- menu visibility, activity logs, and work sessions without removing
-- the existing legacy RBAC model.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_owner_or_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'super_admin')
  )
  or exists (
    select 1
    from public.user_admin_roles uar
    where uar.user_id = auth.uid()
      and uar.role_code in ('owner', 'super_admin')
  );
$$;

grant execute on function public.is_owner_or_super_admin() to authenticated;

create or replace function public.is_admin_team_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin();
$$;

grant execute on function public.is_admin_team_member() to authenticated;

alter table if exists public.admin_roles
  add column if not exists id uuid,
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists is_system_role boolean,
  add column if not exists is_owner_role boolean,
  add column if not exists is_active boolean,
  add column if not exists updated_at timestamptz not null default now();

update public.admin_roles
set id = coalesce(id, gen_random_uuid()),
    name = coalesce(name, label, code),
    slug = coalesce(slug, replace(code, '_', '-')),
    description = coalesce(description, label),
    is_system_role = coalesce(is_system_role, is_system, true),
    is_owner_role = coalesce(is_owner_role, code = 'super_admin'),
    is_active = coalesce(is_active, true),
    updated_at = coalesce(updated_at, now())
where id is null
   or name is null
   or slug is null
   or description is null
   or is_system_role is null
   or is_owner_role is null
   or is_active is null
   or updated_at is null;

alter table public.admin_roles
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column name set not null,
  alter column slug set not null,
  alter column is_system_role set default false,
  alter column is_system_role set not null,
  alter column is_owner_role set default false,
  alter column is_owner_role set not null,
  alter column is_active set default true,
  alter column is_active set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_roles_code_key'
      and conrelid = 'public.admin_roles'::regclass
  ) then
    alter table public.admin_roles
      add constraint admin_roles_code_key unique (code);
  end if;
end
$$;

create unique index if not exists admin_roles_slug_key
  on public.admin_roles(slug);

create unique index if not exists admin_roles_id_key
  on public.admin_roles(id);

alter table if exists public.admin_permissions
  add column if not exists id uuid,
  add column if not exists key text,
  add column if not exists description text,
  add column if not exists group_key text;

update public.admin_permissions
set id = coalesce(id, gen_random_uuid()),
    key = coalesce(key, code),
    group_key = coalesce(group_key, module)
where id is null
   or key is null
   or group_key is null;

alter table public.admin_permissions
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_permissions_code_key'
      and conrelid = 'public.admin_permissions'::regclass
  ) then
    alter table public.admin_permissions
      add constraint admin_permissions_code_key unique (code);
  end if;
end
$$;

create unique index if not exists admin_permissions_key_key
  on public.admin_permissions(key);

create unique index if not exists admin_permissions_id_key
  on public.admin_permissions(id);

alter table if exists public.admin_role_permissions
  add column if not exists id uuid,
  add column if not exists role_id uuid,
  add column if not exists permission_id uuid,
  add column if not exists is_allowed boolean not null default true;

update public.admin_role_permissions arp
set id = coalesce(arp.id, gen_random_uuid()),
    role_id = coalesce(arp.role_id, ar.id),
    permission_id = coalesce(arp.permission_id, ap.id)
from public.admin_roles ar,
     public.admin_permissions ap
where ar.code = arp.role_code
  and ap.code = arp.permission_code
  and (
    arp.id is null
    or arp.role_id is null
    or arp.permission_id is null
  );

alter table public.admin_role_permissions
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_permissions_role_id_fkey'
      and conrelid = 'public.admin_role_permissions'::regclass
  ) then
    alter table public.admin_role_permissions
      add constraint admin_role_permissions_role_id_fkey
      foreign key (role_id) references public.admin_roles(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_permissions_permission_id_fkey'
      and conrelid = 'public.admin_role_permissions'::regclass
  ) then
    alter table public.admin_role_permissions
      add constraint admin_role_permissions_permission_id_fkey
      foreign key (permission_id) references public.admin_permissions(id) on delete cascade;
  end if;
end
$$;

create unique index if not exists admin_role_permissions_id_key
  on public.admin_role_permissions(id);

create unique index if not exists admin_role_permissions_role_permission_key
  on public.admin_role_permissions(role_id, permission_id);

create unique index if not exists admin_role_permissions_role_code_permission_code_key
  on public.admin_role_permissions(role_code, permission_code);

create table if not exists public.admin_team_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  email text not null,
  full_name text,
  role_id uuid references public.admin_roles(id) on delete set null,
  status text not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_team_members_status_check check (
    status = any (array['active', 'inactive', 'invited', 'suspended', 'archived'])
  )
);

create index if not exists admin_team_members_status_idx
  on public.admin_team_members(status, created_at desc);

create index if not exists admin_team_members_role_id_idx
  on public.admin_team_members(role_id)
  where role_id is not null;

create table if not exists public.admin_menu_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  route text not null,
  icon text,
  group_key text not null,
  group_label text not null,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  required_permissions text[] not null default '{}'::text[],
  is_critical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_menu_items_group_sort_idx
  on public.admin_menu_items(group_key, sort_order asc, created_at asc);

create table if not exists public.admin_role_menu_visibility (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  menu_item_id uuid not null references public.admin_menu_items(id) on delete cascade,
  is_visible boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, menu_item_id)
);

create index if not exists admin_role_menu_visibility_role_id_idx
  on public.admin_role_menu_visibility(role_id, is_visible);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_logs_profile_idx
  on public.admin_activity_logs(admin_profile_id, created_at desc);

create index if not exists admin_activity_logs_action_idx
  on public.admin_activity_logs(action, created_at desc);

create index if not exists admin_activity_logs_entity_idx
  on public.admin_activity_logs(entity_type, entity_id, created_at desc);

create table if not exists public.admin_work_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_seen_at timestamptz,
  duration_seconds integer,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint admin_work_sessions_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  )
);

create index if not exists admin_work_sessions_profile_idx
  on public.admin_work_sessions(admin_profile_id, started_at desc);

create index if not exists admin_work_sessions_last_seen_idx
  on public.admin_work_sessions(last_seen_at desc);

drop trigger if exists set_updated_at_on_admin_roles on public.admin_roles;
create trigger set_updated_at_on_admin_roles
before update on public.admin_roles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_admin_team_members on public.admin_team_members;
create trigger set_updated_at_on_admin_team_members
before update on public.admin_team_members
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_admin_menu_items on public.admin_menu_items;
create trigger set_updated_at_on_admin_menu_items
before update on public.admin_menu_items
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_admin_role_menu_visibility on public.admin_role_menu_visibility;
create trigger set_updated_at_on_admin_role_menu_visibility
before update on public.admin_role_menu_visibility
for each row execute function public.set_updated_at();

create or replace function public.prevent_admin_system_role_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_system_role then
    raise exception 'System roles cannot be deleted.';
  end if;

  return old;
end;
$$;

create or replace function public.prevent_last_owner_role_deactivation()
returns trigger
language plpgsql
as $$
declare
  remaining_owner_roles integer;
begin
  if tg_op = 'DELETE' then
    if old.is_owner_role then
      select count(*)
      into remaining_owner_roles
      from public.admin_roles
      where is_owner_role = true
        and is_active = true
        and id <> old.id;

      if remaining_owner_roles < 1 then
        raise exception 'Cannot remove or deactivate the last owner role.';
      end if;
    end if;

    return old;
  end if;

  if old.is_owner_role and (
    new.is_owner_role = false
    or new.is_active = false
  ) then
    select count(*)
    into remaining_owner_roles
    from public.admin_roles
    where is_owner_role = true
      and is_active = true
      and id <> old.id;

    if remaining_owner_roles < 1 then
      raise exception 'Cannot remove or deactivate the last owner role.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_last_owner_team_member()
returns trigger
language plpgsql
as $$
declare
  old_role_owner boolean;
  new_role_owner boolean;
  remaining_owners integer;
begin
  if tg_op = 'DELETE' then
    select coalesce(ar.is_owner_role, false)
    into old_role_owner
    from public.admin_roles ar
    where ar.id = old.role_id;

    if old_role_owner and old.status = 'active' then
      select count(*)
      into remaining_owners
      from public.admin_team_members atm
      join public.admin_roles ar on ar.id = atm.role_id
      where atm.id <> old.id
        and atm.status = 'active'
        and ar.is_owner_role = true
        and ar.is_active = true;

      if remaining_owners < 1 then
        raise exception 'Cannot remove the last active owner team member.';
      end if;
    end if;

    return old;
  end if;

  select coalesce(ar.is_owner_role, false)
  into old_role_owner
  from public.admin_roles ar
  where ar.id = old.role_id;

  select coalesce(ar.is_owner_role, false)
  into new_role_owner
  from public.admin_roles ar
  where ar.id = new.role_id;

  if old_role_owner
     and old.status = 'active'
     and (
       new.status <> 'active'
       or not new_role_owner
     ) then
    select count(*)
    into remaining_owners
    from public.admin_team_members atm
    join public.admin_roles ar on ar.id = atm.role_id
    where atm.id <> old.id
      and atm.status = 'active'
      and ar.is_owner_role = true
      and ar.is_active = true;

    if remaining_owners < 1 then
      raise exception 'Cannot deactivate or demote the last active owner team member.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_owner_menu_visibility()
returns trigger
language plpgsql
as $$
declare
  owner_role boolean;
  critical_item boolean;
begin
  if tg_op = 'DELETE' then
    select coalesce(ar.is_owner_role, false)
    into owner_role
    from public.admin_roles ar
    where ar.id = old.role_id;

    select coalesce(mi.is_critical, false)
    into critical_item
    from public.admin_menu_items mi
    where mi.id = old.menu_item_id;

    if owner_role and critical_item then
      raise exception 'Critical system menu access cannot be hidden from owner roles.';
    end if;

    return old;
  end if;

  select coalesce(ar.is_owner_role, false)
  into owner_role
  from public.admin_roles ar
  where ar.id = new.role_id;

  select coalesce(mi.is_critical, false)
  into critical_item
  from public.admin_menu_items mi
  where mi.id = new.menu_item_id;

  if owner_role and critical_item and coalesce(new.is_visible, false) = false then
    raise exception 'Critical system menu access cannot be hidden from owner roles.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_admin_system_role_delete on public.admin_roles;
create trigger prevent_admin_system_role_delete
before delete on public.admin_roles
for each row execute function public.prevent_admin_system_role_delete();

drop trigger if exists prevent_last_owner_role_change on public.admin_roles;
create trigger prevent_last_owner_role_change
before update or delete on public.admin_roles
for each row execute function public.prevent_last_owner_role_deactivation();

drop trigger if exists prevent_last_owner_team_member_change on public.admin_team_members;
create trigger prevent_last_owner_team_member_change
before update or delete on public.admin_team_members
for each row execute function public.prevent_last_owner_team_member();

drop trigger if exists protect_owner_menu_visibility on public.admin_role_menu_visibility;
create trigger protect_owner_menu_visibility
before update or delete on public.admin_role_menu_visibility
for each row execute function public.protect_owner_menu_visibility();

insert into public.admin_roles (
  code,
  label,
  rank,
  is_system,
  id,
  name,
  slug,
  description,
  is_system_role,
  is_owner_role,
  is_active,
  updated_at
) values
  ('super_admin', 'Super Admin', 100, true, gen_random_uuid(), 'Super Admin', 'super-admin', 'Legacy super admin role with full access.', true, true, true, now()),
  ('owner', 'Owner', 110, true, gen_random_uuid(), 'Owner', 'owner', 'Primary owner role with unrestricted admin control.', true, true, true, now()),
  ('admin', 'Admin', 90, true, gen_random_uuid(), 'Admin', 'admin', 'General administrative role.', true, false, true, now()),
  ('manager_1', 'Manager 1', 80, true, gen_random_uuid(), 'Manager 1', 'manager-1', 'Operations manager role template.', true, false, true, now()),
  ('manager_2', 'Manager 2', 79, true, gen_random_uuid(), 'Manager 2', 'manager-2', 'Operations manager role template.', true, false, true, now()),
  ('manager_3', 'Manager 3', 78, true, gen_random_uuid(), 'Manager 3', 'manager-3', 'Operations manager role template.', true, false, true, now()),
  ('finance', 'Finance', 60, true, gen_random_uuid(), 'Finance', 'finance', 'Finance operations role.', true, false, true, now()),
  ('support', 'Support', 55, true, gen_random_uuid(), 'Support', 'support', 'Customer support role.', true, false, true, now()),
  ('content', 'Content', 50, true, gen_random_uuid(), 'Content', 'content', 'Content management role.', true, false, true, now()),
  ('partner_manager', 'Partner Manager', 58, true, gen_random_uuid(), 'Partner Manager', 'partner-manager', 'Partner program operations role.', true, false, true, now()),
  ('operations_manager', 'Operations Manager', 70, true, gen_random_uuid(), 'Operations Manager', 'operations-manager', 'Legacy operations manager role.', true, false, true, now()),
  ('case_manager', 'Case Manager', 60, true, gen_random_uuid(), 'Case Manager', 'case-manager', 'Legacy case manager role.', true, false, true, now()),
  ('customer_support_agent', 'Customer Support Agent', 50, true, gen_random_uuid(), 'Customer Support Agent', 'customer-support-agent', 'Legacy customer support role.', true, false, true, now()),
  ('content_manager', 'Content Manager', 40, true, gen_random_uuid(), 'Content Manager', 'content-manager', 'Legacy content role.', true, false, true, now()),
  ('finance_manager', 'Finance Manager', 45, true, gen_random_uuid(), 'Finance Manager', 'finance-manager', 'Legacy finance role.', true, false, true, now()),
  ('read_only', 'Read Only', 10, true, gen_random_uuid(), 'Read Only', 'read-only', 'Read only admin access.', true, false, true, now())
on conflict (code) do update
set label = excluded.label,
    rank = excluded.rank,
    is_system = excluded.is_system,
    name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    is_system_role = excluded.is_system_role,
    is_owner_role = excluded.is_owner_role,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.admin_permissions (
  code,
  module,
  action,
  label,
  id,
  key,
  description,
  group_key
) values
  ('dashboard.view', 'dashboard', 'view', 'View dashboard', gen_random_uuid(), 'dashboard.view', 'View operational dashboard.', 'overview'),
  ('tasks.view', 'tasks', 'view', 'View tasks', gen_random_uuid(), 'tasks.view', 'View admin task list.', 'overview'),
  ('tasks.edit', 'tasks', 'edit', 'Manage tasks', gen_random_uuid(), 'tasks.edit', 'Create and update tasks.', 'overview'),
  ('activity.view', 'activity', 'view', 'View activity logs', gen_random_uuid(), 'activity.view', 'View admin activity logs.', 'overview'),
  ('leads.view', 'leads', 'view', 'View leads', gen_random_uuid(), 'leads.view', 'View claim leads.', 'claims_operations'),
  ('leads.edit', 'leads', 'edit', 'Edit leads', gen_random_uuid(), 'leads.edit', 'Edit lead records.', 'claims_operations'),
  ('leads.assign', 'leads', 'assign', 'Assign leads', gen_random_uuid(), 'leads.assign', 'Assign leads to staff.', 'claims_operations'),
  ('leads.export', 'leads', 'export', 'Export leads', gen_random_uuid(), 'leads.export', 'Export lead data.', 'claims_operations'),
  ('cases.view', 'cases', 'view', 'View cases', gen_random_uuid(), 'cases.view', 'View cases.', 'claims_operations'),
  ('cases.edit', 'cases', 'edit', 'Edit cases', gen_random_uuid(), 'cases.edit', 'Edit case records.', 'claims_operations'),
  ('cases.assign', 'cases', 'assign', 'Assign cases', gen_random_uuid(), 'cases.assign', 'Assign cases to staff.', 'claims_operations'),
  ('cases.export', 'cases', 'export', 'Export cases', gen_random_uuid(), 'cases.export', 'Export case data.', 'claims_operations'),
  ('documents.view', 'documents', 'view', 'View documents', gen_random_uuid(), 'documents.view', 'View case and lead documents.', 'claims_operations'),
  ('documents.manage', 'documents', 'manage', 'Manage documents', gen_random_uuid(), 'documents.manage', 'Manage documents.', 'claims_operations'),
  ('documents.download', 'documents', 'download', 'Download documents', gen_random_uuid(), 'documents.download', 'Download protected documents.', 'claims_operations'),
  ('communications.view', 'communications', 'view', 'View communications', gen_random_uuid(), 'communications.view', 'View communication records.', 'claims_operations'),
  ('communications.edit', 'communications', 'edit', 'Manage communications', gen_random_uuid(), 'communications.edit', 'Create and update communications.', 'claims_operations'),
  ('customers.view', 'customers', 'view', 'View customers', gen_random_uuid(), 'customers.view', 'View customers.', 'customers'),
  ('customers.edit', 'customers', 'edit', 'Edit customers', gen_random_uuid(), 'customers.edit', 'Edit customer records.', 'customers'),
  ('client_portal_users.view', 'client_portal_users', 'view', 'View client portal users', gen_random_uuid(), 'client_portal_users.view', 'View client portal user records.', 'customers'),
  ('partners.view', 'partners', 'view', 'View referral partners', gen_random_uuid(), 'partners.view', 'View referral partners.', 'partner_program'),
  ('partners.edit', 'partners', 'edit', 'Manage referral partners', gen_random_uuid(), 'partners.edit', 'Manage referral partners.', 'partner_program'),
  ('partner_applications.view', 'partner_applications', 'view', 'View partner applications', gen_random_uuid(), 'partner_applications.view', 'View partner applications.', 'partner_program'),
  ('partner_applications.manage', 'partner_applications', 'manage', 'Manage partner applications', gen_random_uuid(), 'partner_applications.manage', 'Approve and reject partner applications.', 'partner_program'),
  ('referrals.view', 'referrals', 'view', 'View referrals', gen_random_uuid(), 'referrals.view', 'View referral attribution.', 'partner_program'),
  ('partner_commissions.view', 'partner_commissions', 'view', 'View partner commissions', gen_random_uuid(), 'partner_commissions.view', 'View partner commissions.', 'partner_program'),
  ('partner_commissions.manage', 'partner_commissions', 'manage', 'Manage partner commissions', gen_random_uuid(), 'partner_commissions.manage', 'Manage partner commissions.', 'partner_program'),
  ('partner_payouts.view', 'partner_payouts', 'view', 'View partner payouts', gen_random_uuid(), 'partner_payouts.view', 'View partner payouts.', 'partner_program'),
  ('partner_payouts.manage', 'partner_payouts', 'manage', 'Manage partner payouts', gen_random_uuid(), 'partner_payouts.manage', 'Manage partner payouts.', 'partner_program'),
  ('finance.view', 'finance', 'view', 'View finance', gen_random_uuid(), 'finance.view', 'View finance data.', 'finance'),
  ('finance.edit', 'finance', 'edit', 'Manage finance', gen_random_uuid(), 'finance.edit', 'Manage finance records.', 'finance'),
  ('reports.view', 'reports', 'view', 'View reports', gen_random_uuid(), 'reports.view', 'View reports.', 'finance'),
  ('reports.export', 'reports', 'export', 'Export reports', gen_random_uuid(), 'reports.export', 'Export reports.', 'finance'),
  ('payments.view', 'payments', 'view', 'View payments', gen_random_uuid(), 'payments.view', 'View payment records.', 'finance'),
  ('case_finance.view', 'case_finance', 'view', 'View case finance', gen_random_uuid(), 'case_finance.view', 'View case finance details.', 'finance'),
  ('cms.view', 'cms', 'view', 'View CMS', gen_random_uuid(), 'cms.view', 'View CMS pages.', 'content'),
  ('cms.edit', 'cms', 'edit', 'Manage CMS', gen_random_uuid(), 'cms.edit', 'Manage CMS pages.', 'content'),
  ('blog.view', 'blog', 'view', 'View blog', gen_random_uuid(), 'blog.view', 'View blog posts.', 'content'),
  ('blog.edit', 'blog', 'edit', 'Manage blog', gen_random_uuid(), 'blog.edit', 'Manage blog posts.', 'content'),
  ('faq.view', 'faq', 'view', 'View FAQ', gen_random_uuid(), 'faq.view', 'View FAQ entries.', 'content'),
  ('faq.edit', 'faq', 'edit', 'Manage FAQ', gen_random_uuid(), 'faq.edit', 'Manage FAQ entries.', 'content'),
  ('team.view', 'team', 'view', 'View team members', gen_random_uuid(), 'team.view', 'View internal team members.', 'system'),
  ('team.manage', 'team', 'manage', 'Manage team members', gen_random_uuid(), 'team.manage', 'Create, edit, and deactivate team members.', 'system'),
  ('users.view', 'users', 'view', 'View users', gen_random_uuid(), 'users.view', 'View user access.', 'system'),
  ('users.manage', 'users', 'manage', 'Manage users', gen_random_uuid(), 'users.manage', 'Manage user access.', 'system'),
  ('roles.view', 'roles', 'view', 'View roles', gen_random_uuid(), 'roles.view', 'View roles.', 'system'),
  ('roles.manage', 'roles', 'manage', 'Manage roles', gen_random_uuid(), 'roles.manage', 'Manage roles and permissions.', 'system'),
  ('permissions.view', 'permissions', 'view', 'View permissions', gen_random_uuid(), 'permissions.view', 'View permissions.', 'system'),
  ('permissions.manage', 'permissions', 'manage', 'Manage permissions', gen_random_uuid(), 'permissions.manage', 'Manage permission assignments.', 'system'),
  ('menu.view', 'menu', 'view', 'View menu builder', gen_random_uuid(), 'menu.view', 'View menu visibility config.', 'system'),
  ('menu.manage', 'menu', 'manage', 'Manage menu builder', gen_random_uuid(), 'menu.manage', 'Manage menu visibility config.', 'system'),
  ('settings.view', 'settings', 'view', 'View settings', gen_random_uuid(), 'settings.view', 'View settings.', 'system'),
  ('settings.edit', 'settings', 'edit', 'Manage settings', gen_random_uuid(), 'settings.edit', 'Manage settings.', 'system'),
  ('trash.view', 'trash', 'view', 'View trash', gen_random_uuid(), 'trash.view', 'View trash records.', 'system'),
  ('trash.manage', 'trash', 'manage', 'Manage trash', gen_random_uuid(), 'trash.manage', 'Restore or purge trash items.', 'system')
on conflict (code) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label,
    key = excluded.key,
    description = excluded.description,
    group_key = excluded.group_key;

update public.admin_permissions
set id = coalesce(id, gen_random_uuid()),
    key = coalesce(key, code),
    group_key = coalesce(group_key, module);

update public.admin_role_permissions arp
set role_id = ar.id,
    permission_id = ap.id
from public.admin_roles ar,
     public.admin_permissions ap
where ar.code = arp.role_code
  and ap.code = arp.permission_code
  and (
    arp.role_id is distinct from ar.id
    or arp.permission_id is distinct from ap.id
  );

alter table public.admin_role_permissions
  alter column role_id set not null,
  alter column permission_id set not null;

insert into public.admin_role_permissions (role_code, permission_code, id, role_id, permission_id, is_allowed)
select
  ar.code,
  ap.code,
  gen_random_uuid(),
  ar.id,
  ap.id,
  true
from public.admin_roles ar
cross join public.admin_permissions ap
where ar.code in ('owner', 'super_admin')
  and not exists (
    select 1
    from public.admin_role_permissions existing
    where existing.role_code = ar.code
      and existing.permission_code = ap.code
  );

insert into public.admin_role_permissions (role_code, permission_code, id, role_id, permission_id, is_allowed)
select
  ar.code,
  ap.code,
  gen_random_uuid(),
  ar.id,
  ap.id,
  true
from public.admin_roles ar
join public.admin_permissions ap on ap.code = any (array[
  'dashboard.view',
  'tasks.view',
  'tasks.edit',
  'activity.view',
  'leads.view',
  'leads.edit',
  'leads.assign',
  'cases.view',
  'cases.edit',
  'cases.assign',
  'documents.view',
  'documents.manage',
  'documents.download',
  'communications.view',
  'communications.edit',
  'customers.view',
  'customers.edit',
  'reports.view',
  'partner_applications.view',
  'partner_applications.manage',
  'partners.view',
  'referrals.view'
])
where ar.code in ('manager_1', 'manager_2', 'manager_3')
  and not exists (
    select 1
    from public.admin_role_permissions existing
    where existing.role_code = ar.code
      and existing.permission_code = ap.code
  );

insert into public.admin_role_permissions (role_code, permission_code, id, role_id, permission_id, is_allowed)
select
  ar.code,
  ap.code,
  gen_random_uuid(),
  ar.id,
  ap.id,
  true
from public.admin_roles ar
join public.admin_permissions ap on ap.code = any (array[
  'dashboard.view',
  'customers.view',
  'customers.edit',
  'leads.view',
  'leads.edit',
  'documents.view',
  'documents.download',
  'communications.view',
  'communications.edit',
  'tasks.view',
  'tasks.edit'
])
where ar.code = 'support'
  and not exists (
    select 1
    from public.admin_role_permissions existing
    where existing.role_code = ar.code
      and existing.permission_code = ap.code
  );

insert into public.admin_role_permissions (role_code, permission_code, id, role_id, permission_id, is_allowed)
select
  ar.code,
  ap.code,
  gen_random_uuid(),
  ar.id,
  ap.id,
  true
from public.admin_roles ar
join public.admin_permissions ap on ap.code = any (array[
  'dashboard.view',
  'finance.view',
  'finance.edit',
  'payments.view',
  'case_finance.view',
  'reports.view',
  'reports.export',
  'partner_payouts.view',
  'partner_payouts.manage',
  'partner_commissions.view',
  'documents.view',
  'documents.download'
])
where ar.code = 'finance'
  and not exists (
    select 1
    from public.admin_role_permissions existing
    where existing.role_code = ar.code
      and existing.permission_code = ap.code
  );

insert into public.admin_role_permissions (role_code, permission_code, id, role_id, permission_id, is_allowed)
select
  ar.code,
  ap.code,
  gen_random_uuid(),
  ar.id,
  ap.id,
  true
from public.admin_roles ar
join public.admin_permissions ap on ap.code = any (array[
  'dashboard.view',
  'cms.view',
  'cms.edit',
  'blog.view',
  'blog.edit',
  'faq.view',
  'faq.edit',
  'reports.view'
])
where ar.code = 'content'
  and not exists (
    select 1
    from public.admin_role_permissions existing
    where existing.role_code = ar.code
      and existing.permission_code = ap.code
  );

insert into public.admin_role_permissions (role_code, permission_code, id, role_id, permission_id, is_allowed)
select
  ar.code,
  ap.code,
  gen_random_uuid(),
  ar.id,
  ap.id,
  true
from public.admin_roles ar
join public.admin_permissions ap on ap.code = any (array[
  'dashboard.view',
  'partner_applications.view',
  'partner_applications.manage',
  'partners.view',
  'partners.edit',
  'referrals.view',
  'partner_commissions.view',
  'partner_commissions.manage',
  'partner_payouts.view',
  'partner_payouts.manage',
  'reports.view'
])
where ar.code = 'partner_manager'
  and not exists (
    select 1
    from public.admin_role_permissions existing
    where existing.role_code = ar.code
      and existing.permission_code = ap.code
  );

insert into public.admin_menu_items (
  key,
  label,
  route,
  icon,
  group_key,
  group_label,
  sort_order,
  is_enabled,
  required_permissions,
  is_critical
) values
  ('dashboard', 'Dashboard', '/admin', 'LayoutDashboard', 'overview', 'Overview', 10, true, array['dashboard.view'], true),
  ('tasks', 'Tasks', '/admin/tasks', 'SquareCheckBig', 'overview', 'Overview', 20, true, array['tasks.view'], false),
  ('activity-log', 'Activity Log', '/admin/activity', 'Activity', 'overview', 'Overview', 30, true, array['activity.view'], true),
  ('leads', 'Leads', '/admin/leads', 'UserSquare2', 'claims-operations', 'Claims Operations', 10, true, array['leads.view'], false),
  ('cases', 'Cases', '/admin/cases', 'Briefcase', 'claims-operations', 'Claims Operations', 20, true, array['cases.view'], false),
  ('documents', 'Documents', '/admin/documents', 'FolderOpen', 'claims-operations', 'Claims Operations', 30, true, array['documents.view'], false),
  ('communication', 'Communications', '/admin/communication', 'MessageSquareText', 'claims-operations', 'Claims Operations', 40, true, array['communications.view'], false),
  ('customers', 'Customers', '/admin/customers', 'Users', 'customers', 'Customers', 10, true, array['customers.view'], false),
  ('partner-applications', 'Partner Applications', '/admin/partner-applications', 'HandCoins', 'partner-program', 'Partner Program', 10, true, array['partner_applications.view'], false),
  ('referral-partners', 'Referral Partners', '/admin/referral-partners', 'HandCoins', 'partner-program', 'Partner Program', 20, true, array['partners.view'], false),
  ('finance', 'Finance', '/admin/finance', 'Wallet', 'finance', 'Finance', 10, true, array['finance.view'], false),
  ('reports', 'Reports', '/admin/reports', 'BarChart3', 'finance', 'Finance', 20, true, array['reports.view'], false),
  ('cms', 'Website CMS', '/admin/cms', 'FileText', 'content', 'Content', 10, true, array['cms.view'], false),
  ('blog', 'Blog', '/admin/blog', 'Newspaper', 'content', 'Content', 20, true, array['blog.view'], false),
  ('faq', 'FAQ', '/admin/faq', 'CircleHelp', 'content', 'Content', 30, true, array['faq.view'], false),
  ('access', 'Users & Roles', '/admin/access', 'ShieldCheck', 'system', 'System', 10, true, array['users.view', 'roles.view'], true),
  ('trash', 'Trash', '/admin/trash', 'Trash2', 'system', 'System', 20, true, array['trash.view', 'users.manage'], false),
  ('settings', 'Settings', '/admin/settings', 'Settings', 'system', 'System', 30, true, array['settings.view'], true)
on conflict (key) do update
set label = excluded.label,
    route = excluded.route,
    icon = excluded.icon,
    group_key = excluded.group_key,
    group_label = excluded.group_label,
    sort_order = excluded.sort_order,
    is_enabled = excluded.is_enabled,
    required_permissions = excluded.required_permissions,
    is_critical = excluded.is_critical,
    updated_at = now();

insert into public.admin_role_menu_visibility (
  role_id,
  menu_item_id,
  is_visible,
  sort_order
)
select
  ar.id,
  mi.id,
  true,
  mi.sort_order
from public.admin_roles ar
cross join public.admin_menu_items mi
where ar.is_active = true
  and (
    ar.is_owner_role = true
    or exists (
      select 1
      from public.admin_role_permissions arp
      where arp.role_code = ar.code
        and arp.is_allowed = true
        and (
          mi.required_permissions = '{}'::text[]
          or arp.permission_code = any (mi.required_permissions)
        )
    )
  )
  and not exists (
    select 1
    from public.admin_role_menu_visibility existing
    where existing.role_id = ar.id
      and existing.menu_item_id = mi.id
  );

insert into public.admin_team_members (
  profile_id,
  email,
  full_name,
  role_id,
  status,
  invited_by
)
select
  p.id,
  p.email,
  p.full_name,
  ar.id,
  'active',
  null
from public.profiles p
left join lateral (
  select uar.role_code
  from public.user_admin_roles uar
  where uar.user_id = p.id
  order by case
    when uar.role_code = 'owner' then 1000
    when uar.role_code = 'super_admin' then 999
    else 0
  end desc, uar.created_at asc
  limit 1
) assigned on true
left join public.admin_roles ar on ar.code = coalesce(
  assigned.role_code,
  case p.role
    when 'owner' then 'owner'
    when 'super_admin' then 'super_admin'
    when 'admin' then 'admin'
    when 'operations_manager' then 'operations_manager'
    when 'case_manager' then 'case_manager'
    when 'customer_support_agent' then 'customer_support_agent'
    when 'content_manager' then 'content_manager'
    when 'finance_manager' then 'finance_manager'
    when 'read_only' then 'read_only'
    when 'manager' then 'operations_manager'
    when 'support' then 'support'
    when 'customer' then 'read_only'
    else p.role
  end
)
where p.email is not null
  and (
    p.role in (
      'admin',
      'super_admin',
      'operations_manager',
      'case_manager',
      'customer_support_agent',
      'content_manager',
      'finance_manager',
      'read_only',
      'manager',
      'support'
    )
    or exists (
      select 1
      from public.user_admin_roles uar
      where uar.user_id = p.id
    )
  )
  and not exists (
    select 1
    from public.admin_team_members atm
    where atm.profile_id = p.id
  );

alter table public.admin_team_members enable row level security;
alter table public.admin_menu_items enable row level security;
alter table public.admin_role_menu_visibility enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.admin_work_sessions enable row level security;

grant select, insert, update, delete on public.admin_roles to authenticated;
grant select, insert, update, delete on public.admin_permissions to authenticated;
grant select, insert, update, delete on public.admin_role_permissions to authenticated;
grant select, insert, update, delete on public.admin_team_members to authenticated;
grant all on public.admin_menu_items to authenticated;
grant all on public.admin_role_menu_visibility to authenticated;
grant select, insert on public.admin_activity_logs to authenticated;
grant select, insert, update on public.admin_work_sessions to authenticated;

drop policy if exists "admins manage roles" on public.admin_roles;
drop policy if exists "owner manage admin roles" on public.admin_roles;
create policy "owner manage admin roles"
on public.admin_roles for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "admins manage permissions" on public.admin_permissions;
drop policy if exists "owner manage admin permissions" on public.admin_permissions;
create policy "owner manage admin permissions"
on public.admin_permissions for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "admins manage role permissions" on public.admin_role_permissions;
drop policy if exists "owner manage admin role permissions" on public.admin_role_permissions;
create policy "owner manage admin role permissions"
on public.admin_role_permissions for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "owner read and manage admin team members" on public.admin_team_members;
create policy "owner read and manage admin team members"
on public.admin_team_members for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "team members read own team profile" on public.admin_team_members;
create policy "team members read own team profile"
on public.admin_team_members for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "admins read enabled menu items" on public.admin_menu_items;
create policy "admins read enabled menu items"
on public.admin_menu_items for select
to authenticated
using (public.is_admin_team_member() and is_enabled = true);

drop policy if exists "owner manage admin menu items" on public.admin_menu_items;
create policy "owner manage admin menu items"
on public.admin_menu_items for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "owner manage role menu visibility" on public.admin_role_menu_visibility;
create policy "owner manage role menu visibility"
on public.admin_role_menu_visibility for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "owner read admin activity logs" on public.admin_activity_logs;
create policy "owner read admin activity logs"
on public.admin_activity_logs for select
to authenticated
using (public.is_owner_or_super_admin());

drop policy if exists "admin team create own activity logs" on public.admin_activity_logs;
create policy "admin team create own activity logs"
on public.admin_activity_logs for insert
to authenticated
with check (
  public.is_admin_team_member()
  and admin_profile_id = auth.uid()
);

drop policy if exists "owner read all work sessions" on public.admin_work_sessions;
create policy "owner read all work sessions"
on public.admin_work_sessions for select
to authenticated
using (public.is_owner_or_super_admin());

drop policy if exists "admin team read own work sessions" on public.admin_work_sessions;
create policy "admin team read own work sessions"
on public.admin_work_sessions for select
to authenticated
using (admin_profile_id = auth.uid());

drop policy if exists "admin team create own work sessions" on public.admin_work_sessions;
create policy "admin team create own work sessions"
on public.admin_work_sessions for insert
to authenticated
with check (
  public.is_admin_team_member()
  and admin_profile_id = auth.uid()
);

drop policy if exists "admin team update own work sessions" on public.admin_work_sessions;
create policy "admin team update own work sessions"
on public.admin_work_sessions for update
to authenticated
using (admin_profile_id = auth.uid())
with check (admin_profile_id = auth.uid());

create or replace function public.is_owner_or_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'super_admin')
  )
  or exists (
    select 1
    from public.user_admin_roles uar
    left join public.admin_roles ar on ar.code = uar.role_code
    where uar.user_id = auth.uid()
      and (
        uar.role_code = 'super_admin'
        or coalesce(ar.is_owner_role, false)
      )
  )
  or exists (
    select 1
    from public.admin_team_members atm
    join public.admin_roles ar on ar.id = atm.role_id
    where atm.profile_id = auth.uid()
      and atm.status = 'active'
      and ar.is_active = true
      and ar.is_owner_role = true
  );
$$;

create or replace function public.is_admin_team_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin()
  or exists (
    select 1
    from public.admin_team_members atm
    where atm.profile_id = auth.uid()
      and atm.status in ('active', 'invited')
  );
$$;
