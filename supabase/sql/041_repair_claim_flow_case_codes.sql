-- Repair already converted modern claim_flow leads/cases so the case number
-- always matches the lead number: FF-0001 -> CASE-0001.
-- OLD-* / Django import records are not touched.

update public.cases as c
set case_code = regexp_replace(l.lead_code, '^FF-', 'CASE-')
from public.leads as l
where c.lead_id = l.id
  and lower(coalesce(l.source, '')) = 'claim_flow'
  and coalesce(l.lead_code, '') ~ '^FF-[0-9]{4,}$'
  and coalesce(c.case_code, '') <> regexp_replace(l.lead_code, '^FF-', 'CASE-');
