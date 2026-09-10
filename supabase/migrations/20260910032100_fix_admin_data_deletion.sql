-- =========================================================
-- FIX ADMIN DATA DELETION
-- Uses a SECURITY DEFINER RPC so administrator deletion is not
-- blocked by table-level RLS policies. No service-role key is used.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.data_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  deleted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  table_name text NOT NULL,
  deleted_count integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_deletion_audit_church_idx
  ON public.data_deletion_audit (church_id, created_at DESC);

ALTER TABLE public.data_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_deletion_audit_admin_select
  ON public.data_deletion_audit;

CREATE POLICY data_deletion_audit_admin_select
  ON public.data_deletion_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));


CREATE OR REPLACE FUNCTION public.clear_church_table_data(
  p_table_name text,
  p_church_id uuid,
  p_confirm text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  snapshot_data jsonb := '[]'::jsonb;
  deleted_count integer := 0;
  allowed boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF p_confirm <> 'DELETE' THEN
    RAISE EXCEPTION 'Confirmation required';
  END IF;

  -- Explicit allow-list: table names can never come from arbitrary input.
  allowed := p_table_name IN (
    'receipts',
    'expenses',
    'cash_statements',
    'weekly_reports',
    'remittances',
    'church_members',
    'departments',
    'notices',
    'audit_log'
  );

  IF NOT allowed THEN
    RAISE EXCEPTION 'Table is not allowed to be cleared';
  END IF;

  -- Capture a complete snapshot before deletion. The snapshot is stored in
  -- a separate immutable audit table so clearing audit_log is also auditable.
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       FROM public.%I t
      WHERE church_id = $1',
    p_table_name
  )
  INTO snapshot_data
  USING p_church_id;

  -- Delete using the security-definer owner privileges so RLS does not block
  -- an administrator performing an explicitly confirmed destructive action.
  EXECUTE format(
    'DELETE FROM public.%I WHERE church_id = $1',
    p_table_name
  )
  USING p_church_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO public.data_deletion_audit (
    church_id,
    deleted_by,
    table_name,
    deleted_count,
    snapshot
  )
  VALUES (
    p_church_id,
    uid,
    p_table_name,
    deleted_count,
    snapshot_data
  );

  -- Also leave a normal audit_log event where possible. If audit_log itself
  -- was the target, this event is intentionally written AFTER its deletion.
  INSERT INTO public.audit_log (
    church_id,
    user_id,
    action,
    entity,
    entity_id,
    details
  )
  VALUES (
    p_church_id,
    uid,
    'table_cleared',
    p_table_name,
    NULL,
    jsonb_build_object(
      'deleted_count', deleted_count,
      'backup_id', (
        SELECT id
        FROM public.data_deletion_audit
        WHERE church_id = p_church_id
          AND deleted_by = uid
          AND table_name = p_table_name
        ORDER BY created_at DESC
        LIMIT 1
      )
    )
  );

  RETURN deleted_count;
END;
$$;

REVOKE ALL
  ON FUNCTION public.clear_church_table_data(text, uuid, text)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.clear_church_table_data(text, uuid, text)
  TO authenticated;
