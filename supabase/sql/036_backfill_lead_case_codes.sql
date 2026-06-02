-- Run manually once if you want to backfill ONLY the newer Supabase claim flow records.
--
-- Safe scope:
-- - touches only leads where source = 'claim_flow'
-- - touches only cases linked to those leads
-- - does NOT touch legacy Django leads/cases
-- - does NOT touch orphan cases with no linked lead
--
-- Result:
--   leads  -> FF-12345
--   cases  -> CASE-12345
-- Linked lead/case pairs receive the same 5-digit suffix.

begin;

do $$
declare
  lead_row record;
  next_suffix text;
  next_lead_code text;
  next_case_code text;
  used_suffixes text[] := array[]::text[];
begin
  for lead_row in
    select l.id
    from public.leads l
    where coalesce(l.source, 'claim_flow') = 'claim_flow'
    order by l.created_at asc nulls first, l.id
  loop
    loop
      next_suffix := lpad((floor(random() * 100000))::int::text, 5, '0');
      next_lead_code := 'FF-' || next_suffix;
      next_case_code := 'CASE-' || next_suffix;

      exit when not next_suffix = any(used_suffixes)
        and not exists (
          select 1
          from public.leads l2
          where l2.id <> lead_row.id
            and l2.lead_code = next_lead_code
        )
        and not exists (
          select 1
          from public.cases c2
          where c2.case_code = next_case_code
            and c2.lead_id is distinct from lead_row.id
        );
    end loop;

    used_suffixes := array_append(used_suffixes, next_suffix);

    update public.leads l
    set lead_code = next_lead_code,
        updated_at = now()
    where l.id = lead_row.id;

    update public.cases c
    set case_code = next_case_code,
        updated_at = now()
    where c.lead_id = lead_row.id;

    update public.referrals r
    set attribution_meta = jsonb_set(
          jsonb_set(
            coalesce(r.attribution_meta, '{}'::jsonb),
            '{lead_code}',
            to_jsonb(next_lead_code),
            true
          ),
          '{case_code}',
          to_jsonb((
            select c.case_code
            from public.cases c
            where c.id = r.case_id
          )),
          true
        ),
        updated_at = now()
    where r.lead_id = lead_row.id;
  end loop;
end
$$;

commit;
