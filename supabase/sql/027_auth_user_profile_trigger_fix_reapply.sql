-- Re-apply auth.users -> public.profiles trigger fix.
-- Some environments still keep a legacy trigger that inserts role = 'customer'.
-- This repair migration is safe to run multiple times and only targets
-- known profile-sync triggers on auth.users.

create or replace function public.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    status
  )
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    null,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    role = case
      when public.profiles.role in ('owner', 'partner') then public.profiles.role
      else null
    end,
    status = coalesce(public.profiles.status, 'active');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_profile on auth.users;

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select tg.tgname
    from pg_trigger tg
    join pg_proc p
      on p.oid = tg.tgfoid
    join pg_namespace n
      on n.oid = p.pronamespace
    where tg.tgrelid = 'auth.users'::regclass
      and not tg.tgisinternal
      and n.nspname = 'public'
      and p.proname in ('handle_auth_user_profile_sync', 'handle_new_user')
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_record.tgname);
  end loop;
end
$$;

create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row execute function public.handle_auth_user_profile_sync();
