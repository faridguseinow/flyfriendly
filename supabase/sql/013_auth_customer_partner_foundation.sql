-- Auth + Customer / Partner Portal Foundation V1
-- Extends the existing Fly Friendly schema without replacing current admin RBAC
-- or the existing referral_partners module.

alter table public.profiles
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status = any (array['active', 'pending', 'blocked', 'suspended']));
  end if;
end
$$;

alter table public.customers
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

alter table public.leads
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

alter table public.cases
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists customers_profile_id_key
  on public.customers(profile_id)
  where profile_id is not null;

create index if not exists leads_profile_id_idx on public.leads(profile_id);
create index if not exists cases_profile_id_idx on public.cases(profile_id);
create index if not exists profiles_status_idx on public.profiles(status);

alter table public.referral_partners
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists public_name text,
  add column if not exists slug text,
  add column if not exists portal_status text not null default 'pending',
  add column if not exists application_reason text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists youtube_url text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists total_earned numeric(10,2) not null default 0,
  add column if not exists total_paid numeric(10,2) not null default 0;

update public.referral_partners
set
  public_name = coalesce(public_name, name),
  referral_link = coalesce(referral_link, '/r/' || referral_code),
  portal_status = case
    when portal_status is not null and portal_status <> 'pending' then portal_status
    when status = 'active' then 'approved'
    when status = 'paused' then 'suspended'
    when status = 'archived' then 'rejected'
    else 'pending'
  end
where public_name is null
   or referral_link is null
   or portal_status = 'pending';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'referral_partners_portal_status_check'
      and conrelid = 'public.referral_partners'::regclass
  ) then
    alter table public.referral_partners
      drop constraint referral_partners_portal_status_check;
  end if;

  alter table public.referral_partners
    add constraint referral_partners_portal_status_check
    check (portal_status = any (array['pending', 'approved', 'rejected', 'suspended']));
end
$$;

create unique index if not exists referral_partners_profile_id_key
  on public.referral_partners(profile_id)
  where profile_id is not null;

create unique index if not exists referral_partners_slug_key
  on public.referral_partners(slug)
  where slug is not null;

create index if not exists referral_partners_portal_status_idx
  on public.referral_partners(portal_status);

alter table public.referral_partner_payouts
  add column if not exists payment_reference text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'referral_partner_payouts_status_check'
      and conrelid = 'public.referral_partner_payouts'::regclass
  ) then
    alter table public.referral_partner_payouts
      drop constraint referral_partner_payouts_status_check;
  end if;

  alter table public.referral_partner_payouts
    add constraint referral_partner_payouts_status_check
    check (status = any (array['pending', 'processing', 'approved', 'paid', 'failed', 'cancelled']));
end
$$;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  client_profile_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  claim_id uuid,
  referral_code text,
  source_url text,
  source_path text,
  status text not null default 'captured',
  attribution_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_status_check check (
    status = any (array['captured', 'lead_created', 'case_created', 'converted', 'cancelled'])
  )
);

create index if not exists referrals_partner_id_idx on public.referrals(partner_id, created_at desc);
create index if not exists referrals_client_profile_id_idx on public.referrals(client_profile_id, created_at desc);
create unique index if not exists referrals_lead_id_key
  on public.referrals(lead_id)
  where lead_id is not null;
create unique index if not exists referrals_case_id_key
  on public.referrals(case_id)
  where case_id is not null;

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  claim_id uuid,
  amount numeric(10,2) not null,
  currency text not null default 'EUR',
  commission_rate numeric(10,2),
  source_amount numeric(10,2),
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  constraint partner_commissions_status_check check (
    status = any (array['pending', 'approved', 'paid', 'cancelled'])
  ),
  constraint partner_commissions_amount_check check (amount >= 0),
  constraint partner_commissions_rate_check check (
    commission_rate is null or (commission_rate >= 0 and commission_rate <= 100)
  )
);

create index if not exists partner_commissions_partner_id_idx
  on public.partner_commissions(partner_id, created_at desc);
create unique index if not exists partner_commissions_partner_case_key
  on public.partner_commissions(partner_id, case_id)
  where case_id is not null;
create unique index if not exists partner_commissions_partner_claim_key
  on public.partner_commissions(partner_id, claim_id)
  where claim_id is not null;

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.current_profile_status()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select status
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.current_partner_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

