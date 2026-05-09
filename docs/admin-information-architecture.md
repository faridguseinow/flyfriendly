# Admin Information Architecture

## Purpose

This document defines the target information architecture for the Fly Friendly admin panel before UI redesign and implementation refactor.

It does not change current code or routes. It describes the intended target structure, responsibilities, and access model for admin modules.

## Core principles

### 1. Dashboard shows attention, not all data

The admin dashboard should answer:

- what needs review now
- what is blocked
- what is overdue
- what has changed recently
- what requires action by the current user role

It should not be a compressed copy of every module.

### 2. Menu visibility is UX only

Sidebar and menu visibility improve usability.

They do not provide security.

If a module is hidden in the menu but the user still has backend access, that is not secure enough.

### 3. Permissions are security

Route guards, service-layer access, RLS, and Edge Function authorization are the real security boundary.

Menu grouping and hidden links are only presentation.

### 4. Owner / super admin must never self-lock

The top-level owner or `super_admin` must not be able to:

- remove their own critical role
- delete their own account
- remove the last super admin from the system
- accidentally hide access to recovery-critical system controls

### 5. Workspaces should have one primary job

Each module should clearly communicate:

- what this page is for
- what action is expected
- which records need attention

Supporting data should stay subordinate to the primary action.

## Target admin structure

## 1. Overview

### Dashboard

- **Purpose**
  - Show what needs attention across claims, partner reviews, finance, documents, and team workload.
- **Primary user role**
  - `super_admin`, `admin`, `operations_manager`
- **Primary action**
  - Open the next priority queue or resume active work.
- **Key metrics**
  - leads awaiting review
  - cases awaiting update
  - overdue tasks
  - pending partner applications
  - documents pending review
  - finance items pending action
- **Table columns**
  - not a full table by default
  - only short “attention widgets” or compact queues
  - for example:
    - entity
    - code
    - status
    - owner
    - age / due time
    - CTA
- **Filters**
  - my work
  - all work
  - overdue only
  - today / this week
- **Detail drawer content**
  - compact summary
  - next action
  - owner
  - link to full module
- **Empty state**
  - “No urgent items right now.”
  - show quick links to major modules
- **Dangerous actions**
  - none on dashboard directly
  - dashboard should route to workspaces for destructive actions
- **Required permission**
  - `dashboard.view`
- **Default visibility by role**
  - visible to all admin roles

### Tasks

- **Purpose**
  - Central queue for operational follow-ups, deadlines, and assigned work.
- **Primary user role**
  - `operations_manager`, `case_manager`, `customer_support_agent`
- **Primary action**
  - assign, update, or complete operational work
- **Key metrics**
  - open tasks
  - overdue tasks
  - due today
  - due this week
  - completed today
- **Table columns**
  - title
  - linked entity type
  - linked entity code
  - assigned to
  - priority
  - status
  - due date
- **Filters**
  - status
  - priority
  - assigned to
  - entity type
  - overdue
- **Detail drawer content**
  - description
  - related lead/case/customer
  - assignee
  - due date
  - status history
  - notes
- **Empty state**
  - “No tasks match this filter.”
- **Dangerous actions**
  - cancel task
  - bulk reassignment
- **Required permission**
  - `tasks.manage`
- **Default visibility by role**
  - visible to operations, case, support, admin, super admin, read only as view-only if granted

### Activity Log

- **Purpose**
  - Audit important admin actions across the system.
- **Primary user role**
  - `super_admin`, `admin`, `read_only`
- **Primary action**
  - inspect who changed what and when
- **Key metrics**
  - total actions today
  - finance actions
  - access changes
  - partner review actions
  - deletions / purges
- **Table columns**
  - timestamp
  - user
  - module
  - action
  - target type
  - target id
- **Filters**
  - module
  - action
  - user
  - date range
- **Detail drawer content**
  - previous value
  - new value
  - metadata
  - actor identity
- **Empty state**
  - “No activity found for this filter.”
- **Dangerous actions**
  - none
- **Required permission**
  - `activity_logs.view`
- **Default visibility by role**
  - visible to admin, super admin, read-only auditors if granted

## 2. Claims Operations

### Leads

