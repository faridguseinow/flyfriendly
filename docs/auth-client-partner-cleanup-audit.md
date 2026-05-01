# Auth / Client / Partner Cleanup Audit

## Scope

This audit covers the current state of:

- routes;
- auth and role resolution;
- claim submission;
- client portal;
- partner application / partner portal;
- referral attribution;
- admin partner review;
- relevant Supabase schema and Edge Functions.

The goal is to prepare a safe cleanup path for:

1. Client Claim + Client Account Flow
2. Partner / Influencer Referral Program Flow

This document is Step 1 only.
No behavior changes are proposed here.

## Current Route Structure

### Public website

- `/:lang/`
- `/:lang/claim`
- `/:lang/claim/:stage`
- `/:lang/referral`
- `/:lang/partner-program`
- `/:lang/blog`
- `/:lang/contact`
- `/:lang/about`
- `/:lang/privacyPolicy`
- `/:lang/terms`
- `/:lang/cookies`
- `/r/:referralCode`
- `/:lang/r/:referralCode`

### Auth

- `/:lang/auth/login`
- `/:lang/auth/register`
- `/:lang/auth/forgot-password`
- `/:lang/auth/reset-password`

Observations:

- There is no dedicated `/:lang/auth/set-password` route.
- `reset-password` currently lives inside `ProtectedRoute`, which conflicts with a normal recovery / invite-link flow.
- Guest auth pages are already separated with `GuestRoute`.

### Client portal

- `/:lang/client/dashboard`
- `/:lang/client/claims`
- `/:lang/client/claims/:id`
- `/:lang/client/documents`
- `/:lang/client/profile`
- `/:lang/client/payments`

Observations:

- Client area currently allows normalized roles `client` and `partner` through `RoleRoute allowedRoles={["client", "partner"]}` with `ignorePartnerStatus`.
- That means partner users are currently allowed through the client portal gate, which is against the requested separation-by-default rule.

### Partner routes

- `/:lang/partner/apply`
- `/:lang/partner/pending`
- `/:lang/partner/rejected`
- `/:lang/partner/suspended`
- `/:lang/partner/dashboard`
- `/:lang/partner/link`
- `/:lang/partner/referrals`
- `/:lang/partner/earnings`
- `/:lang/partner/payouts`
- `/:lang/partner/profile`
- `/:lang/partner/assets`

Observations:

- The portal route structure exists.
- Application, approval state pages, and dashboard pages already exist.
- The data model behind application vs approved partner is still mixed.

### Admin

- `/admin`
- `/admin/leads`
- `/admin/cases`
- `/admin/customers`
- `/admin/tasks`
- `/admin/communication`
- `/admin/documents`
- `/admin/referral-partners`
- `/admin/finance`
- `/admin/reports`
- `/admin/cms`
- `/admin/blog`
- `/admin/faq`
- `/admin/access`
- `/admin/trash`
- `/admin/settings`
- `/admin/activity`

Observations:

- There is no dedicated `/admin/partner-applications` route yet.
- Partner review currently happens inside `/admin/referral-partners`.

## Current Auth Implementation

### Frontend auth state

Files:

- `src/auth/AuthContext.jsx`
- `src/auth/AuthGuards.jsx`
- `src/auth/routeUtils.js`
- `src/pages/Auth/index.jsx`
- `src/services/authService.js`

Current behavior:

- Auth state is loaded from Supabase session.
- On session load, the app ensures a `profiles` row exists for the authenticated user.
- Role resolution is not based only on `profiles.role`.
- `getNormalizedRole(profile, partnerProfile)` currently works like this:
  - internal/admin-like roles => `admin`
  - any existing `partnerProfile` => `partner`
  - otherwise any existing `profile` => `client`

Important consequence:

- A user with any partner profile row is normalized to `partner` even if the business meaning is only "applied for partnership".
- Partner existence and partner approval are not modeled as separate concepts in auth normalization.

### Auth pages

Implemented pages:

- login
- register
- forgot password
- reset password

Missing / mismatched against target:

- no dedicated set-password page;
- reset-password requires an authenticated session gate in routing;
- recovery / invite / create-password link flow is not clearly separated from normal authenticated password change.

### Current claim-triggered account creation

`ensureClaimAccount()` currently runs from the claim flow on the frontend.

Current logic:

- if already authenticated:
  - update current profile;
  - run claim ownership sync;
- if no user exists:
  - call `signUpWithEmail(email, generatedPassword, metadata)`;
  - if email confirmation prevents a session, also call `resetPassword(email)`;
- if email already exists:
  - call `resetPassword(email)`.

Observations:

- No raw temporary password is emailed, which is good.
- However the flow is still frontend-orchestrated and split across multiple calls.
- Claim submission and account creation are not atomic.

## Current Supabase Usage

### Existing relevant tables

Core public / operations:

- `profiles`
- `leads`
- `lead_documents`
- `lead_signatures`
- `customers`
- `cases`
- `case_documents`
- `case_finance`
- `lead_notes`
- `lead_status_history`
- `case_status_history`
- `communications`
- `tasks`

Partner / referral / finance:

- `referral_partners`
- `referral_partner_payouts`
- `referrals`
- `partner_commissions`

Admin / RBAC:

- `admin_roles`
- `admin_permissions`
- `admin_role_permissions`
- `user_admin_roles`
- `trash_items`

### Existing migrations relevant to this cleanup

- `002_public_leads.sql`
- `006_core_operations_schema_v1.sql`
- `007_cases_module_v1.sql`
- `008_referral_partners_module_v1.sql`
- `013_auth_customer_partner_foundation.sql`
- `014_referral_capture_and_partner_application.sql`
- `015_partner_profile_self_service.sql`
- `016_admin_trash_and_soft_delete.sql`
- `017_claim_ownership_backfill.sql`

### Current schema direction

The project does already support:

- `profiles`
- `leads.profile_id`
- `customers.profile_id`
- `cases.profile_id`
- `leads.referral_partner_id`
- `cases.referral_partner_id`
- `referral_partners.profile_id`
- `referrals`
- `partner_commissions`
- `referral_partner_payouts`

Observations:

- The base data needed for separation exists.
- The main problem is not missing tables alone.
- The main problem is mixed lifecycle logic and late linking.

### Missing target table

There is no dedicated `partner_applications` table.

Current application flow writes directly into `referral_partners` with pending-style fields like:

- `portal_status = pending`
- `status = paused`
- application notes / bio / social fields

This is the biggest schema mismatch against the requested business flow.

## Current Edge Functions

Present:

- `supabase/functions/catalog-search/index.ts`
- `supabase/functions/send-claim-confirmation/index.ts`

Observations:

- There is no `submit-claim` Edge Function or equivalent orchestration handler.
- Claim submission is still performed from the frontend via separate service calls.
- Confirmation email sending already exists as a separate function.

## Current Claim Submit Logic

Files:

- `src/pages/Claim/index.jsx`
- `src/services/leadService.js`
- `src/services/authService.js`

### Current flow

The current claim flow is primarily frontend-driven:

1. `createLead()` inserts a lead early.
2. Step data is written back through `saveLeadStep()`.
3. Documents are uploaded through `saveLeadDocuments()`.
4. Signature is inserted through `saveLeadSignature()`.
5. Final submit updates lead status through `submitLead()`.
6. `ensureClaimAccount()` runs client auth/profile logic on the frontend.
7. `linkLeadToCurrentProfile()` runs after auth/profile logic.
8. `sendLeadConfirmationEmail()` invokes `send-claim-confirmation`.

### Current strengths

- The app can collect a lead without requiring prior login.
- Referral attribution can be attached separately.
- The confirmation email function already exists.

### Current weaknesses

- Final submit is not atomic.
- Lead creation, account creation, profile creation, lead linking, referral linking, and email sending are separate client-triggered operations.
- A partial failure can leave inconsistent state.
- Ownership is sometimes repaired later by `sync_current_profile_claim_data()` instead of being established once in a single authoritative server-side step.
- This is the main reason the client portal can appear empty even when a lead exists.

