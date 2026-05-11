-- Reset admin access to a single owner account.
-- Keeps `owner` and `partner` in `public.profiles`.
-- Regular clients should not carry any profile role value.
-- but removes every non-owner admin assignment and admin role definition.
-- After this reset, new admin roles should be created only from the admin UI.

create extension if not exists pgcrypto;

do $$
declare
  owner_profile_id uuid;
  owner_role_id uuid;
begin
  select id
  into owner_profile_id
  from public.profiles
  where lower(email) = 'cavidrahimo@gmail.com'
  limit 1;

  if owner_profile_id is null then
    raise exception 'Owner profile for cavidrahimo@gmail.com was not found.';
  end if;

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
    alter column role drop not null;

  update public.profiles p
  set role = case
    when p.id = owner_profile_id then 'owner'
    when exists (
      select 1
      from public.referral_partners rp
      where rp.profile_id = p.id
    ) then 'partner'
    else null
  end
  where p.role is distinct from case
    when p.id = owner_profile_id then 'owner'
    when exists (
      select 1
      from public.referral_partners rp
      where rp.profile_id = p.id
    ) then 'partner'
    else null
  end;

  alter table public.profiles
    add constraint profiles_role_check
    check (role is null or role = any (array['partner', 'owner']));

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
  )
  values (
    'owner',
    'Owner',
    110,
    true,
    gen_random_uuid(),
    'Owner',
    'owner',
    'Primary owner role with unrestricted admin control.',
    true,
    true,
    true,
    now()
  )
  on conflict (code) do update
  set
    label = excluded.label,
    rank = excluded.rank,
    is_system = true,
    name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    is_system_role = true,
    is_owner_role = true,
    is_active = true,
    updated_at = now();

  select id
  into owner_role_id
  from public.admin_roles
  where code = 'owner'
  limit 1;

  delete from public.admin_team_members
  where profile_id <> owner_profile_id;

  delete from public.user_admin_roles
  where user_id <> owner_profile_id;

  update public.admin_roles
  set
    is_system_role = false,
    is_system = false,
    is_active = false,
    updated_at = now()
  where code <> 'owner';

  delete from public.admin_roles
  where code <> 'owner';

  insert into public.user_admin_roles (user_id, role_code, assigned_by)
  values (owner_profile_id, 'owner', owner_profile_id)
  on conflict (user_id, role_code) do update
  set assigned_by = excluded.assigned_by;

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
    owner_role_id,
    'active',
    owner_profile_id
  from public.profiles p
  where p.id = owner_profile_id
  on conflict (profile_id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    role_id = excluded.role_id,
    status = 'active',
    updated_at = now();

  delete from public.admin_role_permissions
  where role_code <> 'owner';

  insert into public.admin_role_permissions (
    role_code,
    permission_code,
    id,
    role_id,
    permission_id,
    is_allowed
  )
  select
    'owner',
    ap.code,
    gen_random_uuid(),
    owner_role_id,
    ap.id,
    true
  from public.admin_permissions ap
  where not exists (
    select 1
    from public.admin_role_permissions arp
    where arp.role_code = 'owner'
      and arp.permission_code = ap.code
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
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
  )
  or exists (
    select 1
    from public.user_admin_roles uar
    join public.admin_roles ar on ar.code = uar.role_code
    where uar.user_id = auth.uid()
      and ar.is_active = true
  )
  or exists (
    select 1
    from public.admin_team_members atm
    join public.admin_roles ar on ar.id = atm.role_id
    where atm.profile_id = auth.uid()
      and atm.status = 'active'
      and ar.is_active = true
  );
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
      and p.role = 'owner'
  )
  or exists (
    select 1
    from public.user_admin_roles uar
    join public.admin_roles ar on ar.code = uar.role_code
    where uar.user_id = auth.uid()
      and ar.is_active = true
      and ar.is_owner_role = true
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
    join public.admin_roles ar on ar.id = atm.role_id
    where atm.profile_id = auth.uid()
      and atm.status in ('active', 'invited')
      and ar.is_active = true
  );
$$;
