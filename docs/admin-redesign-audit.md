# Admin Redesign Audit

## Scope

This audit reviews the current Fly Friendly admin panel before redesign. It covers:

- navigation and layout shell
- route guard and RBAC behavior
- module structure and responsibilities
- page density and interaction problems
- sidebar/menu logic
- user/team management logic
- refactor risks

No behavior changes are proposed in this document. This is a read-only architectural and UX audit.

## 1. Current admin navigation

Current navigation is defined in [src/admin/navigation.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/navigation.js:1) as one flat list of items with:

- `label`
- `path`
- `icon`
- `permission`

Current menu items:

- Dashboard
- Leads
- Cases
- Customers
- Tasks
- Communication
- Documents
- Partner Applications
- Referral Partners
- Finance
- Reports
- Website CMS
- Blog
- FAQ
- Users & Roles
- Trash
- Settings
- Activity Logs

Observations:

- Navigation is permission-aware but not grouped.
- The list is long for a single flat sidebar.
- Operational, content, finance, and system tools are visually mixed together.
- The menu works functionally, but it does not express clear information architecture.

## 2. Current admin modules

### Overview

- Dashboard

### Claims Operations

- Leads
- Cases
- Tasks
- Communication
- Documents

### Customers

- Customers

### Partner Program

- Partner Applications
- Referral Partners

### Finance

- Finance
- Reports

### Content

- Website CMS
- Blog
- FAQ

### System

- Users & Roles
- Trash
- Settings
- Activity Logs

Notes:

- Reports currently spans both operations and finance, but functionally it behaves more like a cross-functional analytics workspace.
- Documents is operationally linked to claims/cases, but it also behaves like its own registry center.
- Trash and Activity Logs are system modules, but they currently feel visually similar to day-to-day operational pages.

## 3. Current routes and layout shell

Admin routes are registered in [src/routes/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/routes/index.jsx:1).

Current route model:

- `/admin/login`
- `/admin/forbidden`
- `/admin`
- `/admin/leads`
- `/admin/cases`
- `/admin/customers`
- `/admin/tasks`
- `/admin/communication`
- `/admin/documents`
- `/admin/partner-applications`
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

The shell is implemented in [src/admin/AdminLayout.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminLayout.jsx:1).

Current shell behavior:

- fixed sidebar
- topbar with current module title
- role labels and account email
- global admin search
- mobile sidebar toggle
- sign out action

Observations:

- The shell is stable and functional.
- The layout pattern is reusable for redesign.
- The shell already includes a useful cross-module search layer.
- The search layer is more advanced than the navigation grouping itself.

## 4. Current sidebar and menu logic

Sidebar logic is driven by:

- `adminNavigation`
- `hasPermission()`
- pathname matching in `AdminLayout`

Current behavior:

- all items are rendered from one flat config
- items are filtered by permission
- active item is determined by path equality or prefix match

Strengths:

- centralized config
- permission-based visibility
- low maintenance cost for simple additions

Weaknesses:

- no menu sections
- no secondary navigation
- no distinction between primary and secondary workflows
- no context-aware subnavigation inside dense modules like Leads, Cases, Finance, or Content

Redesign implication:

- the navigation model should probably move from one flat list to grouped sections with optional subitems
- but the current permission-driven config should be preserved as the source of truth

## 5. Current RBAC and role logic

RBAC is defined in [src/admin/rbac.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/rbac.js:1).

Current normalized admin roles:

- `super_admin`
- `admin`
- `operations_manager`
- `case_manager`
- `customer_support_agent`
- `content_manager`
- `finance_manager`
- `read_only`

Legacy role mappings still exist:

- `admin -> admin`
- `manager -> operations_manager`
- `support -> customer_support_agent`
- `customer -> read_only`

Admin auth state is managed in [src/admin/AdminAuthContext.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminAuthContext.jsx:1).

Current role resolution combines:

- `profiles.role` legacy fallback
- `user_admin_roles` normalized assignments

Current route guard is in [src/admin/AdminGuards.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/admin/AdminGuards.jsx:1).

Important current behavior:

