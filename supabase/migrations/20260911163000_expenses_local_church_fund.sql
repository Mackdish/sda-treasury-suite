-- All church expenses are charged to the Local Church Fund.
-- Approved expenses are already included as deductions by the fund reconciliation
-- query; this migration makes the accounting rule explicit and database-enforced.

-- Normalize any existing expense records to the Local Church Fund.
update public.expenses
set fund_type = 'local'
where fund_type is distinct from 'local';

-- Replace the previous multi-fund constraint with a local-fund-only rule.
alter table public.expenses
  drop constraint if exists expenses_fund_type_check;

alter table public.expenses
  add constraint expenses_fund_type_check
  check (fund_type = 'local');

-- Keep all future inserts/updates on the Local Church Fund, even if an old
-- client attempts to submit another fund value.
create or replace function public.enforce_expense_local_fund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.fund_type := 'local';
  return new;
end;
$$;

revoke all on function public.enforce_expense_local_fund() from public, anon;
grant execute on function public.enforce_expense_local_fund() to authenticated, service_role;

drop trigger if exists enforce_expense_local_fund on public.expenses;
create trigger enforce_expense_local_fund
before insert or update of fund_type on public.expenses
for each row
execute function public.enforce_expense_local_fund();

-- Index specifically for Local Church Fund reconciliation.
create index if not exists expenses_local_church_fund_idx
  on public.expenses (church_id, approval_status, transaction_date)
  where fund_type = 'local';

-- Ensure PostgREST notices the updated database metadata.
select pg_notify('pgrst', 'reload schema');
