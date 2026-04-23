-- Foundation RBAC schema for Fly Friendly admin.
-- Keeps compatibility with existing public.profiles.role while introducing normalized role assignments.

create table if not exists public.admin_roles (
  code text primary key,
  label text not null,
  rank integer not null default 0,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_permissions (
  code text primary key,
  module text not null,
  action text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_code text not null references public.admin_roles(code) on delete cascade,
  permission_code text not null references public.admin_permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_code, permission_code)
);

create table if not exists public.user_admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null references public.admin_roles(code) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role_code)
);

insert into public.admin_roles (code, label, rank) values
  ('super_admin', 'Super Admin', 100),
  ('admin', 'Admin', 90),
  ('operations_manager', 'Operations Manager', 70),
  ('case_manager', 'Case Manager', 60),
  ('customer_support_agent', 'Customer Support Agent', 50),
  ('content_manager', 'Content Manager', 40),
  ('finance_manager', 'Finance Manager', 45),
  ('read_only', 'Read Only', 10)
on conflict (code) do update
set label = excluded.label,
    rank = excluded.rank;

insert into public.admin_permissions (code, module, action, label) values
  ('dashboard.view', 'dashboard', 'view', 'View dashboard'),
  ('users.view', 'users', 'view', 'View users'),
  ('users.manage', 'users', 'manage', 'Manage users'),
  ('roles.view', 'roles', 'view', 'View roles'),
  ('roles.manage', 'roles', 'manage', 'Manage roles'),
  ('leads.view', 'leads', 'view', 'View leads'),
  ('leads.edit', 'leads', 'edit', 'Edit leads'),
  ('leads.assign', 'leads', 'assign', 'Assign leads'),
  ('leads.export', 'leads', 'export', 'Export leads'),
  ('cases.view', 'cases', 'view', 'View cases'),
  ('cases.edit', 'cases', 'edit', 'Edit cases'),
  ('cases.assign', 'cases', 'assign', 'Assign cases'),
  ('cases.export', 'cases', 'export', 'Export cases'),
  ('customers.view', 'customers', 'view', 'View customers'),
  ('customers.edit', 'customers', 'edit', 'Edit customers'),
  ('tasks.view', 'tasks', 'view', 'View tasks'),
  ('tasks.edit', 'tasks', 'edit', 'Edit tasks'),
  ('communications.view', 'communications', 'view', 'View communications'),
  ('communications.edit', 'communications', 'edit', 'Edit communications'),
  ('documents.view', 'documents', 'view', 'View documents'),
  ('documents.manage', 'documents', 'manage', 'Manage documents'),
  ('documents.download', 'documents', 'download', 'Download documents'),
  ('partners.view', 'partners', 'view', 'View referral partners'),
  ('partners.edit', 'partners', 'edit', 'Manage referral partners'),
  ('finance.view', 'finance', 'view', 'View finance'),
  ('finance.edit', 'finance', 'edit', 'Manage finance'),
  ('reports.view', 'reports', 'view', 'View reports'),
  ('reports.export', 'reports', 'export', 'Export reports'),
  ('cms.view', 'cms', 'view', 'View CMS'),
  ('cms.edit', 'cms', 'edit', 'Manage CMS'),
  ('blog.view', 'blog', 'view', 'View blog'),
  ('blog.edit', 'blog', 'edit', 'Manage blog'),
  ('faq.view', 'faq', 'view', 'View FAQ'),
  ('faq.edit', 'faq', 'edit', 'Manage FAQ'),
  ('settings.view', 'settings', 'view', 'View settings'),
  ('settings.edit', 'settings', 'edit', 'Manage settings'),
  ('activity.view', 'activity', 'view', 'View activity logs')
on conflict (code) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label;

insert into public.admin_role_permissions (role_code, permission_code)
select 'admin', code from public.admin_permissions
on conflict do nothing;

insert into public.admin_role_permissions (role_code, permission_code)
select 'super_admin', code from public.admin_permissions
on conflict do nothing;

