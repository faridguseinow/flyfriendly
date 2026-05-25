-- Partner Program Access Alignment
-- Keeps the current schema intact while aligning partner-program RLS with
-- dynamic admin permissions used by the frontend.

create or replace function public.has_admin_permission(target_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.user_admin_roles uar
      join public.admin_role_permissions arp
        on arp.role_code = uar.role_code
       and arp.permission_code = target_permission
       and coalesce(arp.is_allowed, true) = true
      left join public.admin_roles ar
        on ar.code = uar.role_code
      where uar.user_id = auth.uid()
        and coalesce(ar.is_active, true) = true
    )
    or exists (
      select 1
      from public.admin_team_members atm
      join public.admin_roles ar
        on ar.id = atm.role_id
       and ar.is_active = true
      join public.admin_role_permissions arp
        on arp.role_code = ar.code
       and arp.permission_code = target_permission
       and coalesce(arp.is_allowed, true) = true
      where atm.profile_id = auth.uid()
        and atm.status = 'active'
    );
$$;

grant execute on function public.has_admin_permission(text) to authenticated;

create index if not exists referrals_referral_code_idx
  on public.referrals(referral_code);

drop policy if exists "partner program admins read partner applications" on public.partner_applications;
create policy "partner program admins read partner applications"
on public.partner_applications for select
to authenticated
using (
  public.has_admin_permission('partner_applications.view')
  or public.has_admin_permission('partner_applications.manage')
  or public.has_admin_permission('partners.view')
);

drop policy if exists "partner program admins manage partner applications" on public.partner_applications;
create policy "partner program admins manage partner applications"
on public.partner_applications for update
to authenticated
using (public.has_admin_permission('partner_applications.manage'))
with check (public.has_admin_permission('partner_applications.manage'));

drop policy if exists "partner program admins read referral partners" on public.referral_partners;
create policy "partner program admins read referral partners"
on public.referral_partners for select
to authenticated
using (
  public.has_admin_permission('partners.view')
  or public.has_admin_permission('partners.edit')
  or public.has_admin_permission('referrals.view')
);

drop policy if exists "partner program admins edit referral partners" on public.referral_partners;
create policy "partner program admins edit referral partners"
on public.referral_partners for update
to authenticated
using (public.has_admin_permission('partners.edit'))
with check (public.has_admin_permission('partners.edit'));

drop policy if exists "partner program admins read referrals" on public.referrals;
create policy "partner program admins read referrals"
on public.referrals for select
to authenticated
using (
  public.has_admin_permission('referrals.view')
  or public.has_admin_permission('partners.view')
  or public.has_admin_permission('partners.edit')
);

drop policy if exists "partner program admins read commissions" on public.partner_commissions;
create policy "partner program admins read commissions"
on public.partner_commissions for select
to authenticated
using (
  public.has_admin_permission('partners.view')
  or public.has_admin_permission('partners.edit')
  or public.has_admin_permission('referrals.view')
);

drop policy if exists "partner program admins read payouts" on public.referral_partner_payouts;
create policy "partner program admins read payouts"
on public.referral_partner_payouts for select
to authenticated
using (
  public.has_admin_permission('partners.view')
  or public.has_admin_permission('partners.edit')
  or public.has_admin_permission('referrals.view')
);

drop policy if exists "partner program admins read referred leads" on public.leads;
create policy "partner program admins read referred leads"
on public.leads for select
to authenticated
using (
  (
    public.has_admin_permission('partners.view')
    or public.has_admin_permission('partners.edit')
    or public.has_admin_permission('referrals.view')
  )
  and referral_partner_id is not null
);

drop policy if exists "partner program admins read referred cases" on public.cases;
create policy "partner program admins read referred cases"
on public.cases for select
to authenticated
using (
  (
    public.has_admin_permission('partners.view')
    or public.has_admin_permission('partners.edit')
    or public.has_admin_permission('referrals.view')
  )
  and (
    referral_partner_id is not null
    or nullif(btrim(coalesce(referral_partner_label, '')), '') is not null
  )
);

drop policy if exists "partner program admins read referred customer finance" on public.case_finance;
create policy "partner program admins read referred customer finance"
on public.case_finance for select
to authenticated
using (
  (
    public.has_admin_permission('partners.view')
    or public.has_admin_permission('partners.edit')
    or public.has_admin_permission('referrals.view')
  )
  and exists (
    select 1
    from public.cases c
    where c.id = public.case_finance.case_id
      and (
        c.referral_partner_id is not null
        or nullif(btrim(coalesce(c.referral_partner_label, '')), '') is not null
      )
  )
);

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
  and (
    exists (
      select 1
      from public.referrals r
      where r.customer_id = public.customers.id
    )
    or exists (
      select 1
      from public.cases c
      where c.customer_id = public.customers.id
        and (
          c.referral_partner_id is not null
          or nullif(btrim(coalesce(c.referral_partner_label, '')), '') is not null
        )
    )
    or exists (
      select 1
      from public.leads l
      where l.customer_id = public.customers.id
        and l.referral_partner_id is not null
    )
  )
);
