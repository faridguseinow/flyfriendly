# Partner Program Audit

## Scope

Audit target:

- `/partner/apply`
- `partner_applications` usage
- `referral_partners` usage
- partner portal access logic
- `/r/:code` and `?ref` tracking
- admin referral partners module
- partner statuses
- RLS policies for partner-related tables

This document describes the current implementation only. No behavior changes are included in this task.

## Current Routes

Public routes:

- `/:lang/partner-program`
- `/:lang/r/:referralCode`

Protected partner application route:

- `/:lang/partner/apply`

Protected partner status routes:

- `/:lang/partner/pending`
- `/:lang/partner/rejected`
- `/:lang/partner/suspended`

Protected partner portal routes:

- `/:lang/partner/dashboard`
- `/:lang/partner/referrals`
- `/:lang/partner/earnings`
- `/:lang/partner/payouts`
- `/:lang/partner/link`
- `/:lang/partner/profile`
- `/:lang/partner/assets`

Admin route:

- `/admin/referral-partners`

Route implementation notes:

- `/partner/apply` is not public. It is behind `ProtectedRoute` and `RoleRoute` with `allowedRoles=["client", "partner"]` and `ignorePartnerStatus`.
- `/partner-program` is the public marketing page and sends logged-out users to auth before they can apply.
- There is no separate `/admin/partner-applications` route yet.

Relevant files:

- [src/routes/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/routes/index.jsx:111)
- [src/routes/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/routes/index.jsx:184)

## Current Tables

### `referral_partners`

This is the active runtime table for both:

- approved partner profiles
- pending partner applications created from the current frontend

Current runtime usage:

- partner profile lookup
- partner portal access
- referral code ownership
- partner stats and payout totals
- current partner application writes
- admin partner management

Fields added over time include:

- `profile_id`
- `public_name`
- `slug`
- `referral_code`
- `referral_link`
- `status`
- `portal_status`
- `application_reason`
- social/profile fields
- `total_earned`
- `total_paid`
- `approved_at`
- `rejected_at`
- `suspended_at`

Primary SQL sources:

- [supabase/sql/008_referral_partners_module_v1.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/008_referral_partners_module_v1.sql:1)
- [supabase/sql/013_auth_customer_partner_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/013_auth_customer_partner_foundation.sql:40)

### `partner_applications`

This table exists in schema but is not the current runtime source for the frontend application flow.

Intended purpose:

- inbound partner applications
- separate review queue before partner approval

Current state:

- created in SQL
- backfilled from legacy `referral_partners`
- not used by current `/partner/apply`
- not used by current admin review UI

Primary SQL source:

- [supabase/sql/018_partner_applications_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/018_partner_applications_foundation.sql:19)

### `referrals`

This table is actively used for referral attribution.

Current runtime usage:

- stores captured referral visits/lead attribution
- links partner to lead/case/client profile
- feeds partner portal referral records

Primary SQL source:

- [supabase/sql/013_auth_customer_partner_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/013_auth_customer_partner_foundation.sql:120)

### `partner_commissions`

This table is actively used for partner earnings tracking.

Current runtime usage:

- partner portal earnings list
- admin commission and totals logic

Primary SQL source:

- [supabase/sql/013_auth_customer_partner_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/013_auth_customer_partner_foundation.sql:149)

### `referral_partner_payouts`

This remains the payout table in active use.

Current runtime usage:

- partner portal payout history
- admin payout management

Primary SQL source:

- [supabase/sql/008_referral_partners_module_v1.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/008_referral_partners_module_v1.sql:27)

## Current Data Flow

### 1. Public marketing page

The public partner page is [src/pages/Referral/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Referral/index.jsx:1).

Current behavior:

- if user is logged out, CTA points to `/auth/register?returnTo=%2Fpartner%2Fapply`
- if user is logged in and has no partner profile, CTA points to `/partner/apply`
- if user already has a partner profile, CTA points to dashboard or status page based on `portal_status`

This means the public page already assumes a partner application depends on auth.

### 2. Partner application submission

The current application page is [src/pages/PartnerApply/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/PartnerApply/index.jsx:1).

Current behavior:

- requires authenticated user
- checks whether a `partnerProfile` already exists
- collects a small set of fields:
  - `public_name`
  - `website_url`
  - `instagram_url`
  - `tiktok_url`
  - `youtube_url`
  - `bio`
  - `reason`
