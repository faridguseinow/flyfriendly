# Partner Program QA Checklist

## Scope

This checklist covers the Fly Friendly partner / referral program flow:

- public and authenticated partner applications
- admin review and approval / rejection
- partner portal access
- referral attribution
- access control and data isolation

Use this after deploying the latest partner-program frontend and Supabase Edge Functions.

---

## 1. Application

### Public applicant can submit

1. Open `/partner/apply` in an incognito window.
2. Fill all required fields:
   - `full_name`
   - `email`
   - `country`
   - `preferred_language`
   - `public_name`
   - `primary_platform`
   - `audience_size`
   - `motivation`
   - consent checkbox
3. Submit the form.

Expected:

- submission succeeds
- success / received state is shown
- a new row is created in `partner_applications`
- `status = pending`
- no row is created in `referral_partners`
- application received email is sent if email env is configured

### Logged-in user can submit

1. Log in as a normal authenticated user without partner access.
2. Open `/partner/apply`.
3. Submit a valid application.

Expected:

- submission succeeds
- `partner_applications.profile_id` is linked to the current profile when available
- `partner_applications` contains the submitted data
- no `referral_partners` row is created before approval

### Resubmission rules

1. Submit an application.
2. Try submitting again while the first application is still `pending`.

Expected:

- the system does not create duplicate active pending applications
- existing pending state is respected

---

## 2. Admin Review

### Admin sees pending applications

1. Log in as admin or manager.
2. Open `/admin/partner-applications`.

Expected:

- pending applications are shown by default
- filters work:
  - `pending`
  - `approved`
  - `rejected`
  - `all`
- row shows:
  - `full_name`
  - `email`
  - `country`
  - `primary_platform`
  - `audience_size`
  - `niche`
  - `created_at`
  - `status`

### Admin can approve

1. Open a pending application.
2. Click `Approve`.
3. Confirm the action.

Expected:

- Edge Function `approve-partner-application` is called
- application becomes `approved`
- `reviewed_by` is saved
- `reviewed_at` is saved
- auth user is created or reused by email
- `profiles` row is created or updated
- `profiles.role = partner`
- a `referral_partners` row is created or linked
- `portal_status = approved`
- partner approval email is sent if email env is configured

### Admin can reject with reason

1. Open a pending application.
2. Click `Reject`.
3. Enter a rejection reason.
4. Confirm the action.

Expected:

- reject is blocked if no rejection reason is provided
- Edge Function `reject-partner-application` is called
- application becomes `rejected`
- `rejection_reason` is saved
- `reviewed_by` is saved
- `reviewed_at` is saved
- no auth user is created
- no `referral_partners` row is created
- no partner access is granted
- rejection email is sent if email env is configured

---

## 3. Partner Portal

### Approved partner can log in

1. Approve a pending application.
2. Open the approval email.
3. Use the password setup link if this is a new user.
4. Log in.

Expected:

- approved partner can access `/partner/dashboard`
- user is redirected according to role and portal status
- referral link is visible

### Pending applicant cannot access dashboard

1. Use an applicant account that has not been approved.
2. Try to open `/partner/dashboard`.

Expected:

- access is denied
- user is redirected to `/partner/pending`

### Suspended partner cannot access dashboard

1. Suspend an approved partner from admin.
2. Log in as that partner.
3. Try to open `/partner/dashboard`.

Expected:

- access is denied
- user is redirected to `/partner/suspended`
- suspended email is sent if email env is configured

### Reactivated partner can access dashboard again

1. Reactivate a suspended partner by setting portal access back to `approved`.
2. Log in as that partner.

Expected:

- access to `/partner/dashboard` is restored
- reactivated email is sent if email env is configured

### Partner sees only own data

Log in as approved partner A.

Expected:

- `/partner/referrals` shows only partner A referrals
- `/partner/earnings` shows only partner A commissions
- `/partner/payouts` shows only partner A payouts
- no other partner’s records appear

Repeat with partner B and confirm the dataset is different and isolated.

### Partner sees limited client information only

Open `/partner/referrals`, `/partner/earnings`, and `/partner/payouts`.

Expected:

- partner sees limited references only
- no client email is shown
- no client phone is shown
- no client documents are exposed

---

## 4. Referral Tracking

### Approved referral code is accepted

1. Visit `/r/{approved-code}`.
2. Continue into claim flow.
3. Submit a claim.

Expected:

- referral code is stored
- claim flow continues normally
- a `referrals` row is created on successful claim submit
- the row is linked to the approved partner

### Suspended partner code is ignored

1. Suspend an approved partner.
2. Visit `/r/{that-code}`.
3. Continue into claim flow.

Expected:

- referral code is not stored
- no referral attribution is created
- claim flow still works normally

### Invalid code is ignored

1. Visit `/r/not-a-real-code`.
2. Continue into claim flow.

Expected:

- referral code is not stored
- no error is shown
- claim flow still works normally

### Query param tracking also works

1. Visit `/?ref={approved-code}`.
2. Continue into claim flow and submit.

Expected:

- approved code is accepted
- invalid or not-approved codes are ignored

---

## 5. Security

### Partner cannot read another partner’s data

1. Log in as partner A.
2. Try to access data belonging to partner B through UI.
3. If available, attempt direct API reads using the browser console or network replay.

Expected:

- UI only shows partner A records
- direct API access does not return partner B records

### Direct API access cannot read protected partner data

While authenticated as a partner, try direct reads against:

- `referrals`
- `partner_commissions`
- `referral_partner_payouts`
- `referral_partners`

Expected:

- only current partner rows are returned
- cross-partner rows are blocked by RLS

### Partner cannot access admin pages

1. Log in as partner.
2. Try to open:
   - `/admin`
   - `/admin/partner-applications`
   - `/admin/referral-partners`

Expected:

- access is denied
- partner is redirected away from admin routes

### Client cannot access partner dashboard

1. Log in as a normal client.
2. Try to open `/partner/dashboard`.

Expected:

- access is denied
- user is redirected to the client dashboard or partner pending state only if the account is actually a partner

---

## 6. Database Checks

After manual testing, confirm directly in Supabase:

### partner_applications

- new applications are inserted here
- status transitions are correct
- `reviewed_by` and `reviewed_at` are saved on review

### referral_partners

- no row exists before approval
- row exists after approval
- `portal_status` reflects access state

### profiles

- approved partner has `role = partner`
- rejected application does not grant partner role

### referrals

- created only for valid approved referral attribution
- linked to the correct partner

### partner_commissions / referral_partner_payouts

- partner portal only reflects current partner records

---

## 7. Pass Criteria

The partner program is ready for broader staging review when all of the following are true:

- applications go only into `partner_applications`
- approval creates partner access cleanly
- rejection does not create partner access
- partner portal access follows role + status rules
- only approved partners receive attribution
- partner data is isolated by partner id and RLS
- no client-sensitive data is exposed in partner views
