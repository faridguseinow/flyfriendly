# Production Supabase Checklist

This checklist audits the current Fly Friendly repo against its Supabase expectations before launch.

Checked against:

- repo root: `fly-friendly`
- latest local repo state on `main`
- current SQL files under `supabase/sql`
- current Edge Functions under `supabase/functions`

## 1. Current repo status

- `supabase/sql` contains numbered SQL files from `001` through `027`
- there are no uncommitted SQL files right now
- the two most recent launch-related SQL files are already committed:
  - `026_client_portal_lead_signature_access.sql`
  - `027_auth_user_profile_trigger_fix_reapply.sql`
  - `028_storage_buckets_and_client_read_policies.sql`

Important:

- this repo stores schema changes in `supabase/sql`, not in the standard Supabase CLI `supabase/migrations` directory
- because of that, `supabase db push` will not magically apply these files unless you first convert them into tracked CLI migrations

Practical rule:

- for the current repo layout, use `supabase db query --linked -f ...` or Supabase SQL Editor
- use `supabase db push` only after these SQL files are converted into proper CLI migrations

## 2. Intended SQL order

Apply in numeric filename order:

1. `001_admin_catalog_setup.sql`
2. `002_public_leads.sql`
3. `003_claim_catalog_links.sql`
4. `004_lead_signatures_and_admin_downloads.sql`
5. `005_admin_foundation_rbac.sql`
6. `006_core_operations_schema_v1.sql`
7. `007_cases_module_v1.sql`
8. `008_referral_partners_module_v1.sql`
9. `009_activity_logs_module_v1.sql`
10. `010_content_system_v1.sql`
11. `011_lead_confirmation_email.sql`
12. `011_public_blog_management.sql`
13. `012_admin_rbac_access_fix.sql`
14. `013_auth_customer_partner_foundation.sql`
15. `014_referral_capture_and_partner_application.sql`
16. `015_partner_profile_self_service.sql`
17. `016_admin_trash_and_soft_delete.sql`
18. `017_claim_ownership_backfill.sql`
19. `018_partner_applications_foundation.sql`
20. `019_profiles_role_constraint_cleanup.sql`
21. `020_partner_applications_model_update.sql`
22. `021_distance_compensation_estimate.sql`
23. `022_dynamic_admin_team_management_foundation.sql`
24. `023_owner_access_alignment.sql`
25. `024_owner_only_admin_reset.sql`
26. `025_auth_user_profile_trigger_fix.sql`
27. `026_client_portal_lead_signature_access.sql`
28. `027_auth_user_profile_trigger_fix_reapply.sql`
29. `028_storage_buckets_and_client_read_policies.sql`

Notes:

- both `011_*` files are additive and do not appear to depend on each other
- `027` is the effective auth trigger repair and supersedes the broader trigger cleanup behavior from `025`

## 3. Launch-critical SQL files

These are the SQL files most directly tied to the launch flows:

- claim intake and uploads:
  - `002_public_leads.sql`
  - `004_lead_signatures_and_admin_downloads.sql`
  - `006_core_operations_schema_v1.sql`
  - `008_referral_partners_module_v1.sql`
  - `011_lead_confirmation_email.sql`
  - `016_admin_trash_and_soft_delete.sql`
  - `021_distance_compensation_estimate.sql`
- client auth and portal data ownership:
  - `013_auth_customer_partner_foundation.sql`
  - `017_claim_ownership_backfill.sql`
  - `019_profiles_role_constraint_cleanup.sql`
  - `023_owner_access_alignment.sql`
  - `024_owner_only_admin_reset.sql`
  - `026_client_portal_lead_signature_access.sql`
  - `027_auth_user_profile_trigger_fix_reapply.sql`
- partner application and portal flows:
  - `014_referral_capture_and_partner_application.sql`
  - `015_partner_profile_self_service.sql`
  - `018_partner_applications_foundation.sql`
  - `020_partner_applications_model_update.sql`
  - `022_dynamic_admin_team_management_foundation.sql`

## 4. What 026 and 027 change

`026_client_portal_lead_signature_access.sql`

- grants `select` on `public.lead_signatures` to authenticated users
- creates policy `"users read own lead signatures"` using `public.owns_lead(lead_id)`
- required for client portal `Signature / Consent` visibility
- safe and idempotent

`027_auth_user_profile_trigger_fix_reapply.sql`

- redefines `public.handle_auth_user_profile_sync()`
- ensures auth-created client profiles use `role = null` and `status = 'active'`
- preserves existing `owner` and `partner` roles on conflict
- drops only known profile-sync triggers on `auth.users`
- recreates `on_auth_user_created_sync_profile`
- required for email/Google onboarding and claim submit account creation
- safe and idempotent

`028_storage_buckets_and_client_read_policies.sql`

- ensures private storage buckets exist for:
  - `claim-lead-documents`
  - `case-documents`
  - `claim-documents`
- adds authenticated owner-only `storage.objects` read policies for:
  - own lead documents
  - own case documents
  - own legacy claim documents when the legacy tables exist
