-- Granular admin RLS for operational, documents, and trash modules.
-- Keep companion reads for related admin pages while removing blanket is_admin() access.

drop policy if exists "admins manage case finance" on public.case_finance;
drop policy if exists "admins insert case finance" on public.case_finance;
drop policy if exists "admins update case finance" on public.case_finance;
drop policy if exists "admins delete case finance" on public.case_finance;

create policy "admins insert case finance"
on public.case_finance for insert
to authenticated
with check (
  public.has_any_admin_permission(array['finance.edit', 'cases.edit'])
);

create policy "admins update case finance"
on public.case_finance for update
to authenticated
using (public.has_admin_permission('finance.edit'))
with check (public.has_admin_permission('finance.edit'));

create policy "admins delete case finance"
on public.case_finance for delete
to authenticated
using (public.has_admin_permission('finance.edit'));

drop policy if exists "admins read all leads" on public.leads;
create policy "admins read all leads"
on public.leads for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'leads.view', 'leads.edit', 'leads.assign', 'leads.export',
    'cases.view', 'cases.edit', 'cases.assign',
    'customers.view', 'customers.edit',
    'tasks.view', 'tasks.edit',
    'communications.view', 'communications.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'reports.view', 'reports.export',
    'partners.view', 'partners.edit', 'referrals.view'
  ])
);

drop policy if exists "admins manage leads" on public.leads;
create policy "admins manage leads"
on public.leads for update
to authenticated
using (
  public.has_any_admin_permission(array['leads.edit', 'leads.assign'])
)
with check (
  public.has_any_admin_permission(array['leads.edit', 'leads.assign'])
);

drop policy if exists "admins read all lead documents" on public.lead_documents;
create policy "admins read all lead documents"
on public.lead_documents for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'leads.view', 'leads.edit',
    'customers.view', 'customers.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'reports.view', 'reports.export'
  ])
);

drop policy if exists "admins manage lead documents" on public.lead_documents;
create policy "admins manage lead documents"
on public.lead_documents for update
to authenticated
using (public.has_admin_permission('documents.manage'))
with check (public.has_admin_permission('documents.manage'));

drop policy if exists "admins delete lead documents" on public.lead_documents;
create policy "admins delete lead documents"
on public.lead_documents for delete
to authenticated
using (public.has_admin_permission('documents.manage'));

drop policy if exists "admins read all lead signatures" on public.lead_signatures;
create policy "admins read all lead signatures"
on public.lead_signatures for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'leads.view', 'leads.edit',
    'customers.view', 'customers.edit',
    'documents.view', 'documents.manage', 'documents.download'
  ])
);

drop policy if exists "admins manage lead signatures" on public.lead_signatures;
create policy "admins manage lead signatures"
on public.lead_signatures for update
to authenticated
using (public.has_admin_permission('documents.manage'))
with check (public.has_admin_permission('documents.manage'));

drop policy if exists "admins delete lead signatures" on public.lead_signatures;
create policy "admins delete lead signatures"
on public.lead_signatures for delete
to authenticated
using (public.has_admin_permission('documents.manage'));

drop policy if exists "admins read customers" on public.customers;
create policy "admins read customers"
on public.customers for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'customers.view', 'customers.edit',
    'cases.view', 'cases.edit', 'cases.assign',
    'tasks.view', 'tasks.edit',
    'communications.view', 'communications.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'finance.view', 'finance.edit',
    'reports.view', 'reports.export',
    'partners.view', 'partners.edit', 'referrals.view'
  ])
);

drop policy if exists "admins manage customers" on public.customers;
drop policy if exists "admins insert customers" on public.customers;
drop policy if exists "admins update customers" on public.customers;

create policy "admins insert customers"
on public.customers for insert
to authenticated
with check (
  public.has_any_admin_permission(array['customers.edit', 'cases.edit'])
);

create policy "admins update customers"
on public.customers for update
to authenticated
using (
  public.has_any_admin_permission(array['customers.edit', 'cases.edit'])
)
with check (
  public.has_any_admin_permission(array['customers.edit', 'cases.edit'])
);

drop policy if exists "admins read cases" on public.cases;
create policy "admins read cases"
on public.cases for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'cases.view', 'cases.edit', 'cases.assign', 'cases.export',
    'customers.view', 'customers.edit',
    'tasks.view', 'tasks.edit',
    'communications.view', 'communications.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'finance.view', 'finance.edit',
    'reports.view', 'reports.export',
    'partners.view', 'partners.edit', 'referrals.view'
  ])
);

