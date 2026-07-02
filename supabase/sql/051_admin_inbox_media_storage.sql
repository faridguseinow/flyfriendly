-- Private storage for admin inbox attachments and voice notes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-inbox-media',
  'admin-inbox-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/x-m4a',
    'audio/aac'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins read inbox media" on storage.objects;
create policy "admins read inbox media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'admin-inbox-media'
  and public.has_any_admin_permission(array['communications.view', 'communications.edit'])
);

drop policy if exists "admins upload inbox media" on storage.objects;
create policy "admins upload inbox media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'admin-inbox-media'
  and (storage.foldername(name))[1] = 'conversations'
  and public.has_admin_permission('communications.edit')
);

drop policy if exists "admins delete inbox media" on storage.objects;
create policy "admins delete inbox media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'admin-inbox-media'
  and public.has_admin_permission('communications.edit')
);
