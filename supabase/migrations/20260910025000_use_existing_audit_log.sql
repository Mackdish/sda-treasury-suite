-- The application already exposes public.audit_log in its Audit Trail screen.
-- Record treasury events there so the existing UI immediately shows edits,
-- deletions, approvals, rejections, submissions and fund deductions.
create or replace function public.audit_treasury_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end;
  new_json jsonb := case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end;
  church uuid := nullif(coalesce(new_json, old_json)->>'church_id', '')::uuid;
  record_uuid uuid := coalesce(NEW.id, OLD.id);
  action_name text := lower(TG_OP);
  old_status text := case when TG_OP in ('UPDATE','DELETE') then OLD.approval_status::text else null end;
  new_status text := case when TG_OP in ('INSERT','UPDATE') then NEW.approval_status::text else null end;
begin
  if TG_OP = 'UPDATE' and TG_TABLE_NAME in ('receipts','expenses') then
    if old_status is distinct from new_status and new_status = 'pending' then action_name := 'submitted_for_approval';
    elsif old_status is distinct from new_status and new_status = 'approved' then action_name := 'approved';
    elsif old_status is distinct from new_status and new_status = 'rejected' then action_name := 'rejected';
    elsif old_status is distinct from new_status and new_status = 'draft' then action_name := 'returned_to_draft';
    end if;
  end if;

  insert into public.audit_log (church_id, user_id, action, table_name, record_id, details)
  values (
    church, (select auth.uid()), action_name, TG_TABLE_NAME, record_uuid,
    jsonb_build_object('old', old_json, 'new', new_json, 'source', 'database_trigger')
  );

  if TG_TABLE_NAME = 'expenses' and TG_OP = 'UPDATE'
     and old_status is distinct from new_status and new_status = 'approved' then
    insert into public.audit_log (church_id, user_id, action, table_name, record_id, details)
    values (
      NEW.church_id, (select auth.uid()), 'fund_deduction', TG_TABLE_NAME, NEW.id,
      jsonb_build_object('fund', NEW.fund_type, 'amount', NEW.amount, 'reason', 'approved expense')
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

revoke all on function public.audit_treasury_record() from public, anon;
grant execute on function public.audit_treasury_record() to authenticated, service_role;
