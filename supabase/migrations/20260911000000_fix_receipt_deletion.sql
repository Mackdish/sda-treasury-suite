-- =========================================================
-- FIX RECEIPT DELETION
-- Uses a SECURITY DEFINER RPC so receipt deletion is not blocked
-- by receipt RLS policies. No Supabase service-role key is required.
-- =========================================================

CREATE OR REPLACE FUNCTION public.delete_receipt(
  p_receipt_id uuid,
  p_confirm text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  receipt_row public.receipts%ROWTYPE;
  admin_user boolean := false;
  authorized_user boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_confirm <> 'DELETE' THEN
    RAISE EXCEPTION 'Confirmation required';
  END IF;

  admin_user := public.has_role(uid, 'admin'::public.app_role);
  authorized_user := admin_user
    OR public.has_role(uid, 'treasurer'::public.app_role)
    OR public.has_role(uid, 'elder'::public.app_role);

  IF NOT authorized_user THEN
    RAISE EXCEPTION 'You are not authorized to delete receipts';
  END IF;

  SELECT *
  INTO receipt_row
  FROM public.receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  -- Non-admin treasury users may only delete unlocked draft/rejected receipts.
  -- Administrators may delete any receipt, including approved/locked records.
  IF NOT admin_user THEN
    IF receipt_row.is_locked
       OR receipt_row.reversed_at IS NOT NULL
       OR receipt_row.approval_status NOT IN ('draft', 'rejected') THEN
      RAISE EXCEPTION 'Only unlocked draft or rejected receipts can be deleted by this role';
    END IF;
  END IF;

  DELETE FROM public.receipts
  WHERE id = p_receipt_id;

  INSERT INTO public.audit_log (
    church_id,
    user_id,
    action,
    entity,
    entity_id,
    details
  )
  VALUES (
    receipt_row.church_id,
    uid,
    'receipt_deleted',
    'receipts',
    p_receipt_id,
    jsonb_build_object(
      'receipt_number', receipt_row.receipt_number,
      'member_name', receipt_row.member_name,
      'membership_number', receipt_row.membership_number,
      'amount', receipt_row.amount,
      'payment_method', receipt_row.payment_method,
      'approval_status', receipt_row.approval_status,
      'deleted_by_role', CASE WHEN admin_user THEN 'admin' ELSE 'authorized_treasury_user' END,
      'deleted_at', now()
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL
ON FUNCTION public.delete_receipt(uuid, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.delete_receipt(uuid, text)
TO authenticated;
