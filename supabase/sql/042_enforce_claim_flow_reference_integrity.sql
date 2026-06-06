create or replace function public.derive_claim_case_code(input_lead_code text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(trim(input_lead_code), '') ~ '^FF-[0-9]{4,}$'
      then regexp_replace(trim(input_lead_code), '^FF-', 'CASE-')
    else null
  end
$$;

create or replace function public.enforce_claim_flow_case_code_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_lead record;
  derived_case_code text;
begin
  if new.lead_id is null then
    return new;
  end if;

  select id, source, lead_code
  into linked_lead
  from public.leads
  where id = new.lead_id;

  if not found then
    return new;
  end if;

  if lower(coalesce(linked_lead.source, '')) <> 'claim_flow' then
    return new;
  end if;

  derived_case_code := public.derive_claim_case_code(linked_lead.lead_code);

  if derived_case_code is null then
    raise exception 'Claim-flow lead has invalid lead_code. Expected FF-0001 format.'
      using errcode = 'P0001',
            detail = format('lead_id=%s lead_code=%s', linked_lead.id, coalesce(linked_lead.lead_code, ''));
  end if;

  new.case_code := derived_case_code;
  return new;
end;
$$;

drop trigger if exists enforce_claim_flow_case_code_sync on public.cases;

create trigger enforce_claim_flow_case_code_sync
before insert or update of case_code, lead_id
on public.cases
for each row
execute function public.enforce_claim_flow_case_code_sync();

update public.cases as c
set case_code = public.derive_claim_case_code(l.lead_code),
    updated_at = now()
from public.leads as l
where c.lead_id = l.id
  and lower(coalesce(l.source, '')) = 'claim_flow'
  and public.derive_claim_case_code(l.lead_code) is not null
  and coalesce(c.case_code, '') <> public.derive_claim_case_code(l.lead_code);
