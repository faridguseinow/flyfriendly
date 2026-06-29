alter table public.blog_posts
  add column if not exists cover_image_alt text,
  add column if not exists seo_keywords text[] not null default '{}'::text[],
  add column if not exists canonical_override text,
  add column if not exists translation_group_id uuid,
  add column if not exists translated_from_id uuid;

do $$
begin
  alter table public.blog_posts
    add constraint blog_posts_translated_from_fkey
    foreign key (translated_from_id)
    references public.blog_posts(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists blog_posts_translation_group_idx
on public.blog_posts(translation_group_id, locale);

create index if not exists blog_posts_translated_from_idx
on public.blog_posts(translated_from_id);
