-- Cases Module V1
-- Extends core operations with finance, status history, documents, and relations.

alter table public.cases
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists referral_partner_label text,
  add column if not exists external_reference text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.case_status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_type text not null,
  file_path text,
  file_name text not null,
  mime_type text,
  file_size bigint,
  status text not null default 'uploaded',
  source_document_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.case_finance (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  compensation_amount numeric(10,2) not null default 0,
  company_fee numeric(10,2) not null default 0,
  customer_payout numeric(10,2) not null default 0,
  referral_commission numeric(10,2) not null default 0,
  agent_bonus numeric(10,2) not null default 0,
  payment_status text not null default 'not_started',
  payment_method text,
  currency text not null default 'EUR',
  payment_received_at timestamptz,
  customer_paid_at timestamptz,
  referral_paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_finance_payment_status_check check (
    payment_status = any (
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

create table if not exists public.case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (case_id, task_id)
);

create table if not exists public.case_communications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  communication_id uuid not null references public.communications(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (case_id, communication_id)
);

create index if not exists case_status_history_case_id_idx on public.case_status_history(case_id, created_at desc);
create index if not exists case_documents_case_id_idx on public.case_documents(case_id, created_at desc);
create index if not exists case_finance_payment_status_idx on public.case_finance(payment_status);
create index if not exists case_tasks_case_id_idx on public.case_tasks(case_id);
create index if not exists case_tasks_task_id_idx on public.case_tasks(task_id);
create index if not exists case_communications_case_id_idx on public.case_communications(case_id);
create index if not exists case_communications_communication_id_idx on public.case_communications(communication_id);
create index if not exists cases_assigned_manager_id_idx on public.cases(assigned_manager_id);
create index if not exists cases_customer_status_idx on public.cases(customer_id, status);
create index if not exists cases_referral_partner_label_idx on public.cases(referral_partner_label);

alter table public.case_status_history enable row level security;
alter table public.case_documents enable row level security;
alter table public.case_finance enable row level security;
alter table public.case_tasks enable row level security;
alter table public.case_communications enable row level security;

grant select, insert, update on public.case_status_history to authenticated;
grant select, insert, update on public.case_documents to authenticated;
grant select, insert, update on public.case_finance to authenticated;
grant select, insert, update on public.case_tasks to authenticated;
grant select, insert, update on public.case_communications to authenticated;

drop policy if exists "admins read case status history" on public.case_status_history;
create policy "admins read case status history"
on public.case_status_history for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage case status history" on public.case_status_history;
create policy "admins manage case status history"
on public.case_status_history for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read case documents" on public.case_documents;
create policy "admins read case documents"
on public.case_documents for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage case documents" on public.case_documents;
create policy "admins manage case documents"
on public.case_documents for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read case finance" on public.case_finance;
create policy "admins read case finance"
on public.case_finance for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage case finance" on public.case_finance;
create policy "admins manage case finance"
on public.case_finance for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read case tasks" on public.case_tasks;
create policy "admins read case tasks"
on public.case_tasks for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage case tasks" on public.case_tasks;
create policy "admins manage case tasks"
on public.case_tasks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read case communications" on public.case_communications;
create policy "admins read case communications"
on public.case_communications for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage case communications" on public.case_communications;
create policy "admins manage case communications"
on public.case_communications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read case storage documents" on storage.objects;
create policy "admins read case storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'case-documents'
  and public.is_admin()
);
