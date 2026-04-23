-- Core Operations Schema V1
-- Expands the operational model after foundation:
-- leads, customers, cases, tasks, communications, lead notes, and lead status history.

alter table public.leads
  add column if not exists country text,
  add column if not exists preferred_language text,
  add column if not exists issue_type text,
  add column if not exists assigned_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists customer_id uuid,
  add column if not exists duplicate_of_lead_id uuid references public.leads(id) on delete set null,
  add column if not exists source_details jsonb not null default '{}'::jsonb;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  country text,
  preferred_language text,
  notes text,
  total_leads integer not null default 0,
  total_cases integer not null default 0,
  total_approved_cases integer not null default 0,
  total_compensation numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads
  add constraint leads_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  airline text,
  flight_number text,
  route_from text,
  route_to text,
  flight_date date,
  issue_type text,
  legal_basis text,
  estimated_compensation numeric(10,2) default 0,
  company_fee numeric(10,2) default 0,
  status text not null default 'draft',
  payout_status text not null default 'not_started',
  priority text not null default 'normal',
  assigned_manager_id uuid references public.profiles(id) on delete set null,
  submission_date timestamptz,
  response_date timestamptz,
  deadline_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_status_check check (
    status = any (
      array[
        'draft',
        'documents_pending',
        'ready_to_submit',
        'submitted_to_airline',
        'awaiting_response',
        'airline_replied',
        'escalated',
        'approved',
        'rejected',
        'paid',
        'closed'
      ]
    )
  ),
  constraint cases_payout_status_check check (
    payout_status = any (
      array[
        'not_started',
        'awaiting_payment',
        'payment_received',
        'customer_paid',
        'company_fee_collected',
        'referral_paid',
        'completed'
      ]
    )
  )
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  related_entity_type text not null,
  related_entity_id uuid not null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  priority text not null default 'medium',
  status text not null default 'todo',
  task_type text,
  due_date timestamptz,
  reminder_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_priority_check check (priority = any (array['low', 'medium', 'high', 'urgent'])),
  constraint tasks_status_check check (status = any (array['todo', 'in_progress', 'done', 'cancelled']))
);

create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null,
  direction text not null default 'internal',
  subject text,
  body text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint communications_channel_check check (
    channel = any (array['email', 'whatsapp', 'instagram', 'phone', 'airline', 'internal_note'])
  ),
  constraint communications_direction_check check (
    direction = any (array['inbound', 'outbound', 'internal'])
  )
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists leads_assigned_user_id_idx on public.leads(assigned_user_id);
create index if not exists leads_customer_id_idx on public.leads(customer_id);
create index if not exists leads_status_stage_idx on public.leads(status, stage);
create index if not exists leads_issue_type_idx on public.leads(issue_type);
create index if not exists customers_email_idx on public.customers(email);
create index if not exists customers_phone_idx on public.customers(phone);
create index if not exists cases_lead_id_idx on public.cases(lead_id);
create index if not exists cases_customer_id_idx on public.cases(customer_id);
create index if not exists cases_status_idx on public.cases(status);
create index if not exists tasks_related_entity_idx on public.tasks(related_entity_type, related_entity_id);
create index if not exists tasks_assigned_user_id_idx on public.tasks(assigned_user_id);
create index if not exists communications_entity_idx on public.communications(entity_type, entity_id);
create index if not exists lead_notes_lead_id_idx on public.lead_notes(lead_id, created_at desc);
create index if not exists lead_status_history_lead_id_idx on public.lead_status_history(lead_id, created_at desc);

alter table public.customers enable row level security;
alter table public.cases enable row level security;
alter table public.tasks enable row level security;
alter table public.communications enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_status_history enable row level security;

grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.cases to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert, update on public.communications to authenticated;
grant select, insert, update on public.lead_notes to authenticated;
grant select, insert on public.lead_status_history to authenticated;
grant update on public.leads to authenticated;

drop policy if exists "admins read customers" on public.customers;
create policy "admins read customers"
on public.customers for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage customers" on public.customers;
create policy "admins manage customers"
on public.customers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read cases" on public.cases;
create policy "admins read cases"
on public.cases for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage cases" on public.cases;
create policy "admins manage cases"
on public.cases for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read tasks" on public.tasks;
create policy "admins read tasks"
on public.tasks for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage tasks" on public.tasks;
create policy "admins manage tasks"
on public.tasks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read communications" on public.communications;
create policy "admins read communications"
on public.communications for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage communications" on public.communications;
create policy "admins manage communications"
on public.communications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read lead notes" on public.lead_notes;
create policy "admins read lead notes"
on public.lead_notes for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage lead notes" on public.lead_notes;
create policy "admins manage lead notes"
on public.lead_notes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read lead status history" on public.lead_status_history;
create policy "admins read lead status history"
on public.lead_status_history for select
to authenticated
using (public.is_admin());

drop policy if exists "admins create lead status history" on public.lead_status_history;
create policy "admins create lead status history"
on public.lead_status_history for insert
to authenticated
with check (public.is_admin());
