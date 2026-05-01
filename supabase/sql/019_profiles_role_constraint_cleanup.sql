-- Profiles role constraint cleanup
-- Allows the client/partner portal roles introduced after the original admin-only schema.

do $$
begin
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
        ]
      )
    );
end
$$;
