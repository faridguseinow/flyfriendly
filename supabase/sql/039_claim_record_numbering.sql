-- Sequential numbering for new claim-flow leads and matching cases.
-- New leads: FF-0001, FF-0002, ...
-- Cases created from those leads keep the same suffix: CASE-0001, CASE-0002, ...
-- Existing leads/cases are not modified.

create sequence if not exists public.claim_record_number_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no maxvalue
  cache 1;

create or replace function public.next_claim_record_number()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.claim_record_number_seq');
  return next_value;
end;
$$;

grant execute on function public.next_claim_record_number() to anon;
grant execute on function public.next_claim_record_number() to authenticated;
grant execute on function public.next_claim_record_number() to service_role;
