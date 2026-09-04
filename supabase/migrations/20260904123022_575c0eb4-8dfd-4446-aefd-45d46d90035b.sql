ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status = 'pending';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_approval_status_chk
    CHECK (approval_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "profiles admin delete" ON public.profiles;
CREATE POLICY "profiles admin delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "audit insert admin" ON public.audit_log;
CREATE POLICY "audit insert admin" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
