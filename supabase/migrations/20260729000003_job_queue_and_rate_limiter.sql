-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM — Postgres-native job queue + sliding-window rate limiter
--
-- Replaces BullMQ + Redis from the original two-service architecture.
-- Serverless-safe: jobs are claimed with FOR UPDATE SKIP LOCKED so any number
-- of concurrent function invocations can drain the queue without double-sends.
--
-- job_queue      → pending/delayed AutoDM work (overflow, retries, follow-ups)
-- dm_rate_events → one row per DM sent, used for the 180/hour rolling window
-- ═══════════════════════════════════════════════════════════════════════════

-- ── job_queue ──────────────────────────────────────────────────────────────
CREATE TABLE public.job_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type     TEXT        NOT NULL CHECK (job_type IN ('auto_dm', 'follow_up')),
  payload      JSONB       NOT NULL,
  -- Idempotency: Meta retries webhooks — same event never creates two jobs.
  dedupe_key   TEXT        NOT NULL UNIQUE,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  run_after    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts     INTEGER     NOT NULL DEFAULT 0,
  max_attempts INTEGER     NOT NULL DEFAULT 3,
  last_error   TEXT,
  locked_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_queue_due ON public.job_queue (run_after) WHERE status = 'pending';
CREATE INDEX idx_job_queue_created_at ON public.job_queue (created_at DESC);

CREATE TRIGGER job_queue_updated_at
  BEFORE UPDATE ON public.job_queue
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Service-role only
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- ── RPC: claim due jobs (concurrency-safe) ─────────────────────────────────
-- Atomically claims up to p_limit due jobs. Also self-heals: 'processing'
-- jobs whose invocation died (locked > 10 minutes ago) are reclaimed.
CREATE OR REPLACE FUNCTION public.claim_due_jobs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Reclaim jobs stuck in 'processing' (crashed/timed-out invocations)
  UPDATE public.job_queue
  SET status = 'pending', locked_at = NULL
  WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes';

  RETURN QUERY
  UPDATE public.job_queue jq
  SET status = 'processing', locked_at = NOW()
  WHERE jq.id IN (
    SELECT id FROM public.job_queue
    WHERE status = 'pending' AND run_after <= NOW()
    ORDER BY run_after ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING jq.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_due_jobs(INTEGER) TO service_role;

-- ── dm_rate_events + atomic rate-limit check ───────────────────────────────
CREATE TABLE public.dm_rate_events (
  id                    BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dm_rate_events_window ON public.dm_rate_events (instagram_account_id, sent_at DESC);

ALTER TABLE public.dm_rate_events ENABLE ROW LEVEL SECURITY;

-- Checks the rolling 60-minute window for an account. If under the limit,
-- records the send and returns allowed=true. Runs in a single transaction with
-- a per-account advisory lock, so concurrent invocations can never overshoot.
--
-- Default limit 180/hour: Meta's hard limit is 200 — the 20-DM buffer covers
-- manual DMs the creator sends themselves.
CREATE OR REPLACE FUNCTION public.check_and_record_dm_rate_limit(
  p_account_id UUID,
  p_limit      INTEGER DEFAULT 180
)
RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count  INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  -- Serialize concurrent checks for the same account within this transaction
  PERFORM pg_advisory_xact_lock(hashtext(p_account_id::text));

  -- Opportunistic cleanup of expired window entries for this account
  DELETE FROM public.dm_rate_events
  WHERE instagram_account_id = p_account_id AND sent_at < NOW() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_count
  FROM public.dm_rate_events
  WHERE instagram_account_id = p_account_id AND sent_at > NOW() - INTERVAL '1 hour';

  IF v_count >= p_limit THEN
    SELECT MIN(sent_at) INTO v_oldest
    FROM public.dm_rate_events
    WHERE instagram_account_id = p_account_id AND sent_at > NOW() - INTERVAL '1 hour';

    RETURN QUERY SELECT
      false,
      v_count,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest + INTERVAL '1 hour' - NOW())))::INTEGER + 1);
    RETURN;
  END IF;

  INSERT INTO public.dm_rate_events (instagram_account_id) VALUES (p_account_id);

  RETURN QUERY SELECT true, v_count + 1, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_record_dm_rate_limit(UUID, INTEGER) TO service_role;

-- ── RPC: housekeeping (called by the cron endpoint) ────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_rows()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.debug_events WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.job_queue WHERE status IN ('done', 'failed') AND updated_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.dm_rate_events WHERE sent_at < NOW() - INTERVAL '2 hours';
  DELETE FROM public.automation_sessions WHERE completed = TRUE AND last_activity_at < NOW() - INTERVAL '30 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_rows() TO service_role;
