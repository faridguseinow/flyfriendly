-- Referral Partners Module V1
-- Partner registry, linkage from leads/cases, and payout tracking.

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  referral_code text not null unique,
  referral_link text,
  commission_type text not null default 'percentage',
  commission_rate numeric(10,2) not null default 0,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_partners_commission_type_check check (
    commission_type = any (array['percentage', 'fixed'])
  ),
  constraint referral_partners_status_check check (
    status = any (array['active', 'paused', 'archived'])
  )
);

create table if not exists public.referral_partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  amount numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  status text not null default 'pending',
  payout_method text,
  note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_partner_payouts_status_check check (
    status = any (array['pending', 'approved', 'paid', 'cancelled'])
  )
);

alter table public.leads
  add column if not exists referral_partner_id uuid references public.referral_partners(id) on delete set null;

alter table public.cases
  add column if not exists referral_partner_id uuid references public.referral_partners(id) on delete set null;

create index if not exists referral_partners_code_idx on public.referral_partners(referral_code);
create index if not exists referral_partners_status_idx on public.referral_partners(status);
create index if not exists referral_partner_payouts_partner_id_idx on public.referral_partner_payouts(partner_id, created_at desc);
create index if not exists referral_partner_payouts_status_idx on public.referral_partner_payouts(status);
create index if not exists leads_referral_partner_id_idx on public.leads(referral_partner_id);
create index if not exists cases_referral_partner_id_idx on public.cases(referral_partner_id);

alter table public.referral_partners enable row level security;
alter table public.referral_partner_payouts enable row level security;

grant select, insert, update on public.referral_partners to authenticated;
grant select, insert, update on public.referral_partner_payouts to authenticated;
grant update on public.leads to authenticated;
grant update on public.cases to authenticated;

drop policy if exists "admins read referral partners" on public.referral_partners;
create policy "admins read referral partners"
on public.referral_partners for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage referral partners" on public.referral_partners;
create policy "admins manage referral partners"
on public.referral_partners for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read referral partner payouts" on public.referral_partner_payouts;
create policy "admins read referral partner payouts"
on public.referral_partner_payouts for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage referral partner payouts" on public.referral_partner_payouts;
create policy "admins manage referral partner payouts"
on public.referral_partner_payouts for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
