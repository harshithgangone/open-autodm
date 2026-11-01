-- Track the incident that owns an account pause separately from the latest
-- traffic incident. New spikes can arrive while automations remain paused;
-- those spikes must not steal the resume token from the incident that paused
-- the automations and held their jobs.

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS traffic_guard_paused_incident_id UUID
  REFERENCES public.comment_traffic_incidents(id) ON DELETE SET NULL;

-- Backfill only unambiguous legacy pauses where the account's current incident
-- is itself an active paused incident. Do not guess when the pointer has moved.
UPDATE public.instagram_accounts AS a
SET traffic_guard_paused_incident_id = a.traffic_guard_incident_id
WHERE a.traffic_guard_paused = true
  AND a.traffic_guard_paused_incident_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.comment_traffic_incidents AS i
    WHERE i.id = a.traffic_guard_incident_id
      AND i.instagram_account_id = a.id
      AND i.paused_at IS NOT NULL
      AND i.resumed_at IS NULL
  );

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
  v_account_user_id       UUID;
  v_account_paused        BOOLEAN;
  v_current_incident_id   UUID;
  v_paused_ids            UUID[] := ARRAY[]::UUID[];
  v_held_jobs_count       INTEGER := 0;
BEGIN
  SELECT user_id, traffic_guard_paused, traffic_guard_incident_id
  INTO v_account_user_id, v_account_paused, v_current_incident_id
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot pause automations for another user account';
  END IF;

  IF v_account_paused IS TRUE THEN
    RAISE EXCEPTION 'Account is already paused by Traffic Guard';
  END IF;

  -- Lock the incident first; resume uses the same incident -> account order.
  PERFORM 1
  FROM public.comment_traffic_incidents
  WHERE id = p_incident_id
    AND instagram_account_id = p_instagram_account_id
    AND paused_at IS NULL
    AND resumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident is not the current resumable traffic incident for this account';
  END IF;

  -- Re-read account state under lock so a newer incident cannot race this pause.
  SELECT user_id, traffic_guard_paused, traffic_guard_incident_id
  INTO v_account_user_id, v_account_paused, v_current_incident_id
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot pause automations for another user account';
  END IF;

  IF v_account_paused IS TRUE THEN
    RAISE EXCEPTION 'Account is already paused by Traffic Guard';
  END IF;

  IF v_current_incident_id IS DISTINCT FROM p_incident_id THEN
    RAISE EXCEPTION 'Incident is no longer the current traffic incident for this account';
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
      traffic_guard_paused_incident_id = p_incident_id,
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
  v_paused_incident_id    UUID;
  v_incident              RECORD;
  v_resumed_ids           UUID[] := ARRAY[]::UUID[];
  v_resumed_jobs_cnt      INTEGER := 0;
BEGIN
  SELECT user_id, traffic_guard_paused, traffic_guard_paused_incident_id
  INTO v_account_user_id, v_account_paused, v_paused_incident_id
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot resume automations for another user account';
  END IF;

  -- The pause-origin incident may no longer be the latest traffic incident.
  -- It must still be the one recorded as owning this account's active pause.
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

  -- Re-read the pause identity under an account row lock. This prevents a
  -- stale or concurrent resume from releasing another incident's held jobs.
  SELECT user_id, traffic_guard_paused, traffic_guard_paused_incident_id
  INTO v_account_user_id, v_account_paused, v_paused_incident_id
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
     OR v_paused_incident_id IS DISTINCT FROM p_incident_id THEN
    RAISE EXCEPTION 'Incident is no longer the active paused incident for this account';
  END IF;

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

  -- Keep traffic_guard_incident_id pointing at the latest traffic incident.
  -- Only clear the separate pause-origin incident reference.
  UPDATE public.instagram_accounts
  SET traffic_guard_paused = false,
      traffic_guard_paused_incident_id = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_instagram_account_id;

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

CREATE OR REPLACE FUNCTION public.get_traffic_guard_status(
  p_instagram_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account             RECORD;
  v_current_count       INTEGER := 0;
  v_latest_incident     RECORD;
  v_paused_count        INTEGER := 0;
  v_active_count        INTEGER := 0;
  v_held_jobs_count     INTEGER := 0;
  v_settings            JSONB;
BEGIN
  SELECT id, user_id, traffic_guard_status, traffic_guard_paused,
         traffic_guard_incident_id, traffic_guard_paused_incident_id,
         traffic_guard_settings
  INTO v_account
  FROM public.instagram_accounts
  WHERE id = p_instagram_account_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('error', 'Account not found');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_account.user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot view traffic guard status for another user account';
  END IF;

  v_settings := COALESCE(
    v_account.traffic_guard_settings,
    '{"high_traffic_threshold": 20, "recovery_threshold": 5, "recovery_duration_seconds": 300, "window_seconds": 60}'::jsonb
  );

  SELECT pg_catalog.count(*)
  INTO v_current_count
  FROM public.comment_traffic_events
  WHERE instagram_account_id = p_instagram_account_id
    AND received_at >= pg_catalog.now() - INTERVAL '60 seconds';

  SELECT * INTO v_latest_incident
  FROM public.comment_traffic_incidents
  WHERE instagram_account_id = p_instagram_account_id
  ORDER BY opened_at DESC
  LIMIT 1;

  SELECT
    pg_catalog.count(*) FILTER (WHERE is_active = true),
    pg_catalog.count(*) FILTER (WHERE is_traffic_guard_paused = true)
  INTO v_active_count, v_paused_count
  FROM public.automations
  WHERE instagram_account_id = p_instagram_account_id;

  SELECT pg_catalog.count(*)
  INTO v_held_jobs_count
  FROM public.job_queue
  WHERE status = 'held'
    AND payload->>'instagramAccountId' = p_instagram_account_id::text;

  RETURN pg_catalog.jsonb_build_object(
    'account_id', p_instagram_account_id,
    'traffic_status', v_account.traffic_guard_status,
    'is_paused', v_account.traffic_guard_paused,
    'paused_incident_id', v_account.traffic_guard_paused_incident_id,
    'current_60s_count', v_current_count,
    'settings', v_settings,
    'active_automations_count', v_active_count,
    'paused_by_guard_count', v_paused_count,
    'held_jobs_count', v_held_jobs_count,
    'incident', CASE WHEN v_latest_incident.id IS NOT NULL THEN
      pg_catalog.jsonb_build_object(
        'id', v_latest_incident.id,
        'status', v_latest_incident.status,
        'peak_rate', v_latest_incident.peak_comments_per_minute,
        'opened_at', v_latest_incident.opened_at,
        'last_spike_at', v_latest_incident.last_spike_at,
        'recovered_at', v_latest_incident.recovered_at,
        'paused_at', v_latest_incident.paused_at,
        'paused_automation_ids', v_latest_incident.paused_automation_ids,
        'resumed_at', v_latest_incident.resumed_at
      ) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.traffic_guard_pause_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_guard_pause_account(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.traffic_guard_resume_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_guard_resume_account(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_traffic_guard_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_traffic_guard_status(UUID) TO service_role;
