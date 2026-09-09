-- Treasury controls: immutable audit trail for receipt/expense changes and
-- approved-expense fund deductions. The fund balance is derived from the
-- transaction ledger, so no mutable balance column can drift out of sync.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_church_created_idx
  on public.audit_logs (church_id, created_at desc);
create index if not exists audit_logs_record_idx
  on public.audit_logs (table_name, record_id, created_at desc);

alter table public.audit_logs enable row level security;

create or replace function public.can_view_treasury_audit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin', 'auditor', 'elder', 'treasurer')
  );
$$;

revoke all on function public.can_view_treasury_audit() from public, anon;
grant execute on function public.can_view_treasury_audit() to authenticated;

drop policy if exists "Treasury audit viewers" on public.audit_logs;
create policy "Treasury audit viewers"
on public.audit_logs
for select
to authenticated
using (public.can_view_treasury_audit());

revoke insert, update, delete on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.audit_treasury_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end;
  new_json jsonb := case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end;
  church uuid;
  record_uuid uuid;
  action_name text := lower(TG_OP);
begin
  church := coalesce(
    nullif(coalesce(new_json, old_json)->>'church_id', '')::uuid,
    null
  );
  record_uuid := coalesce(NEW.id, OLD.id);

  insert into public.audit_logs (
    church_id, user_id, action, table_name, record_id, old_data, new_data, metadata
  ) values (
    church,
    (select auth.uid()),
    action_name,
    TG_TABLE_NAME,
    record_uuid,
    old_json,
    new_json,
    jsonb_build_object('source', 'database_trigger')
  );

  -- Approval is the accounting event that makes an expense charge the fund.
  -- Keep a separate audit event so reviewers can distinguish a normal edit
  -- from the financial deduction caused by approval.
  if TG_TABLE_NAME = 'expenses'
     and TG_OP = 'UPDATE'
     and coalesce(OLD.approval_status, '') <> 'approved'
     and NEW.approval_status = 'approved' then
    insert into public.audit_logs (
      church_id, user_id, action, table_name, record_id, old_data, new_data, metadata
    ) values (
      NEW.church_id,
      (select auth.uid()),
      'fund_deduction',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object('approval_status', OLD.approval_status),
      jsonb_build_object('approval_status', NEW.approval_status, 'amount', NEW.amount),
      jsonb_build_object(
        'fund', 'local',
        'amount', NEW.amount,
        'reason', 'approved expense'
      )
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

revoke all on function public.audit_treasury_record() from public, anon;
grant execute on function public.audit_treasury_record() to authenticated, service_role;

drop trigger if exists audit_receipts_changes on public.receipts;
create trigger audit_receipts_changes
after insert or update or delete on public.receipts
for each row execute function public.audit_treasury_record();

drop trigger if exists audit_expenses_changes on public.expenses;
create trigger audit_expenses_changes
after insert or update or delete on public.expenses
for each row execute function public.audit_treasury_record();

-- Approved expenses are immutable to non-admin users at the application layer.
-- These indexes keep the fund reconciliation query fast as the ledger grows.
create index if not exists expenses_local_fund_approval_idx
  on public.expenses (church_id, approval_status, transaction_date)
  where approval_status = 'approved';
