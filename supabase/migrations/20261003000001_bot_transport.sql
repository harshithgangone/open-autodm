-- Generic external-bot transport. Secrets and queues are service-role only.
CREATE TABLE public.bot_integrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL, webhook_url text NOT NULL, token_hash text NOT NULL UNIQUE,
 signing_secret_encrypted text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 last_claimed_at timestamptz NOT NULL DEFAULT 'epoch', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.account_bot_bindings (
 account_id uuid PRIMARY KEY REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
 integration_id uuid REFERENCES public.bot_integrations(id), revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE public.webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), body_hash text NOT NULL UNIQUE,
 body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bot_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
 sender_id text NOT NULL, paused boolean NOT NULL DEFAULT false, last_inbound_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id, sender_id)
);
CREATE TABLE public.bot_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.bot_conversations(id) ON DELETE CASCADE,
 integration_id uuid NOT NULL REFERENCES public.bot_integrations(id) ON DELETE CASCADE, binding_revision bigint NOT NULL,
 direction text NOT NULL CHECK(direction IN ('inbound','outbound')), text text NOT NULL,
 external_id text, in_reply_to_event_id uuid REFERENCES public.bot_messages(id), idempotency_key text, request_hash text,
 status text NOT NULL CHECK(status IN ('received','queued','sending','sent','failed','delivery_unknown')),
 error_code text, occurred_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(integration_id,idempotency_key)
);
-- Deduplication remains effective across detach/rebind cycles.
CREATE UNIQUE INDEX bot_messages_inbound_unique ON public.bot_messages(conversation_id,external_id) WHERE direction='inbound';
CREATE INDEX bot_messages_conversation ON public.bot_messages(conversation_id,created_at);
CREATE TABLE public.bot_transport_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('webhook','event','send')),
 ref_id uuid NOT NULL, integration_id uuid REFERENCES public.bot_integrations(id) ON DELETE CASCADE,
 lane text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
 run_after timestamptz NOT NULL DEFAULT now(), claim_token uuid, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, last_error text,
 sequence bigint GENERATED ALWAYS AS IDENTITY, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,ref_id)
);
CREATE INDEX bot_jobs_due ON public.bot_transport_jobs(run_after) WHERE status='pending';
CREATE INDEX bot_jobs_lane ON public.bot_transport_jobs(lane,sequence) WHERE status IN ('pending','processing');
ALTER TABLE public.bot_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_bot_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_transport_jobs ENABLE ROW LEVEL SECURITY;
-- No direct browser access; API verifies owners/integration tokens before service-role queries.
REVOKE ALL ON public.bot_integrations,public.account_bot_bindings,public.webhook_events,
 public.bot_conversations,public.bot_messages,public.bot_transport_jobs FROM anon,authenticated;
GRANT ALL ON public.bot_integrations,public.account_bot_bindings,public.webhook_events,
 public.bot_conversations,public.bot_messages,public.bot_transport_jobs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot_transport_jobs_sequence_seq TO service_role;

