-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Public Comment Replies, 5 Opening Variations & Workers AI
--
-- 1. Adds public reply controls (ON/OFF, mode, variations, AI instructions)
--    and opening DM variations (up to 5) + AI runtime settings to automations.
-- 2. Creates comment_public_reply_reservations with atomic reservation RPCs
--    to guarantee at most ONE public reply per comment across automations.
-- 3. Creates ai_usage_log for tracking Cloudflare Workers AI usage.
-- 4. Hardened with empty search_path and strict service_role execution privileges.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1: Schema Updates on automations ─────────────────────────────────────────

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS public_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_reply_mode TEXT NOT NULL DEFAULT 'manual' CHECK (public_reply_mode IN ('manual', 'ai_generated')),
  ADD COLUMN IF NOT EXISTS public_reply_options TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS public_reply_ai_instructions TEXT NULL,
  ADD COLUMN IF NOT EXISTS dm_opening_message_variations TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS ai_runtime_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_runtime_instructions TEXT NULL,
  ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.2-3b-instruct';

-- Backfill public_reply_options from comment_reply_options if already populated
UPDATE public.automations
SET public_reply_options = comment_reply_options
WHERE pg_catalog.array_length(comment_reply_options, 1) > 0
  AND pg_catalog.array_length(public_reply_options, 1) IS NULL;

-- ── 2: Comment Public Reply Reservations Table ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.comment_public_reply_reservations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  comment_id            TEXT        NOT NULL,
  automation_id         UUID        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  status                TEXT        NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'sent', 'failed')),
  reply_comment_id      TEXT,
  reserved_at           TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  sent_at               TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  failure_reason        TEXT,
  CONSTRAINT uq_comment_public_reply UNIQUE (instagram_account_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_pub_reservations_acc_status 
  ON public.comment_public_reply_reservations(instagram_account_id, status);

ALTER TABLE public.comment_public_reply_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own comment public reservations" ON public.comment_public_reply_reservations;
CREATE POLICY "Users can view own comment public reservations"
  ON public.comment_public_reply_reservations FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.automations a WHERE a.id = comment_public_reply_reservations.automation_id AND a.user_id = auth.uid()));

REVOKE ALL ON TABLE public.comment_public_reply_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.comment_public_reply_reservations TO authenticated;
GRANT ALL ON TABLE public.comment_public_reply_reservations TO service_role;

-- ── 3: Atomic Public Reply Reservation RPC ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_comment_public_reply(
  p_instagram_account_id UUID,
  p_comment_id TEXT,
  p_automation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res RECORD;
  v_stale_interval INTERVAL := INTERVAL '10 minutes';
BEGIN
  -- Strict cross-entity validation: automation must belong to the specified instagram account
  IF NOT EXISTS (
    SELECT 1 FROM public.automations
    WHERE id = p_automation_id AND instagram_account_id = p_instagram_account_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'authorized', false,
      'status', 'error',
      'reason', 'invalid_automation_account_pair'
    );
  END IF;

  -- Attempt initial insert
  INSERT INTO public.comment_public_reply_reservations (
    instagram_account_id,
    comment_id,
    automation_id,
    status,
    reserved_at
  )
  VALUES (
    p_instagram_account_id,
    p_comment_id,
    p_automation_id,
    'reserved',
    pg_catalog.now()
  )
  ON CONFLICT (instagram_account_id, comment_id) DO NOTHING
  RETURNING * INTO v_res;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('authorized', true, 'status', 'reserved', 'reason', 'new_reservation');
  END IF;

  -- Conflict occurred: inspect existing reservation
  SELECT * INTO v_res
  FROM public.comment_public_reply_reservations
  WHERE instagram_account_id = p_instagram_account_id
    AND comment_id = p_comment_id;

  -- Case 1: Already sent
  IF v_res.status = 'sent' THEN
    RETURN pg_catalog.jsonb_build_object('authorized', false, 'status', 'sent', 'reason', 'already_sent');
  END IF;

  -- Case 2: Permanent failure recorded
  IF v_res.status = 'failed' THEN
    RETURN pg_catalog.jsonb_build_object('authorized', false, 'status', 'failed', 'reason', 'previously_failed');
  END IF;

  -- Case 3: In-flight reservation that went stale (> 10 mins without confirm)
  -- Transition stale reservation to 'failed' and fail closed.
  IF v_res.status = 'reserved' AND v_res.reserved_at < (pg_catalog.now() - v_stale_interval) THEN
    UPDATE public.comment_public_reply_reservations
    SET status = 'failed',
        failed_at = pg_catalog.now(),
        failure_reason = 'stale_unconfirmed_abandoned'
    WHERE instagram_account_id = p_instagram_account_id
      AND comment_id = p_comment_id
      AND status = 'reserved';

    RETURN pg_catalog.jsonb_build_object('authorized', false, 'status', 'failed', 'reason', 'stale_unconfirmed_abandoned');
  END IF;

  -- Case 4: In-flight active reservation held by another worker
  RETURN pg_catalog.jsonb_build_object('authorized', false, 'status', 'reserved', 'reason', 'in_flight');
END;
$$;

-- ── 4: Confirm Public Reply Sent RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_comment_public_reply_sent(
  p_instagram_account_id UUID,
  p_comment_id TEXT,
  p_reply_comment_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.comment_public_reply_reservations
  SET status = 'sent',
      sent_at = pg_catalog.now(),
      reply_comment_id = p_reply_comment_id
  WHERE instagram_account_id = p_instagram_account_id
    AND comment_id = p_comment_id
    AND status = 'reserved';
END;
$$;

-- ── 5: Release Public Reply Reservation RPC ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_comment_public_reply(
  p_instagram_account_id UUID,
  p_comment_id TEXT,
  p_automation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.comment_public_reply_reservations
  WHERE instagram_account_id = p_instagram_account_id
    AND comment_id = p_comment_id
    AND automation_id = p_automation_id
    AND status = 'reserved';
END;
$$;

-- ── 6: Mark Public Reply Failed RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_comment_public_reply_failed(
  p_instagram_account_id UUID,
  p_comment_id TEXT,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.comment_public_reply_reservations
  SET status = 'failed',
      failed_at = pg_catalog.now(),
      failure_reason = p_failure_reason
  WHERE instagram_account_id = p_instagram_account_id
    AND comment_id = p_comment_id;
END;
$$;

-- Revoke execute from public/anon/authenticated and grant strictly to service_role
REVOKE ALL ON FUNCTION public.reserve_comment_public_reply(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_comment_public_reply(UUID, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_comment_public_reply_sent(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_comment_public_reply_sent(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.release_comment_public_reply(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_comment_public_reply(UUID, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.mark_comment_public_reply_failed(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_comment_public_reply_failed(UUID, TEXT, TEXT) TO service_role;

-- ── 7: AI Usage Log Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id  UUID        REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  automation_id         UUID        REFERENCES public.automations(id) ON DELETE SET NULL,
  feature               TEXT        NOT NULL CHECK (feature IN ('opening_variations', 'runtime_response', 'public_reply_draft', 'public_reply_runtime')),
  model                 TEXT        NOT NULL,
  prompt_tokens         INTEGER,
  completion_tokens     INTEGER,
  status                TEXT        NOT NULL CHECK (status IN ('success', 'error', 'fallback')),
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON public.ai_usage_log(user_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own AI usage" ON public.ai_usage_log;
CREATE POLICY "Users can view own AI usage"
  ON public.ai_usage_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.ai_usage_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ai_usage_log TO authenticated;
GRANT ALL ON TABLE public.ai_usage_log TO service_role;
