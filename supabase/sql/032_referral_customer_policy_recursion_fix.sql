-- Break the customers <-> cases RLS recursion introduced by partner-program
-- reporting policies. Keep the current schema and access model intact.

create or replace function public.customer_has_referral_context(target_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1
      from public.referrals r
      where r.customer_id = target_customer_id
    )
    or exists (
      select 1
      from public.leads l
      where l.customer_id = target_customer_id
        and l.referral_partner_id is not null
    )
    or exists (
      select 1
      from public.cases c
      where c.customer_id = target_customer_id
        and (
          c.referral_partner_id is not null
          or nullif(btrim(coalesce(c.referral_partner_label, '')), '') is not null
        )
    );
$$;

grant execute on function public.customer_has_referral_context(uuid) to authenticated;

drop policy if exists "partner program admins read referred customers" on public.customers;
create policy "partner program admins read referred customers"
on public.customers for select
to authenticated
using (
  (
    public.has_admin_permission('partners.view')
    or public.has_admin_permission('partners.edit')
    or public.has_admin_permission('referrals.view')
  )
  and public.customer_has_referral_context(public.customers.id)
);