- on submit calls `applyForPartner()`

The submit service is [src/services/partnerService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/partnerService.js:1).

Current behavior of `applyForPartner()`:

- requires current logged-in profile
- checks for existing partner row
- generates `slug`
- generates `referral_code`
- inserts directly into `referral_partners`
- writes:
  - `status = "paused"`
  - `portal_status = "pending"`
  - `commission_rate = 20`
  - `referral_link = /r/{code}`

Important conclusion:

- current `/partner/apply` does not write to `partner_applications`
- current `/partner/apply` creates a pending row directly in `referral_partners`

### 3. Partner portal access logic

Partner routing is normalized in [src/auth/routeUtils.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/auth/routeUtils.js:1).

Current behavior:

- if `partnerProfile` exists, normalized role becomes `partner`
- `profile.role` is not the only source of truth
- `portal_status` is mapped as:
  - `approved` or legacy `active` -> approved
  - `suspended` or legacy `paused` -> suspended
  - `rejected` or legacy `archived` -> rejected
  - anything else -> pending

Important conclusion:

- partner access is derived implicitly from presence of `partnerProfile`
- legacy `status` values are still part of live access resolution

### 4. Referral code tracking

Referral tracking lives in:

- [src/services/referralService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/referralService.js:1)
- [src/pages/ReferralCapture/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/ReferralCapture/index.jsx:1)

Current behavior:

- `/r/:referralCode` validates code then stores referral locally and redirects to claim flow
- `?ref=code` also captures and stores attribution
- partner lookup uses `getPartnerByReferralCode()`
- final lead attachment:
  - upserts `referrals`
  - updates `leads.referral_partner_id`
  - stores source metadata on the lead

Important conclusion:

- referral attribution is already reasonably separated from partner application
- the current runtime only accepts approved referral codes through the SQL helper function

### 5. Partner portal data loading

Partner portal data comes from [src/services/partnerPortalService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/partnerPortalService.js:1).

Current behavior:

- loads current partner profile from `referral_partners`
- loads `referrals`, `partner_commissions`, `referral_partner_payouts`
- derives summary metrics client-side

Important conclusion:

- the partner portal already assumes `referral_partners` is the canonical approved partner record
- this part is functional and likely reusable

### 6. Admin partner management

Admin partner management is currently one combined module:

- [src/pages/AdminReferralPartners/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminReferralPartners/index.jsx:1)
- [src/services/adminService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/adminService.js:1771)

Current behavior:

- reads partner rows from `referral_partners`
- counts pending applications by filtering `portal_status === "pending"`
- allows status changes through the same partner record
- maps new portal states back into legacy status values

Admin status mapping currently behaves like:

- `approved` -> `active`
- `pending` -> `paused`
- `rejected` -> `archived`
- `suspended` -> `paused`

Important conclusion:

- there is no dedicated application review inbox yet
- pending applications and approved partners live in the same admin list

## Partner Status Model

Current runtime uses two overlapping status layers:

Legacy status values on `referral_partners.status`:

- `active`
- `paused`
- `archived`

Portal/business access values on `referral_partners.portal_status`:

- `pending`
- `approved`
- `rejected`
- `suspended`

Current access logic mixes both models.

Consequences:

- `paused` maps to suspended access, even though it is not a business-facing portal status
- admin writes both meanings at once
- frontend route guards still rely on legacy-to-new translation

## Current RLS Policies

### `referral_partners`

Existing policy layers:

- admins read/manage referral partners
- authenticated users can create own pending partner application row in `referral_partners`
- partners can read own partner profile
- partners can update own safe profile fields

Relevant SQL:

- [supabase/sql/008_referral_partners_module_v1.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/008_referral_partners_module_v1.sql:56)
- [supabase/sql/014_referral_capture_and_partner_application.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/014_referral_capture_and_partner_application.sql:7)
- [supabase/sql/015_partner_profile_self_service.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/015_partner_profile_self_service.sql:96)

### `partner_applications`

Existing policy layers:

- public can submit partner applications
- authenticated users can read own applications
- admins/managers can manage all applications

Important note:

- RLS is present
- runtime UI does not currently use this table

Relevant SQL:

- [supabase/sql/018_partner_applications_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/018_partner_applications_foundation.sql:137)

### `referrals`

Existing policy layers:

- public insert for referral capture
- partners read own referrals
- clients read own referrals
- admins manage referrals

