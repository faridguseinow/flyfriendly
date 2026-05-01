-- Partner Applications Foundation V1
-- Step 2 cleanup:
-- - keeps existing referral_partners as the approved partner profile registry;
-- - adds a separate partner_applications table for public/inbound applications;
-- - preserves current frontend compatibility until the application flow is moved.

create or replace function public.is_admin_or_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin();
$$;

grant execute on function public.is_admin_or_manager() to authenticated;

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text not null,
  full_name text not null,
  public_name text,
  phone text,
  country text,
  preferred_language text,
  primary_platform text,
  website_url text,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  content_links jsonb not null default '[]'::jsonb,
  audience_size text,
  audience_countries jsonb not null default '[]'::jsonb,
  niche text,
  bio text,
  motivation text,
  notes text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  source_partner_id uuid references public.referral_partners(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_applications_status_check check (
    status = any (array['pending', 'approved', 'rejected'])
  ),
  constraint partner_applications_email_check check (length(btrim(email)) > 0),
  constraint partner_applications_full_name_check check (length(btrim(full_name)) > 0)
);

create index if not exists partner_applications_status_idx
  on public.partner_applications(status, created_at desc);

create index if not exists partner_applications_email_idx
  on public.partner_applications(lower(email));

create index if not exists partner_applications_profile_id_idx
  on public.partner_applications(profile_id)
  where profile_id is not null;

create unique index if not exists partner_applications_source_partner_id_key
  on public.partner_applications(source_partner_id)
  where source_partner_id is not null;

alter table public.referral_partners
  add column if not exists application_id uuid references public.partner_applications(id) on delete set null;

create unique index if not exists referral_partners_application_id_key
  on public.referral_partners(application_id)
  where application_id is not null;

insert into public.partner_applications (
  profile_id,
  email,
  full_name,
  public_name,
  phone,
  website_url,
  instagram_url,
  tiktok_url,
  youtube_url,
  bio,
  motivation,
  notes,
  status,
  reviewed_at,
  rejection_reason,
  source_partner_id,
  created_at,
  updated_at
)
select
  rp.profile_id,
  coalesce(rp.contact_email, p.email) as email,
  coalesce(nullif(btrim(rp.contact_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(rp.public_name), ''), rp.name) as full_name,
  coalesce(nullif(btrim(rp.public_name), ''), rp.name) as public_name,
  coalesce(rp.contact_phone, p.phone) as phone,
  rp.website_url,
  rp.instagram_url,
  rp.tiktok_url,
  rp.youtube_url,
  rp.bio,
  coalesce(rp.application_reason, rp.notes) as motivation,
  rp.notes,
  case
    when rp.portal_status = 'rejected' then 'rejected'
    when rp.portal_status in ('approved', 'suspended') then 'approved'
    else 'pending'
  end as status,
  coalesce(rp.approved_at, rp.rejected_at) as reviewed_at,
  case
    when rp.portal_status = 'rejected' then nullif(btrim(rp.notes), '')
    else null
  end as rejection_reason,
  rp.id as source_partner_id,
  rp.created_at,
  rp.updated_at
from public.referral_partners rp
left join public.profiles p on p.id = rp.profile_id
where rp.application_id is null
  and coalesce(rp.contact_email, p.email) is not null
  and not exists (
    select 1
    from public.partner_applications pa
    where pa.source_partner_id = rp.id
  );

update public.referral_partners rp
set application_id = pa.id
from public.partner_applications pa
where rp.application_id is null
  and pa.source_partner_id = rp.id;

alter table public.partner_applications enable row level security;

grant select on public.partner_applications to authenticated;
grant insert on public.partner_applications to anon, authenticated;
grant update on public.partner_applications to authenticated;

drop policy if exists "public submit partner applications" on public.partner_applications;
create policy "public submit partner applications"
on public.partner_applications for insert
to anon, authenticated
with check (
  status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and rejection_reason is null
  and source_partner_id is null
  and (profile_id is null or profile_id = auth.uid())
);

drop policy if exists "users read own partner applications" on public.partner_applications;
create policy "users read own partner applications"
on public.partner_applications for select
to authenticated
using (
  profile_id = auth.uid()
  or lower(email) = lower(
    coalesce(
      (
        select p.email
        from public.profiles p
        where p.id = auth.uid()
      ),
      ''
    )
  )
);

drop policy if exists "admins manage partner applications" on public.partner_applications;
create policy "admins manage partner applications"
on public.partner_applications for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());
