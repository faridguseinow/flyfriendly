-- Fly Friendly public lead flow.
-- Run after 001_admin_catalog_setup.sql.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text not null unique,
  source text not null default 'claim_flow',
  status text not null default 'new',
  stage text not null default 'eligibility',
  eligibility_status text not null default 'pending',
  departure_airport_id bigint references public.airports(id) on delete set null,
  arrival_airport_id bigint references public.airports(id) on delete set null,
  airline_id bigint references public.airlines(id) on delete set null,
  departure_airport text,
  arrival_airport text,
  airline text,
  flight_number text,
  scheduled_departure_date date,
  delay_duration text,
  disruption_type text,
  is_direct boolean,
  full_name text,
  email text,
  phone text,
  city text,
  has_whatsapp boolean default false,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint leads_status_check check (status in ('new', 'submitted', 'not_eligible', 'converted', 'archived')),
  constraint leads_stage_check check (stage in ('eligibility', 'contact', 'documents', 'finish', 'approved', 'denied')),
  constraint leads_eligibility_status_check check (eligibility_status in ('pending', 'eligible', 'not_eligible'))
);

create table if not exists public.lead_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  document_type text not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  status text not null default 'uploaded',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads(created_at desc);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_airports_idx on public.leads(departure_airport_id, arrival_airport_id);
create index if not exists lead_documents_lead_id_idx on public.lead_documents(lead_id);

alter table public.leads enable row level security;
alter table public.lead_documents enable row level security;

grant insert, update on public.leads to anon, authenticated;
grant select, update on public.leads to authenticated;
grant insert on public.lead_documents to anon, authenticated;
grant select on public.lead_documents to authenticated;

drop policy if exists "public can create leads" on public.leads;
create policy "public can create leads"
on public.leads for insert
to anon, authenticated
with check (true);

drop policy if exists "public can update own fresh leads" on public.leads;
create policy "public can update own fresh leads"
on public.leads for update
to anon, authenticated
using (created_at > now() - interval '2 hours')
with check (created_at > now() - interval '2 hours');

drop policy if exists "admins read all leads" on public.leads;
create policy "admins read all leads"
on public.leads for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage leads" on public.leads;
create policy "admins manage leads"
on public.leads for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can create lead documents" on public.lead_documents;
create policy "public can create lead documents"
on public.lead_documents for insert
to anon, authenticated
with check (true);

drop policy if exists "admins read all lead documents" on public.lead_documents;
create policy "admins read all lead documents"
on public.lead_documents for select
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-lead-documents',
  'claim-lead-documents',
  false,
  26214400,
  array['image/png', 'image/jpeg', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can upload lead documents" on storage.objects;
create policy "public can upload lead documents"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'claim-lead-documents'
  and (storage.foldername(name))[1] = 'leads'
);

drop policy if exists "admins read lead storage documents" on storage.objects;
create policy "admins read lead storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'claim-lead-documents'
  and public.is_admin()
);
