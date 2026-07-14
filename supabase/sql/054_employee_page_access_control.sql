-- Employee page access control
-- Adds a simple employee-level admin page access table without deleting legacy RBAC tables.

create table if not exists public.admin_employee_page_access (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.admin_team_members(id) on delete cascade,
  menu_item_key text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, menu_item_key)
);

create index if not exists admin_employee_page_access_team_member_idx
  on public.admin_employee_page_access(team_member_id, can_view);

drop trigger if exists set_updated_at_on_admin_employee_page_access on public.admin_employee_page_access;
create trigger set_updated_at_on_admin_employee_page_access
before update on public.admin_employee_page_access
for each row execute function public.set_updated_at();

alter table public.admin_employee_page_access enable row level security;

grant all on public.admin_employee_page_access to authenticated;

create or replace function public.current_admin_team_member_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select atm.id
  from public.admin_team_members atm
  where atm.profile_id = auth.uid()
    and atm.status = 'active'
  order by atm.created_at asc
  limit 1;
$$;

grant execute on function public.current_admin_team_member_id() to authenticated;

create or replace function public.has_admin_page_access(page_key text, action text default 'view')
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with normalized as (
    select
      nullif(btrim(page_key), '') as page_key,
      case
        when lower(coalesce(action, 'view')) in ('edit', 'update', 'manage', 'write') then 'edit'
        else 'view'
      end as action
  )
  select
    (
      public.is_owner_or_super_admin()
      or exists (
        select 1
        from normalized n
        join public.admin_employee_page_access aepa
          on aepa.menu_item_key = n.page_key
        where n.page_key is not null
          and aepa.team_member_id = public.current_admin_team_member_id()
          and aepa.can_view = true
          and (
            n.action = 'view'
            or aepa.can_edit = true
          )
      )
    );
$$;

grant execute on function public.has_admin_page_access(text, text) to authenticated;

create or replace function public.has_any_admin_page_access(page_keys text[], action text default 'view')
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(coalesce(page_keys, array[]::text[])) as candidate(page_key)
    where public.has_admin_page_access(candidate.page_key, action)
  );
$$;

grant execute on function public.has_any_admin_page_access(text[], text) to authenticated;

-- Page-key to sensitive-data matrix used by backend RLS:
-- dashboard.activity -> activity_logs, admin_activity_logs
-- dashboard.revenue / finance.* -> case_finance, finance_audit_logs, partner_commissions, referral_partner_payouts
-- content.blog / content.pages / content.media / content.website -> blog_posts, faq_items, cms_pages, cms_blocks
-- partners.referral / partners.applications / partners.referralPartners / partners.referrals -> partner_applications, referral_partners, partner_commissions, referral_partner_payouts
-- people.employees / settings.access -> admin access structures remain owner-only in RLS; employee self-read is limited to own active team member record

drop policy if exists "admins read activity logs" on public.activity_logs;
create policy "admins read activity logs"
on public.activity_logs for select
to authenticated
using (public.has_admin_page_access('dashboard.activity', 'view'));

drop policy if exists "owner read admin activity logs" on public.admin_activity_logs;
drop policy if exists "admins read admin activity logs" on public.admin_activity_logs;
create policy "admins read admin activity logs"
on public.admin_activity_logs for select
to authenticated
using (public.has_admin_page_access('dashboard.activity', 'view'));

drop policy if exists "admins read case finance" on public.case_finance;
create policy "admins read case finance"
on public.case_finance for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'finance.caseFinance'
  ], 'view')
);

drop policy if exists "admins manage case finance" on public.case_finance;
drop policy if exists "admins insert case finance" on public.case_finance;
drop policy if exists "admins update case finance" on public.case_finance;
drop policy if exists "admins delete case finance" on public.case_finance;

create policy "admins insert case finance"
on public.case_finance for insert
to authenticated
with check (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'finance.caseFinance'
  ], 'edit')
);

create policy "admins update case finance"
on public.case_finance for update
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'finance.caseFinance'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'finance.caseFinance'
  ], 'edit')
);

create policy "admins delete case finance"
on public.case_finance for delete
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'finance.caseFinance'
  ], 'edit')
);

drop policy if exists "finance admins read audit logs" on public.finance_audit_logs;
create policy "finance admins read audit logs"
on public.finance_audit_logs for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions'
  ], 'view')
);

drop policy if exists "finance admins create audit logs" on public.finance_audit_logs;
create policy "finance admins create audit logs"
on public.finance_audit_logs for insert
to authenticated
with check (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.overview',
    'finance.payments',
    'finance.partnerPayouts',
    'finance.partnerCommissions'
  ], 'edit')
);

drop policy if exists "admins manage system settings" on public.system_settings;
create policy "admins manage system settings"
on public.system_settings
for all
to authenticated
using (public.is_owner_or_super_admin())
with check (public.is_owner_or_super_admin());

drop policy if exists "admins manage faq items" on public.faq_items;
drop policy if exists "admins read faq items" on public.faq_items;
create policy "admins read faq items"
on public.faq_items for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'view')
);

create policy "admins manage faq items"
on public.faq_items for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'edit')
);