drop policy if exists "admins manage cases" on public.cases;
create policy "admins manage cases"
on public.cases for update
to authenticated
using (
  public.has_any_admin_permission(array['cases.edit', 'cases.assign'])
)
with check (
  public.has_any_admin_permission(array['cases.edit', 'cases.assign'])
);

drop policy if exists "admins read tasks" on public.tasks;
create policy "admins read tasks"
on public.tasks for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'tasks.view', 'tasks.edit',
    'cases.view', 'cases.edit',
    'customers.view', 'customers.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'reports.view', 'reports.export'
  ])
);

drop policy if exists "admins manage tasks" on public.tasks;
create policy "admins manage tasks"
on public.tasks for all
to authenticated
using (public.has_admin_permission('tasks.edit'))
with check (public.has_admin_permission('tasks.edit'));

drop policy if exists "admins read communications" on public.communications;
create policy "admins read communications"
on public.communications for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'communications.view', 'communications.edit',
    'cases.view', 'cases.edit',
    'customers.view', 'customers.edit',
    'reports.view', 'reports.export'
  ])
);

drop policy if exists "admins manage communications" on public.communications;
create policy "admins manage communications"
on public.communications for all
to authenticated
using (public.has_admin_permission('communications.edit'))
with check (public.has_admin_permission('communications.edit'));

drop policy if exists "admins read lead notes" on public.lead_notes;
create policy "admins read lead notes"
on public.lead_notes for select
to authenticated
using (
  public.has_any_admin_permission(array['leads.view', 'leads.edit'])
);

drop policy if exists "admins manage lead notes" on public.lead_notes;
create policy "admins manage lead notes"
on public.lead_notes for all
to authenticated
using (public.has_admin_permission('leads.edit'))
with check (public.has_admin_permission('leads.edit'));

drop policy if exists "admins read lead status history" on public.lead_status_history;
create policy "admins read lead status history"
on public.lead_status_history for select
to authenticated
using (
  public.has_any_admin_permission(array['leads.view', 'leads.edit'])
);

drop policy if exists "admins create lead status history" on public.lead_status_history;
create policy "admins create lead status history"
on public.lead_status_history for insert
to authenticated
with check (public.has_admin_permission('leads.edit'));

drop policy if exists "admins read case status history" on public.case_status_history;
create policy "admins read case status history"
on public.case_status_history for select
to authenticated
using (
  public.has_any_admin_permission(array['cases.view', 'cases.edit', 'reports.view', 'reports.export'])
);

drop policy if exists "admins manage case status history" on public.case_status_history;
create policy "admins manage case status history"
on public.case_status_history for all
to authenticated
using (public.has_admin_permission('cases.edit'))
with check (public.has_admin_permission('cases.edit'));

drop policy if exists "admins read case documents" on public.case_documents;
create policy "admins read case documents"
on public.case_documents for select
to authenticated
using (
  public.has_any_admin_permission(array[
    'cases.view', 'cases.edit',
    'customers.view', 'customers.edit',
    'tasks.view', 'tasks.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'reports.view', 'reports.export'
  ])
);

drop policy if exists "admins manage case documents" on public.case_documents;
drop policy if exists "admins insert case documents" on public.case_documents;
drop policy if exists "admins update case documents" on public.case_documents;
drop policy if exists "admins delete case documents" on public.case_documents;

create policy "admins insert case documents"
on public.case_documents for insert
to authenticated
with check (
  public.has_any_admin_permission(array['documents.manage', 'cases.edit'])
);

create policy "admins update case documents"
on public.case_documents for update
to authenticated
using (public.has_admin_permission('documents.manage'))
with check (public.has_admin_permission('documents.manage'));

create policy "admins delete case documents"
on public.case_documents for delete
to authenticated
using (public.has_admin_permission('documents.manage'));

drop policy if exists "admins read case tasks" on public.case_tasks;
create policy "admins read case tasks"
on public.case_tasks for select
to authenticated
using (
  public.has_any_admin_permission(array['cases.view', 'cases.edit', 'tasks.view', 'tasks.edit'])
);

