-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Queue Claim Limit & Concurrency Fix
--
-- Replaces claim_due_jobs() with a CTE-materialized FOR UPDATE SKIP LOCKED.
-- In the original subquery-based implementation (WHERE jq.id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)),
-- PostgreSQL's query engine re-evaluated the subquery per candidate row in jq.
-- Because previous rows were skipped due to SKIP LOCKED, subsequent rows were selected,
-- resulting in unconstrained batch claims exceeding p_limit.
--
-- The CTE (WITH targets AS (...) UPDATE jq FROM targets) materializes the exact
-- p_limit row IDs once, guaranteeing strict batch boundaries under all conditions.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_due_jobs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Reclaim jobs stuck in 'processing' (crashed/timed-out invocations)
  UPDATE public.job_queue
  SET status = 'pending', locked_at = NULL
  WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes';

  RETURN QUERY
  WITH targets AS (
    SELECT id FROM public.job_queue
    WHERE status = 'pending' AND run_after <= NOW()
    ORDER BY run_after ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue jq
  SET status = 'processing', locked_at = NOW()
  FROM targets
  WHERE jq.id = targets.id
  RETURNING jq.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_due_jobs(INTEGER) TO service_role;