- **Purpose**
  - Intake queue for new claim submissions before they become cases.
- **Primary user role**
  - `operations_manager`, `customer_support_agent`
- **Primary action**
  - review, qualify, assign, convert to case
- **Key metrics**
  - new leads
  - submitted leads
  - pending review
  - converted leads
  - not eligible
- **Table columns**
  - lead code
  - customer name
  - email
  - route
  - airline
  - eligibility status
  - estimate status
  - owner
  - created at
- **Filters**
  - status
  - stage
  - owner
  - estimate status
  - search
- **Detail drawer content**
  - passenger details
  - route and airport info
  - uploaded documents
  - signature
  - estimate fields
  - notes
  - assignment
  - convert to case CTA
- **Empty state**
  - “No leads need review right now.”
- **Dangerous actions**
  - mark not eligible
  - convert to case
  - trash linked documents
- **Required permission**
  - `leads.manage`
- **Default visibility by role**
  - visible to operations, support, admin, super admin; read-only for finance/content should be hidden by default

### Cases

- **Purpose**
  - Active claims workspace after qualification.
- **Primary user role**
  - `case_manager`, `operations_manager`
- **Primary action**
  - progress case workflow and resolve payout path
- **Key metrics**
  - active cases
  - awaiting documents
  - awaiting airline response
  - approved
  - rejected
  - paid
- **Table columns**
  - case code
  - customer
  - route
  - airline
  - case status
  - payout status
  - assigned manager
  - estimated compensation
  - updated at
- **Filters**
  - case status
  - payout status
  - manager
  - airline
  - estimate status
  - search
- **Detail drawer content**
  - linked lead summary
  - customer summary
  - route
  - distance and estimate
  - finance summary
  - tasks
  - communications
  - documents
  - status history
- **Empty state**
  - “No cases match this view.”
- **Dangerous actions**
  - reject case
  - close case
  - mark paid
- **Required permission**
  - `cases.manage`
- **Default visibility by role**
  - visible to case, operations, admin, super admin; support can have limited visibility if granted

### Documents

- **Purpose**
  - Central review and cleanup area for lead, case, claim, and signature documents.
- **Primary user role**
  - `customer_support_agent`, `operations_manager`
- **Primary action**
  - review, download, verify, trash documents
- **Key metrics**
  - total files
  - pending review
  - lead docs
  - case docs
  - signatures
- **Table columns**
  - file name
  - owner type
  - owner code
  - document type
  - status
  - uploaded at
- **Filters**
  - owner type
  - document type
  - status
  - search
- **Detail drawer content**
  - preview/download
  - owner references
  - upload metadata
  - signature metadata
  - trash action
- **Empty state**
  - “No documents match this filter.”
- **Dangerous actions**
  - move to trash
  - permanent delete only via Trash module
- **Required permission**
  - `documents.manage`
- **Default visibility by role**
  - visible to operations, support, admin, super admin

### Communications

- **Purpose**
  - Operational log of customer and airline communications.
- **Primary user role**
  - `customer_support_agent`, `case_manager`
- **Primary action**
  - record communication and review thread history
- **Key metrics**
  - inbound today
  - outbound today
  - unresolved replies
  - internal notes
- **Table columns**
  - channel
  - direction
  - entity type
  - entity code
  - customer
  - subject
  - created at
- **Filters**
  - channel
  - direction
  - entity type
  - search
- **Detail drawer content**
  - full message body
  - linked customer/case/lead
  - author
  - timestamps
  - add follow-up note
- **Empty state**
  - “No communications found.”
- **Dangerous actions**
  - none by default
  - delete/edit logs should be heavily restricted if ever added
- **Required permission**
  - `communications.manage`
- **Default visibility by role**
  - visible to support, case, operations, admin, super admin

## 3. Customers

### Customers

- **Purpose**
  - 360-degree customer record across leads, cases, communications, and payouts.
- **Primary user role**
  - `customer_support_agent`, `operations_manager`
- **Primary action**
  - inspect customer history and update internal notes
- **Key metrics**
  - total customers
  - total leads
  - total cases
  - approved cases
  - total compensation
