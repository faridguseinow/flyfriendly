-- Claim Ownership Backfill V1
-- Links previously anonymous claim-flow records to the authenticated profile.

create or replace function public.sync_current_profile_claim_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  current_profile public.profiles%rowtype;
  matched_customer_id uuid;
  linked_leads_count integer := 0;
  linked_customers_count integer := 0;
  linked_cases_count integer := 0;
  linked_referrals_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id;

  if not found then
    raise exception 'Profile was not found for the current user.';
  end if;

  update public.leads
  set
    profile_id = current_user_id,
    full_name = coalesce(public.leads.full_name, current_profile.full_name),
    phone = coalesce(public.leads.phone, current_profile.phone),
    updated_at = now()
  where profile_id is null
    and current_email is not null
    and lower(coalesce(email, '')) = current_email;

  get diagnostics linked_leads_count = row_count;

  update public.customers
  set
    profile_id = current_user_id,
    full_name = coalesce(public.customers.full_name, current_profile.full_name, public.customers.email, 'Customer'),
    phone = coalesce(public.customers.phone, current_profile.phone),
    updated_at = now()
  where profile_id is null
    and (
      (current_email is not null and lower(coalesce(email, '')) = current_email)
      or id in (
        select customer_id
        from public.leads
        where profile_id = current_user_id
          and customer_id is not null
      )
    );

  get diagnostics linked_customers_count = row_count;

  select id
  into matched_customer_id
  from public.customers
  where profile_id = current_user_id
  order by created_at asc
  limit 1;

  if matched_customer_id is null then
    insert into public.customers (
      id,
      full_name,
      email,
      phone,
      country,
      preferred_language,
      notes,
      profile_id
    )
    select
      gen_random_uuid(),
      coalesce(nullif(l.full_name, ''), current_profile.full_name, current_email, 'Customer'),
      coalesce(nullif(l.email, ''), current_email),
      coalesce(nullif(l.phone, ''), current_profile.phone),
      l.country,
      l.preferred_language,
      l.reason,
      current_user_id
    from public.leads l
    where l.profile_id = current_user_id
    order by l.created_at asc
    limit 1
    returning id into matched_customer_id;
  end if;

  if matched_customer_id is not null then
    update public.leads
    set
      customer_id = matched_customer_id,
      updated_at = now()
    where profile_id = current_user_id
      and customer_id is null;

    update public.cases
    set
      profile_id = current_user_id,
      customer_id = coalesce(public.cases.customer_id, matched_customer_id),
      updated_at = now()
    where
      profile_id is null
      and (
        lead_id in (
          select id
          from public.leads
          where profile_id = current_user_id
        )
        or customer_id = matched_customer_id
      );

    get diagnostics linked_cases_count = row_count;

    update public.referrals
    set
      client_profile_id = current_user_id,
      customer_id = coalesce(public.referrals.customer_id, matched_customer_id),
      updated_at = now()
    where client_profile_id is null
      and (
        customer_id = matched_customer_id
        or lead_id in (
          select id
          from public.leads
          where profile_id = current_user_id
        )
        or case_id in (
          select id
          from public.cases
          where profile_id = current_user_id
        )
      );

    get diagnostics linked_referrals_count = row_count;
  end if;

  return jsonb_build_object(
    'profile_id', current_user_id,
    'customer_id', matched_customer_id,
    'linked_leads', linked_leads_count,
    'linked_customers', linked_customers_count,
    'linked_cases', linked_cases_count,
    'linked_referrals', linked_referrals_count
  );
end;
$$;

grant execute on function public.sync_current_profile_claim_data() to authenticated;
