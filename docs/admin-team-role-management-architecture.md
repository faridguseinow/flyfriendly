# Admin Team & Role Management Architecture

## Purpose

This document defines the target architecture for dynamic admin team management, custom roles, permissions, menu visibility, activity logging, and work-session tracking in Fly Friendly.

It does not change current code or schema yet. It describes the intended target model and rollout path.

## Goal

Fly Friendly should support one top-level Owner / Super Admin who can:

- create team members
- deactivate or remove team members
- create, edit, deactivate, and delete custom roles
- assign permissions to roles
- assign menu visibility to roles
- view team activity and work statistics

The system must remain safe against self-lockout and privilege corruption.

## Core principles

### 1. Security and UX are separate concerns

- permissions define what a user can actually access or mutate
- menu visibility only controls what a user sees in the UI

Menu visibility must never grant backend or route access by itself.

### 2. Owner is the final authority

The owner role must:

- always retain access to team management
- always retain access to role management
- always retain access to menu builder
- always retain access to settings and recovery-critical system modules

The system must prevent destructive actions that would remove the last owner or hide critical access from the owner role.

### 3. Dynamic roles must coexist with legacy RBAC during rollout

Fly Friendly already has a static RBAC layer and legacy role mappings.

The new architecture must be introduced gradually and must not assume an instant full migration.

### 4. Auditability is mandatory

All important access-control changes must be logged with:

- actor
- target
- previous state
- new state
- timestamp
- metadata

### 5. Custom roles are business roles, not arbitrary users

Roles should be reusable role definitions with:

- code
- label
- description
- status
- system/custom flags
- assigned permissions
- assigned menu visibility

## Target database model

## 1. `admin_roles`

### Purpose

Stores system and custom role definitions.

### Suggested fields

- `id uuid primary key`
- `code text unique not null`
- `label text not null`
- `description text null`
- `status text not null default 'active'`
- `is_system boolean not null default false`
- `is_owner_role boolean not null default false`
- `rank integer not null default 0`
- `created_by uuid null references profiles(id)`
- `updated_by uuid null references profiles(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deactivated_at timestamptz null`

### Status values

- `active`
- `inactive`
- `archived`

### Notes

- `is_system = true` means the role cannot be destructively deleted
- `is_owner_role = true` should normally apply to exactly one owner-level role such as `super_admin`

## 2. `admin_permissions`

### Purpose

Stores canonical permission keys available in the system.

### Suggested fields

- `id uuid primary key`
- `code text unique not null`
- `module text not null`
- `action text not null`
- `label text not null`
- `description text null`
- `is_system boolean not null default true`
- `created_at timestamptz not null default now()`

### Examples

- `dashboard.view`
- `leads.manage`
- `cases.manage`
- `documents.manage`
- `finance.manage`
- `reports.view`
- `content.manage`
- `users.manage`
- `settings.manage`
- `activity_logs.view`
- `team.manage`
- `roles.manage`
- `menu.manage`

## 3. `admin_role_permissions`

### Purpose

Join table between roles and permissions.

### Suggested fields

- `id uuid primary key`
- `role_id uuid not null references admin_roles(id) on delete cascade`
- `permission_id uuid not null references admin_permissions(id) on delete cascade`
- `created_by uuid null references profiles(id)`
- `created_at timestamptz not null default now()`

### Constraints

- unique `(role_id, permission_id)`

## 4. `admin_team_members`

### Purpose

Stores admin-team membership and operational state separately from generic profiles/auth.

This table represents “who is on the internal team”, not just “who exists as a user”.

### Suggested fields

- `id uuid primary key`
- `profile_id uuid not null unique references profiles(id)`
- `email text not null`
- `full_name text null`
- `status text not null default 'active'`
- `employment_type text null`
- `job_title text null`
- `timezone text null`
- `last_seen_at timestamptz null`
- `invited_by uuid null references profiles(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deactivated_at timestamptz null`
- `deactivation_reason text null`

### Status values

- `active`
- `inactive`
- `invited`
- `blocked`
- `archived`

### Optional join table recommended