- **Table columns**
  - customer name
  - email
  - phone
  - country
  - language
  - total leads
  - total cases
  - approved cases
  - total compensation
- **Filters**
  - country
  - language
  - search
- **Detail drawer content**
  - contact details
  - profile notes
  - linked leads
  - linked cases
  - communications
  - portal usage summary if available
- **Empty state**
  - “No customers found.”
- **Dangerous actions**
  - none directly
  - destructive profile actions should live in System
- **Required permission**
  - `customers.manage`
- **Default visibility by role**
  - visible to support, operations, admin, super admin

### Client Portal Users

- **Purpose**
  - View customer-facing auth accounts and access state separately from customer business records.
- **Primary user role**
  - `admin`, `super_admin`, `customer_support_agent`
- **Primary action**
  - inspect account access, reset path issues, linked profile state
- **Key metrics**
  - total client accounts
  - active accounts
  - accounts without claims
  - accounts pending onboarding
- **Table columns**
  - full name
  - email
  - role
  - account status
  - created at
  - linked claims count
  - last sign in if available
- **Filters**
  - onboarding state
  - linked claim count
  - search
- **Detail drawer content**
  - profile fields
  - linked lead/case count
  - onboarding notes
  - reset-password helper actions if supported later
- **Empty state**
  - “No portal users found.”
- **Dangerous actions**
  - disable account
  - delete account should remain system-level and highly restricted
- **Required permission**
  - `users.manage`
- **Default visibility by role**
  - visible to admin and super admin by default; support view-only if granted

## 4. Partner Program

### Partner Applications

- **Purpose**
  - Queue of inbound partner applications awaiting review.
- **Primary user role**
  - `admin`, `operations_manager`, `super_admin`
- **Primary action**
  - approve or reject applications
- **Key metrics**
  - pending
  - approved
  - rejected
  - total applications
- **Table columns**
  - full name
  - email
  - country
  - primary platform
  - audience size
  - niche
  - created at
  - status
- **Filters**
  - status
  - country
  - primary platform
  - search
- **Detail drawer content**
  - motivation
  - social links
  - content links
  - consent
  - reviewed by
  - reviewed at
  - rejection reason
- **Empty state**
  - “No partner applications in this queue.”
- **Dangerous actions**
  - approve
  - reject
- **Required permission**
  - `partners.manage`
- **Default visibility by role**
  - visible to admin, super admin, operations managers handling partnerships

### Referral Partners

- **Purpose**
  - Registry of approved partners and portal access state.
- **Primary user role**
  - `admin`, `super_admin`
- **Primary action**
  - manage partner profile and portal status
- **Key metrics**
  - approved partners
  - suspended partners
  - referred leads
  - converted claims
  - earned commission
- **Table columns**
  - partner name
  - referral code
  - portal status
  - legacy status
  - leads generated
  - cases converted
  - earned commission
  - paid commission
- **Filters**
  - portal status
  - legacy status
  - search
- **Detail drawer content**
  - profile/contact details
  - referral link
  - application origin
  - linked performance summary
  - portal access controls
- **Empty state**
  - “No approved partners found.”
- **Dangerous actions**
  - suspend partner
  - reactivate partner
  - archive partner
- **Required permission**
  - `partners.manage`
- **Default visibility by role**
  - visible to admin, super admin

### Referrals

- **Purpose**
  - Attribution log of referred visitors/leads/claims.
- **Primary user role**
  - `admin`, `operations_manager`
- **Primary action**
  - inspect attribution quality and partner-driven lead flow
- **Key metrics**
  - total referrals
  - valid referrals
  - converted referrals
  - invalid / ignored referral attempts
- **Table columns**
  - created at
  - referral code
  - partner
  - lead code
  - case code
  - status
  - source
- **Filters**
  - partner
  - status
  - date range
  - search by code
- **Detail drawer content**
  - attribution metadata
  - linked lead/case
  - validation state
  - reason codes if invalid
- **Empty state**
  - “No referrals found.”
- **Dangerous actions**
  - none by default
- **Required permission**
  - `partners.manage`
- **Default visibility by role**
  - visible to admin, super admin, operations if needed

### Partner Commissions

- **Purpose**
  - Ledger of partner commission records.
