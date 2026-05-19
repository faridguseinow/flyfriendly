-- Profile preferred language
-- Stores the authenticated client / partner language selection in public.profiles.

alter table public.profiles
  add column if not exists preferred_language text;
