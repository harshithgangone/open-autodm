-- Prevent stale or replayed Traffic Guard resume requests from unpausing an account.
--
-- A previous incident can remain visible in an open dashboard tab after the
-- account has moved on to a newer incident. Resume must only apply to the
-- currently-paused incident, and only once. The application route checks this
-- too, but the SECURITY DEFINER RPC enforces the invariant for every caller.

CREATE OR REPLACE FUNCTION public.traffic_guard_resume_account(
  p_instagram_account_id UUID,
  p_incident_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_user_id       UUID;
  v_account_paused        BOOLEAN;
  v_current_incident_id   UUID;
  v_incident              RECORD;
  v_resumed_ids           UUID[] := ARRAY[]::UUID[];
  v_resumed_jobs_cnt      INTEGER := 0;
BEGIN
  SELECT user_id, traffic_guard_paused, traffic_guard_incident_id
  INTO v_account_user_id, v_account_paused, v_current_incident_id
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot resume automations for another user account';
  END IF;

  -- Lock and validate the incident first, matching the pause RPC lock order.
  SELECT *
  INTO v_incident
  FROM public.comment_traffic_incidents
  WHERE id = p_incident_id
    AND instagram_account_id = p_instagram_account_id
    AND paused_at IS NOT NULL
    AND resumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident is not an active paused incident for this account';
  END IF;

  -- Lock the account only after the incident to avoid inverting the pause
  -- RPC's incident -> account lock order. Re-read the state under the lock:
  -- a newer incident may have replaced this one since the first read.
  SELECT user_id, traffic_guard_paused, traffic_guard_incident_id
  INTO v_account_user_id, v_account_paused, v_current_incident_id
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot resume automations for another user account';
  END IF;

  IF v_account_paused IS DISTINCT FROM true
     OR v_current_incident_id IS DISTINCT FROM p_incident_id THEN
    RAISE EXCEPTION 'Incident is no longer the active paused incident for this account';
  END IF;

  -- Resume ONLY automations this incident paused, and do not overwrite
  -- automations that an owner manually edited/reconfigured since the pause.
  SELECT COALESCE(pg_catalog.array_agg(id), ARRAY[]::UUID[])
  INTO v_resumed_ids
  FROM public.automations
  WHERE id = ANY(v_incident.paused_automation_ids)
    AND is_traffic_guard_paused = true
    AND traffic_guard_incident_id = p_incident_id
    AND updated_at <= v_incident.paused_at + INTERVAL '5 seconds';

  IF pg_catalog.array_length(v_resumed_ids, 1) > 0 THEN
    UPDATE public.automations
    SET is_active = true,
        is_traffic_guard_paused = false,
        traffic_guard_paused_at = NULL,
        traffic_guard_incident_id = NULL,
        updated_at = pg_catalog.now()
    WHERE id = ANY(v_resumed_ids);
  END IF;

  UPDATE public.comment_traffic_incidents
  SET resumed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_incident_id
    AND instagram_account_id = p_instagram_account_id;

  UPDATE public.instagram_accounts
  SET traffic_guard_paused = false,
      traffic_guard_incident_id = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_instagram_account_id;

  -- Only jobs explicitly held by this guard are released.
  WITH resumed AS (
    UPDATE public.job_queue
    SET status = 'pending',
        run_after = pg_catalog.now(),
        last_error = NULL,
        updated_at = pg_catalog.now()
    WHERE status = 'held'
      AND last_error = 'Held by Traffic Guard pause'
      AND payload->>'instagramAccountId' = p_instagram_account_id::text
    RETURNING 1
  )
  SELECT pg_catalog.count(*) INTO v_resumed_jobs_cnt FROM resumed;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'resumed_automation_ids', v_resumed_ids,
    'resumed_jobs_count', v_resumed_jobs_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.traffic_guard_resume_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_guard_resume_account(UUID, UUID) TO service_role;