insert into public.admin_role_permissions (role_code, permission_code) values
  ('operations_manager', 'dashboard.view'),
  ('operations_manager', 'leads.view'),
  ('operations_manager', 'leads.edit'),
  ('operations_manager', 'leads.assign'),
  ('operations_manager', 'cases.view'),
  ('operations_manager', 'cases.edit'),
  ('operations_manager', 'cases.assign'),
  ('operations_manager', 'customers.view'),
  ('operations_manager', 'customers.edit'),
  ('operations_manager', 'tasks.view'),
  ('operations_manager', 'tasks.edit'),
  ('operations_manager', 'communications.view'),
  ('operations_manager', 'communications.edit'),
  ('operations_manager', 'documents.view'),
  ('operations_manager', 'documents.manage'),
  ('operations_manager', 'documents.download'),
  ('operations_manager', 'reports.view'),
  ('operations_manager', 'activity.view'),
  ('case_manager', 'dashboard.view'),
  ('case_manager', 'leads.view'),
  ('case_manager', 'leads.edit'),
  ('case_manager', 'cases.view'),
  ('case_manager', 'cases.edit'),
  ('case_manager', 'customers.view'),
  ('case_manager', 'tasks.view'),
  ('case_manager', 'tasks.edit'),
  ('case_manager', 'communications.view'),
  ('case_manager', 'communications.edit'),
  ('case_manager', 'documents.view'),
  ('case_manager', 'documents.manage'),
  ('case_manager', 'documents.download'),
  ('case_manager', 'activity.view'),
  ('customer_support_agent', 'dashboard.view'),
  ('customer_support_agent', 'leads.view'),
  ('customer_support_agent', 'leads.edit'),
  ('customer_support_agent', 'customers.view'),
  ('customer_support_agent', 'customers.edit'),
  ('customer_support_agent', 'tasks.view'),
  ('customer_support_agent', 'tasks.edit'),
  ('customer_support_agent', 'communications.view'),
  ('customer_support_agent', 'communications.edit'),
  ('customer_support_agent', 'documents.view'),
  ('customer_support_agent', 'documents.download'),
  ('content_manager', 'dashboard.view'),
  ('content_manager', 'cms.view'),
  ('content_manager', 'cms.edit'),
  ('content_manager', 'blog.view'),
  ('content_manager', 'blog.edit'),
  ('content_manager', 'faq.view'),
  ('content_manager', 'faq.edit'),
  ('content_manager', 'reports.view'),
  ('finance_manager', 'dashboard.view'),
  ('finance_manager', 'finance.view'),
  ('finance_manager', 'finance.edit'),
  ('finance_manager', 'reports.view'),
  ('finance_manager', 'reports.export'),
  ('finance_manager', 'cases.view'),
  ('finance_manager', 'documents.view'),
  ('finance_manager', 'documents.download'),
  ('finance_manager', 'partners.view'),
  ('finance_manager', 'partners.edit'),
  ('read_only', 'dashboard.view'),
  ('read_only', 'leads.view'),
  ('read_only', 'cases.view'),
  ('read_only', 'customers.view'),
  ('read_only', 'tasks.view'),
  ('read_only', 'communications.view'),
  ('read_only', 'documents.view'),
  ('read_only', 'finance.view'),
  ('read_only', 'reports.view'),
  ('read_only', 'cms.view'),
  ('read_only', 'blog.view'),
  ('read_only', 'faq.view'),
  ('read_only', 'activity.view')
on conflict do nothing;

alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.user_admin_roles enable row level security;

grant select on public.admin_roles to authenticated;
grant select on public.admin_permissions to authenticated;
grant select on public.admin_role_permissions to authenticated;
grant select on public.user_admin_roles to authenticated;

drop policy if exists "admins read roles" on public.admin_roles;
create policy "admins read roles"
on public.admin_roles for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage roles" on public.admin_roles;
create policy "admins manage roles"
on public.admin_roles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read permissions" on public.admin_permissions;
create policy "admins read permissions"
on public.admin_permissions for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage permissions" on public.admin_permissions;
create policy "admins manage permissions"
on public.admin_permissions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read role permissions" on public.admin_role_permissions;
create policy "admins read role permissions"
on public.admin_role_permissions for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage role permissions" on public.admin_role_permissions;
create policy "admins manage role permissions"
on public.admin_role_permissions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read user admin roles" on public.user_admin_roles;
create policy "admins read user admin roles"
on public.user_admin_roles for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage user admin roles" on public.user_admin_roles;
create policy "admins manage user admin roles"
on public.user_admin_roles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.user_admin_roles (user_id, role_code)
select p.id, 'admin'
from public.profiles p
where p.email = 'sapienspay@gmail.com'
on conflict (user_id, role_code) do nothing;
