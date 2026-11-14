-- Remove legacy auto-expose privileges from existing application objects.
--
-- Supabase's default-grants rollout affects future objects only. Existing
-- objects keep prior grants, so explicitly strip client access from all public
-- tables/sequences/functions and then re-grant only the tables with intentional
-- owner-scoped policies. The server-side app uses service_role for DB access.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Keep the precise authenticated access model aligned with the existing RLS
-- policies. Anonymous users get no direct table/function/sequence privileges.
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, DELETE ON TABLE public.instagram_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.automations TO authenticated;
GRANT SELECT ON TABLE
  public.dm_jobs,
  public.dm_sent_log,
  public.automation_sessions,
  public.dm_logs,
  public.contacts,
  public.comment_private_reply_reservations,
  public.comment_public_reply_reservations,
  public.ai_usage_log,
  public.automation_follow_ups,
  public.recipient_opt_outs
TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.comment_traffic_incidents TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.traffic_guard_notifications TO authenticated;

-- Restore function execution only to the trusted backend role.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
