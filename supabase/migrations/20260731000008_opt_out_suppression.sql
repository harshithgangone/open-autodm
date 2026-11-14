-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Recipient Opt-Out & Suppression Migration
--
-- Provides persistent, recipient-level opt-out suppression to honor user intent
-- (e.g. STOP, UNSUBSCRIBE, DON'T DM ME) and Meta platform policies.
--
-- Guarantees:
-- 1. Recipient opt-out state is persisted per connected Instagram account.
-- 2. Once opted out, an audience member can never be sent an automated DM,
--    follow-up, or public reply from that account.
-- 3. Duplicate opt-out events are handled idempotently via uq_recipient_opt_out.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recipient_opt_outs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  recipient_id          TEXT        NOT NULL,
  trigger_event_id      TEXT,
  opt_out_text          TEXT,
  reason                TEXT        NOT NULL DEFAULT 'keyword',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_recipient_opt_out UNIQUE (instagram_account_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipient_opt_outs_lookup 
  ON public.recipient_opt_outs(instagram_account_id, recipient_id);

ALTER TABLE public.recipient_opt_outs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recipient opt outs" ON public.recipient_opt_outs;
CREATE POLICY "Users can view own recipient opt outs"
  ON public.recipient_opt_outs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.instagram_accounts a
    WHERE a.id = recipient_opt_outs.instagram_account_id AND a.user_id = auth.uid()
  ));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.instagram_accounts TO authenticated;
REVOKE ALL ON TABLE public.recipient_opt_outs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.recipient_opt_outs TO authenticated;
GRANT ALL ON TABLE public.recipient_opt_outs TO service_role;

-- ── 1: Atomic Opt-Out Record RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_recipient_opt_out(
  p_instagram_account_id UUID,
  p_recipient_id TEXT,
  p_trigger_event_id TEXT DEFAULT NULL,
  p_opt_out_text TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'keyword'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.recipient_opt_outs (
    instagram_account_id,
    recipient_id,
    trigger_event_id,
    opt_out_text,
    reason,
    created_at
  )
  VALUES (
    p_instagram_account_id,
    p_recipient_id,
    p_trigger_event_id,
    p_opt_out_text,
    p_reason,
    pg_catalog.now()
  )
  ON CONFLICT (instagram_account_id, recipient_id) DO UPDATE
  SET
    trigger_event_id = COALESCE(EXCLUDED.trigger_event_id, public.recipient_opt_outs.trigger_event_id),
    opt_out_text = COALESCE(EXCLUDED.opt_out_text, public.recipient_opt_outs.opt_out_text),
    reason = EXCLUDED.reason;

  RETURN true;
END;
$$;

-- ── 2: Suppression Check RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_recipient_suppressed(
  p_instagram_account_id UUID,
  p_recipient_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.recipient_opt_outs
    WHERE instagram_account_id = p_instagram_account_id
      AND recipient_id = p_recipient_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_recipient_opt_out(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_recipient_opt_out(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.is_recipient_suppressed(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_recipient_suppressed(UUID, TEXT) TO service_role;
