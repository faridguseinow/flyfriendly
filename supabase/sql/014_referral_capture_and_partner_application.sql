-- Referral Capture + Partner Application Access V1
-- Apply after 013_auth_customer_partner_foundation.sql.

grant insert on public.referral_partners to authenticated;
grant insert on public.referrals to anon, authenticated;

drop policy if exists "users create own partner application" on public.referral_partners;
create policy "users create own partner application"
on public.referral_partners for insert
to authenticated
with check (
  profile_id = auth.uid()
  and portal_status = 'pending'
  and status = 'paused'
  and coalesce(total_earned, 0) = 0
  and coalesce(total_paid, 0) = 0
);

drop policy if exists "public capture referral attribution" on public.referrals;
create policy "public capture referral attribution"
on public.referrals for insert
to anon, authenticated
with check (
  partner_id is not null
  and status = any (array['captured', 'lead_created', 'case_created'])
);
