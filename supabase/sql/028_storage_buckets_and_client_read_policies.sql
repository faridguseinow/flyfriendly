-- Storage buckets + client document access hardening.
-- Apply after 027_auth_user_profile_trigger_fix_reapply.sql.
--
-- Verification after apply:
--   select id, public, file_size_limit
--   from storage.buckets
--   where id in ('claim-lead-documents', 'case-documents', 'claim-documents')
--   order by id;
--
--   select policyname, cmd
--   from pg_policies
--   where schemaname = 'storage'
--     and tablename = 'objects'
--   order by policyname;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'claim-lead-documents',
    'claim-lead-documents',
    false,
    26214400,
    array['image/png', 'image/jpeg', 'application/pdf']::text[]
  ),
  (
    'case-documents',
    'case-documents',
    false,
    26214400,
    array['image/png', 'image/jpeg', 'application/pdf']::text[]
  ),
  (
    'claim-documents',
    'claim-documents',
    false,
    26214400,
    array['image/png', 'image/jpeg', 'application/pdf']::text[]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users read own lead storage documents" on storage.objects;
create policy "users read own lead storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'claim-lead-documents'
  and (
    exists (
      select 1
      from public.lead_documents ld
      where ld.file_path = name
        and ld.deleted_at is null
        and public.owns_lead(ld.lead_id)
    )
    or exists (
      select 1
      from public.case_documents cd
      where cd.file_path = name
        and cd.deleted_at is null
        and public.owns_case(cd.case_id)
    )
  )
);

drop policy if exists "users read own case storage documents" on storage.objects;
create policy "users read own case storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'case-documents'
  and exists (
    select 1
    from public.case_documents cd
    where cd.file_path = name
      and cd.deleted_at is null
      and public.owns_case(cd.case_id)
  )
);

do $$
begin
  if to_regclass('public.documents') is not null
    and to_regclass('public.claims') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'documents'
        and column_name = 'claim_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'documents'
        and column_name = 'file_path'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'claims'
        and column_name = 'user_id'
    ) then
    execute 'drop policy if exists "users read own claim storage documents" on storage.objects';
    execute $policy$
      create policy "users read own claim storage documents"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'claim-documents'
        and exists (
          select 1
          from public.documents d
          join public.claims c on c.id = d.claim_id
          where d.file_path = name
            and d.deleted_at is null
            and c.user_id = auth.uid()
        )
      )
    $policy$;
  end if;
end
$$;

drop policy if exists "users update own lead documents" on public.lead_documents;
create policy "users update own lead documents"
on public.lead_documents for update
to authenticated
using (
  public.owns_lead(lead_id)
  and deleted_at is null
)
with check (public.owns_lead(lead_id));
