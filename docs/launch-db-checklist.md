# Launch DB Checklist

This checklist covers the two local SQL migrations that were pending before launch:

- `supabase/sql/026_client_portal_lead_signature_access.sql`
- `supabase/sql/027_auth_user_profile_trigger_fix_reapply.sql`

## What 026 does

`026_client_portal_lead_signature_access.sql` allows authenticated users to read their own `lead_signatures` rows through RLS.

Why it matters:

- The client portal reads `lead_signatures` to show `Signature / Consent`
- Without this policy, the client portal can load claims and documents but fail to show the signature record

What it changes:

- grants `select` on `public.lead_signatures` to `authenticated`
- creates policy `"users read own lead signatures"` using `public.owns_lead(lead_id)`

Launch impact:

- Required for client portal signature access
- Not required for public claim submission itself

Idempotence:

- Safe to run more than once
- Uses `drop policy if exists ...` before `create policy ...`
- `grant select ...` is safe to repeat

## What 027 does

`027_auth_user_profile_trigger_fix_reapply.sql` repairs the `auth.users -> public.profiles` sync trigger.

Why it matters:

- Some environments still keep a legacy trigger/function path that inserts `profiles.role = 'customer'`
- The current schema expects regular clients to have `role = null`
- If the legacy trigger is still active, account creation can fail against `profiles_role_check`

What it changes:

- redefines `public.handle_auth_user_profile_sync()`
- ensures new profiles are inserted with:
  - `role = null`
  - `status = 'active'`
- preserves existing `owner` and `partner` roles on conflict
- removes only known profile-sync triggers on `auth.users`
- recreates `on_auth_user_created_sync_profile`

Launch impact:

- Required for stable auth profile creation
- Required for claim submit/account onboarding when a new auth user is created
- Important for Google/email auth flows that rely on profile sync

Idempotence:

- Safe to run more than once
- `create or replace function ...` is repeatable
- targeted trigger cleanup is repeatable
- `drop trigger if exists ...` is repeatable

## How to apply in Supabase

Run these in Supabase SQL Editor, in this order:

1. `026_client_portal_lead_signature_access.sql`
2. `027_auth_user_profile_trigger_fix_reapply.sql`

If they were already applied manually, use the verification steps below instead of reapplying blindly.

## How to verify 026 worked

Verify policy exists:

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'lead_signatures'
order by policyname;
```

Expected:

- policy `"users read own lead signatures"` exists

Functional verification:

- sign in as a real client who has a submitted claim with a signature
- open client portal:
  - `/client/documents`
  - or claim details page
- confirm `Signature / Consent` appears instead of staying missing

## How to verify 027 worked

Verify trigger function body:

```sql
select pg_get_functiondef('public.handle_auth_user_profile_sync()'::regprocedure);
```

Expected:

- insert values include `role, status`
- inserted role is `null`
- conflict update keeps only `owner` or `partner`, otherwise `null`

Verify active trigger(s) on `auth.users`:

```sql
select
  tg.tgname,
  n.nspname as function_schema,
  p.proname as function_name
from pg_trigger tg
join pg_proc p on p.oid = tg.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where tg.tgrelid = 'auth.users'::regclass
  and not tg.tgisinternal
order by tg.tgname;
```

Expected:

- `on_auth_user_created_sync_profile`
- function should be `public.handle_auth_user_profile_sync`

Functional verification:

- create a fresh account with email/password or Google
- confirm:
  - auth user is created
  - `public.profiles` row is created
  - `profiles.role` is `null` for regular client
  - registration/login flow does not fail with `profiles_role_check`

## Launch decision summary

- `026` is required if the client portal must show signature/consent correctly
- `027` is required if auth onboarding or profile creation has ever failed because of `role = 'customer'`
- If both were already applied in production, the remaining task is to commit them so repo state matches DB expectations