- adds a client-safe `update` policy on `public.lead_documents` so the portal can soft-delete/replace only the user's own lead documents
- required for client preview/download of private documents in the portal
- safe and idempotent

## 5. Edge Functions to deploy

Deploy these before launch:

```bash
supabase functions deploy submit-claim
supabase functions deploy send-claim-confirmation
supabase functions deploy submit-partner-application
supabase functions deploy approve-partner-application
supabase functions deploy reject-partner-application
supabase functions deploy update-partner-portal-status
```

Current function auth expectation:

- `submit-claim`: public claim flow, `verify_jwt = false` in `supabase/config.toml`
- `send-claim-confirmation`: server-to-server style invocation, `verify_jwt = false`
- `submit-partner-application`: public partner application flow, `verify_jwt = false`
- `approve-partner-application`: protected reviewer action, relies on JWT + role checks
- `reject-partner-application`: protected reviewer action, relies on JWT + role checks
- `update-partner-portal-status`: protected reviewer action, relies on JWT + role checks

## 6. Required function secrets and environment

Supabase built-in function environment expected by code:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Custom secrets used by the current functions:

- `PUBLIC_SITE_URL` or `SITE_URL` or `APP_URL`
- `RESEND_API_KEY`
- `MAIL_FROM`
- `MAIL_REPLY_TO`
- `LEAD_ALERT_TO`

Recommended secret setup:

```bash
supabase secrets set PUBLIC_SITE_URL=https://fly-friendly.com
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set MAIL_FROM="Fly Friendly <info@fly-friendly.com>"
supabase secrets set MAIL_REPLY_TO=info@fly-friendly.com
supabase secrets set LEAD_ALERT_TO=info@fly-friendly.com
```

Notes:

- `submit-claim` depends on `send-claim-confirmation`
- if `send-claim-confirmation` fails because `RESEND_API_KEY` is missing, the entire final claim submit will fail
- partner application emails are more forgiving because those functions catch email errors, but approval/rejection/status notifications are still expected operationally

## 7. Frontend and function expectations by table

### `public.leads`

Expected by:

- claim wizard draft/save/submit flow
- `submit-claim`
- client portal home/claims/details
- referral attribution

Must exist with fields introduced across:

- `002_public_leads.sql`
- `006_core_operations_schema_v1.sql`
- `008_referral_partners_module_v1.sql`
- `011_lead_confirmation_email.sql`
- `013_auth_customer_partner_foundation.sql`
- `021_distance_compensation_estimate.sql`

Critical columns used by current code include:

- `lead_code`
- `status`
- `stage`
- `eligibility_status`
- `profile_id`
- `customer_id`
- `referral_partner_id`
- `source_details`
- `preferred_language`
- `distance_km`
- `distance_band`
- `estimated_compensation_eur`
- `compensation_currency`
- `estimate_status`
- `estimate_explanation`
- `customer_confirmation_sent_at`
- `customer_confirmation_error`

### `public.lead_documents`

Expected by:

- public claim document upload
- admin document views
- client portal documents/details

Must exist with:

- base table from `002_public_leads.sql`
- soft-delete support from `016_admin_trash_and_soft_delete.sql`
- client metadata read policy from `013_auth_customer_partner_foundation.sql`

### `public.lead_signatures`

Expected by:

- final claim submit
- client portal `Signature / Consent`
- admin views

Must exist with:

- base table from `004_lead_signatures_and_admin_downloads.sql`
- soft-delete support from `016_admin_trash_and_soft_delete.sql`
- client own-row read policy from `026_client_portal_lead_signature_access.sql`

### `public.profiles`

Expected by:

- sign up / sign in / Google sign-in
- claim submit onboarding
- client dashboard routing
- partner approval onboarding

Must exist with:

- `status` support from `013_auth_customer_partner_foundation.sql`
- role constraint cleanup from `019`, `023`, `024`
- auth sync trigger repair from `027`

### `public.customers`

Expected by:

- claim ownership sync RPC
- customer/profile linkage
- case ownership

Current submit behavior:

- `submit-claim` updates matching customers by email if they already exist
- `sync_current_profile_claim_data()` can create/link a customer from lead data after auth

### `public.cases` and `public.case_finance`

Expected by:

- client portal claims/payment views after lead-to-case conversion
- admin cases/finance flow

Current submit behavior:

- public claim submit does not create a case directly
- cases become required after admin conversion or backend workflow

### `public.referrals`, `public.referral_partners`, `public.partner_applications`

Expected by:

- referral capture
- partner applications
- partner approval/rejection/status functions

Must exist with partner-related migrations through at least:

- `013`
- `014`
- `015`
- `018`
- `020`
- `022`

## 8. Storage buckets and policies

### Bucket expectations from code

Current code expects these buckets:

- `claim-lead-documents`
- `case-documents`
- `claim-documents`

Current migration coverage:

- `claim-lead-documents` is created in `002_public_leads.sql`
- `case-documents` is referenced by SQL and frontend/admin code, but no bucket creation SQL was found
- `claim-documents` is referenced by SQL and legacy `src/services/claimService.js`, but no bucket creation SQL was found

