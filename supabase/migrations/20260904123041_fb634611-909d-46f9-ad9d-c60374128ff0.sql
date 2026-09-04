REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_read_church(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_write_church(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_church_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_in_church(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_member_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