- **Primary user role**
  - `finance_manager`, `admin`
- **Primary action**
  - review and reconcile partner earnings
- **Key metrics**
  - pending commissions
  - approved commissions
  - paid commissions
  - total accrued
- **Table columns**
  - created at
  - partner
  - case code
  - amount
  - commission rate
  - status
  - approved at
  - paid at
- **Filters**
  - partner
  - status
  - date range
  - search
- **Detail drawer content**
  - source amount
  - linked claim/case
  - referral linkage
  - status history
- **Empty state**
  - “No commission records found.”
- **Dangerous actions**
  - approve commission
  - cancel commission
  - mark paid if business process allows
- **Required permission**
  - `finance.manage`
- **Default visibility by role**
  - visible to finance, admin, super admin

### Partner Payouts

- **Purpose**
  - Operational payout registry for partner disbursements.
- **Primary user role**
  - `finance_manager`, `admin`
- **Primary action**
  - create and reconcile partner payouts
- **Key metrics**
  - pending payouts
  - processing payouts
  - paid payouts
  - failed/cancelled payouts
- **Table columns**
  - created at
  - partner
  - amount
  - currency
  - payout method
  - status
  - payment reference
- **Filters**
  - partner
  - payout status
  - payment method
  - search
- **Detail drawer content**
  - linked commission/case context
  - notes
  - paid at
  - history
- **Empty state**
  - “No partner payouts found.”
- **Dangerous actions**
  - mark paid
  - cancel payout
  - edit payment reference
- **Required permission**
  - `finance.manage`
- **Default visibility by role**
  - visible to finance, admin, super admin

## 5. Finance

### Payments

- **Purpose**
  - Payment operations queue across customer payouts and settlement states.
- **Primary user role**
  - `finance_manager`
- **Primary action**
  - move payment items through payout workflow
- **Key metrics**
  - pending payouts
  - approved payouts
  - paid today
  - failed payments
- **Table columns**
  - case code
  - customer
  - payout amount
  - payment status
  - payment method
  - updated at
- **Filters**
  - status
  - method
  - manager
  - search
- **Detail drawer content**
  - linked finance summary
  - payout timeline
  - notes
  - payment references
- **Empty state**
  - “No payments found.”
- **Dangerous actions**
  - mark paid
  - cancel payment
- **Required permission**
  - `finance.manage`
- **Default visibility by role**
  - visible to finance, admin, super admin

### Case Finance

- **Purpose**
  - Financial detail workspace for case-level compensation, company fee, customer payout, and partner commission.
- **Primary user role**
  - `finance_manager`, `admin`
- **Primary action**
  - reconcile or update case-level financial values
- **Key metrics**
  - expected compensation
  - company revenue
  - customer payout total
  - partner commission total
  - pending finance reviews
- **Table columns**
  - case code
  - route
  - compensation amount
  - company fee
  - customer payout
  - partner commission
  - payment status
- **Filters**
  - payment status
  - partner-linked only
  - estimate status
  - search
- **Detail drawer content**
  - financial breakdown
  - distance estimate context
  - linked partner details
  - finance timeline
- **Empty state**
  - “No finance records found.”
- **Dangerous actions**
  - edit monetary values
  - override payout status
- **Required permission**
  - `finance.manage`
- **Default visibility by role**
  - visible to finance, admin, super admin

### Reports

- **Purpose**
  - Cross-functional analytics and export surface.
- **Primary user role**
  - `admin`, `super_admin`, `finance_manager`, `operations_manager`
- **Primary action**
  - review business performance and export summaries
- **Key metrics**
  - leads
  - cases
  - conversion
  - revenue
  - compensation
  - partner performance
- **Table columns**
  - not necessarily one table
  - module-specific report tables:
    - top routes
    - top airlines
    - partner performance
    - lead source
- **Filters**
  - date range
  - route
  - airline
  - partner
  - status
- **Detail drawer content**
  - drill-down exports
  - comparative metrics
  - route/airline partner detail
- **Empty state**
  - “No report data found for this period.”
- **Dangerous actions**
  - none
- **Required permission**
  - `reports.view`
- **Default visibility by role**
  - visible to admin, super admin, finance, operations

## 6. Content

