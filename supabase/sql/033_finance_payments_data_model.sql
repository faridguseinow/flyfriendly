-- Finance / Payments data model migration
-- Backward-compatible additive changes for admin finance and payments flows.

alter table public.case_finance
  add column if not exists internal_compensation_confirmed boolean,
  add column if not exists client_visible_approval boolean,
  add column if not exists client_payment_status text,
  add column if not exists client_payment_reference text,
  add column if not exists internal_note text,
  add column if not exists client_paid_at timestamptz,
  add column if not exists client_payment_flow_type text,
  add column if not exists updated_by uuid;

update public.case_finance
set internal_compensation_confirmed = false
where internal_compensation_confirmed is null;

update public.case_finance
set client_visible_approval = false
where client_visible_approval is null;

update public.case_finance
set client_payment_status = 'unpaid'
where client_payment_status is null
   or client_payment_status not in ('unpaid', 'paid');

update public.case_finance
set client_payment_flow_type = 'through_company'
where client_payment_flow_type is null
   or client_payment_flow_type not in ('through_company', 'direct_to_client');

alter table public.case_finance
  alter column internal_compensation_confirmed set default false,
  alter column internal_compensation_confirmed set not null,
  alter column client_visible_approval set default false,
  alter column client_visible_approval set not null,
  alter column client_payment_status set default 'unpaid',
  alter column client_payment_status set not null,
  alter column client_payment_flow_type set default 'through_company',
  alter column client_payment_flow_type set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'case_finance_client_payment_status_check'
      and conrelid = 'public.case_finance'::regclass
  ) then
    alter table public.case_finance
      drop constraint case_finance_client_payment_status_check;
  end if;

  alter table public.case_finance
    add constraint case_finance_client_payment_status_check
    check (client_payment_status = any (array['unpaid', 'paid']));

  if exists (
    select 1
    from pg_constraint
    where conname = 'case_finance_client_payment_flow_type_check'
      and conrelid = 'public.case_finance'::regclass
  ) then
    alter table public.case_finance
      drop constraint case_finance_client_payment_flow_type_check;
  end if;

  alter table public.case_finance
    add constraint case_finance_client_payment_flow_type_check
    check (
      client_payment_flow_type = any (array['through_company', 'direct_to_client'])
    );
end
$$;

create index if not exists case_finance_internal_compensation_confirmed_idx
  on public.case_finance(internal_compensation_confirmed);

create index if not exists case_finance_client_visible_approval_idx
  on public.case_finance(client_visible_approval);

create index if not exists case_finance_client_payment_status_idx
  on public.case_finance(client_payment_status);

create index if not exists case_finance_client_payment_flow_type_idx
  on public.case_finance(client_payment_flow_type);

create index if not exists case_finance_client_paid_at_idx
  on public.case_finance(client_paid_at desc);

alter table public.referral_partner_payouts
  add column if not exists updated_by uuid;

create index if not exists referral_partner_payouts_paid_at_idx
  on public.referral_partner_payouts(paid_at desc);

alter table public.partner_commissions
  add column if not exists partner_rate numeric;

update public.partner_commissions
set partner_rate = case
  when partner_rate is null then 0.15
  when partner_rate > 1 and partner_rate <= 100 then round((partner_rate / 100.0)::numeric, 4)
  else partner_rate
end;

update public.partner_commissions
set partner_rate = 0.15
where partner_rate is null
   or partner_rate <= 0
   or partner_rate >= 1;

alter table public.partner_commissions
  alter column partner_rate set default 0.15,
  alter column partner_rate set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'partner_commissions_partner_rate_check'
      and conrelid = 'public.partner_commissions'::regclass
  ) then
    alter table public.partner_commissions
      drop constraint partner_commissions_partner_rate_check;
  end if;

  alter table public.partner_commissions
    add constraint partner_commissions_partner_rate_check
    check (partner_rate > 0 and partner_rate < 1);
end
$$;

create index if not exists partner_commissions_partner_rate_idx
  on public.partner_commissions(partner_rate);

create index if not exists partner_commissions_case_id_idx
  on public.partner_commissions(case_id)
  where case_id is not null;

create table if not exists public.finance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  performed_by uuid,
  performed_at timestamptz not null default now(),
  comment text,
  created_at timestamptz not null default now(),
  constraint finance_audit_logs_entity_type_check check (
    entity_type = any (
      array[
        'case_finance',
        'partner_commission',
        'referral_partner_payout',
        'finance_export'
      ]
    )
  ),
  constraint finance_audit_logs_action_check check (
    action = any (
      array[
        'internal_compensation_confirmed_changed',
        'client_visible_approval_changed',
        'client_payment_marked_paid',
        'client_payment_marked_unpaid',
        'partner_payment_marked_paid',
        'partner_payment_marked_unpaid',
        'amount_changed',
        'payment_reference_changed',
        'internal_note_changed',
        'payment_flow_changed',
        'export_created'
      ]
    )
  )
);

create index if not exists finance_audit_logs_entity_idx
  on public.finance_audit_logs(entity_type, entity_id, performed_at desc);

create index if not exists finance_audit_logs_performed_by_idx
  on public.finance_audit_logs(performed_by, performed_at desc);

create index if not exists finance_audit_logs_performed_at_idx
  on public.finance_audit_logs(performed_at desc);

create index if not exists finance_audit_logs_action_idx
  on public.finance_audit_logs(action, performed_at desc);

alter table public.finance_audit_logs enable row level security;

grant select, insert on public.finance_audit_logs to authenticated;

drop policy if exists "finance admins read audit logs" on public.finance_audit_logs;
create policy "finance admins read audit logs"
on public.finance_audit_logs for select
to authenticated
using (
  public.has_admin_permission('finance.view')
  or public.has_admin_permission('finance.edit')
  or public.has_admin_permission('payments.view')
  or public.has_admin_permission('partner_commissions.view')
  or public.has_admin_permission('partner_commissions.manage')
  or public.has_admin_permission('partner_payouts.view')
  or public.has_admin_permission('partner_payouts.manage')
  or public.has_admin_permission('reports.view')
  or public.has_admin_permission('reports.export')
);

drop policy if exists "finance admins create audit logs" on public.finance_audit_logs;
create policy "finance admins create audit logs"
on public.finance_audit_logs for insert
to authenticated
with check (
  public.has_admin_permission('finance.edit')
  or public.has_admin_permission('partner_commissions.manage')
  or public.has_admin_permission('partner_payouts.manage')
  or public.has_admin_permission('reports.export')
);