For multi-role assignment, the architecture should also include:

- `admin_team_member_roles`

Suggested fields:

- `id uuid primary key`
- `team_member_id uuid not null references admin_team_members(id) on delete cascade`
- `role_id uuid not null references admin_roles(id) on delete cascade`
- `assigned_by uuid null references profiles(id)`
- `created_at timestamptz not null default now()`

Constraint:

- unique `(team_member_id, role_id)`

This table is strongly recommended even if it was not explicitly listed in the requirement, because dynamic multi-role assignment is difficult to model cleanly without it.

## 5. `admin_menu_items`

### Purpose

Defines the canonical admin navigation items and section metadata.

### Suggested fields

- `id uuid primary key`
- `key text unique not null`
- `label text not null`
- `path text not null`
- `section_key text not null`
- `parent_item_id uuid null references admin_menu_items(id)`
- `icon text null`
- `sort_order integer not null default 0`
- `is_system boolean not null default true`
- `is_visible boolean not null default true`
- `required_permission_code text null`
- `is_critical boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Notes

- `required_permission_code` is optional metadata for UI routing, but route enforcement should still use guards and backend authorization
- `is_critical = true` for modules like team, roles, settings, activity, and dashboard

## 6. `admin_role_menu_visibility`

### Purpose

Defines which menu items are visible for which roles.

### Suggested fields

- `id uuid primary key`
- `role_id uuid not null references admin_roles(id) on delete cascade`
- `menu_item_id uuid not null references admin_menu_items(id) on delete cascade`
- `is_visible boolean not null default true`
- `created_by uuid null references profiles(id)`
- `created_at timestamptz not null default now()`

### Constraint

- unique `(role_id, menu_item_id)`

### Important rule

This table controls only visibility in the UI, not actual access.

## 7. `admin_activity_logs`

### Purpose

Structured audit log for admin and security-sensitive actions.

### Suggested fields

- `id uuid primary key`
- `actor_profile_id uuid null references profiles(id)`
- `actor_team_member_id uuid null references admin_team_members(id)`
- `module text not null`
- `action text not null`
- `target_entity_type text not null`
- `target_entity_id text null`
- `previous_value jsonb null`
- `new_value jsonb null`
- `meta jsonb not null default '{}'::jsonb`
- `ip_address inet null`
- `user_agent text null`
- `created_at timestamptz not null default now()`

## 8. `admin_work_sessions`

### Purpose

Tracks team activity windows for work analytics and presence.

### Suggested fields

- `id uuid primary key`
- `team_member_id uuid not null references admin_team_members(id)`
- `profile_id uuid not null references profiles(id)`
- `session_token text unique not null`
- `status text not null default 'active'`
- `started_at timestamptz not null default now()`
- `last_heartbeat_at timestamptz not null default now()`
- `ended_at timestamptz null`
- `end_reason text null`
- `ip_address inet null`
- `user_agent text null`
- `meta jsonb not null default '{}'::jsonb`

### Status values

- `active`
- `idle`
- `closed`
- `expired`

## Permission model

## 1. Permission keys

Permissions should remain module/action oriented.

Recommended format:

- `{module}.{action}`

Examples:

- `dashboard.view`
- `tasks.manage`
- `activity_logs.view`
- `leads.manage`
- `cases.manage`
- `documents.manage`
- `communications.manage`
- `customers.manage`
- `partners.manage`
- `finance.manage`
- `reports.view`
- `content.manage`
- `users.manage`
- `team.manage`
- `roles.manage`
- `menu.manage`
- `settings.manage`
- `trash.manage`

## 2. Owner role

The owner role must have:

- all permissions
- immutable critical visibility to system modules
- protection against destructive self-modification

Recommended rules:

- owner role can be renamed only if `is_owner_role` remains true
- owner role cannot be deleted
- owner role permissions cannot be reduced below full-access baseline without explicit protected migration logic

## 3. Custom roles

Custom roles should support:

- create
- edit label/description
- activate/deactivate
- assign permissions
- assign menu visibility
- assign to team members

Custom roles should not automatically bypass route guards or RLS.

## 4. System roles

System roles should exist as protected defaults.

Examples:

- Owner / Super Admin
- Admin
- Operations Manager
- Case Manager
- Customer Support
- Finance Manager
- Content Manager
- Read Only

Rules:

- system roles cannot be destructively deleted
- system roles can be deactivated only if safe and not currently required for platform recovery
- owner role can never be deactivated if it is the last owner role

## Route structure

Target routes:

- `/admin/team`
- `/admin/team/:id/activity`
- `/admin/roles`
- `/admin/menu-builder`

### `/admin/team`

Purpose:

- manage team members
- invite/create members
- activate/deactivate/remove members
- inspect roles and team state

### `/admin/team/:id/activity`

Purpose:

- inspect one team member’s activity
- audit actions
- work statistics
- session history

### `/admin/roles`

Purpose:

- list roles
- create custom roles
- edit permissions
- activate/deactivate roles
- assign menu visibility at role level

### `/admin/menu-builder`

Purpose:

- define menu grouping and role-based visibility
- preview admin navigation by role

Important:

- this route must control only UI visibility and grouping
- it must not directly define security permissions

## Security model

## 1. Menu visibility does not grant access

If a role can see:

- `/admin/finance`

that does not mean it should be allowed to access finance.

Finance access must still require:

- route guard permission
- backend permission
- RLS or service-role enforcement where needed

## 2. Route guards enforce permissions

Target behavior:

- route-level guard checks required permission
- page-level action controls check more specific mutation permissions if needed

Examples:

- open Finance page requires `finance.manage` or `finance.view` if a read-only split is introduced
- mark payout paid requires a stronger action-level permission if desired

## 3. RLS and backend functions remain the security boundary

Even if frontend hides a page:

- direct API access must still be blocked
- unauthorized function invocation must still be blocked

This means:

- RLS must remain authoritative for direct table access
- Edge Functions must verify caller identity and permissions

## 4. Owner protection rules

The system must prevent:

- removing the last owner from the team
- removing the last owner role assignment
- deleting the owner role
- hiding critical system modules from the owner role
- deleting the current actor’s own owner access

Recommended protected modules for owner visibility:

- Dashboard
- Team
- Roles
- Menu Builder
- Settings
- Activity Log
- Trash

Recommended owner safeguards:

- `is_critical` menu items cannot be hidden for owner role
- last owner check on team member deactivation
- last owner check on role unassignment
- owner self-delete blocked

## 5. Self-service safety rules

The acting owner should not be able to:

- deactivate self if last owner
- demote self if last owner
- remove own critical system visibility if it would cause lockout

## Activity logging design

## 1. What actions should be logged

The following should always be logged:

- create team member
- invite team member
- activate/deactivate/block/archive team member
- delete team member
- create role
- edit role metadata
- activate/deactivate/archive role
- assign/remove permission from role
- assign/remove role from team member
- change menu visibility for role
- change critical settings
- purge user
- restore from trash
- finance status changes
- partner approval/rejection/suspension/reactivation
- manual case workflow changes if business-critical

### Recommended log payloads

Each log should capture:

- actor
- action
- module
- target entity type
- target entity id
- previous value
- new value
- metadata
- timestamp

## 2. What should not be logged

The system should avoid logging sensitive raw secrets or unnecessary personal data.

Do not log:

- raw passwords
- reset tokens
- OTP tokens
- secret API keys
- full auth session tokens
- full payment instrument data
- sensitive personal identity documents in raw form

Also avoid excessive heartbeat spam in the main activity log. Work-session heartbeat should go into `admin_work_sessions`, not the primary audit trail.

## Work session tracking design

## 1. Login / session start

When an admin user opens the admin area successfully:

- create `admin_work_sessions` row
- store:
  - team member id
  - profile id
  - session token
  - started_at
  - last_heartbeat_at
  - status = active
  - optional IP / user agent

## 2. Heartbeat

While admin UI is open and active:

- send heartbeat periodically
- recommended interval:
  - every 60 to 180 seconds

Heartbeat updates:

- `last_heartbeat_at`
- `status = active`

Optional idle behavior:

- if no UI interaction for a threshold, mark session `idle`
- next interaction returns it to `active`

## 3. Logout / session close

On explicit logout:

- update session:
  - `status = closed`
  - `ended_at = now()`
  - `end_reason = 'logout'`

On browser close or silent timeout:

- background cleanup job or lazy session reconciliation can mark:
  - `status = expired`
  - `ended_at`
  - `end_reason = 'timeout'` or `heartbeat_expired`

## 4. Team activity statistics

`admin_work_sessions` can power:

- daily active team members
- average session length
- last seen status
- active now
- time spent by team member
- workload correlation with completed tasks or case actions

Important:

- this is operational analytics, not payroll-grade time tracking unless explicitly expanded

## Target UI responsibilities

## 1. Team management workspace

`/admin/team` should support:

- create/invite team member
- activate/deactivate/block/remove team member
- assign roles
- inspect permission summary
- inspect last activity
- inspect current session state

## 2. Role management workspace

`/admin/roles` should support:

- create custom role
- edit role metadata
- activate/deactivate role
- assign/remove permissions
- preview effective access
- protect system roles from destructive deletion

## 3. Menu builder workspace

`/admin/menu-builder` should support:

- section ordering
- item grouping
- role-based visibility preview
- per-role menu visibility matrix

It must also display warnings such as:

- “This does not grant access.”
- “Owner role must retain critical system navigation.”

## Rollout plan

## Phase 1 — Preserve existing RBAC

Keep current system working:

- static `rbac.js`
- existing `user_admin_roles`
- existing route guards
- current admin pages

Do not rip out current RBAC before the dynamic model is validated.

## Phase 2 — Add new schema side-by-side

Introduce new tables:

- `admin_roles`
- `admin_permissions`
- `admin_role_permissions`
- `admin_team_members`
- `admin_team_member_roles`
- `admin_menu_items`
- `admin_role_menu_visibility`
- `admin_activity_logs`
- `admin_work_sessions`

Seed:

- system roles
- canonical permissions
- base menu items

## Phase 3 — Read from both static and dynamic role sources

During transition:

- keep static RBAC as fallback
- allow dynamic roles to mirror system roles first
- compare effective permissions for parity

This phase is about validation, not replacement.

## Phase 4 — Build admin/team and admin/roles UI

Create new management surfaces:

- `/admin/team`
- `/admin/team/:id/activity`
- `/admin/roles`
- `/admin/menu-builder`

At first:

- restrict access to owner/super admin
- use clear warnings about preview vs enforced permissions

## Phase 5 — Introduce dynamic permission evaluation

When parity is stable:

- update route guards to use dynamic permissions first
- keep static fallback for migration safety
- verify backend function authorization aligns with dynamic permissions

## Phase 6 — Harden owner protection

Before removing fallback assumptions, ensure:

- last owner checks exist
- critical menu visibility protection exists
- owner self-lockout is blocked
- destructive owner-role edits are prevented

## Phase 7 — Reduce legacy dependence

After stable production validation:

- stop relying on legacy role mappings where possible
- reduce `profiles.role` to compatibility-only or deprecate it gradually
- keep migration documentation

## Suggested migration compatibility strategy

During migration, keep these concepts separate:

- auth identity: who the person is
- profile: user profile record
- team member: internal staff membership
- roles: reusable access definitions
- permissions: enforced capabilities
- menu visibility: UX visibility only

This separation is the key to preventing role logic from becoming tangled again.

## Summary

The target Fly Friendly team and role management architecture should provide:

- one protected owner/super admin authority
- dynamic custom roles
- dynamic permission assignment
- dynamic menu visibility
- team member lifecycle management
- audit logging
- work-session tracking
- strong self-lockout protection

The most important safety rule is:

- owner access must remain recoverable and protected

The most important rollout rule is:

- keep current RBAC alive until dynamic permissions are fully validated and stable

The most important architectural rule is:

- menu visibility is UX
- permissions are security
- backend and RLS remain the real enforcement boundary
