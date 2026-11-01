-- Optional database scheduler extensions.
--
-- Open AutoDM's supported deployment uses the Cloudflare cron dispatcher.
-- Installing pg_cron/pg_net by default would create an unnecessary second
-- scheduler surface. Keep this migration versioned, but make DB scheduling an
-- explicit per-database opt-in:
--
--   ALTER DATABASE postgres SET open_autodm.enable_db_scheduler = 'true';
--
-- Reconnect before applying this migration when DB-side scheduling is
-- intentionally selected. Existing environments where this migration was
-- already applied are not changed by editing this historical file.

DO $$
BEGIN
  IF current_setting('open_autodm.enable_db_scheduler', true) IS DISTINCT FROM 'true' THEN
    RAISE NOTICE 'Skipping pg_cron/pg_net: Open AutoDM uses the Cloudflare cron dispatcher by default';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public';
END
$$;