- the top-level admin shell is guarded by one permission: `dashboard.view`
- module visibility is primarily enforced by sidebar filtering
- individual pages rely on permission-aware UI behavior, but the route tree itself is not deeply permission-segmented

Current risks in RBAC:

- dual role model exists: legacy `profiles.role` plus normalized `user_admin_roles`
- some logic still syncs normalized roles back into `profiles.role`
- redesign must not assume one clean source of truth unless that migration is planned explicitly

## 6. Current team/user management logic

User and team access management lives primarily in:

- [src/pages/AdminAccess/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminAccess/index.jsx:1)
- [src/services/adminService.js](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/services/adminService.js:2514)

Current capabilities:

- list profiles
- inspect assigned roles
- assign/remove normalized admin roles
- display effective permission matrix
- move a user to trash

Important behavior:

- role assignment updates `user_admin_roles`
- then also rewrites `profiles.role` using `toLegacyRoleCode()`
- super admin is required to delete users
- deleted profiles are hidden from the active access module

Implications:

- there is already a usable access-control admin surface
- but user management is still tightly coupled to legacy compatibility
- redesign should treat “team access” as a system workspace, not just a table with checkboxes

## 7. Module-by-module audit

### Dashboard

File:

- [src/pages/Admin/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/Admin/index.jsx:1)

Current behavior:

- overview metrics
- leads table
- lead detail
- claims table
- users table
- documents/signatures data
- inline editing in multiple places

Problems:

- too much mixed operational data on the home screen
- acts as overview, work queue, detail page, and editing surface at the same time
- no single primary action
- weak prioritization

Redesign note:

- this page should become a true command center instead of a compressed multi-module dump

### Leads

File:

- [src/pages/AdminLeads/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminLeads/index.jsx:1)

Current behavior:

- pipeline metrics
- filters
- list/detail split view
- status updates
- owner assignment
- notes
- conversion to case
- document and signature visibility

Strengths:

- operationally rich
- good fit for a work queue pattern

Problems:

- too many competing actions in one detail pane
- primary action is unclear between:
  - review
  - assign
  - note
  - status update
  - convert to case

### Cases

File:

- [src/pages/AdminCases/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminCases/index.jsx:1)

Current behavior:

- metrics
- filters
- list/detail split
- case workflow updates
- linked lead/customer/finance/documents/history/tasks/communications

Problems:

- one page contains too much operational, financial, and communication detail
- high information density
- difficult to scan on first read
- likely needs tabs or subsection navigation in redesign

### Customers

File:

- [src/pages/AdminCustomers/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminCustomers/index.jsx:1)

Current behavior:

- customer metrics
- searchable customer list
- customer detail
- linked leads
- linked cases
- linked communications
- editable notes

Strengths:

- coherent “customer 360” idea

Problems:

- detail view likely mixes profile, relationship history, and notes without strong hierarchy
- primary action is limited and not visually emphasized

### Tasks

File:

- [src/pages/AdminTasks/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminTasks/index.jsx:1)

Current behavior:

- task metrics
- filters
- task table
- task detail
- create task form
- update task state

Problems:

- list/detail/create workflow is all on one screen
- primary action alternates between reviewing backlog and creating a new task

### Communication

File:

- [src/pages/AdminCommunication/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminCommunication/index.jsx:1)

Current behavior:

- communication metrics
- communication log
- filters
- detail view
- create communication form

Problems:

- combines audit trail and message composition in the same workspace
- page does not strongly distinguish “log review” from “send/add new communication”

### Documents

File:

- [src/pages/AdminDocuments/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminDocuments/index.jsx:1)

Current behavior:

- registry metrics
- filters
- document list
- detail view
- download
- trash action

Strengths:

- clearly recognizable registry pattern

Problems:

- detail vs action hierarchy could be stronger
- “review”, “download”, and “cleanup” states are not visually separated enough

### Partner Applications

File:

- [src/pages/AdminPartnerApplications/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminPartnerApplications/index.jsx:1)

Current behavior:

- application queue
- status filters
- detail drawer/pane
- approve/reject actions

Strengths:

- cleanest of the newer admin modules
- clear queue concept
- clearer primary actions than most older modules

Problems:

- still uses the same generic panel language as everything else
- could benefit from clearer “review workflow” states

