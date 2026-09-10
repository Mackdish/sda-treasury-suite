CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'member',
  member_id uuid REFERENCES public.church_members(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT user_invitations_role_check CHECK (role IN ('admin','pastor','elder','treasurer','auditor','member')),
  CONSTRAINT user_invitations_email_check CHECK (length(trim(email)) > 3),
  CONSTRAINT user_invitations_name_check CHECK (length(trim(full_name)) >= 2)
);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx
  ON public.user_invitations (lower(email));
CREATE INDEX IF NOT EXISTS user_invitations_church_idx
  ON public.user_invitations (church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_invitations_active_idx
  ON public.user_invitations (token_hash, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_admin_select ON public.user_invitations;
CREATE POLICY user_invitations_admin_select
  ON public.user_invitations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS user_invitations_admin_insert ON public.user_invitations;
CREATE POLICY user_invitations_admin_insert
  ON public.user_invitations FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS user_invitations_admin_update ON public.user_invitations;
CREATE POLICY user_invitations_admin_update
  ON public.user_invitations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.complete_user_invitation(p_token_hash text)
RETURNS TABLE (church_id uuid, role text, member_id uuid, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  inv public.user_invitations%ROWTYPE;
  current_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO current_email FROM auth.users WHERE id = uid;
  IF current_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated account has no email address';
  END IF;

  SELECT * INTO inv
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid, expired, revoked, or already used';
  END IF;

  IF lower(trim(inv.email)) <> lower(trim(current_email)) THEN
    RAISE EXCEPTION 'This invitation was issued to a different email address';
  END IF;

  UPDATE public.profiles
  SET full_name = inv.full_name,
      email = current_email,
      phone = inv.phone,
      primary_church_id = inv.church_id,
      member_id = inv.member_id,
      is_active = true,
      approval_status = 'approved',
      approved_at = now(),
      approved_by = inv.invited_by,
      rejection_reason = NULL
  WHERE id = uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      id, full_name, email, phone, primary_church_id, member_id,
      is_active, approval_status, approved_at, approved_by
    ) VALUES (
      uid, inv.full_name, current_email, inv.phone, inv.church_id, inv.member_id,
      true, 'approved', now(), inv.invited_by
    );
  END IF;

  DELETE FROM public.user_roles WHERE user_id = uid;
  INSERT INTO public.user_roles (user_id, role, church_id)
  VALUES (uid, inv.role::public.app_role, inv.church_id);

  UPDATE public.user_invitations
  SET accepted_at = now()
  WHERE id = inv.id;

  INSERT INTO public.audit_log (
    church_id, user_id, action, entity, entity_id, details
  ) VALUES (
    inv.church_id, inv.invited_by, 'user_invitation_accepted', 'user_invitations', inv.id,
    jsonb_build_object(
      'user_id', uid,
      'email', current_email,
      'role', inv.role,
      'accepted_at', now()
    )
  );

  RETURN QUERY SELECT inv.church_id, inv.role, inv.member_id, inv.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_user_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_user_invitation(text) TO authenticated;
