-- Partner Profile Self-Service V1
-- Allows approved/pending partner users to update safe public profile fields only.

create or replace function public.current_partner_status()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select status
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

create or replace function public.current_partner_portal_status()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select portal_status
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

create or replace function public.current_partner_commission_rate()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select commission_rate
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

create or replace function public.current_partner_commission_type()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select commission_type
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

create or replace function public.current_partner_total_earned()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select total_earned
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

create or replace function public.current_partner_total_paid()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select total_paid
  from public.referral_partners
  where profile_id = auth.uid()
  order by created_at asc
  limit 1
$$;

grant update on public.referral_partners to authenticated;
grant execute on function public.current_partner_status() to authenticated;
grant execute on function public.current_partner_portal_status() to authenticated;
grant execute on function public.current_partner_commission_rate() to authenticated;
grant execute on function public.current_partner_commission_type() to authenticated;
grant execute on function public.current_partner_total_earned() to authenticated;
grant execute on function public.current_partner_total_paid() to authenticated;

drop policy if exists "partners update own safe profile" on public.referral_partners;
create policy "partners update own safe profile"
on public.referral_partners for update
to authenticated
using (profile_id = auth.uid())
with check (
  profile_id = auth.uid()
  and status = public.current_partner_status()
  and portal_status = public.current_partner_portal_status()
  and commission_rate = public.current_partner_commission_rate()
  and commission_type = public.current_partner_commission_type()
  and total_earned = public.current_partner_total_earned()
  and total_paid = public.current_partner_total_paid()
);
