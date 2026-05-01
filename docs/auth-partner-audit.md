# Fly Friendly Auth + Partner Audit

## Current Route Structure

- Public localized routes live in [src/routes/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/routes/index.jsx:1).
- Public pages already include home, claim flow, blog, about, contact, legal pages, and referral landing pages.
- Admin routes are already mounted under `/admin` with nested module routes and a dedicated login/forbidden flow.
- There are no dedicated user auth routes yet such as `/auth/login`, `/client/*`, or `/partner/*`.

## Current Auth Implementation

- Supabase client setup lives in [src/lib/supabase.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/lib/supabase.js:1).
- Basic frontend auth helpers already exist in [src/services/authService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/authService.js:1).
- The current signup/login UI is a modal used from the referral page in [src/components/ClaimStartModal/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/components/ClaimStartModal/index.jsx:1).
- Global auth state for the general site does not exist yet.
- Admin auth state already exists in [src/admin/AdminAuthContext.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminAuthContext.jsx:1).

## Current Admin Protection

- Admin access is protected by [src/admin/AdminGuards.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminGuards.jsx:1).
- Admin permissions are defined in frontend RBAC metadata in [src/admin/rbac.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/rbac.js:1).
- Database-side RBAC is already present in [supabase/sql/005_admin_foundation_rbac.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/005_admin_foundation_rbac.sql:1).
- `public.is_admin()` is already the core SQL helper and is updated in [supabase/sql/012_admin_rbac_access_fix.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/012_admin_rbac_access_fix.sql:1).

## Current Supabase Usage

- Public claim flow currently writes to `public.leads`, `public.lead_documents`, and `public.lead_signatures`.
- An older authenticated claim system also exists around `claims`, `flight_checks`, `documents`, and `claim_events` in [src/services/claimService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/claimService.js:1).
- Admin modules already operate on `leads`, `customers`, `cases`, `tasks`, `communications`, `case_finance`, `referral_partners`, `blog_posts`, `faq_items`, `cms_pages`, and RBAC tables through [src/services/adminService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/adminService.js:1).
- There is already one Supabase Edge Function for claim confirmation emails and one for catalog search.

## Current Claim Flow Submission Logic

- The active public flow is the lead-based flow in [src/pages/Claim/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Claim/index.jsx:1) using [src/services/leadService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/leadService.js:1).
- Leads can currently be created anonymously and updated during a short fresh-window using RLS from [supabase/sql/002_public_leads.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/002_public_leads.sql:1).
- The current lead flow is not linked to authenticated `profiles`, `customers`, or partner attribution beyond `referral_partner_id` fields already present on `leads` and `cases`.

## Current Referral State

- A partner registry already exists in [supabase/sql/008_referral_partners_module_v1.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/008_referral_partners_module_v1.sql:1) with `referral_partners` and `referral_partner_payouts`.
- Admin UI for partners already exists in [src/pages/AdminReferralPartners/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminReferralPartners/index.jsx:1).
- Public referral marketing page already exists in [src/pages/Referral/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Referral/index.jsx:1).
- There is no full referral attribution pipeline yet:
  - no `/r/:code` route;
  - no stored referral session utility;
  - no `referrals` join table;
  - no partner-facing portal.

## Key Gaps

- No shared site-wide AuthProvider for public/client/partner areas.
- No dedicated auth pages for login, register, forgot password, or reset password.
- No user-facing protected routes for `/client/*` or `/partner/*`.
- No direct ownership link from authenticated profiles to `customers`, `leads`, and `cases`.
- No partner-user linkage from auth profile to `referral_partners`.
- No first-class `referrals` or `partner_commissions` table yet.
- Existing `referral_partners` table must be extended instead of replaced to avoid breaking the admin module.
- Existing admin RBAC must be preserved rather than replaced by a simpler four-role model.

## Recommended Rollout

1. Extend the existing database model instead of creating parallel auth/partner tables.
2. Add ownership columns linking `profiles` to `customers`, `leads`, and `cases`.
3. Extend `referral_partners` with user-linked portal fields and add `referrals` plus `partner_commissions`.
4. Add safe RLS for self-profile reads, client ownership reads, and partner ownership reads.
5. Expand frontend auth services to ensure `profiles` exist and to load current profile and partner context.
6. Introduce a global AuthProvider and public route guards without touching the existing admin provider first.
7. Add dedicated auth pages and role-based redirect logic.
8. Build client portal on top of `leads`, `cases`, `case_documents`, and `case_finance`.
9. Add partner application flow and partner portal using the extended `referral_partners` model.
10. Add referral tracking routes and only then attach new leads/cases to partner attribution records.
