# Admin Team Backend Gap

## Current state

`/admin/team` is implemented with a safe service boundary and works for:

- viewing admin team members;
- assigning an existing profile to the admin team;
- changing the assigned role;
- suspending / reactivating a member;
- removing a member;
- showing recent activity and work-session stats if the dynamic admin foundation tables are available.

## Current limitation

Full invite-by-email onboarding is **not** wired yet.

At the moment a new team member can only be added if the email already exists in:

- `auth.users`
- `profiles`

The current UI therefore uses:

- email
- full name
- role

but the service requires a pre-existing profile.

## Remaining backend work

To support full owner-driven admin invites, the project still needs:

1. A backend admin-only invite flow
   - create auth user or invite auth user by email
   - create missing `profiles` row if needed
   - create or upsert `admin_team_members`
   - assign `user_admin_roles`
   - optionally attach dynamic `admin_roles.role_id`

2. Password setup email
   - secure set-password / invite link
   - canonical production URL
   - no localhost redirects

3. Invite status lifecycle
   - `invited`
   - `active`
   - `suspended`
   - `archived`

4. Optional admin invite / activation email template
   - invite received
   - password setup
   - role assigned
   - admin login URL

5. Activity logging for invite acceptance
   - invite created
   - invite opened
   - password set
   - first admin login

## Recommended next backend step

Create an admin-only Edge Function, for example:

- `invite-admin-team-member`

Suggested input:

- `email`
- `full_name`
- `role_id`

Suggested behavior:

1. Require owner / super admin authorization
2. Find or create auth user
3. Find or create profile
4. Create / update `admin_team_members`
5. Assign legacy `user_admin_roles`
6. Send password setup / invite email
7. Return created team member record
