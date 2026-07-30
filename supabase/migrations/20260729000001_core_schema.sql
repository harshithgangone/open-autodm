-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Core schema
--
-- profiles            → extends auth.users
-- instagram_accounts  → connected IG accounts (AES-256-GCM encrypted tokens)
-- automations         → AutoDM rules
-- dm_jobs             → audit log of every processed job
-- dm_sent_log         → deduplication (UNIQUE constraints are the guarantee)
-- automation_sessions → 2-step DM flow state (quick-reply button routing)
-- dm_logs             → per-session conversation history
-- debug_events        → live debug panel event stream
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shared trigger: auto-update updated_at ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── profiles ───────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: users created in the dashboard BEFORE this migration ran have no
-- profiles row (the trigger above didn't exist yet). No-op on fresh projects.
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT id, raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── instagram_accounts ─────────────────────────────────────────────────────
CREATE TABLE public.instagram_accounts (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  instagram_user_id       TEXT        NOT NULL,  -- Meta IGSID of the business account
  username                TEXT        NOT NULL,
  name                    TEXT,
  profile_picture_url     TEXT,

  -- AES-256-GCM encrypted. Format: iv_hex:ciphertext_hex:authtag_hex. NEVER logged.
  access_token_encrypted  TEXT        NOT NULL,
  token_expires_at        TIMESTAMPTZ,

  is_active               BOOLEAN     NOT NULL DEFAULT true,

  -- Safety circuit breaker: when Meta returns a policy/spam block for this
  -- account, the engine pauses all sends until this timestamp.
  paused_until            TIMESTAMPTZ,
  pause_reason            TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_instagram_accounts_igsid ON public.instagram_accounts(instagram_user_id);
CREATE INDEX idx_instagram_accounts_user_id ON public.instagram_accounts(user_id);
CREATE INDEX idx_instagram_accounts_is_active ON public.instagram_accounts(is_active) WHERE is_active = true;
CREATE INDEX idx_instagram_accounts_token_expiry ON public.instagram_accounts(token_expires_at) WHERE is_active = true;

CREATE TRIGGER instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instagram accounts"
  ON public.instagram_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own instagram accounts"
  ON public.instagram_accounts FOR DELETE USING (auth.uid() = user_id);

-- ── automations ────────────────────────────────────────────────────────────
CREATE TYPE public.automation_type AS ENUM ('comment_dm', 'dm_reply', 'story_reply');

CREATE TABLE public.automations (
  id                                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                             UUID            NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  instagram_account_id                UUID            NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,

  name                                TEXT            NOT NULL,
  type                                automation_type NOT NULL,
  is_active                           BOOLEAN         NOT NULL DEFAULT true,

  -- Trigger: specific post (comment_dm) or NULL = all posts
  post_id                             TEXT,
  post_thumbnail_url                  TEXT,           -- UI snapshot, best-effort
  post_caption                        TEXT,           -- UI snapshot, best-effort

  -- NULL = any content triggers. ["*ANY*"] = explicit wildcard.
  -- Otherwise: case-insensitive whole-word match.
  keywords                            TEXT[],

  -- Public comment replies - one picked at random per trigger. Empty = none.
  comment_reply_options               TEXT[]          NOT NULL DEFAULT '{}',

  -- Opening DM
  dm_opening_message_enabled          BOOLEAN         NOT NULL DEFAULT true,
  dm_opening_message                  TEXT            NOT NULL DEFAULT '',
  dm_opening_message_button_title     TEXT,
  dm_opening_message_button_link      TEXT,

  -- Ask-to-follow gate (honor system - Meta has no follower-check endpoint)
  ask_to_follow_enabled               BOOLEAN         NOT NULL DEFAULT false,
  ask_to_follow_message               TEXT            NOT NULL DEFAULT 'Hey! It seems you''re not following me yet 😊',
  ask_to_follow_visit_profile_button  TEXT            NOT NULL DEFAULT 'Visit Profile',
  ask_to_follow_confirm_button        TEXT            NOT NULL DEFAULT 'I''m following ✅',

  -- Sequential responses after the quick-reply tap. JSONB array of DMResponse.
  dm_responses                        JSONB           NOT NULL DEFAULT '[]'::JSONB,

  total_dms_sent                      BIGINT          NOT NULL DEFAULT 0,

  created_at                          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

ALTER TABLE public.automations
  ADD CONSTRAINT chk_dm_responses_is_array CHECK (jsonb_typeof(dm_responses) = 'array');

CREATE INDEX idx_automations_user_id ON public.automations(user_id);
CREATE INDEX idx_automations_active_account_type
  ON public.automations(instagram_account_id, type) WHERE is_active = true;

CREATE TRIGGER automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own automations"
  ON public.automations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own automations"
  ON public.automations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own automations"
  ON public.automations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own automations"
  ON public.automations FOR DELETE USING (auth.uid() = user_id);

-- ── dm_jobs (audit log) ────────────────────────────────────────────────────
CREATE TYPE public.dm_job_status AS ENUM ('queued', 'processing', 'sent', 'failed', 'skipped');

CREATE TABLE public.dm_jobs (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id         UUID          NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  instagram_account_id  UUID          NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,

  trigger_type          TEXT          NOT NULL CHECK (trigger_type IN ('comment', 'dm', 'story_reply', 'dm_reply_followup')),
  trigger_user_id       TEXT          NOT NULL,
  trigger_event_id      TEXT          NOT NULL,
  trigger_timestamp     TIMESTAMPTZ   NOT NULL,

  status                dm_job_status NOT NULL DEFAULT 'queued',
  error_message         TEXT,
  attempts              INTEGER       NOT NULL DEFAULT 0,
  sent_at               TIMESTAMPTZ,
  -- Idempotency for the public comment reply: a retried job must never post
  -- the visible reply a second time even when the DM leg is retried.
  public_reply_sent_at  TIMESTAMPTZ,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Required by the status-upsert (ON CONFLICT target)
CREATE UNIQUE INDEX uq_dm_jobs_automation_event ON public.dm_jobs(automation_id, trigger_event_id);
CREATE INDEX idx_dm_jobs_created_at ON public.dm_jobs(created_at DESC);

CREATE TRIGGER dm_jobs_updated_at
  BEFORE UPDATE ON public.dm_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.dm_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dm jobs"
  ON public.dm_jobs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.automations a WHERE a.id = dm_jobs.automation_id AND a.user_id = auth.uid()));

-- ── dm_sent_log (deduplication - DB-level guarantee) ───────────────────────
CREATE TABLE public.dm_sent_log (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  automation_id         UUID        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  trigger_user_id       TEXT        NOT NULL,
  trigger_event_id      TEXT        NOT NULL,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One DM per trigger event per automation. Non-negotiable.
CREATE UNIQUE INDEX uq_dm_sent_log_automation_event ON public.dm_sent_log(automation_id, trigger_event_id);
-- One DM per person per automation (even across multiple comments).
CREATE UNIQUE INDEX uq_dm_sent_log_automation_user ON public.dm_sent_log(automation_id, trigger_user_id);
CREATE INDEX idx_dm_sent_log_sent_at ON public.dm_sent_log(sent_at DESC);

ALTER TABLE public.dm_sent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dm sent log"
  ON public.dm_sent_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.automations a WHERE a.id = dm_sent_log.automation_id AND a.user_id = auth.uid()));

-- ── automation_sessions (2-step quick-reply flow) ──────────────────────────
CREATE TABLE public.automation_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id         UUID        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  instagram_account_id  UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  audience_ig_user_id   TEXT        NOT NULL,
  current_step          INTEGER     NOT NULL DEFAULT 1,
  completed             BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at            TIMESTAMPTZ NOT NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active session per (automation, audience member).
CREATE UNIQUE INDEX automation_sessions_active_unique
  ON public.automation_sessions (automation_id, audience_ig_user_id) WHERE completed = FALSE;
CREATE INDEX automation_sessions_lookup_idx
  ON public.automation_sessions (instagram_account_id, audience_ig_user_id, completed, expires_at);

ALTER TABLE public.automation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own automation sessions"
  ON public.automation_sessions FOR SELECT
  USING (automation_id IN (SELECT id FROM public.automations WHERE user_id = auth.uid()));

-- ── dm_logs (conversation history) ─────────────────────────────────────────
CREATE TABLE public.dm_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.automation_sessions(id) ON DELETE CASCADE,
  direction    TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  step         INTEGER,
  message_text TEXT        NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dm_logs_session_idx ON public.dm_logs (session_id, sent_at);

ALTER TABLE public.dm_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dm logs"
  ON public.dm_logs FOR SELECT
  USING (session_id IN (
    SELECT s.id FROM public.automation_sessions s
    JOIN public.automations a ON a.id = s.automation_id
    WHERE a.user_id = auth.uid()
  ));

-- ── debug_events (live debug panel) ────────────────────────────────────────
CREATE TABLE public.debug_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  service      TEXT         NOT NULL,                  -- 'webhook' | 'worker' | 'instagram'
  level        TEXT         NOT NULL DEFAULT 'info',   -- 'info' | 'warn' | 'error'
  event_type   TEXT         NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'ok',     -- 'ok' | 'error' | 'skipped' | 'processing'
  message      TEXT         NOT NULL,
  metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX debug_events_created_at_idx ON public.debug_events (created_at DESC);

-- No user policies: service-role only (read surfaced via API in debug mode).
ALTER TABLE public.debug_events ENABLE ROW LEVEL SECURITY;

-- ── RPC: atomic DM counter ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_automation_dms_sent(automation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.automations SET total_dms_sent = total_dms_sent + 1 WHERE id = automation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_automation_dms_sent(UUID) TO service_role;

-- ── Storage bucket for card DM images (public: Meta must fetch the URLs) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-images', 'card-images', true, 2097152, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auth users upload card images') THEN
    CREATE POLICY "Auth users upload card images"
      ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'card-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read card images') THEN
    CREATE POLICY "Public read card images"
      ON storage.objects FOR SELECT TO public USING (bucket_id = 'card-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auth users delete card images') THEN
    CREATE POLICY "Auth users delete card images"
      ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'card-images');
  END IF;
END $$;
