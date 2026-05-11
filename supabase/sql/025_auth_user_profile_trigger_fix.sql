-- Replace legacy auth.users -> public.profiles trigger logic.
-- Old projects often insert role = 'customer' here, which now conflicts
-- with the normalized profiles_role_check. Regular clients should have no role.

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

do $$
declare
  trigger_record record;
begin
  -- Remove custom auth.users triggers so the legacy profile trigger
  -- does not keep inserting invalid role values such as `customer`.
  for trigger_record in
    select tgname
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_record.tgname);
  end loop;
end
$$;

create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row execute function public.handle_auth_user_profile_sync();
