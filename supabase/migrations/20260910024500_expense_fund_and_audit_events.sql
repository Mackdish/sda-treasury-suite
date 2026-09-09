-- Expense fund integration. Existing expenses default to the Local Church Fund;
-- approved expenses are then deducted from that fund's derived balance.
alter table public.expenses
  add column if not exists fund_type text not null default 'local';

alter table public.expenses
  drop constraint if exists expenses_fund_type_check;
alter table public.expenses
  add constraint expenses_fund_type_check
  check (fund_type in ('local', 'camp', 'trust'));

create index if not exists expenses_fund_status_date_idx
  on public.expenses (church_id, fund_type, approval_status, transaction_date);

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
  old_status text := case when TG_OP in ('UPDATE','DELETE') then OLD.approval_status::text else null end;
  new_status text := case when TG_OP in ('INSERT','UPDATE') then NEW.approval_status::text else null end;
begin
  church := nullif(coalesce(new_json, old_json)->>'church_id', '')::uuid;
  record_uuid := coalesce(NEW.id, OLD.id);

  if TG_OP = 'UPDATE' and TG_TABLE_NAME in ('receipts','expenses') then
    if old_status is distinct from new_status and new_status = 'pending' then
      action_name := 'submitted_for_approval';
    elsif old_status is distinct from new_status and new_status = 'approved' then
      action_name := 'approved';
    elsif old_status is distinct from new_status and new_status = 'rejected' then
      action_name := 'rejected';
    elsif old_status is distinct from new_status and new_status = 'draft' then
      action_name := 'returned_to_draft';
    end if;
  end if;

  insert into public.audit_logs (
    church_id, user_id, action, table_name, record_id, old_data, new_data, metadata
  ) values (
    church, (select auth.uid()), action_name, TG_TABLE_NAME, record_uuid,
    old_json, new_json, jsonb_build_object('source', 'database_trigger')
  );

  if TG_TABLE_NAME = 'expenses'
     and TG_OP = 'UPDATE'
     and old_status is distinct from new_status
     and new_status = 'approved' then
    insert into public.audit_logs (
      church_id, user_id, action, table_name, record_id, old_data, new_data, metadata
    ) values (
      NEW.church_id, (select auth.uid()), 'fund_deduction', TG_TABLE_NAME, NEW.id,
      jsonb_build_object('approval_status', OLD.approval_status, 'fund_type', OLD.fund_type),
      jsonb_build_object('approval_status', NEW.approval_status, 'fund_type', NEW.fund_type, 'amount', NEW.amount),
      jsonb_build_object('fund', NEW.fund_type, 'amount', NEW.amount, 'reason', 'approved expense')
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

revoke all on function public.audit_treasury_record() from public, anon;
grant execute on function public.audit_treasury_record() to authenticated, service_role;