## Current Client Portal Logic

Files:

- `src/pages/ClientPortal/index.jsx`
- `src/services/clientPortalService.js`

### Current behavior

Client portal reads:

- own `leads`
- own `cases`
- own `case_finance`
- own `lead_documents`
- own `case_documents`

RLS is expected to enforce ownership by:

- `profile_id` on leads/cases
- related profile/customer ownership for downstream data

### Current dependency

Before reading dashboard data, the portal runs:

- `syncCurrentUserClaimData()`

This means the client portal currently depends on a repair/backfill RPC to stabilize ownership.

### Main issue

Portal correctness depends on linkage being repaired after login instead of claim ownership being correct at submission time.

That is workable as a migration bridge, but it should not be the final production architecture.

## Current Partner Application Logic

Files:

- `src/pages/Referral/index.jsx`
- `src/pages/PartnerApply/index.jsx`
- `src/services/partnerService.js`

### Current behavior

Partner apply requires an authenticated user and then inserts directly into `referral_partners`.

There is no separate application record.

Current application insert includes:

- `profile_id`
- `public_name`
- generated `slug`
- generated `referral_code`
- `portal_status = pending`
- `status = paused`
- social links / bio / notes

### Main issue

This mixes two different entities:

- partner application
- approved partner profile

As a result:

- auth logic sees "partner profile exists";
- admin review happens inside the approved-partner registry table;
- role normalization can drift toward partner semantics too early.

## Current Partner Portal Logic

Files:

- `src/pages/PartnerPortal/index.jsx`
- `src/services/partnerPortalService.js`

### Current behavior

Approved-style partner users can read:

- own partner profile
- own referrals
- own partner commissions
- own payout records

Portal sections already exist:

- dashboard
- link
- referrals
- earnings
- payouts
- profile
- assets

### Strengths

- Partner data is already separated from client claim ownership at the table level.
- Portal reads own partner data rather than general client data.

### Remaining problem

The lifecycle for entering this portal is not clean enough because application and partner profile are still conflated.

## Current Referral Logic

Files:

- `src/services/referralService.js`
- `src/pages/ReferralCapture/index.jsx`
- `src/App.jsx`

### Current behavior

Supported formats:

- `/r/:referralCode`
- `?ref=code`

Flow:

1. code is validated through `getPartnerByReferralCode()`;
2. approved-ish partner is looked up;
3. referral record is stored in localStorage;
4. on lead creation / claim flow, `attachReferralToLead()` upserts a `referrals` row;
5. lead is updated with `referral_partner_id`.

### Strengths

- Referral attribution is already conceptually separate from client auth.
- Referral capture does not create a client account by itself.

### Weaknesses

- Validation depends on current partner row semantics in `referral_partners`.
- Because partner application and partner profile are mixed, the code path must infer whether a row is a valid approved partner or only a pending applicant.

## Current Admin Partner Logic

Files:

- `src/pages/AdminReferralPartners/index.jsx`
- `src/services/adminService.js`

### Current behavior

Admin can already:

- view partner records;
- approve application-like rows;
- reject;
- suspend;
- return to pending;
- inspect referrals;
- inspect commissions;
- inspect payouts.

### Strengths

- Admin already has one place for partner review and partner finance.
- Commission sync helpers already exist in admin service.

### Weaknesses

- Review currently happens on `referral_partners` rows rather than a dedicated `partner_applications` pipeline.
- There is no dedicated `/admin/partner-applications` module yet.
- The admin process currently reviews mixed entity types in one table.

## Current RLS / Security Direction

Good foundations already exist:

- own profile policies;
- own leads/cases policies;
- own partner profile policies;
- own referrals/commissions/payouts policies;
- admin/all policies based on RBAC helpers;
- no temporary-password email flow;
- deleted profiles are blocked out of normal auth/admin use.

Main gap:

- the security model is mostly present, but business lifecycle correctness is not fully server-centered.
- unstable linkage can still produce confusing UX even if RLS itself is not the root problem.

## Problems Found

### High-priority domain-mixing problems