drop policy if exists "admins manage blog posts" on public.blog_posts;
drop policy if exists "admins read blog posts" on public.blog_posts;
create policy "admins read blog posts"
on public.blog_posts for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.blog',
    'content.pages',
    'content.media',
    'content.website'
  ], 'view')
);

create policy "admins manage blog posts"
on public.blog_posts for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.blog',
    'content.pages',
    'content.media',
    'content.website'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'content.blog',
    'content.pages',
    'content.media',
    'content.website'
  ], 'edit')
);

drop policy if exists "admins manage cms pages" on public.cms_pages;
drop policy if exists "admins read cms pages" on public.cms_pages;
create policy "admins read cms pages"
on public.cms_pages for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'view')
);

create policy "admins manage cms pages"
on public.cms_pages for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'edit')
);

drop policy if exists "admins manage cms blocks" on public.cms_blocks;
drop policy if exists "admins read cms blocks" on public.cms_blocks;
create policy "admins read cms blocks"
on public.cms_blocks for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'view')
);

create policy "admins manage cms blocks"
on public.cms_blocks for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'content.pages',
    'content.media',
    'content.website',
    'content.blog'
  ], 'edit')
);

drop policy if exists "admins manage partner applications" on public.partner_applications;
drop policy if exists "partner program admins read partner applications" on public.partner_applications;
drop policy if exists "partner program admins manage partner applications" on public.partner_applications;
create policy "partner program admins read partner applications"
on public.partner_applications for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.applications'
  ], 'view')
);

create policy "partner program admins manage partner applications"
on public.partner_applications for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.applications'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.applications'
  ], 'edit')
);

drop policy if exists "admins read referral partners" on public.referral_partners;
drop policy if exists "admins manage referral partners" on public.referral_partners;
drop policy if exists "partner program admins read referral partners" on public.referral_partners;
drop policy if exists "partner program admins edit referral partners" on public.referral_partners;
create policy "partner program admins read referral partners"
on public.referral_partners for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.applications',
    'partners.referralPartners',
    'partners.referrals'
  ], 'view')
);

create policy "partner program admins edit referral partners"
on public.referral_partners for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.referralPartners'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.referralPartners'
  ], 'edit')
);

drop policy if exists "admins manage commissions" on public.partner_commissions;
drop policy if exists "partner program admins read commissions" on public.partner_commissions;
create policy "partner program admins read commissions"
on public.partner_commissions for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.partnerCommissions',
    'finance.partnerPayouts',
    'partners.referral',
    'partners.applications',
    'partners.referralPartners',
    'partners.referrals'
  ], 'view')
);

create policy "admins manage commissions"
on public.partner_commissions for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.partnerCommissions',
    'finance.partnerPayouts',
    'partners.referral',
    'partners.referralPartners'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.partnerCommissions',
    'finance.partnerPayouts',
    'partners.referral',
    'partners.referralPartners'
  ], 'edit')
);

drop policy if exists "admins read referral partner payouts" on public.referral_partner_payouts;
drop policy if exists "admins manage referral partner payouts" on public.referral_partner_payouts;
drop policy if exists "partner program admins read payouts" on public.referral_partner_payouts;
create policy "partner program admins read payouts"
on public.referral_partner_payouts for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'partners.referral',
    'partners.applications',
    'partners.referralPartners',
    'partners.referrals'
  ], 'view')
);

create policy "admins manage referral partner payouts"
on public.referral_partner_payouts for all
to authenticated
using (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'partners.referral',
    'partners.referralPartners'
  ], 'edit')
)
with check (
  public.has_any_admin_page_access(array[
    'dashboard.revenue',
    'finance.partnerPayouts',
    'finance.partnerCommissions',
    'partners.referral',
    'partners.referralPartners'
  ], 'edit')
);

drop policy if exists "partner program admins read referred customer finance" on public.case_finance;
create policy "partner program admins read referred customer finance"
on public.case_finance for select
to authenticated
using (
  public.has_any_admin_page_access(array[
    'partners.referral',
    'partners.applications',
    'partners.referralPartners',
    'partners.referrals'
  ], 'view')
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

drop policy if exists "employees read own admin page access" on public.admin_employee_page_access;
create policy "employees read own admin page access"
on public.admin_employee_page_access for select
to authenticated
using (
  public.current_admin_team_member_id() = admin_employee_page_access.team_member_id
);

drop policy if exists "owners read all admin page access" on public.admin_employee_page_access;
create policy "owners read all admin page access"
on public.admin_employee_page_access for select
to authenticated
using (
  public.is_owner_or_super_admin()
);

drop policy if exists "owners manage admin page access" on public.admin_employee_page_access;
create policy "owners manage admin page access"
on public.admin_employee_page_access for all
to authenticated
using (
  public.is_owner_or_super_admin()
)
with check (
  public.is_owner_or_super_admin()
);

update public.admin_roles
set is_owner_role = true,
    updated_at = now()
where code in ('owner', 'super_admin')
  and coalesce(is_owner_role, false) = false;

update public.admin_roles
set is_owner_role = false,
    updated_at = now()
where code not in ('owner', 'super_admin')
  and coalesce(is_owner_role, false) = true;
