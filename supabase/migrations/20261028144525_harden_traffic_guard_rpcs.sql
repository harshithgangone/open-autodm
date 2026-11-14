-- Harden Traffic Guard privileged RPCs and reject mismatched incidents before mutation.
--
-- These RPCs are invoked by authenticated application routes through the
-- service-role client. The routes enforce user/account ownership; direct
-- execution by client roles is unnecessary and expands the public API surface.

CREATE OR REPLACE FUNCTION public.traffic_guard_pause_account(
  p_instagram_account_id UUID,
  p_incident_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_user_id   UUID;
  v_paused_ids        UUID[] := ARRAY[]::UUID[];
  v_held_jobs_count   INTEGER := 0;
BEGIN
  SELECT user_id INTO v_account_user_id
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot pause automations for another user account';
  END IF;

  -- Fail closed before changing automation or queue state. Without this guard,
  -- an invalid incident ID could still pause the account while leaving no
  -- valid incident record for the normal resume RPC to recover from.
  PERFORM 1
  FROM public.comment_traffic_incidents
  WHERE id = p_incident_id
    AND instagram_account_id = p_instagram_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found for Instagram account';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(id), ARRAY[]::UUID[])
  INTO v_paused_ids
  FROM public.automations
  WHERE instagram_account_id = p_instagram_account_id
    AND is_active = true;

  IF pg_catalog.array_length(v_paused_ids, 1) > 0 THEN
    UPDATE public.automations
    SET is_active = false,
        is_traffic_guard_paused = true,
        traffic_guard_paused_at = pg_catalog.now(),
        traffic_guard_incident_id = p_incident_id,
        updated_at = pg_catalog.now()
    WHERE id = ANY(v_paused_ids);
  END IF;

  UPDATE public.comment_traffic_incidents
  SET paused_at = pg_catalog.now(),
      paused_automation_ids = v_paused_ids,
      updated_at = pg_catalog.now()
  WHERE id = p_incident_id
    AND instagram_account_id = p_instagram_account_id;

  UPDATE public.instagram_accounts
  SET traffic_guard_paused = true,
      traffic_guard_incident_id = p_incident_id,
      updated_at = pg_catalog.now()
  WHERE id = p_instagram_account_id;

  WITH held AS (
    UPDATE public.job_queue
    SET status = 'held',
        last_error = 'Held by Traffic Guard pause',
        updated_at = pg_catalog.now()
    WHERE status = 'pending'
      AND payload->>'instagramAccountId' = p_instagram_account_id::text
    RETURNING 1
  )
  SELECT pg_catalog.count(*) INTO v_held_jobs_count FROM held;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'paused_automation_ids', v_paused_ids,
    'held_jobs_count', v_held_jobs_count
  );
END;
$$;

-- These functions are invoked by server-side routes with the service role.
-- Revoke default PUBLIC/client execution, retaining only the backend grant.
REVOKE ALL ON FUNCTION public.get_traffic_guard_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_traffic_guard_status(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.traffic_guard_pause_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_guard_pause_account(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.traffic_guard_resume_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_guard_resume_account(UUID, UUID) TO service_role;
