-- Admin granular access hardening
-- Keeps the current RBAC model but removes broad admin fallback from
-- permission-aware policies used by finance, referral, activity, and marketing.

create or replace function public.has_admin_permission(target_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    nullif(btrim(target_permission), '') is not null
    and (
      public.is_owner_or_super_admin()
      or exists (
        select 1
        from public.user_admin_roles uar
        left join public.admin_roles ar
          on ar.code = uar.role_code
        join public.admin_role_permissions arp
          on arp.role_code = uar.role_code
         and arp.permission_code = target_permission
         and coalesce(arp.is_allowed, true) = true
        where uar.user_id = auth.uid()
          and coalesce(ar.is_active, true) = true
          and not exists (
            select 1
            from public.admin_team_members atm_block
            where atm_block.profile_id = auth.uid()
              and atm_block.status <> 'active'
          )
      )
      or exists (
        select 1
        from public.admin_team_members atm
        join public.admin_roles ar
          on ar.id = atm.role_id
         and ar.is_active = true
        join public.admin_role_permissions arp
          on (
            arp.role_id = ar.id
            or arp.role_code = ar.code
          )
         and arp.permission_code = target_permission
         and coalesce(arp.is_allowed, true) = true
        where atm.profile_id = auth.uid()
          and atm.status = 'active'
      )
    );
$$;

grant execute on function public.has_admin_permission(text) to authenticated;

create or replace function public.has_any_admin_permission(target_permissions text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(coalesce(target_permissions, array[]::text[])) as permission_code
    where public.has_admin_permission(permission_code)
  );
$$;

grant execute on function public.has_any_admin_permission(text[]) to authenticated;

drop policy if exists "admins read activity logs" on public.activity_logs;
create policy "admins read activity logs"
on public.activity_logs for select
to authenticated
using (public.has_admin_permission('activity.view'));

drop policy if exists "admins create activity logs" on public.activity_logs;
create policy "admins create activity logs"
on public.activity_logs for insert
to authenticated
with check (public.is_admin_team_member());

drop policy if exists "owner read admin activity logs" on public.admin_activity_logs;
create policy "admins read admin activity logs"
on public.admin_activity_logs for select
to authenticated
using (public.has_admin_permission('activity.view'));

drop policy if exists "admins read case finance" on public.case_finance;
create policy "admins read case finance"
on public.case_finance for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'finance.view',
    'finance.edit',
    'payments.view',
    'partner_commissions.view',
    'partner_commissions.manage',
    'partner_payouts.view',
    'partner_payouts.manage',
    'reports.view',
    'reports.export'
  ])
);

drop policy if exists "admins manage case finance" on public.case_finance;
create policy "admins manage case finance"
on public.case_finance for all
to authenticated
using (public.has_admin_permission('finance.edit'))
with check (public.has_admin_permission('finance.edit'));

drop policy if exists "finance admins read audit logs" on public.finance_audit_logs;
create policy "finance admins read audit logs"
on public.finance_audit_logs for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'finance.view',
    'finance.edit',
    'payments.view',
    'partner_commissions.view',
    'partner_commissions.manage',
    'partner_payouts.view',
    'partner_payouts.manage',
    'reports.view',
    'reports.export'
  ])
);

drop policy if exists "finance admins create audit logs" on public.finance_audit_logs;
create policy "finance admins create audit logs"
on public.finance_audit_logs for insert
to authenticated
with check (
  public.has_any_admin_permission(array[
    'finance.edit',
    'partner_commissions.manage',
    'partner_payouts.manage',
    'reports.export'
  ])
);

drop policy if exists "admins read analytics events" on public.analytics_events;
create policy "admins read analytics events"
on public.analytics_events for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'reports.view',
    'reports.export'
  ])
);
