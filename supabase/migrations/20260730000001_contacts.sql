-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Contacts (automation-captured audience CRM)
--
-- A contact is every unique audience member captured through an automation
-- interaction: commented a trigger, DM'd a keyword, story-replied, or tapped
-- a flow button. Rows are written by the engine (service role) as events flow;
-- usernames + follow status are enriched from Instagram's User Profile API
-- (available for anyone who has messaged the account).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.contacts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  audience_ig_user_id   TEXT        NOT NULL,   -- IGSID of the audience member

  username              TEXT,                   -- enriched: comments carry it; DMs via profile API
  follows_business      BOOLEAN,                -- last known follow status (null = never checked)

  first_interaction_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_interaction_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_trigger_type     TEXT,                   -- 'comment' | 'dm' | 'story_reply' | 'button'
  last_automation_id    UUID        REFERENCES public.automations(id) ON DELETE SET NULL,
  total_triggers        INTEGER     NOT NULL DEFAULT 1,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_contacts_account_audience
  ON public.contacts (instagram_account_id, audience_ig_user_id);
CREATE INDEX idx_contacts_last_interaction
  ON public.contacts (instagram_account_id, last_interaction_at DESC);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Users see contacts captured by their own connected accounts. Writes are
-- service-role only (the engine).
CREATE POLICY "Users can view own contacts"
  ON public.contacts FOR SELECT
  USING (
    instagram_account_id IN (
      SELECT id FROM public.instagram_accounts WHERE user_id = auth.uid()
    )
  );

-- ── RPC: record an interaction (atomic upsert + counter) ───────────────────
CREATE OR REPLACE FUNCTION public.record_contact_interaction(
  p_account_id    UUID,
  p_audience_id   TEXT,
  p_username      TEXT,
  p_trigger_type  TEXT,
  p_automation_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.contacts (
    instagram_account_id, audience_ig_user_id, username,
    last_trigger_type, last_automation_id
  )
  VALUES (p_account_id, p_audience_id, NULLIF(TRIM(p_username), ''), p_trigger_type, p_automation_id)
  ON CONFLICT (instagram_account_id, audience_ig_user_id) DO UPDATE SET
    last_interaction_at = NOW(),
    last_trigger_type   = EXCLUDED.last_trigger_type,
    last_automation_id  = COALESCE(EXCLUDED.last_automation_id, contacts.last_automation_id),
    username            = COALESCE(EXCLUDED.username, contacts.username),
    total_triggers      = contacts.total_triggers + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_contact_interaction(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ── RPC: enrich profile fields (username / follow status) ──────────────────
CREATE OR REPLACE FUNCTION public.update_contact_profile(
  p_account_id  UUID,
  p_audience_id TEXT,
  p_username    TEXT,
  p_follows     BOOLEAN
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.contacts SET
    username         = COALESCE(NULLIF(TRIM(p_username), ''), username),
    follows_business = COALESCE(p_follows, follows_business)
  WHERE instagram_account_id = p_account_id AND audience_ig_user_id = p_audience_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_contact_profile(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
