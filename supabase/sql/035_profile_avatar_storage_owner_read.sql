-- Allow authenticated users to read their own avatar objects through Storage API.
-- This helps owner-scoped upsert/update flows that need to address existing files.

drop policy if exists "users read own profile avatars" on storage.objects;
create policy "users read own profile avatars"
on storage.objects for select
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