CREATE FUNCTION public.transport_store_webhook(p_hash text,p_body jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 INSERT INTO webhook_events(body_hash,body) VALUES(p_hash,p_body) ON CONFLICT(body_hash) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN
  INSERT INTO bot_transport_jobs(kind,ref_id,lane) VALUES('webhook',v_id,'webhook:'||v_id);
 ELSE SELECT id INTO v_id FROM webhook_events WHERE body_hash=p_hash;
 END IF;
 RETURN v_id;
END $$;

CREATE FUNCTION public.transport_bind(p_user uuid,p_account uuid,p_integration uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_revision bigint;
BEGIN
 PERFORM 1 FROM instagram_accounts WHERE id=p_account AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 IF p_integration IS NOT NULL THEN
  PERFORM 1 FROM bot_integrations WHERE id=p_integration AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 END IF;
 INSERT INTO account_bot_bindings(account_id,integration_id) VALUES(p_account,p_integration)
 ON CONFLICT(account_id) DO UPDATE SET integration_id=excluded.integration_id, revision=account_bot_bindings.revision+1
 RETURNING revision INTO v_revision;
 RETURN v_revision;
END $$;

CREATE FUNCTION public.transport_ingest_dm(p_account uuid,p_sender text,p_mid text,p_text text,p_occurred timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b account_bot_bindings; c uuid; m uuid;
BEGIN
 PERFORM 1 FROM instagram_accounts WHERE id=p_account FOR SHARE;
 SELECT * INTO b FROM account_bot_bindings WHERE account_id=p_account FOR SHARE;
 IF b.integration_id IS NULL THEN RETURN 'unbound'; END IF;
 IF p_occurred > now()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid_timestamp'; END IF;
 INSERT INTO bot_conversations(account_id,sender_id,last_inbound_at) VALUES(p_account,p_sender,LEAST(p_occurred,now()))
 ON CONFLICT(account_id,sender_id) DO UPDATE SET sender_id=bot_conversations.sender_id
 RETURNING id INTO c;
 INSERT INTO bot_messages(conversation_id,integration_id,binding_revision,direction,text,external_id,status,occurred_at)
 VALUES(c,b.integration_id,b.revision,'inbound',p_text,p_mid,'received',p_occurred)
 ON CONFLICT(conversation_id,external_id) WHERE direction='inbound' DO NOTHING RETURNING id INTO m;
 IF m IS NOT NULL THEN
  UPDATE bot_conversations SET last_inbound_at=GREATEST(last_inbound_at,LEAST(p_occurred,now())) WHERE id=c;
  INSERT INTO bot_transport_jobs(kind,ref_id,integration_id,lane) VALUES('event',m,b.integration_id,'event:'||c);
  RETURN 'received';
 END IF;
 RETURN 'duplicate';
END $$;

CREATE FUNCTION public.transport_queue_reply(p_integration uuid,p_conversation uuid,p_event uuid,p_text text,p_key text,p_hash text)
RETURNS public.bot_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c bot_conversations; b account_bot_bindings; m bot_messages;
BEGIN
 -- Serialize the idempotency key across conversations without a global lock.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_integration::text||':'||p_key,0));
 SELECT * INTO m FROM bot_messages WHERE integration_id=p_integration AND idempotency_key=p_key;
 IF FOUND THEN
  IF m.request_hash<>p_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN m;
 END IF;
 SELECT * INTO c FROM bot_conversations WHERE id=p_conversation;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 PERFORM 1 FROM instagram_accounts WHERE id=c.account_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO b FROM account_bot_bindings WHERE account_id=c.account_id FOR SHARE;
 SELECT * INTO c FROM bot_conversations WHERE id=p_conversation FOR SHARE;
 IF b.integration_id IS DISTINCT FROM p_integration OR NOT EXISTS(
  SELECT 1 FROM bot_integrations WHERE id=p_integration AND enabled
 ) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bot_messages WHERE id=p_event AND conversation_id=c.id AND direction='inbound'
  AND integration_id=p_integration AND binding_revision=b.revision) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF c.paused THEN RAISE EXCEPTION 'conversation_paused'; END IF;
 IF c.last_inbound_at < now()-interval '24 hours' THEN RAISE EXCEPTION 'window_closed'; END IF;
 IF length(p_text)<1 OR length(p_text)>1000 THEN RAISE EXCEPTION 'invalid_text'; END IF;
 INSERT INTO bot_messages(conversation_id,integration_id,binding_revision,direction,text,in_reply_to_event_id,idempotency_key,request_hash,status)
 VALUES(c.id,p_integration,b.revision,'outbound',p_text,p_event,p_key,p_hash,'queued') RETURNING * INTO m;
 INSERT INTO bot_transport_jobs(kind,ref_id,integration_id,lane) VALUES('send',m.id,p_integration,'send:'||c.id);
 RETURN m;
END $$;