### Blog

- **Purpose**
  - Editorial publishing workspace.
- **Primary user role**
  - `content_manager`
- **Primary action**
  - create, schedule, publish blog posts
- **Key metrics**
  - total posts
  - draft
  - scheduled
  - published
- **Table columns**
  - title
  - slug
  - locale
  - author
  - status
  - published at
- **Filters**
  - status
  - locale
  - tags
  - categories
  - search
- **Detail drawer content**
  - editor
  - SEO
  - scheduling
  - tags/categories
- **Empty state**
  - “No blog posts yet.”
- **Dangerous actions**
  - archive/unpublish
- **Required permission**
  - `content.manage`
- **Default visibility by role**
  - visible to content, admin, super admin

### FAQ

- **Purpose**
  - Structured customer help content.
- **Primary user role**
  - `content_manager`, `customer_support_agent`
- **Primary action**
  - create and publish FAQ items
- **Key metrics**
  - total items
  - draft
  - published
  - categories
- **Table columns**
  - question
  - category
  - locale
  - status
  - sort order
- **Filters**
  - category
  - status
  - locale
  - search
- **Detail drawer content**
  - question
  - answer
  - category
  - sort order
  - locale
- **Empty state**
  - “No FAQ items found.”
- **Dangerous actions**
  - archive/unpublish
- **Required permission**
  - `content.manage`
- **Default visibility by role**
  - visible to content, admin, super admin

### CMS Pages

- **Purpose**
  - Public page and block management for static or structured website pages.
- **Primary user role**
  - `content_manager`
- **Primary action**
  - edit pages and blocks
- **Key metrics**
  - pages
  - published pages
  - blocks
  - published blocks
- **Table columns**
  - page title
  - page key
  - slug
  - locale
  - status
  - updated at
- **Filters**
  - locale
  - status
  - search
- **Detail drawer content**
  - page meta
  - SEO
  - ordered blocks
  - block editor
- **Empty state**
  - “No CMS pages found.”
- **Dangerous actions**
  - unpublish page
  - destructive block changes
- **Required permission**
  - `content.manage`
- **Default visibility by role**
  - visible to content, admin, super admin

## 7. System

### Team Members

- **Purpose**
  - Directory of internal accounts with access state and role summary.
- **Primary user role**
  - `super_admin`, `admin`
- **Primary action**
  - inspect and manage who has admin access
- **Key metrics**
  - total users
  - active admins
  - blocked users
  - pending onboarding if relevant
- **Table columns**
  - full name
  - email
  - legacy role
  - assigned roles
  - account status
  - created at
- **Filters**
  - role
  - status
  - search
- **Detail drawer content**
  - account summary
  - assigned roles
  - last important actions if available
- **Empty state**
  - “No team members found.”
- **Dangerous actions**
  - delete user
  - disable access
- **Required permission**
  - `users.manage`
- **Default visibility by role**
  - visible to admin and super admin

### Roles & Permissions

- **Purpose**
  - Manage normalized role assignments and inspect effective permission surfaces.
- **Primary user role**
  - `super_admin`
- **Primary action**
  - assign or update roles safely
- **Key metrics**
  - roles
  - permissions
  - users by role
  - super admins count
- **Table columns**
  - user
  - role
  - permission count
  - assigned by
- **Filters**
  - role
  - permission group
  - search
- **Detail drawer content**
  - role toggles
  - effective permissions
  - legacy role mapping
- **Empty state**
  - “No role assignments found.”
- **Dangerous actions**
  - remove super admin
  - save invalid role combinations
- **Required permission**
  - `users.manage`
- **Default visibility by role**
  - visible to super admin by default, admin if explicitly allowed

### Menu Builder

- **Purpose**
  - UX-only configuration for admin menu grouping, labels, and ordering.
- **Primary user role**
  - `super_admin`, `content_manager` only if product decides so
- **Primary action**
  - organize navigation for usability
- **Key metrics**
  - sections
  - items
  - hidden items
- **Table columns**
  - label
  - route
  - section
  - order
  - visible by default
- **Filters**
  - section
  - visibility
- **Detail drawer content**
  - label
  - route
  - icon
  - grouping metadata