Relevant SQL:

- [supabase/sql/013_auth_customer_partner_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/013_auth_customer_partner_foundation.sql:349)
- [supabase/sql/014_referral_capture_and_partner_application.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/014_referral_capture_and_partner_application.sql:19)

### `partner_commissions`

Existing policy layers:

- partners read own commissions
- admins manage commissions

Relevant SQL:

- [supabase/sql/013_auth_customer_partner_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/013_auth_customer_partner_foundation.sql:376)

### `referral_partner_payouts`

Existing policy layers:

- partners read own payouts
- admins read/manage payouts

Relevant SQL:

- [supabase/sql/008_referral_partners_module_v1.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/008_referral_partners_module_v1.sql:75)
- [supabase/sql/013_auth_customer_partner_foundation.sql](/Users/a1111/Documents/My%20projects/Github/fly-friendly/supabase/sql/013_auth_customer_partner_foundation.sql:388)

## Mixed Legacy Behavior

The current implementation mixes two different models.

### Mixed application model

- `partner_applications` exists as the intended inbound application table
- current `/partner/apply` still inserts directly into `referral_partners`

### Mixed access model

- partner access is derived from existence of a `partnerProfile`
- `profile.role` is not the single source of truth

### Mixed status model

- old operational `status`
- new business-facing `portal_status`
- route guards and admin updates translate between both

### Mixed admin model

- one admin module handles both:
  - pending partner applications
  - approved/suspended/rejected partners
- no separate admin review queue for `partner_applications`

### Mixed route intent

- public marketing page exists
- actual application requires login
- this is a product decision, but currently it is implicit rather than explicitly designed

## What Should Be Reused

These parts already provide useful foundation and should likely be preserved.

### Reuse candidate: referral tracking

- `/r/:code`
- `?ref=code`
- local storage attribution
- `referrals` table
- lead linkage through `referral_partner_id`

This part is comparatively well isolated already.

### Reuse candidate: partner portal

- existing routes
- current portal layouts/pages
- current portal data model from:
  - `referrals`
  - `partner_commissions`
  - `referral_partner_payouts`

This can remain the approved-partner experience.

### Reuse candidate: RLS foundation

- self-read policies for partner profile
- self-read policies for referrals/commissions/payouts
- admin management policies

The policy base is largely in place.

### Reuse candidate: `partner_applications` schema

- the table exists
- indexes exist
- RLS exists
- backfill logic already exists

This should become the actual source of truth for new applications.

## What Should Be Refactored

### Refactor 1: move `/partner/apply` to `partner_applications`

Current behavior writes pending applications to `referral_partners`.

Target direction:

- `/partner/apply` should create only `partner_applications`
- `referral_partners` should represent approved partner profiles only

### Refactor 2: create a real admin application review queue

Current admin UI merges applications and approved partners.

Target direction:

- separate `/admin/partner-applications`
- approve/reject from application records
- keep `/admin/referral-partners` for approved partner registry and lifecycle management

### Refactor 3: make approval an explicit business operation

Current behavior mostly changes status on an existing `referral_partners` row.

Target direction:

- approve application
- create/find auth user
- create/update profile
- create approved `referral_partners` row
- connect `application_id`
- generate final `referral_code`
- send approval onboarding email

### Refactor 4: normalize partner status handling

Current runtime still depends on legacy `status`.

Target direction:

- use `portal_status` as the business access state
- reduce legacy `status` dependency in route guards and admin logic

### Refactor 5: decide whether partner apply is public or authenticated

Current behavior requires auth.

This must become an explicit product decision:

- public application by email only
- or authenticated application only

The schema can support either, but the current implementation is midway between both.

## Recommended Safe Migration Path

1. Keep referral tracking unchanged.
2. Keep partner portal unchanged for approved partners.
3. Switch `/partner/apply` to write into `partner_applications`.
4. Add `/admin/partner-applications`.
5. Implement explicit approve/reject actions from application records.
6. After that, progressively reduce runtime dependence on legacy `status`.

## Summary

Current state:

- referral attribution is mostly workable
- partner portal is mostly workable
- `partner_applications` schema exists
- but the live application/review flow still runs on legacy `referral_partners`

Main architectural issue:

- inbound partner application flow and approved partner registry are not cleanly separated yet

Best reuse strategy:

- keep referral tracking, partner portal, and existing RLS base
- refactor application submission and admin review around `partner_applications`
