-- Allow authenticated users to read their own lead signatures in the client portal.
-- Apply after 025_auth_user_profile_trigger_fix.sql.

grant select on public.lead_signatures to authenticated;

drop policy if exists "users read own lead signatures" on public.lead_signatures;
create policy "users read own lead signatures"
on public.lead_signatures for select
to authenticated
using (public.owns_lead(lead_id));