### Referral Partners

File:

- [src/pages/AdminReferralPartners/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminReferralPartners/index.jsx:1)

Current behavior:

- partner metrics
- list of approved/existing partners
- create partner form
- edit partner details
- payout creation
- status changes
- linked cases/leads/commissions/payouts

Problems:

- this is one of the densest pages in the system
- mixes:
  - partner registry
  - profile editing
  - portal access control
  - payout management
  - referral performance
  - manual partner creation

Redesign note:

- should probably be split conceptually into:
  - partner registry/profile
  - performance/earnings
  - payouts/access controls

### Finance

File:

- [src/pages/AdminFinance/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminFinance/index.jsx:1)

Current behavior:

- ledger metrics
- table of finance rows
- detail editor
- payment status updates
- amount edits
- timeline

Problems:

- page mixes review, reconciliation, editing, and payout progress
- no singular “main job” is visually obvious

### Reports

File:

- [src/pages/AdminReports/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminReports/index.jsx:1)

Current behavior:

- analytics metrics
- grouped charts/lists
- top airlines/routes
- partner performance
- exports

Problems:

- it is broad and useful, but not clearly separated by business area
- could be reorganized into analytics sections instead of one long reporting board

### Website CMS

File:

- [src/pages/AdminCms/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminCms/index.jsx:1)

Current behavior:

- page list
- block list
- page editor
- block editor
- aviation catalog refresh

Problems:

- combines page management, block management, and catalog refresh in one place
- aviation catalog refresh is operationally unrelated to page/block editing and weakens conceptual clarity

### Blog

File:

- [src/pages/AdminBlog/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminBlog/index.jsx:1)

Current behavior:

- post list
- filters
- editor
- SEO fields
- scheduling

Strengths:

- reasonably self-contained content workflow

Problems:

- editor is dense but acceptable
- still visually uses the same generic admin module pattern as system/operations pages

### FAQ

File:

- [src/pages/AdminFaq/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminFaq/index.jsx:1)

Current behavior:

- FAQ list
- filters
- editor

Strengths:

- relatively simple and focused

Problems:

- less severe than other pages
- mostly a consistency issue rather than a structural failure

### Users & Roles

File:

- [src/pages/AdminAccess/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminAccess/index.jsx:1)

Current behavior:

- profiles list
- role filters
- role checkboxes
- permission visibility
- delete user action for super admin

Strengths:

- exposes real access model

Problems:

- team management is very data-centric and low-context
- users, roles, permissions, and destructive account actions share one surface

### Trash

File:

- [src/pages/AdminTrash/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminTrash/index.jsx:1)

Current behavior:

- recycle bin metrics
- item list
- restore
- permanent delete
- automatic purge notice

Strengths:

- clear operational purpose

Problems:

- reused access-module layout makes it feel like a derivative page rather than a dedicated cleanup workspace

### Settings

File:

- [src/pages/AdminSettings/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminSettings/index.jsx:1)

Current behavior:

- settings metrics
- list of settings
- editor for typed values

Strengths:

- conceptually clean

Problems:

- naming and visual language still sit closer to content tools than system configuration

### Activity Logs

File:

- [src/pages/AdminActivity/index.jsx](/Users/a1111/Documents/My%20projects/Github/fly-friendly/src/pages/AdminActivity/index.jsx:1)

Current behavior:

- audit trail table
- filter controls
- detail JSON panes

Strengths:

- clear purpose

Problems:

- raw JSON presentation is useful for power users but visually harsh
- fine for v1, but not a polished audit UX yet

## 8. Pages with too much data

The most overloaded pages today are:

- Dashboard
- Cases
- Leads
- Finance
- Referral Partners
- Website CMS

Why:

- they combine overview, edit actions, detail inspection, and adjacent workflows on one page
- they create high cognitive load
- they lack strong separation between primary action and supporting context

## 9. Pages missing clear primary actions

Pages where the main action is not obvious enough:

- Dashboard
- Leads
- Cases
- Finance
- Customers
- Communication
- Tasks
- Referral Partners

Typical pattern:

- several actions are all visible at the same level
- nothing strongly communicates “what this page is mainly for”

Examples:

- Leads: review vs assign vs convert vs note
- Cases: update workflow vs inspect linked data vs manage communication
- Finance: reconcile vs edit amounts vs inspect status
- Referral Partners: manage profile vs payouts vs portal status vs performance

## 10. UI inconsistencies

### Information architecture inconsistencies

- flat sidebar for a large system
- operational and content tools mixed together
- no module grouping in navigation

### Interaction inconsistencies

- some pages use split list/detail patterns
- some use editor + list patterns
- some use mixed registry + create forms
- primary actions move around from page to page

### Visual inconsistencies

- almost every page reuses the same hero + metric + panel stack
- system pages, content pages, and operations pages look too similar
- destructive actions and routine edits are not visually distinguished strongly enough

### Terminology inconsistencies

- partner statuses use dual legacy/current concepts
- roles exist in both normalized and legacy form
- some pages refer to “core operations”, others “business modules”, others “content system”, but these are just hero badges and not actual IA structure

## 11. What should likely be reused

Strong reusable foundations:

- `AdminLayout`
- permission-based nav config
- global admin search
- metric card pattern
- split-view pattern for queue-oriented modules
- content-system editor pattern for CMS/Blog/FAQ
- activity logging approach

Reusable module concepts:

- Partner Applications queue
- Documents center
- Trash workflow
- Users & Roles permission visibility

## 12. What likely needs refactoring in redesign

Most likely redesign targets:

- sidebar IA and grouping
- dashboard structure
- cases workspace
- leads workspace
- finance workspace
- referral partners workspace
- clearer system/tools separation
- better primary-action hierarchy across pages

## 13. Risks before refactoring

### 1. Dual role system

RBAC is not fully single-source-of-truth yet.

Risk:

- redesign might assume normalized roles only
- runtime still syncs normalized roles back into `profiles.role`

### 2. Broad route guard vs narrow page permissions

Admin routes are broadly guarded at shell level.

Risk:

- redesign that moves modules around may accidentally assume route-level permission isolation that does not actually exist yet

### 3. Module support flags and schema tolerance

Many modules tolerate missing tables/columns and show messages like:

- run SQL X to enable module Y

Risk:

- redesign must preserve graceful degradation or explicitly remove support for partial schema states

### 4. Page-level coupling

Several pages combine data from many tables:

- cases
- finance
- referral partners
- dashboard

Risk:

- visual refactor can accidentally break data dependencies if page responsibilities are split without a service-layer review

### 5. Search index assumptions

Admin global search depends on a hand-curated aggregate fetch in `fetchAdminSearchData()`.

Risk:

- if modules move or are regrouped, search result routing and labels may drift unless updated together

### 6. Legacy partner and status behavior

Partner program still carries legacy `status` plus newer `portal_status`.

Risk:

- redesign could oversimplify status display and hide meaningful operational state differences

### 7. Destructive actions inside general workspaces

Examples:

- delete user in Users & Roles
- purge in Trash
- trash actions in Documents

Risk:

- visual cleanup that minimizes controls too aggressively may make destructive actions harder to understand or safer flows less obvious

## 14. Recommended redesign framing

The current admin can be reorganized into this higher-level IA without changing business behavior first:

### Overview

- Dashboard
- Reports

### Claims Operations

- Leads
- Cases
- Tasks
- Communication
- Documents

### Customers

- Customers

### Partner Program

- Partner Applications
- Referral Partners

### Finance

- Finance

### Content

- Website CMS
- Blog
- FAQ

### System

- Users & Roles
- Trash
- Settings
- Activity Logs

This structure already matches the actual product better than the current flat menu.

## Summary

The current admin panel is functionally rich and already has a solid shell, permission-aware navigation, and broad operational coverage. The main redesign problem is not missing features. It is information architecture, action hierarchy, and workspace overload.

The biggest opportunities are:

- group the sidebar
- reduce dashboard overload
- turn Leads/Cases/Finance/Referral Partners into more focused workspaces
- make system vs content vs operations visually distinct
- preserve current RBAC and route compatibility while redesigning the surface

The biggest refactor risks are:

- dual role logic
- broad shell guard assumptions
- module support flag behavior
- data-heavy page coupling
- legacy partner status behavior
