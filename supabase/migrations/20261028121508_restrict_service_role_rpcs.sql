-- Restrict service-side SECURITY DEFINER RPCs to the backend service role.
--
-- These functions are only called by server-side code using createServiceClient().
-- Earlier migrations granted service_role but did not revoke PostgreSQL's default
-- PUBLIC EXECUTE privilege, which also made them callable by anon/authenticated.
-- Keep owner-scoped Traffic Guard RPCs unchanged; their access is handled separately.

REVOKE ALL ON FUNCTION public.check_and_record_dm_rate_limit(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_dm_rate_limit(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.claim_due_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_jobs(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_old_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rows() TO service_role;

REVOKE ALL ON FUNCTION public.increment_automation_dms_sent(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_automation_dms_sent(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.record_contact_interaction(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_contact_interaction(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.update_contact_profile(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_contact_profile(UUID, TEXT, TEXT, BOOLEAN) TO service_role;

-- Trigger-only helper: cannot be invoked through PostgREST as a normal function.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
