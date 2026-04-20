-- Optional normalized links from existing claims/flight_checks to airport and airline catalog rows.
-- Run after 001_admin_catalog_setup.sql.

alter table public.claims
  add column if not exists departure_airport_id bigint references public.airports(id) on delete set null,
  add column if not exists arrival_airport_id bigint references public.airports(id) on delete set null,
  add column if not exists airline_id bigint references public.airlines(id) on delete set null;

alter table public.flight_checks
  add column if not exists departure_airport_id bigint references public.airports(id) on delete set null,
  add column if not exists arrival_airport_id bigint references public.airports(id) on delete set null,
  add column if not exists airline_id bigint references public.airlines(id) on delete set null;

create index if not exists claims_departure_airport_id_idx on public.claims(departure_airport_id);
create index if not exists claims_arrival_airport_id_idx on public.claims(arrival_airport_id);
create index if not exists claims_airline_id_idx on public.claims(airline_id);
create index if not exists flight_checks_departure_airport_id_idx on public.flight_checks(departure_airport_id);
create index if not exists flight_checks_arrival_airport_id_idx on public.flight_checks(arrival_airport_id);
create index if not exists flight_checks_airline_id_idx on public.flight_checks(airline_id);
