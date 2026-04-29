alter table public.blog_posts
  add column if not exists locale text not null default 'en',
  add column if not exists read_time text,
  add column if not exists content_sections jsonb not null default '[]'::jsonb;

alter table public.blog_posts
  drop constraint if exists blog_posts_slug_key;

create unique index if not exists blog_posts_locale_slug_unique
on public.blog_posts(locale, slug);

create index if not exists blog_posts_public_idx
on public.blog_posts(locale, status, published_at desc);

grant select on public.blog_posts to anon;

drop policy if exists "public read published blog posts" on public.blog_posts;
create policy "public read published blog posts"
on public.blog_posts
for select
to anon, authenticated
using (
  status = 'published'
  and (published_at is null or published_at <= now())
);

insert into public.blog_posts (
  id,
  title,
  slug,
  excerpt,
  content,
  content_sections,
  cover_image,
  categories,
  tags,
  author_name,
  status,
  published_at,
  locale,
  read_time,
  seo_title,
  seo_description
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Know Your Air Passenger Rights',
    'air-passenger-rights',
    'Many travelers do not realize they can claim compensation for flight disruptions. Here is what you are entitled to when airlines fail you.',
    'Many travelers do not realize they can claim compensation for flight disruptions. Here is what you are entitled to when airlines fail you.',
    '[
      {"title":"What passenger rights usually cover","body":"When a flight is delayed, cancelled, overbooked, or causes a missed connection, passengers may have compensation rights depending on the route, airline responsibility, and arrival delay. The important first step is to keep your booking reference, boarding pass, and any airline messages."},
      {"title":"Why timing matters","body":"Eligibility is often tied to the final arrival time, not only the departure delay. A disruption that looks small at the gate can still become claimable if you arrive several hours late at your final destination."},
      {"title":"How Fly Friendly helps","body":"Fly Friendly checks the disruption details, organizes the claim evidence, and handles communication with the airline so passengers do not have to navigate policy language alone."}
    ]'::jsonb,
    'https://images.unsplash.com/photo-1483450388369-9ed95738483c?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    array['rights', 'compensation'],
    array['delay', 'cancellation', 'passenger rights'],
    'Fly Friendly',
    'published',
    '2025-07-22T09:00:00Z',
    'en',
    '5 min read',
    'Know Your Air Passenger Rights',
    'Learn when flight disruptions may qualify for compensation and what evidence to keep.'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Why Airlines Delay Payments',
    'why-airlines-delay-payments',
    'Ever wondered why compensation takes time? Learn what happens behind the scenes and how we speed up the process for you.',
    'Ever wondered why compensation takes time? Learn what happens behind the scenes and how we speed up the process for you.',
    '[
      {"title":"Airlines review claims carefully","body":"Compensation claims can take time because airlines review operational records, weather reports, airport restrictions, and internal disruption notes before accepting liability."},
      {"title":"Missing documents slow things down","body":"The most common delays come from incomplete passenger details, missing booking references, or unclear flight timelines. A clean claim file makes the process easier to defend."},
      {"title":"How we speed up the process","body":"We structure the claim clearly, submit the right evidence, track responses, and follow up when airlines delay decisions longer than expected."}
    ]'::jsonb,
    'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=900&q=80',
    array['process', 'compensation'],
    array['airlines', 'payments', 'claims'],
    'Fly Friendly',
    'published',
    '2025-08-10T09:00:00Z',
    'en',
    '4 min read',
    'Why Airlines Delay Payments',
    'Understand why airline compensation payments can take time and how Fly Friendly follows up.'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Top Tips for Stress-Free Travel',
    'stress-free-travel-tips',
    'Discover simple habits that make your trips smoother, from booking wisely to knowing when you are eligible for compensation.',
    'Discover simple habits that make your trips smoother, from booking wisely to knowing when you are eligible for compensation.',
    '[
      {"title":"Book with disruption risk in mind","body":"Direct flights, realistic connection windows, and morning departures can reduce the chance that one delay ruins the rest of your trip."},
      {"title":"Keep a simple travel record","body":"Save boarding passes, screenshots of delay notifications, booking confirmations, and arrival times. These details are easy to forget after a stressful travel day."},
      {"title":"Know when to check compensation","body":"If your arrival was delayed by several hours, your flight was cancelled close to departure, or you were denied boarding, it is worth checking your eligibility before moving on."}
    ]'::jsonb,
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    array['travel tips'],
    array['planning', 'travel', 'rights'],
    'Fly Friendly',
    'published',
    '2025-09-05T09:00:00Z',
    'en',
    '6 min read',
    'Top Tips for Stress-Free Travel',
    'Simple travel habits that help reduce disruption risk and preserve compensation evidence.'
  )
on conflict (locale, slug) do update
set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  content_sections = excluded.content_sections,
  cover_image = excluded.cover_image,
  categories = excluded.categories,
  tags = excluded.tags,
  author_name = excluded.author_name,
  status = excluded.status,
  published_at = excluded.published_at,
  read_time = excluded.read_time,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  updated_at = now();
