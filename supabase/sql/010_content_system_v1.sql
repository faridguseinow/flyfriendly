grant usage on schema public to authenticated;

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  setting_key text not null unique,
  label text not null,
  value jsonb not null default '{}'::jsonb,
  value_type text not null default 'string',
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint system_settings_value_type_check check (value_type in ('string', 'number', 'boolean', 'json', 'array'))
);

create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'general',
  sort_order integer not null default 0,
  status text not null default 'draft',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint faq_items_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null default '',
  cover_image text,
  categories text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  author_name text,
  status text not null default 'draft',
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint blog_posts_status_check check (status in ('draft', 'published', 'scheduled', 'archived'))
);

create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  title text not null,
  slug text not null,
  status text not null default 'draft',
  seo_title text,
  seo_description text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint cms_pages_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.cms_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.cms_pages(id) on delete cascade,
  block_type text not null,
  block_key text not null,
  title text,
  body text,
  image_url text,
  cta_label text,
  cta_link text,
  sort_order integer not null default 0,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint cms_blocks_status_check check (status in ('draft', 'published', 'archived')),
  constraint cms_blocks_page_key_unique unique (page_id, block_key)
);

create index if not exists system_settings_group_idx on public.system_settings(group_key, setting_key);
create index if not exists faq_items_status_idx on public.faq_items(status, category, sort_order);
create index if not exists blog_posts_status_idx on public.blog_posts(status, published_at desc);
create index if not exists blog_posts_slug_idx on public.blog_posts(slug);
create index if not exists cms_pages_status_idx on public.cms_pages(status, page_key);
create index if not exists cms_blocks_page_idx on public.cms_blocks(page_id, sort_order);

alter table public.system_settings enable row level security;
alter table public.faq_items enable row level security;
alter table public.blog_posts enable row level security;
alter table public.cms_pages enable row level security;
alter table public.cms_blocks enable row level security;

grant select, insert, update on public.system_settings to authenticated;
grant select, insert, update on public.faq_items to authenticated;
grant select, insert, update on public.blog_posts to authenticated;
grant select, insert, update on public.cms_pages to authenticated;
grant select, insert, update on public.cms_blocks to authenticated;

drop policy if exists "admins manage system settings" on public.system_settings;
create policy "admins manage system settings"
on public.system_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage faq items" on public.faq_items;
create policy "admins manage faq items"
on public.faq_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage blog posts" on public.blog_posts;
create policy "admins manage blog posts"
on public.blog_posts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage cms pages" on public.cms_pages;
create policy "admins manage cms pages"
on public.cms_pages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage cms blocks" on public.cms_blocks;
create policy "admins manage cms blocks"
on public.cms_blocks
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.system_settings (group_key, setting_key, label, value, value_type, description, is_public)
values
  ('general', 'site_name', 'Site Name', '"Fly Friendly"'::jsonb, 'string', 'Primary public site label.', true),
  ('general', 'default_locale', 'Default Locale', '"en"'::jsonb, 'string', 'Default locale for public content.', true),
  ('claims', 'default_currency', 'Default Currency', '"EUR"'::jsonb, 'string', 'Currency used across case estimates.', false),
  ('claims', 'min_delay_hours', 'Minimum Delay Hours', '3'::jsonb, 'number', 'Threshold for delay-based eligibility.', false),
  ('notifications', 'lead_alert_email', 'Lead Alert Email', '"ops@fly-friendly.com"'::jsonb, 'string', 'Operations alert destination for new leads.', false)
on conflict (setting_key) do nothing;

insert into public.cms_pages (page_key, title, slug, status, seo_title, seo_description)
values
  ('home', 'Home', '/', 'draft', 'Fly Friendly', 'Homepage content'),
  ('about', 'About', '/about', 'draft', 'About Fly Friendly', 'About page content'),
  ('referral', 'Referral Program', '/referralProgram', 'draft', 'Referral Program', 'Referral landing content'),
  ('faq', 'FAQ', '/faq', 'draft', 'Frequently Asked Questions', 'FAQ page content'),
  ('footer', 'Footer', 'footer', 'draft', 'Footer', 'Footer blocks')
on conflict (page_key) do nothing;
