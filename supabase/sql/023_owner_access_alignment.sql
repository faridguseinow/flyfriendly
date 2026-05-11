-- Align owner access across frontend RBAC, database RLS, and edge-function authorization.
-- Run this after 022_dynamic_admin_team_management_foundation.sql.

do $$
begin
  update public.profiles
  set role = case
    when role in ('manager_1', 'manager_2', 'manager_3') then 'operations_manager'
    when role = 'finance' then 'finance_manager'
    when role = 'content' then 'content_manager'
    when role = 'customer' then 'read_only'
    else role
  end
  where role in ('manager_1', 'manager_2', 'manager_3', 'finance', 'content', 'customer');

  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_role_check;
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (
      role = any (
        array[
          'client',
          'partner',
          'owner',
          'admin',
          'super_admin',
          'partner_manager',
          'operations_manager',
          'case_manager',
          'customer_support_agent',
          'content_manager',
          'finance_manager',
          'read_only',
          'manager',
          'support'
        ]
      )
    );
end
$$;

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
        'owner',
        'super_admin',
        'admin',
        'partner_manager',
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
        'owner',
        'super_admin',
        'admin',
        'partner_manager',
        'operations_manager',
        'case_manager',
        'customer_support_agent',
        'content_manager',
        'finance_manager',
        'read_only'
      )
  )
  or exists (
    select 1
    from public.admin_team_members atm
    join public.admin_roles ar on ar.id = atm.role_id
    where atm.profile_id = auth.uid()
      and atm.status = 'active'
      and (
        ar.code in (
          'owner',
          'super_admin',
          'admin',
          'partner_manager',
          'operations_manager',
          'case_manager',
          'customer_support_agent',
          'content_manager',
          'finance_manager',
          'read_only'
        )
        or ar.is_owner_role = true
      )
  );
$$;

update public.profiles
set role = 'owner'
where lower(email) = 'cavidrahimo@gmail.com'
  and coalesce(role, '') <> 'owner';

insert into public.user_admin_roles (user_id, role_code)
select p.id, 'owner'
from public.profiles p
where lower(p.email) = 'cavidrahimo@gmail.com'
on conflict (user_id, role_code) do nothing;

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
join public.admin_roles ar on ar.code = 'owner'
where lower(p.email) = 'cavidrahimo@gmail.com'
on conflict (profile_id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role_id = excluded.role_id,
  status = 'active',
  updated_at = now();