CREATE FUNCTION public.transport_claim(p_limit integer DEFAULT 16) RETURNS SETOF public.bot_transport_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A crashed send may already have reached Meta. Never automatically repeat it.
 WITH lost AS (
  UPDATE bot_transport_jobs j SET status='failed',last_error='delivery_unknown'
  WHERE j.status='processing' AND j.lease_until<now() AND j.kind='send'
   AND EXISTS(SELECT 1 FROM bot_messages m WHERE m.id=j.ref_id AND m.status='sending') RETURNING ref_id
 ) UPDATE bot_messages SET status='delivery_unknown',error_code='worker_lost' WHERE id IN(SELECT ref_id FROM lost);
 WITH expired AS (
 UPDATE bot_transport_jobs SET status=CASE WHEN attempts>=9 THEN 'failed' ELSE 'pending' END,
  claim_token=NULL,lease_until=NULL,attempts=attempts+1,last_error='lease_expired'
 WHERE status='processing' AND lease_until<now() RETURNING ref_id,kind,status
 ) UPDATE bot_messages SET status='failed',error_code='lease_exhausted'
 WHERE id IN(SELECT ref_id FROM expired WHERE kind='send' AND status='failed');
 RETURN QUERY WITH candidates AS (
  SELECT j.id,j.integration_id,j.run_after,i.last_claimed_at,
   row_number() OVER(PARTITION BY j.integration_id ORDER BY j.run_after,j.sequence) AS turn
  FROM bot_transport_jobs j LEFT JOIN bot_integrations i ON i.id=j.integration_id
  WHERE j.status='pending' AND j.run_after<=now() AND NOT EXISTS(
   SELECT 1 FROM bot_transport_jobs older WHERE older.lane=j.lane AND older.sequence<j.sequence
    AND older.status IN ('pending','processing')
  )
 ), picked AS (
  SELECT j.id FROM bot_transport_jobs j JOIN candidates c ON c.id=j.id WHERE c.turn=1 AND j.status='pending'
  ORDER BY c.turn,COALESCE(c.last_claimed_at,'epoch'),c.run_after,j.sequence
  LIMIT LEAST(GREATEST(p_limit,1),32) FOR UPDATE OF j SKIP LOCKED
 ), claimed AS (
  UPDATE bot_transport_jobs j SET status='processing',claim_token=gen_random_uuid(),lease_until=now()+interval '60 seconds'
  WHERE j.id IN(SELECT id FROM picked) RETURNING j.*
 ), fair AS (
  UPDATE bot_integrations SET last_claimed_at=now() WHERE id IN(SELECT integration_id FROM claimed)
 ) SELECT * FROM claimed;

END $$;

