-- Fix admin access checks so the database agrees with the frontend RBAC model.
-- Run this after 005_admin_foundation_rbac.sql.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in (
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
  )
  or exists (
    select 1
    from public.user_admin_roles
    where user_id = auth.uid()
      and role_code in (
        'admin',
        'super_admin',
        'operations_manager',
        'case_manager',
        'customer_support_agent',
        'content_manager',
        'finance_manager',
        'read_only'
      )
  );
$$;

-- Optional bootstrap for the known first administrator.
update public.profiles
set role = 'admin'
where email = 'sapienspay@gmail.com'
  and coalesce(role, '') <> 'admin';

insert into public.user_admin_roles (user_id, role_code)
select p.id, 'admin'
from public.profiles p
where p.email = 'sapienspay@gmail.com'
on conflict (user_id, role_code) do nothing;