drop policy if exists "admins manage case tasks" on public.case_tasks;
create policy "admins manage case tasks"
on public.case_tasks for all
to authenticated
using (public.has_admin_permission('tasks.edit'))
with check (public.has_admin_permission('tasks.edit'));

drop policy if exists "admins read case communications" on public.case_communications;
create policy "admins read case communications"
on public.case_communications for select
to authenticated
using (
  public.has_any_admin_permission(array['cases.view', 'cases.edit', 'communications.view', 'communications.edit'])
);

drop policy if exists "admins manage case communications" on public.case_communications;
create policy "admins manage case communications"
on public.case_communications for all
to authenticated
using (public.has_admin_permission('communications.edit'))
with check (public.has_admin_permission('communications.edit'));

drop policy if exists "admins read all claims" on public.claims;
create policy "admins read all claims"
on public.claims for select
to authenticated
using (
  public.has_any_admin_permission(array['documents.view', 'documents.manage', 'documents.download'])
);

drop policy if exists "admins update claims" on public.claims;
create policy "admins update claims"
on public.claims for update
to authenticated
using (public.has_admin_permission('documents.manage'))
with check (public.has_admin_permission('documents.manage'));

drop policy if exists "admins read all documents" on public.documents;
create policy "admins read all documents"
on public.documents for select
to authenticated
using (
  public.has_any_admin_permission(array['documents.view', 'documents.manage', 'documents.download'])
);

drop policy if exists "admins update documents" on public.documents;
create policy "admins update documents"
on public.documents for update
to authenticated
using (public.has_admin_permission('documents.manage'))
with check (public.has_admin_permission('documents.manage'));

drop policy if exists "admins delete documents" on public.documents;
create policy "admins delete documents"
on public.documents for delete
to authenticated
using (public.has_admin_permission('documents.manage'));

drop policy if exists "admins read lead storage documents" on storage.objects;
create policy "admins read lead storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'claim-lead-documents'
  and public.has_any_admin_permission(array[
    'leads.view', 'leads.edit',
    'cases.view', 'cases.edit',
    'customers.view', 'customers.edit',
    'tasks.view', 'tasks.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'reports.view', 'reports.export'
  ])
);

drop policy if exists "admins read case storage documents" on storage.objects;
create policy "admins read case storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'case-documents'
  and public.has_any_admin_permission(array[
    'cases.view', 'cases.edit',
    'customers.view', 'customers.edit',
    'tasks.view', 'tasks.edit',
    'documents.view', 'documents.manage', 'documents.download',
    'reports.view', 'reports.export'
  ])
);

drop policy if exists "admins read claim storage documents" on storage.objects;
create policy "admins read claim storage documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'claim-documents'
  and public.has_any_admin_permission(array['documents.view', 'documents.manage', 'documents.download'])
);

drop policy if exists "admins delete lead storage documents" on storage.objects;
create policy "admins delete lead storage documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'claim-lead-documents'
  and public.has_admin_permission('documents.manage')
);

drop policy if exists "admins delete case storage documents" on storage.objects;
create policy "admins delete case storage documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'case-documents'
  and public.has_admin_permission('documents.manage')
);

drop policy if exists "admins delete claim storage documents" on storage.objects;
create policy "admins delete claim storage documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'claim-documents'
  and public.has_admin_permission('documents.manage')
);

drop policy if exists "admins read trash items" on public.trash_items;
create policy "admins read trash items"
on public.trash_items for select
to authenticated
using (
  (
    entity_type = 'profile'
    and public.has_any_admin_permission(array['users.manage', 'trash.manage'])
  )
  or (
    entity_type <> 'profile'
    and public.has_any_admin_permission(array['documents.manage', 'trash.manage'])
  )
);

drop policy if exists "admins manage trash items" on public.trash_items;
create policy "admins manage trash items"
on public.trash_items for all
to authenticated
using (
  (
    entity_type = 'profile'
    and public.has_any_admin_permission(array['users.manage', 'trash.manage'])
  )
  or (
    entity_type <> 'profile'
    and public.has_any_admin_permission(array['documents.manage', 'trash.manage'])
  )
)
with check (
  (
    entity_type = 'profile'
    and public.has_any_admin_permission(array['users.manage', 'trash.manage'])
  )
  or (
    entity_type <> 'profile'
    and public.has_any_admin_permission(array['documents.manage', 'trash.manage'])
  )
);