-- Rechecks routing and all send guards immediately before network I/O.
CREATE FUNCTION public.transport_context(p_job uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j bot_transport_jobs; m bot_messages; c bot_conversations; b account_bot_bindings;
 i bot_integrations; a instagram_accounts; r record; reason text;
BEGIN
 SELECT * INTO j FROM bot_transport_jobs WHERE id=p_job AND claim_token=p_token AND status='processing' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF j.kind='webhook' THEN RETURN (SELECT jsonb_build_object('body',body) FROM webhook_events WHERE id=j.ref_id); END IF;
 SELECT * INTO m FROM bot_messages WHERE id=j.ref_id;
 SELECT * INTO c FROM bot_conversations WHERE id=m.conversation_id;
 SELECT * INTO a FROM instagram_accounts WHERE id=c.account_id FOR SHARE;
 SELECT * INTO b FROM account_bot_bindings WHERE account_id=c.account_id FOR SHARE;
 SELECT * INTO c FROM bot_conversations WHERE id=m.conversation_id FOR SHARE;
 SELECT * INTO i FROM bot_integrations WHERE id=m.integration_id FOR SHARE;
 IF m.id IS NULL OR a.id IS NULL OR NOT a.is_active THEN reason:='account_unavailable';
 ELSIF b.integration_id IS DISTINCT FROM m.integration_id OR b.revision<>m.binding_revision THEN reason:='binding_changed';
 ELSIF j.kind='send' AND c.last_inbound_at<now()-interval '24 hours' THEN reason:='window_closed';
 END IF;
 IF reason IS NOT NULL THEN
  UPDATE bot_transport_jobs SET status='failed',last_error=reason WHERE id=j.id;
  UPDATE bot_messages SET status='failed',error_code=reason WHERE id=m.id AND direction='outbound';
  RETURN NULL;
 END IF;
 IF c.paused OR NOT i.enabled OR (a.paused_until IS NOT NULL AND a.paused_until>now()) THEN
  UPDATE bot_transport_jobs SET status='pending',run_after=now()+interval '60 seconds',claim_token=NULL,lease_until=NULL WHERE id=j.id;
  RETURN NULL;
 END IF;
 IF j.kind='send' THEN
  IF m.status<>'queued' THEN
   UPDATE bot_transport_jobs SET status='failed',last_error='invalid_message_state' WHERE id=j.id;
   RETURN NULL;
  END IF;
  IF a.token_expires_at IS NOT NULL AND a.token_expires_at<now() THEN
   UPDATE bot_transport_jobs SET status='failed',last_error='token_expired' WHERE id=j.id;
   UPDATE bot_messages SET status='failed',error_code='token_expired' WHERE id=m.id;
   RETURN NULL;
  END IF;
  SELECT * INTO r FROM check_and_record_dm_rate_limit(a.id,180);
  IF r.allowed IS DISTINCT FROM true THEN
   UPDATE bot_transport_jobs SET status='pending',run_after=now()+make_interval(secs=>COALESCE(r.retry_after_seconds,60)),claim_token=NULL,lease_until=NULL WHERE id=j.id;
   RETURN NULL;
  END IF;
  UPDATE bot_messages SET status='sending' WHERE id=m.id;
 END IF;
 RETURN jsonb_build_object('message',to_jsonb(m),'conversation',to_jsonb(c),
  'integration',jsonb_build_object('id',i.id,'webhook_url',i.webhook_url,'signing_secret_encrypted',i.signing_secret_encrypted),
  'account',jsonb_build_object('id',a.id,'instagram_user_id',a.instagram_user_id,'access_token_encrypted',a.access_token_encrypted));
END $$;

CREATE FUNCTION public.transport_finish(p_job uuid,p_token uuid,p_state text,p_error text DEFAULT NULL,p_external text DEFAULT NULL,p_delay integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j bot_transport_jobs; retry boolean;
BEGIN
 SELECT * INTO j FROM bot_transport_jobs WHERE id=p_job AND claim_token=p_token AND status='processing' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_state NOT IN ('done','retry','failed','delivery_unknown') THEN RAISE EXCEPTION 'invalid_state'; END IF;
 retry:=p_state='retry' AND j.attempts<9;
 UPDATE bot_transport_jobs SET status=CASE WHEN retry THEN 'pending' WHEN p_state='done' THEN 'done' ELSE 'failed' END,
  run_after=now()+make_interval(secs=>GREATEST(p_delay,1)),attempts=attempts+CASE WHEN p_state='retry' THEN 1 ELSE 0 END,
  last_error=p_error,claim_token=NULL,lease_until=NULL WHERE id=j.id;
 IF j.kind='send' THEN
  UPDATE bot_messages SET status=CASE WHEN retry THEN 'queued' WHEN p_state='done' THEN 'sent'
   WHEN p_state='delivery_unknown' THEN 'delivery_unknown' ELSE 'failed' END,
   error_code=p_error,external_id=COALESCE(p_external,external_id) WHERE id=j.ref_id;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.transport_cleanup() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM webhook_events WHERE created_at<now()-interval '7 days' AND id IN(
  SELECT ref_id FROM bot_transport_jobs WHERE kind='webhook' AND status IN ('done','failed'));
 DELETE FROM bot_transport_jobs WHERE status IN ('done','failed') AND created_at<now()-interval '30 days';
 DELETE FROM bot_messages m WHERE direction='outbound' AND created_at<now()-interval '30 days' AND status IN ('sent','failed','delivery_unknown')
  AND NOT EXISTS(SELECT 1 FROM bot_transport_jobs j WHERE j.ref_id=m.id AND j.status IN ('pending','processing'));
 DELETE FROM bot_messages m WHERE direction='inbound' AND created_at<now()-interval '30 days'
  AND NOT EXISTS(SELECT 1 FROM bot_messages replies WHERE replies.in_reply_to_event_id=m.id)
  AND NOT EXISTS(SELECT 1 FROM bot_transport_jobs j WHERE j.ref_id=m.id AND j.status IN ('pending','processing'));
END $$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default. Restrict every new RPC.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'transport_%' OR proname IN ('claim_due_jobs','check_and_record_dm_rate_limit','cleanup_old_rows','increment_automation_dms_sent','record_contact_interaction','update_contact_profile')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
