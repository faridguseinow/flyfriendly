-- Profiles role constraint cleanup
-- Allows the client/partner portal roles introduced after the original admin-only schema.

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