- **Empty state**
  - “No menu items configured.”
- **Dangerous actions**
  - hide critical system navigation
- **Required permission**
  - `settings.manage`
- **Default visibility by role**
  - visible to super admin only by default

Important:

- Menu Builder must never override backend permissions.
- Hidden menu items must still remain subject to RBAC.

### Settings

- **Purpose**
  - Global operational and product configuration.
- **Primary user role**
  - `super_admin`, `admin`
- **Primary action**
  - update system settings safely
- **Key metrics**
  - total settings
  - public settings
  - structured settings
  - groups
- **Table columns**
  - label
  - key
  - group
  - type
  - public/private
- **Filters**
  - group
  - value type
  - search
- **Detail drawer content**
  - typed editor
  - description
  - exposure state
- **Empty state**
  - “No settings found.”
- **Dangerous actions**
  - changing public site behavior
  - changing email endpoints
  - changing financial defaults
- **Required permission**
  - `settings.manage`
- **Default visibility by role**
  - visible to admin and super admin

### Trash

- **Purpose**
  - Restore or permanently purge soft-deleted users and documents.
- **Primary user role**
  - `super_admin`, `admin`
- **Primary action**
  - restore mistaken deletions or purge test data
- **Key metrics**
  - total trash items
  - deleted users
  - deleted documents
  - expiring soon
- **Table columns**
  - type
  - label
  - deleted at
  - purge after
  - owner
- **Filters**
  - entity type
  - expiring soon
  - search
- **Detail drawer content**
  - deletion metadata
  - owner
  - restore action
  - permanent delete action
- **Empty state**
  - “Trash is empty.”
- **Dangerous actions**
  - permanent delete
  - permanent user purge
- **Required permission**
  - `documents.manage` for document restore
  - `users.manage` for user-related actions
  - `super_admin` for permanent user deletion
- **Default visibility by role**
  - visible to admin and super admin; destructive user purge only for super admin

## Role visibility summary

### Super Admin

- visible:
  - all modules

### Admin

- visible:
  - all modules except the most sensitive self-governed super-admin-only system actions if separated later

### Operations Manager

- visible:
  - Dashboard
  - Tasks
  - Leads
  - Cases
  - Documents
  - Communications
  - Customers
  - Partner Applications
  - Referrals
  - Reports

### Case Manager

- visible:
  - Dashboard
  - Tasks
  - Cases
  - Communications
  - Documents
  - Customers

### Customer Support Agent

- visible:
  - Dashboard
  - Tasks
  - Leads
  - Customers
  - Communications
  - Documents
  - FAQ if content support overlap is desired

### Finance Manager

- visible:
  - Dashboard
  - Payments
  - Case Finance
  - Partner Commissions
  - Partner Payouts
  - Reports

### Content Manager

- visible:
  - Blog
  - FAQ
  - CMS Pages

### Read Only

- visible:
  - Dashboard
  - Reports
  - Activity Log
  - selected view-only pages only if explicitly granted

## Security and UX note

The target admin architecture should separate:

- **what the user sees in the menu**
- **what the user can open**
- **what the user can mutate**

These are not the same thing.

Target rule:

- menu visibility = usability
- route access = frontend guard
- data access = RLS / backend authorization
- destructive operations = explicit permission + confirmation + audit trail

## Recommended redesign implementation order

1. Rebuild sidebar grouping and IA labels
2. Redesign Dashboard as an attention center
3. Split Claims Operations into clearer queue-oriented workspaces
4. Split Partner Program into application, registry, referral, commission, payout surfaces
5. Separate Team Members from Roles & Permissions
6. Move Menu Builder to system-only planning if the product really needs it
7. Preserve current routes until the new IA is fully wired

## Summary

The target admin should feel like a set of focused workspaces rather than one long list of mixed modules.

The intended structure is:

- Overview
- Claims Operations
- Customers
- Partner Program
- Finance
- Content
- System

Each module should have:

- one clear purpose
- one clear primary action
- a drawer or detail area subordinate to the main table or queue
- explicit dangerous actions
- explicit permissions
- predictable default role visibility

The redesign should improve clarity without weakening RBAC or breaking legacy compatibility during migration.