create or replace function public.get_partner_by_referral_code(input_code text)
returns table (
  id uuid,
  referral_code text,
  public_name text,
  slug text,
  avatar_url text,
  website_url text,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  portal_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    rp.id,
    rp.referral_code,
    coalesce(rp.public_name, rp.name) as public_name,
    rp.slug,
    rp.avatar_url,
    rp.website_url,
    rp.instagram_url,
    rp.tiktok_url,
    rp.youtube_url,
    rp.portal_status
  from public.referral_partners rp
  where upper(rp.referral_code) = upper(input_code)
    and rp.portal_status = 'approved'
  order by rp.created_at asc
  limit 1
$$;

create or replace function public.owns_case(target_case_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    left join public.customers cu on cu.id = c.customer_id
    where c.id = target_case_id
      and (
        c.profile_id = auth.uid()
        or cu.profile_id = auth.uid()
      )
  )
$$;

create or replace function public.owns_lead(target_lead_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.leads
    where id = target_lead_id
      and profile_id = auth.uid()
  )
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_status() to authenticated;
grant execute on function public.current_partner_id() to authenticated;
grant execute on function public.get_partner_by_referral_code(text) to anon, authenticated;
grant execute on function public.owns_case(uuid) to authenticated;
grant execute on function public.owns_lead(uuid) to authenticated;

alter table public.referrals enable row level security;
alter table public.partner_commissions enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant select on public.customers to authenticated;
grant select on public.leads to authenticated;
grant select on public.cases to authenticated;
grant select on public.lead_documents to authenticated;
grant select on public.case_documents to authenticated;
grant select on public.case_status_history to authenticated;
grant select on public.case_finance to authenticated;
grant select, insert, update on public.referrals to authenticated;
grant select, insert, update on public.partner_commissions to authenticated;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "users create own client profile" on public.profiles;
create policy "users create own client profile"
on public.profiles for insert
to authenticated
with check (
  id = auth.uid()
  and coalesce(role, 'client') = 'client'
  and coalesce(status, 'active') = 'active'
);

drop policy if exists "users update own safe profile" on public.profiles;
create policy "users update own safe profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and coalesce(role, '') = coalesce(public.current_profile_role(), '')
  and coalesce(status, 'active') = coalesce(public.current_profile_status(), 'active')
);

drop policy if exists "users read own customer record" on public.customers;
create policy "users read own customer record"
on public.customers for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "users read own leads" on public.leads;
create policy "users read own leads"
on public.leads for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "users read own lead documents" on public.lead_documents;
create policy "users read own lead documents"
on public.lead_documents for select
to authenticated
using (public.owns_lead(lead_id));

drop policy if exists "users read own cases" on public.cases;
create policy "users read own cases"
on public.cases for select
to authenticated
using (
  profile_id = auth.uid()
  or (
    customer_id is not null
    and exists (
      select 1
      from public.customers cu
      where cu.id = public.cases.customer_id
        and cu.profile_id = auth.uid()
    )
  )
);

drop policy if exists "users read own case documents" on public.case_documents;
create policy "users read own case documents"
on public.case_documents for select
to authenticated
using (public.owns_case(case_id));

drop policy if exists "users read own case status history" on public.case_status_history;
create policy "users read own case status history"
on public.case_status_history for select
to authenticated
using (public.owns_case(case_id));

drop policy if exists "users read own case finance" on public.case_finance;
create policy "users read own case finance"
on public.case_finance for select
to authenticated
using (public.owns_case(case_id));

drop policy if exists "partners read own partner profile" on public.referral_partners;
create policy "partners read own partner profile"
on public.referral_partners for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "partners read own referrals" on public.referrals;
create policy "partners read own referrals"
on public.referrals for select
to authenticated
using (partner_id = public.current_partner_id());

drop policy if exists "clients read own referrals" on public.referrals;
create policy "clients read own referrals"
on public.referrals for select
to authenticated
using (client_profile_id = auth.uid());

drop policy if exists "admins manage referrals" on public.referrals;
create policy "admins manage referrals"
on public.referrals for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "partners read own commissions" on public.partner_commissions;
create policy "partners read own commissions"
on public.partner_commissions for select
to authenticated
using (partner_id = public.current_partner_id());

drop policy if exists "admins manage commissions" on public.partner_commissions;
create policy "admins manage commissions"
on public.partner_commissions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "partners read own payouts" on public.referral_partner_payouts;
create policy "partners read own payouts"
on public.referral_partner_payouts for select
to authenticated
using (partner_id = public.current_partner_id());
