# Distance Compensation Audit

## Scope

This audit reviews the current Fly Friendly data model and runtime flow around:

- `leads`
- `claims`
- `flight_checks`
- claim submission payload
- client portal display fields

The goal is to confirm where airport-linked distance logic and compensation estimate logic should live next.

No code behavior is changed in this step.

---

## 1. Summary

The project already stores airport references in multiple layers:

- `leads`
- `claims`
- `flight_checks`
- downstream `cases`

The project also already stores eligibility and compensation-related values, but they are split across different records:

- `leads.eligibility_status`
- `claims.eligibility_status`
- `claims.compensation_amount` in legacy claim flow
- `cases.estimated_compensation`
- `case_finance.compensation_amount`

Current conclusion:

- airport-based route data is already modeled well enough to support distance calculation
- the cleanest place to store an initial automatic compensation estimate for the public intake flow is **not yet centralized**
- right now the public lead flow mainly writes to `leads`
- the legacy authenticated claim flow writes to `claims` and `flight_checks`

Recommended direction from this audit:

1. use `flight_checks` as the best place for detailed eligibility / route analysis results
2. use `leads` as the best place for the public-flow eligibility outcome snapshot
3. use `cases.estimated_compensation` as the operations-facing case-level estimate after conversion
4. do not treat `claims.compensation_amount` as the primary future source of truth unless the product returns to a claims-first architecture

---

## 2. Existing Airport ID Fields

### 2.1 `leads`

Defined in:

- `supabase/sql/002_public_leads.sql`

Current airport / airline catalog link fields:

- `departure_airport_id bigint references public.airports(id)`
- `arrival_airport_id bigint references public.airports(id)`
- `airline_id bigint references public.airlines(id)`

Current text route fields:

- `departure_airport text`
- `arrival_airport text`
- `airline text`

Additional flight context:

- `scheduled_departure_date date`
- `delay_duration text`
- `disruption_type text`
- `is_direct boolean`

Meaning:

- `leads` already supports both normalized airport links and plain route labels
- this is the main public intake record in the current architecture

### 2.2 `claims`

Catalog link fields are added in:

- `supabase/sql/003_claim_catalog_links.sql`

Current added fields:

- `departure_airport_id bigint references public.airports(id)`
- `arrival_airport_id bigint references public.airports(id)`
- `airline_id bigint references public.airlines(id)`

Meaning:

- the older authenticated claim flow can also store airport references
- `claims` is still present, but the current main public claim submission now centers more on `leads`

### 2.3 `flight_checks`

Catalog link fields are added in:

- `supabase/sql/003_claim_catalog_links.sql`

Current added fields:

- `departure_airport_id bigint references public.airports(id)`
- `arrival_airport_id bigint references public.airports(id)`
- `airline_id bigint references public.airlines(id)`

Meaning:

- `flight_checks` is already the strongest candidate for storing structured route analysis
- it sits naturally next to eligibility logic in the legacy claim flow

### 2.4 `cases`

Cases currently expose route as text fields, not airport ids:

- `route_from text`
- `route_to text`

Defined in:

- `supabase/sql/006_core_operations_schema_v1.sql`

Meaning:

- once a lead becomes a case, the route is preserved as operational text
- the case layer currently does not appear to hold normalized airport ids

---

## 3. Existing Compensation Amount Fields

### 3.1 `claims.compensation_amount`

Observed in runtime code:

- `src/services/claimService.js`
- admin reads from `claims`

Current usage:

- the older authenticated claim flow uses `claims.compensation_amount`
- in `claimService`, there is still a simplified placeholder-style eligibility outcome that can write a `compensation_amount`

Current audit conclusion:

- `claims.compensation_amount` exists, but it does not appear to be the best long-term source of truth for the public lead-based intake architecture

### 3.2 `cases.estimated_compensation`

Defined in:

- `supabase/sql/006_core_operations_schema_v1.sql`

Field:

- `estimated_compensation numeric(10,2) default 0`

Current usage:

- displayed throughout admin cases
- displayed in client portal for case records
- used in reports and finance views

Current audit conclusion:

- this is currently the strongest **operations-facing** compensation estimate field
- good target after lead conversion

### 3.3 `case_finance.compensation_amount`

Defined in:

- `supabase/sql/007_cases_module_v1.sql`

Field:

- `compensation_amount numeric(10,2) not null default 0`

Current usage:

- finance layer
- client payments view
- admin finance

Current audit conclusion:

- this looks like the finance / resolved compensation amount layer
- it should not necessarily be the first public eligibility estimate field

### 3.4 `leads`

Current lead schema does **not** have a dedicated numeric compensation estimate field.

What it has instead:

- `eligibility_status`
- raw route and disruption input
- full payload in `payload jsonb`

Current audit conclusion:

- if the public lead flow is the main intake flow, then compensation estimate is currently missing from the lead schema as a first-class field

---

## 4. Existing Eligibility Fields

### 4.1 `leads`

Defined in:

- `supabase/sql/002_public_leads.sql`

Fields:

- `status`
- `stage`
- `eligibility_status`

Allowed values:

- `eligibility_status in ('pending', 'eligible', 'not_eligible')`

Meaning:

- the lead already stores the public eligibility verdict
- but it does not yet store detailed distance logic or a structured compensation band

### 4.2 `claims`

Observed in runtime code:

- `claims.status`
- `claims.eligibility_status`

