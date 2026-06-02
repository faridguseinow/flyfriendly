-- Add avatar_url to client/customer profiles.
-- Needed for Client Portal avatar upload and avatar display in navbar/account UI.

alter table public.profiles
  add column if not exists avatar_url text;
