-- Partner Applications Model Update V2
-- Goal:
-- - keep partner_applications as the inbound application table;
-- - ensure the table contains all required business fields;
-- - expand status support to: pending, approved, rejected, cancelled.

alter table public.partner_applications
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists preferred_language text,
  add column if not exists public_name text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists youtube_url text,
  add column if not exists primary_platform text,
  add column if not exists audience_size text,
  add column if not exists audience_countries jsonb not null default '[]'::jsonb,
  add column if not exists niche text,
  add column if not exists content_links jsonb not null default '[]'::jsonb,
  add column if not exists motivation text,
  add column if not exists consent_accepted boolean not null default false,
  add column if not exists status text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

update public.partner_applications
set status = 'pending'
where status is null or btrim(status) = '';

alter table public.partner_applications
  alter column full_name set not null,
  alter column email set not null,
  alter column status set not null,
  alter column status set default 'pending';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'partner_applications_status_check'
      and conrelid = 'public.partner_applications'::regclass
  ) then
    alter table public.partner_applications
      drop constraint partner_applications_status_check;
  end if;

  alter table public.partner_applications
    add constraint partner_applications_status_check
    check (
      status = any (array['pending', 'approved', 'rejected', 'cancelled'])
    );
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'partner_applications_email_check'
      and conrelid = 'public.partner_applications'::regclass
  ) then
    alter table public.partner_applications
      drop constraint partner_applications_email_check;
  end if;

  alter table public.partner_applications
    add constraint partner_applications_email_check
    check (length(btrim(email)) > 0);
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'partner_applications_full_name_check'
      and conrelid = 'public.partner_applications'::regclass
  ) then
    alter table public.partner_applications
      drop constraint partner_applications_full_name_check;
  end if;

  alter table public.partner_applications
    add constraint partner_applications_full_name_check
    check (length(btrim(full_name)) > 0);
end
$$;

create index if not exists partner_applications_reviewed_by_idx
  on public.partner_applications(reviewed_by)
  where reviewed_by is not null;

create index if not exists partner_applications_preferred_language_idx
  on public.partner_applications(preferred_language)
  where preferred_language is not null;
