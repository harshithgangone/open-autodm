-- Keep new self-hosted installations compatible with Supabase's explicit Data API grant defaults.
--
-- Application database reads/writes use the server-side createServiceClient()
-- factory. Do not grant anon/authenticated blanket access here: RLS and explicit
-- per-feature grants remain the boundary for any client-facing table access.
--
-- Supabase changes the default privileges for new public-schema objects on
-- 2026-10-30. These explicit grants also make existing migrations independent
-- of the historical auto-expose setting.

GRANT USAGE ON SCHEMA public TO service_role, authenticated;

-- Preserve the existing owner-scoped RLS access on core tables. These are
-- intentionally targeted grants; internal queue/settings/debug tables remain
-- service-role-only because they have no authenticated-user policies.
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, DELETE ON TABLE public.instagram_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.automations TO authenticated;
GRANT SELECT ON TABLE
  public.dm_jobs,
  public.dm_sent_log,
  public.automation_sessions,
  public.dm_logs,
  public.contacts
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.instagram_accounts,
  public.automations,
  public.dm_jobs,
  public.dm_sent_log,
  public.automation_sessions,
  public.dm_logs,
  public.debug_events,
  public.app_settings,
  public.job_queue,
  public.dm_rate_events,
  public.contacts,
  public.comment_private_reply_reservations,
  public.comment_public_reply_reservations,
  public.ai_usage_log,
  public.comment_traffic_events,
  public.comment_traffic_incidents,
  public.traffic_guard_notifications,
  public.automation_follow_ups,
  public.recipient_opt_outs
TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Ensure newly-created application tables/sequences remain reachable to the
-- server API under least privilege, even when project defaults stop exposing
-- new objects to anon/authenticated. Future SECURITY DEFINER functions must
-- still explicitly REVOKE EXECUTE from PUBLIC and grant only intended roles.
-- Remove legacy auto-expose defaults for future objects. Existing object
-- privileges are unchanged; access to current app tables is granted above.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- Server-side app code uses createServiceClient(). Future objects stay private
-- to client roles by default and must receive a deliberate per-object grant.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
