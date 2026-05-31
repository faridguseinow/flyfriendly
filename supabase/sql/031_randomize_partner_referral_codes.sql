-- Randomize existing partner referral codes so public links do not expose partner names.

create or replace function public.generate_random_partner_referral_code(code_length integer default 18)
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  bytes bytea;
  result text := '';
  idx integer;
begin
  code_length := greatest(coalesce(code_length, 18), 8);
  bytes := gen_random_bytes(code_length);

  for idx in 0..code_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, idx) % length(alphabet)) + 1, 1);
  end loop;

  return result;
end;
$$;

do $$
declare
  partner_row record;
  next_code text;
begin
  for partner_row in
    select id
    from public.referral_partners
    order by created_at asc
  loop
    loop
      next_code := public.generate_random_partner_referral_code(18);
      exit when not exists (
        select 1
        from public.referral_partners
        where referral_code = next_code
          and id <> partner_row.id
      );
    end loop;

    update public.referral_partners
    set
      referral_code = next_code,
      referral_link = '/r/' || next_code,
      updated_at = now()
    where id = partner_row.id;
  end loop;
end
$$;

drop function if exists public.generate_random_partner_referral_code(integer);
