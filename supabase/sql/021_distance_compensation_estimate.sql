-- Distance-based compensation estimate fields for intake and legacy claims.
-- This migration is additive only and does not replace existing compensation fields.

alter table if exists public.leads
  add column if not exists distance_km numeric,
  add column if not exists distance_band text,
  add column if not exists estimated_compensation_eur numeric,
  add column if not exists compensation_currency text not null default 'EUR',
  add column if not exists estimate_status text not null default 'pending_review',
  add column if not exists estimate_explanation jsonb;

alter table if exists public.claims
  add column if not exists distance_km numeric,
  add column if not exists distance_band text,
  add column if not exists estimated_compensation_eur numeric,
  add column if not exists compensation_currency text not null default 'EUR',
  add column if not exists estimate_status text not null default 'pending_review',
  add column if not exists estimate_explanation jsonb;

do $$
begin
  if to_regclass('public.leads') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'leads_distance_band_check'
        and conrelid = 'public.leads'::regclass
    ) then
      alter table public.leads
        add constraint leads_distance_band_check
        check (
          distance_band is null
          or distance_band = any (array['short', 'medium', 'long', 'unknown'])
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'leads_estimate_status_check'
        and conrelid = 'public.leads'::regclass
    ) then
      alter table public.leads
        add constraint leads_estimate_status_check
        check (
          estimate_status = any (array['calculated', 'pending_review', 'manual_override'])
        );
    end if;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.claims') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'claims_distance_band_check'
        and conrelid = 'public.claims'::regclass
    ) then
      alter table public.claims
        add constraint claims_distance_band_check
        check (
          distance_band is null
          or distance_band = any (array['short', 'medium', 'long', 'unknown'])
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'claims_estimate_status_check'
        and conrelid = 'public.claims'::regclass
    ) then
      alter table public.claims
        add constraint claims_estimate_status_check
        check (
          estimate_status = any (array['calculated', 'pending_review', 'manual_override'])
        );
    end if;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.leads') is not null then
    create index if not exists leads_distance_band_idx on public.leads(distance_band);
    create index if not exists leads_estimate_status_idx on public.leads(estimate_status);
  end if;

  if to_regclass('public.claims') is not null then
    create index if not exists claims_distance_band_idx on public.claims(distance_band);
    create index if not exists claims_estimate_status_idx on public.claims(estimate_status);
  end if;
end
$$;
