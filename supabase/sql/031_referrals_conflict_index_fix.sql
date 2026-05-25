-- Fix ON CONFLICT compatibility for referral lead/case writes.
-- PostgreSQL accepts multiple NULL values for regular unique indexes,
-- so partial unique indexes are not required here.

drop index if exists public.referrals_lead_id_key;
drop index if exists public.referrals_case_id_key;

create unique index if not exists referrals_lead_id_key
  on public.referrals(lead_id);

create unique index if not exists referrals_case_id_key
  on public.referrals(case_id);