Manual bucket check:

```sql
select id, public, file_size_limit
from storage.buckets
where id in ('claim-lead-documents', 'case-documents', 'claim-documents')
order by id;
```

Required launch result:

- `claim-lead-documents` must exist
- `case-documents` must exist if case documents are used in admin or client portal
- `claim-documents` must exist if the legacy authenticated claim flow is still active anywhere

### Current storage policy coverage

Present in SQL:

- upload policy for `claim-lead-documents`
- admin read policies for:
  - `claim-lead-documents`
  - `case-documents`
  - `claim-documents`
- admin delete policies for:
  - `claim-lead-documents`
  - `case-documents`
  - `claim-documents`

Important gap found in the repo:

- no client-facing `storage.objects for select` policy was found for authenticated users to read their own files from:
  - `claim-lead-documents`
  - `case-documents`

Why this matters:

- the client portal calls `storage.from(bucket).createSignedUrl(...)` on the browser client
- metadata RLS on `lead_documents` and `case_documents` is not enough
- without matching `storage.objects` read access, document preview/download can fail even when rows are visible

Exact next action:

- add a new SQL migration that creates authenticated `select` policies on `storage.objects` for:
  - own lead documents in `claim-lead-documents`
  - own case documents in `case-documents`
- alternatively, proxy downloads through a service-role Edge Function if you do not want direct storage RLS for clients

## 9. Auth URL configuration

Current code expects:

- Google OAuth redirect to the public site origin
- password recovery redirect to neutral routes like `/auth/reset-password`

Manual Auth config checks in Supabase:

1. Set `Site URL` to the production public origin
2. Add redirect URLs for:
   - the production origin itself
   - the `www` production origin if you keep it live
   - neutral auth routes only

Minimum examples:

- `https://fly-friendly.com`
- `https://fly-friendly.com/auth/login`
- `https://fly-friendly.com/auth/reset-password`
- `https://www.fly-friendly.com/*`

Consistency rule:

- `PUBLIC_SITE_URL` in Edge Functions
- `VITE_PUBLIC_SITE_URL` in frontend
- Supabase Auth `Site URL`

should all point to the same production public origin.

## 10. Apply commands

### Current repo reality

Because SQL files live in `supabase/sql`, the practical CLI apply flow is:

```bash
supabase db query --linked -f supabase/sql/028_storage_buckets_and_client_read_policies.sql
supabase db query --linked -f supabase/sql/026_client_portal_lead_signature_access.sql
supabase db query --linked -f supabase/sql/027_auth_user_profile_trigger_fix_reapply.sql
```

Apply other files the same way if the remote DB is not already aligned.

### If you convert these files into standard CLI migrations

Then the standard command becomes:

```bash
supabase db push
```

At the moment, treat `supabase db push` as a future cleanup step, not as the source of truth for the current `supabase/sql` folder.

## 11. Verification queries

Verify `026`:

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'lead_signatures'
order by policyname;
```

Verify `027` function:

```sql
select pg_get_functiondef('public.handle_auth_user_profile_sync()'::regprocedure);
```

Verify active custom trigger(s) on `auth.users`:

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

Verify storage buckets:

```sql
select id, public, file_size_limit
from storage.buckets
where id in ('claim-lead-documents', 'case-documents', 'claim-documents')
order by id;
```

Verify storage policies:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;
```

Verify claim ownership RPC:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'sync_current_profile_claim_data';
```

## 12. Launch blockers and unresolved risks

### Blocker 1: storage bucket creation is incomplete in SQL

Found:

- `case-documents` is expected by code but no bucket creation migration was found
- `claim-documents` is expected by code but no bucket creation migration was found

Required action:

- confirm both buckets exist in production
- if not, create them before launch or add a migration that creates them

### Blocker 2: client storage download policies appear incomplete

Found:

- client portal metadata access exists
- client `storage.objects` read policies for own files were not found

Impact:

- clients may see document rows but fail to open/download the files

Required action:

- add storage read policies for own lead/case files or serve downloads through a privileged function

### Risk 3: repo SQL is not tracked as Supabase CLI migrations

Found:

- repo uses `supabase/sql`
- no `supabase/migrations` history exists

Impact:

- `supabase db push` does not represent the real DB state today
- repo and remote DB can drift silently

Required action:

- after launch stabilization, convert the numbered SQL files into proper Supabase CLI migrations

### Risk 4: remote application of recent SQL cannot be proven from repo alone

Found:

- `026` and `027` are committed locally
- you stated they were already applied remotely
- this audit cannot verify remote DB state by itself

Required action:

- run the verification SQL above in production

## 13. Launch recommendation

Launch is close, but not fully proven yet.

High-confidence ready:

- claim intake tables and lead flow
- auth/profile trigger repair path
- partner application functions and tables
- client portal data ownership logic

Must be verified before calling Supabase fully launch-ready:

- `case-documents` bucket exists
- `claim-documents` bucket exists if legacy claim service is still reachable
- client storage download access for own files actually works
- `026` and `027` verification queries pass in production
- all six launch-related Edge Functions are deployed with required secrets
