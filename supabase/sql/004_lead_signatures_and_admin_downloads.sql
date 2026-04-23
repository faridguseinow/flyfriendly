-- Lead signatures and admin download policies.
-- Run after 002_public_leads.sql.

create table if not exists public.lead_signatures (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  signer_name text,
  signer_email text,
  signature_data_url text not null,
  terms_accepted boolean not null default false,
  signed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_signatures_terms_check check (terms_accepted = true)
);

create index if not exists lead_signatures_lead_id_idx on public.lead_signatures(lead_id);
create index if not exists lead_signatures_signed_at_idx on public.lead_signatures(signed_at desc);

alter table public.lead_signatures enable row level security;

grant insert on public.lead_signatures to anon, authenticated;
grant select on public.lead_signatures to authenticated;

drop policy if exists "public can create lead signatures" on public.lead_signatures;
create policy "public can create lead signatures"
on public.lead_signatures
for insert
to anon, authenticated
with check (terms_accepted = true);

drop policy if exists "admins read all lead signatures" on public.lead_signatures;
create policy "admins read all lead signatures"
on public.lead_signatures
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins read claim storage documents" on storage.objects;
create policy "admins read claim storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'claim-documents'
  and public.is_admin()
);