1. Claim submission is orchestrated on the frontend across separate auth, lead, referral, and email calls.
2. Client claim ownership is often established late or repaired after login instead of being finalized once.
3. Partner application and approved partner profile are stored in the same `referral_partners` entity.
4. Role normalization treats any partner profile row as `partner`, even though business approval is a separate state.
5. Client portal gate currently allows `partner` users through the client route group by default.
6. There is no dedicated set-password route for claim-created or admin-approved accounts.
7. `reset-password` currently sits behind authenticated routing, which is incompatible with a normal email recovery / invite flow.

### High-priority production-stability problems

1. Confirmation email sending is separated from claim/account orchestration and can succeed or fail independently.
2. Claim/account/referral linkage can become inconsistent if one frontend step fails after another succeeded.
3. Portal correctness depends on `sync_current_profile_claim_data()` as a repair step.

### Medium-priority product / admin problems

1. No dedicated `partner_applications` table.
2. No dedicated `/admin/partner-applications` route.
3. Approved partner lifecycle, pending applicant lifecycle, and partner self-service profile editing are all layered onto the same partner row model.

## Recommended Safe Migration Path

### Step 2 — Data model cleanup

Recommended direction:

1. Keep existing `profiles`, `leads`, `customers`, `cases`, `referrals`, `partner_commissions`, `referral_partner_payouts`.
2. Do not remove `referral_partners` immediately.
3. Add a new `partner_applications` table instead of continuing to overload `referral_partners`.
4. Treat `referral_partners` as the approved-partner registry.
5. Keep `leads.profile_id` and `cases.profile_id` as the authoritative client ownership links.
6. Keep `leads.referral_partner_id` and `cases.referral_partner_id` as the partner attribution links.

Suggested mapping:

- client owner:
  - `leads.profile_id`
  - `cases.profile_id`
- referral attribution:
  - `leads.referral_partner_id`
  - `cases.referral_partner_id`
- pending partner application:
  - `partner_applications`
- approved partner account:
  - `referral_partners`

Migration note:

- `017_claim_ownership_backfill.sql` should remain as a bridge / repair utility, not the long-term primary ownership mechanism.

### Step 3 — Client claim submission cleanup

Recommended direction:

1. Introduce a server-side submit handler, preferably `submit-claim` Edge Function.
2. Move final business orchestration into one server-side operation:
   - validate claim payload;
   - create lead;
   - create/find auth user;
   - create/find client profile;
   - link lead to profile;
   - attach referral only if valid;
   - trigger confirmation email;
   - return one success response.
3. Keep the frontend claim wizard for UX only.
4. Stop relying on multiple disconnected frontend writes for final state consistency.

### Step 4 after Step 3

1. Add a dedicated `/:lang/auth/set-password` route or equivalent recovery-compatible page.
2. Remove the dependency on `ProtectedRoute` for recovery / invite password setup.
3. Make claim-created client onboarding and admin-approved partner onboarding use the same secure password-setup path.

## Recommended Order After This Audit

1. Step 2: introduce `partner_applications` and clean data boundaries without breaking current portal reads.
2. Step 3: move final claim submit into a server-side orchestration path.
3. Then clean auth routing:
   - add `set-password`;
   - separate guest recovery from authenticated password change.
4. Then tighten portal access:
   - client routes => client only by default;
   - partner routes => approved partners only;
   - partner application => separate from approved partner profile.
5. Then split admin review:
   - `/admin/partner-applications`
   - `/admin/partners`

## Summary

The project already has most of the raw building blocks needed for the target architecture:

- auth;
- profiles;
- lead/case ownership columns;
- referral attribution columns;
- partner portal;
- admin partner controls;
- RLS foundations.

The main issue is not absence of features.

The main issue is that three domains are still partially mixed in lifecycle logic:

- claim submission;
- client identity;
- partner application / approval.

The safest cleanup path is:

1. separate partner application from approved partner profile at the data model level;
2. move final claim submission into a single server-side orchestration flow;
3. then simplify auth and portal rules around those clean boundaries.
