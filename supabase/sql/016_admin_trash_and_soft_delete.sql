-- Admin Trash + Soft Delete V1
-- Apply after 015_partner_profile_self_service.sql.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_admin_roles
    where user_id = auth.uid()
      and role_code = 'super_admin'
  );
$$;

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists purge_after timestamptz,
  add column if not exists deletion_note text;

alter table public.lead_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists purge_after timestamptz;

alter table public.case_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists purge_after timestamptz;

alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists purge_after timestamptz;

alter table public.lead_signatures
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists purge_after timestamptz;

create index if not exists profiles_deleted_at_idx on public.profiles(deleted_at);
create index if not exists lead_documents_deleted_at_idx on public.lead_documents(deleted_at);
create index if not exists case_documents_deleted_at_idx on public.case_documents(deleted_at);
create index if not exists documents_deleted_at_idx on public.documents(deleted_at);
create index if not exists lead_signatures_deleted_at_idx on public.lead_signatures(deleted_at);

create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  label text,
  owner_type text,
  owner_id uuid,
  storage_bucket text,
  storage_path text,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days'),
  metadata jsonb not null default '{}'::jsonb,
  constraint trash_items_entity_type_check check (
    entity_type = any (
      array[
        'profile',
        'lead_document',
        'case_document',
        'claim_document',
        'lead_signature'
      ]
    )
  ),
  constraint trash_items_entity_unique unique (entity_type, entity_id)
);

create index if not exists trash_items_deleted_at_idx on public.trash_items(deleted_at desc);
create index if not exists trash_items_purge_after_idx on public.trash_items(purge_after asc);
create index if not exists trash_items_entity_type_idx on public.trash_items(entity_type, deleted_at desc);

alter table public.trash_items enable row level security;

grant select, insert, update, delete on public.trash_items to authenticated;
grant update on public.profiles to authenticated;
grant update, delete on public.lead_documents to authenticated;
grant update, delete on public.case_documents to authenticated;
grant update, delete on public.documents to authenticated;
grant update, delete on public.lead_signatures to authenticated;
grant execute on function public.is_super_admin() to authenticated;

drop policy if exists "admins read trash items" on public.trash_items;
create policy "admins read trash items"
on public.trash_items for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage trash items" on public.trash_items;
create policy "admins manage trash items"
on public.trash_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins delete lead storage documents" on storage.objects;
create policy "admins delete lead storage documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'claim-lead-documents'
  and public.is_admin()
);

drop policy if exists "admins delete case storage documents" on storage.objects;
create policy "admins delete case storage documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'case-documents'
  and public.is_admin()
);

drop policy if exists "admins delete claim storage documents" on storage.objects;
create policy "admins delete claim storage documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'claim-documents'
  and public.is_admin()
);

create or replace function public.admin_permanently_delete_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can permanently delete users.';
  end if;

  if target_user_id is null then
    raise exception 'Target user id is required.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot permanently delete your own account.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id;

  if not found then
    return jsonb_build_object(
      'deleted', false,
      'reason', 'not_found',
      'user_id', target_user_id
    );
  end if;

  delete from public.trash_items
  where entity_type = 'profile'
    and entity_id = target_user_id;

  delete from public.profiles
  where id = target_user_id;

  delete from auth.users
  where id = target_user_id;

  return jsonb_build_object(
    'deleted', true,
    'user_id', target_user_id,
    'email', target_profile.email
  );
end;
$$;

grant execute on function public.admin_permanently_delete_user(uuid) to authenticated;
`