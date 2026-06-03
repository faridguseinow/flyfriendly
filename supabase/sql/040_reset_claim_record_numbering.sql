-- One-time reset for the new sequential FF/CASE series.
-- After this, the next created claim_flow lead will try FF-0001,
-- then FF-0002, and so on. The app now skips occupied values
-- automatically if a code already exists.

select setval('public.claim_record_number_seq', 1, false);
