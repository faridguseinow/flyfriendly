-- Profile avatar storage bucket + owner-scoped write policies.
-- Apply after 033_finance_payments_data_model.sql.
--
-- Verification after apply:
--   select id, public, file_size_limit
--   from storage.buckets
--   where id = 'profile-avatars';
--
--   select policyname, cmd
--   from pg_policies
--   where schemaname = 'storage'
--     and tablename = 'objects'
--     and policyname ilike '%profile avatars%';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own profile avatars" on storage.objects;
create policy "users upload own profile avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (
    (
      (storage.foldername(name))[1] = 'clients'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'partners'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

drop policy if exists "users update own profile avatars" on storage.objects;
create policy "users update own profile avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (
      (storage.foldername(name))[1] = 'clients'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'partners'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
)
with check (
  bucket_id = 'profile-avatars'
  and (
    (
      (storage.foldername(name))[1] = 'clients'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'partners'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

drop policy if exists "users delete own profile avatars" on storage.objects;
create policy "users delete own profile avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (
      (storage.foldername(name))[1] = 'clients'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'partners'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);
