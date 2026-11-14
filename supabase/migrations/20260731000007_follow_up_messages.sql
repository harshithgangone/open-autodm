-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260731000007_follow_up_messages.sql
--
-- Follow-up Message Builder & Compliance Infrastructure:
--  1. Add follow-up configuration columns to public.automations:
--     - follow_up_enabled: boolean default false
--     - follow_up_delay_minutes: integer default 60 (10, 20, 60, 120)
--     - follow_up_message: text default ''
--     - follow_up_ai_instructions: text
--  2. Create public.automation_follow_ups tracking table:
--     - Durable tracking of scheduled follow-ups with states:
--       'waiting_response', 'scheduled', 'sending', 'sent', 'skipped', 'expired', 'held', 'failed'
--     - Enforces Meta policy: comment triggers start in 'waiting_response'; only a verified inbound response promotes to 'scheduled'.
--     - Idempotency: UNIQUE (automation_id, recipient_id, qualified_event_id)
--  3. Row Level Security and indexes for high-throughput concurrency.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Automations follow-up columns ──────────────────────────────────────────
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_delay_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (follow_up_delay_minutes IN (10, 20, 60, 120)),
  ADD COLUMN IF NOT EXISTS follow_up_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up_ai_instructions TEXT;

-- ── 2. automation_follow_ups tracking table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_follow_ups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id         UUID        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  session_id            UUID        REFERENCES public.automation_sessions(id) ON DELETE SET NULL,
  recipient_id          TEXT        NOT NULL,
  recipient_username    TEXT,
  qualified_event_id    TEXT        NOT NULL,
  qualified_timestamp   TIMESTAMPTZ NOT NULL,
  scheduled_for         TIMESTAMPTZ NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'scheduled'
                                    CHECK (status IN ('waiting_response', 'scheduled', 'sending', 'sent', 'skipped', 'expired', 'held', 'failed')),
  message_snapshot      TEXT        NOT NULL DEFAULT '',
  error_reason          TEXT,
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_follow_up_schedule UNIQUE (automation_id, recipient_id, qualified_event_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_account_status
  ON public.automation_follow_ups (instagram_account_id, status);

CREATE INDEX IF NOT EXISTS idx_follow_ups_automation_status
  ON public.automation_follow_ups (automation_id, status);

CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled_for
  ON public.automation_follow_ups (scheduled_for) WHERE status = 'scheduled';

ALTER TABLE public.automation_follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own follow ups" ON public.automation_follow_ups;
CREATE POLICY "Users can view own follow ups"
  ON public.automation_follow_ups FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.automations a WHERE a.id = automation_follow_ups.automation_id AND a.user_id = auth.uid()));

GRANT ALL ON TABLE public.automation_follow_ups TO service_role;
GRANT SELECT ON TABLE public.automation_follow_ups TO authenticated;
