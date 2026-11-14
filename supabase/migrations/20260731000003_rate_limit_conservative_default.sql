-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Conservative Rate Limit Default Migration (100 DMs/hour)
--
-- Updates the default rate limit parameter in check_and_record_dm_rate_limit
-- from 180 down to 100 DMs/hour to provide a conservative 50% safety cushion
-- against Meta policy blocks (Error 368 / 613).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_and_record_dm_rate_limit(
  p_account_id UUID,
  p_limit      INTEGER DEFAULT 100
)
RETURNS TABLE (
  allowed              BOOLEAN,
  current_count        INTEGER,
  retry_after_seconds  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_oldest_event TIMESTAMPTZ;
  v_retry_after INTEGER := 0;
BEGIN
  -- Advisory lock serialized per account
  PERFORM pg_advisory_xact_lock(hashtext(p_account_id::text));

  -- Opportunistic cleanup of expired window entries (> 1 hour old)
  DELETE FROM public.dm_rate_events
  WHERE instagram_account_id = p_account_id
    AND sent_at < NOW() - INTERVAL '1 hour';

  -- Count sends within current 1-hour window
  SELECT count(*), min(sent_at)
  INTO v_count, v_oldest_event
  FROM public.dm_rate_events
  WHERE instagram_account_id = p_account_id
    AND sent_at > NOW() - INTERVAL '1 hour';

  IF v_count >= p_limit THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_event + INTERVAL '1 hour' - NOW())))::INTEGER + 1);
    RETURN QUERY SELECT false, v_count, v_retry_after;
    RETURN;
  END IF;

  -- Record send
  INSERT INTO public.dm_rate_events (instagram_account_id)
  VALUES (p_account_id);

  RETURN QUERY SELECT true, v_count + 1, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_record_dm_rate_limit(UUID, INTEGER) TO service_role;