Meaning:

- the older claim flow also models eligibility
- but it is less aligned with the newer lead-first public submission path

### 4.3 `flight_checks`

Observed in runtime:

- `flight_checks.raw_user_input`
- admin also reads `eligibility_results`

Meaning:

- `flight_checks` currently behaves like a structured staging record for route / airline / date / direct-flight input
- it is the best existing place to attach richer eligibility analysis without polluting top-level lead fields

### 4.4 `eligibility_results`

Observed in admin runtime:

- admin fetches `eligibility_results`
- fields include:
  - `stage`
  - `eligible`
  - `confidence`
  - `compensation_amount`
  - `currency`
  - `reason`

Meaning:

- there is already a concept of structured eligibility result records in the project
- this may become an even better place for future distance-band calculation output

Current audit conclusion:

- detailed eligibility logic is not fully centralized yet
- `eligibility_results` is promising for analysis output
- `leads.eligibility_status` is the current public intake snapshot

---

## 5. Existing `submit-claim` Payload

Defined in:

- `supabase/functions/submit-claim/index.ts`

Current payload fields relevant to route / distance logic:

- `departure`
- `destination`
- `airline`
- `date`
- `delayDuration`
- `departureAirportSource`
- `destinationAirportSource`
- `airlineSource`
- `departureAirportId`
- `destinationAirportId`
- `airlineId`
- `direct`

Current normalized write behavior:

- writes `departure_airport_id` only if source is `supabase`
- writes `arrival_airport_id` only if source is `supabase`
- writes `airline_id` only if source is `supabase`
- also writes plain text:
  - `departure_airport`
  - `arrival_airport`
  - `airline`

Validation currently requires:

- full name
- email
- flight date
- airline
- departure
- destination
- signature
- accepted terms

Current audit conclusion:

- `submit-claim` already transports everything needed to support airport-based distance calculation later
- no explicit distance, compensation band, or calculated estimate is currently included in the payload contract

---

## 6. Existing Client Portal Display Fields

### 6.1 Dashboard / claims list

Defined in:

- `src/services/clientPortalService.js`

Leads shown with:

- `lead_code`
- `status`
- `stage`
- `eligibility_status`
- `departure_airport`
- `arrival_airport`
- `airline`

Cases shown with:

- `case_code`
- `status`
- `payout_status`
- `airline`
- `route_from`
- `route_to`
- `estimated_compensation`

Meaning:

- leads currently show route + airline + eligibility state
- cases currently show route + airline + estimated compensation

### 6.2 Claim details

Client claim details page shows:

- route
- airline
- status
- payout status
- documents

For cases, it also reads:

- `estimated_compensation`

### 6.3 Payments

Client finance-facing fields come from:

- `case_finance.compensation_amount`
- `customer_payout`
- `payment_status`
- `currency`

Current audit conclusion:

- client portal already has a natural split:
  - public / early-stage lead state -> route + eligibility
  - converted case state -> route + estimated_compensation
  - finance state -> compensation_amount / payout values

---

## 7. Where Compensation Estimate Should Be Stored

### 7.1 Best current place for public intake estimate

For the **current public lead-first architecture**, the cleanest model is:

1. keep detailed route analysis in `flight_checks` or `eligibility_results`
2. keep the simple public verdict in `leads.eligibility_status`
3. add a first-class lead estimate field in the future if the UI must show estimate before case conversion

Reason:

- the main submission flow currently centers on `leads`
- but `flight_checks` / `eligibility_results` are a better place for structured calculation details
- `leads` is currently missing a dedicated numeric estimate field

### 7.2 Best current place for operations estimate

For the **case / operations layer**, the correct existing field is:

- `cases.estimated_compensation`

Reason:

- already displayed in admin and client portal
- already part of downstream business operations

### 7.3 Best current place for final finance value

For the **final financial amount**, the correct existing field is:

- `case_finance.compensation_amount`

Reason:

- already tied to finance and payout workflows

### 7.4 Field that is less ideal as future source of truth

- `claims.compensation_amount`

Reason:

- it belongs to the older claim-first flow
- current public submission architecture is centered more on `leads`
- using it as the main source of truth would keep two public intake models alive

---

## 8. Recommended Next Data Direction

Based on the current project structure, the most consistent future direction is:

### Public intake

- route + airport ids saved on `leads`
- detailed distance and eligibility logic saved on `flight_checks` and/or `eligibility_results`
- optional future `lead_estimated_compensation` if the public lead UI must display a number early

### Converted case

- `cases.estimated_compensation` remains the case-level expected amount

### Finance

- `case_finance.compensation_amount` remains the financial amount used for payout workflows

---

## 9. Final Conclusion

What already exists:

- airport ids in `leads`, `claims`, `flight_checks`
- route text in `leads` and `cases`
- eligibility status in `leads` and `claims`
- estimate fields in `claims`, `cases`, and `case_finance`
- route fields already shown in client portal

What is missing:

- a unified distance-based compensation engine
- a clearly defined structured storage location for public intake compensation estimate

Best current recommendation:

- use `flight_checks` / `eligibility_results` for detailed distance-based analysis output
- use `leads.eligibility_status` as the public intake eligibility snapshot
- use `cases.estimated_compensation` as the case-level estimate after conversion
- use `case_finance.compensation_amount` as the finance-layer amount

This preserves the project’s current lead-first architecture without forcing the system back into a claims-first model.
