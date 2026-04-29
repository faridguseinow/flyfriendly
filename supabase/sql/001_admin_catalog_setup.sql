-- Fly Friendly admin + airport/airline catalog setup.
-- Run this in Supabase SQL Editor as a project owner.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in (
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
      )
  );
$$;

create table if not exists public.airports (
  id bigint primary key,
  ident text,
  type text,
  name text not null,
  latitude_deg double precision,
  longitude_deg double precision,
  elevation_ft integer,
  continent text,
  iso_country text,
  iso_region text,
  municipality text,
  scheduled_service boolean default false,
  icao_code text,
  iata_code text,
  gps_code text,
  local_code text,
  home_link text,
  wikipedia_link text,
  keywords text,
  search_text text generated always as (
    lower(
      coalesce(name, '') || ' ' ||
      coalesce(iata_code, '') || ' ' ||
      coalesce(icao_code, '') || ' ' ||
      coalesce(ident, '') || ' ' ||
      coalesce(municipality, '') || ' ' ||
      coalesce(iso_country, '')
    )
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.airlines (
  id bigserial primary key,
  name text not null,
  iata_code text,
  icao_code text,
  country text,
  active boolean default true,
  search_text text generated always as (
    lower(
      coalesce(name, '') || ' ' ||
      coalesce(iata_code, '') || ' ' ||
      coalesce(icao_code, '') || ' ' ||
      coalesce(country, '')
    )
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists airports_search_text_idx on public.airports using gin (to_tsvector('simple', search_text));
create index if not exists airports_iata_code_idx on public.airports (iata_code);
create index if not exists airports_icao_code_idx on public.airports (icao_code);
create index if not exists airports_scheduled_service_idx on public.airports (scheduled_service);
create index if not exists airlines_search_text_idx on public.airlines using gin (to_tsvector('simple', search_text));
create unique index if not exists claims_claim_code_key on public.claims (claim_code);

alter table public.airports enable row level security;
alter table public.airlines enable row level security;

drop policy if exists "catalog airports readable" on public.airports;
create policy "catalog airports readable"
on public.airports for select
using (true);

drop policy if exists "catalog airlines readable" on public.airlines;
create policy "catalog airlines readable"
on public.airlines for select
using (true);

drop policy if exists "admins manage airports" on public.airports;
create policy "admins manage airports"
on public.airports for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage airlines" on public.airlines;
create policy "admins manage airlines"
on public.airlines for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles"
on public.profiles for select
using (public.is_admin());

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles"
on public.profiles for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read all claims" on public.claims;
create policy "admins read all claims"
on public.claims for select
using (public.is_admin());

drop policy if exists "admins update claims" on public.claims;
create policy "admins update claims"
on public.claims for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read all flight checks" on public.flight_checks;
create policy "admins read all flight checks"
on public.flight_checks for select
using (public.is_admin());

drop policy if exists "admins read all flight segments" on public.flight_segments;
create policy "admins read all flight segments"
on public.flight_segments for select
using (public.is_admin());

drop policy if exists "admins read all documents" on public.documents;
create policy "admins read all documents"
on public.documents for select
using (public.is_admin());

drop policy if exists "admins update documents" on public.documents;
create policy "admins update documents"
on public.documents for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read all claim events" on public.claim_events;
create policy "admins read all claim events"
on public.claim_events for select
using (public.is_admin());

drop policy if exists "admins read all eligibility results" on public.eligibility_results;
create policy "admins read all eligibility results"
on public.eligibility_results for select
using (public.is_admin());

-- Give the first administrator access. Change the email before running if needed.
update public.profiles
set role = 'admin'
where email = 'sapienspay@gmail.com';
