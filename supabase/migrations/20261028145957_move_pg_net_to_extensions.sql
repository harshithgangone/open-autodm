-- pg_net is non-relocatable. When database-side scheduling is explicitly
-- enabled, recreate pg_net in the extensions schema to clear the
-- extension_in_public warning while preserving the net.* API.
--
-- The default Open AutoDM scheduler is Cloudflare. In that configuration,
-- pg_cron/pg_net are not installed and this migration deliberately becomes
-- a no-op so production can keep a single scheduler.
--
-- To opt into DB-side scheduling, set this before applying the scheduler
-- extension migration and this migration:
--   ALTER DATABASE postgres SET open_autodm.enable_db_scheduler = 'true';
--
-- When enabled, this migration still aborts unless cron jobs are paused,
-- in-flight requests are finished, and the pg_net queue is empty.

DO $$
BEGIN
  IF current_setting('open_autodm.enable_db_scheduler', true) IS DISTINCT FROM 'true' THEN
    RAISE NOTICE 'Skipping pg_net relocation: DB-side scheduling is not enabled';
    RETURN;
  END IF;

  IF to_regclass('cron.job') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'DB-side scheduling opt-in requires pg_cron and pg_net to be installed first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE active = true
      AND command ILIKE '%net.http_%'
  ) THEN
    RAISE EXCEPTION
      'Pause active pg_cron jobs that call net.http_* before moving pg_net';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job_run_details d
    JOIN cron.job j USING (jobid)
    WHERE j.command ILIKE '%net.http_%'
      AND d.status = 'running'
  ) THEN
    RAISE EXCEPTION
      'Wait for in-flight pg_cron jobs calling net.http_* to finish before moving pg_net';
  END IF;

  IF to_regclass('net.http_request_queue') IS NOT NULL
     AND EXISTS (SELECT 1 FROM net.http_request_queue) THEN
    RAISE EXCEPTION
      'Drain net.http_request_queue before moving pg_net';
  END IF;

  EXECUTE 'CREATE SCHEMA IF NOT EXISTS extensions';
  EXECUTE 'DROP EXTENSION pg_net';
  EXECUTE 'CREATE EXTENSION pg_net WITH SCHEMA extensions';
END
$$;
