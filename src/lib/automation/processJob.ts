/**
 * AutoDM job processors — battle-tested logic, adapted
 * for serverless execution with three extra safety layers:
 *
 *  1. Postgres rate limiter — check_and_record_dm_rate_limit RPC, atomic,
 *     180 DMs/hour rolling window per account (20-DM buffer under Meta's 200).
 *  2. Human-like jitter — a randomized 2–5s pause before every send, so
 *     automated replies never look machine-instant to Instagram.
 *  3. Circuit breaker — if Meta returns a policy/spam block (code 368), the
 *     entire account is paused for 24h instead of retrying into a ban.
 *
 * processAutoDmJob   — opening DM (comment / dm_reply keyword trigger)
 * processFollowUpDmJob — follow-up after a quick-reply / postback tap
 *
 * Control flow contract with the engine:
 *  - return 'done'                 → job completed or intentionally skipped
 *  - throw RateLimitDelay          → reschedule without counting an attempt
 *  - throw AccountPausedMetaError  → pause account + fail job
 *  - throw NonRetryableMetaError   → fail job
 *  - throw anything else           → retry with backoff (max_attempts guard)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import { decrypt } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import type { AutoDmJobPayload, AutomationRow, InstagramAccountRow, DMResponse } from '@/lib/types';
import {
  sendInstagramDm,
  sendInstagramLinkButtonDm,
  sendInstagramCardDm,
  sendAskToFollowDm,
  replyToComment,
  getAudienceProfile,
  type DmRecipient,
} from '@/lib/instagram/api';
import { updateContactProfile } from '@/lib/automation/contacts';
import { MetaApiError, AccountPausedMetaError } from '@/lib/instagram/errors';

/**
 * True when a failed button-template send should be retried as plain text
 * with an inline link. Template rejections surface as parameter/permission
 * errors; a policy block (368) must propagate so the circuit breaker opens
 * instead of immediately re-hitting Meta.
 */
function shouldFallBackToInlineLink(err: unknown): err is MetaApiError {
  return err instanceof MetaApiError && !(err instanceof AccountPausedMetaError);
}
import { renderTemplate } from '@/lib/automation/personalize';

/** Sends a single configured response (text w/ optional link button, or card). */
async function sendOneResponse(
  igAccountIgsid: string,
  recipient: DmRecipient,
  audienceId: string,
  response: DMResponse,
  username: string | null | undefined,
  accessToken: string
): Promise<void> {
  if (response.type === 'card') {
    const cardImageUrl = response.cardImage?.startsWith('http') ? response.cardImage : undefined;
    await sendInstagramCardDm(igAccountIgsid, audienceId, accessToken, {
      title: response.cardTitle ?? response.content,
      ...(cardImageUrl !== undefined ? { imageUrl: cardImageUrl } : {}),
      ...(response.cardSubtitle !== undefined ? { subtitle: response.cardSubtitle } : {}),
      ...(response.cardButtons !== undefined
        ? { buttons: response.cardButtons.map((b) => ({ title: b.title, url: b.link })) }
        : {}),
    });
    return;
  }

  const messageText = renderTemplate(response.content.trim(), username);
  const link = response.buttonLink?.trim();
  if (link) {
    const buttonTitle = response.buttonTitle?.trim() || 'Open link';
    try {
      await sendInstagramLinkButtonDm(igAccountIgsid, recipient, messageText, buttonTitle, link, accessToken);
    } catch (buttonErr) {
      if (!shouldFallBackToInlineLink(buttonErr)) throw buttonErr;
      await sendInstagramDm(igAccountIgsid, recipient, `${messageText}\n\n${buttonTitle}: ${link}`, accessToken);
    }
  } else {
    await sendInstagramDm(igAccountIgsid, recipient, messageText, accessToken);
  }
}

/**
 * Best-effort sequential delivery of configured responses for the 1-step flow
 * (no reveal button). Per-response failures are logged and skipped rather than
 * thrown — the opening DM already went out and is dedup-recorded, so a retry
 * could never resend it; losing one response beats losing the whole flow.
 */
async function deliverResponsesBestEffort(
  payload: AutoDmJobPayload,
  responses: DMResponse[],
  accessToken: string
): Promise<number> {
  let sent = 0;
  for (const [idx, response] of responses.entries()) {
    if (!response.content?.trim() && response.type !== 'card') continue;
    try {
      await sendOneResponse(
        payload.igAccountIgsid,
        { id: payload.triggerUserId },
        payload.triggerUserId,
        response,
        payload.triggerUsername,
        accessToken
      );
      sent += 1;
      debugLog('worker', 'info', 'responses_send', 'ok', `Response ${idx + 1}/${responses.length} sent (1-step flow)`, {
        responseIndex: idx + 1,
        type: response.type,
      });
    } catch (err) {
      if (err instanceof AccountPausedMetaError) throw err; // circuit breaker must still open
      debugLog('worker', 'warn', 'responses_send', 'error',
        `Response ${idx + 1}/${responses.length} failed (1-step flow, skipped): ${err instanceof Error ? err.message : String(err)}`,
        { responseIndex: idx + 1 });
    }
  }
  return sent;
}

const logger = createLogger('worker');

/** Meta's DM window: only message users who engaged within the last 24h. */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

/** Hourly DM cap per account (Meta hard limit is 200; 20-DM safety buffer). */
export const DM_LIMIT_PER_HOUR = 180;

/** Randomized pre-send delay — automation that behaves like a human. */
const JITTER_MIN_MS = 2000;
const JITTER_MAX_MS = 5000;

/** Thrown when the hourly window is full — engine reschedules, no attempt counted. */
export class RateLimitDelay extends Error {
  constructor(public readonly retryAfterMs: number, public readonly currentCount: number) {
    super(`Rate limit reached (${currentCount}/${DM_LIMIT_PER_HOUR}/h)`);
    this.name = 'RateLimitDelay';
  }
}

/** Thrown when the account's circuit breaker is open — engine delays the job. */
export class AccountOnPause extends Error {
  constructor(public readonly resumeAtMs: number) {
    super('Account is paused by the safety circuit breaker');
    this.name = 'AccountOnPause';
  }
}

function jitter(): Promise<void> {
  const ms = JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkRateLimit(db: SupabaseClient, accountId: string): Promise<void> {
  const { data, error } = await db.rpc('check_and_record_dm_rate_limit', {
    p_account_id: accountId,
    p_limit: DM_LIMIT_PER_HOUR,
  });
  if (error) {
    // Fail open with a warning — better to send than silently drop on a DB blip
    logger.error({ err: error, accountId }, 'Rate limiter RPC error — allowing send');
    return;
  }
  const row = (data as Array<{ allowed: boolean; current_count: number; retry_after_seconds: number }> | null)?.[0];
  if (row && !row.allowed) {
    debugLog('worker', 'warn', 'rate_limit_check', 'skipped',
      `Rate limit reached (${row.current_count}/${DM_LIMIT_PER_HOUR}/h) — delaying ${Math.ceil(row.retry_after_seconds / 60)}min`,
      { accountId, currentCount: row.current_count });
    throw new RateLimitDelay(row.retry_after_seconds * 1000, row.current_count);
  }
  debugLog('worker', 'info', 'rate_limit_check', 'ok', `Rate limit OK — ${row?.current_count ?? '?'}/${DM_LIMIT_PER_HOUR} this hour`, {
    accountId,
  });
}

/** Circuit breaker: skip sends while the account is paused. */
function assertAccountNotPaused(account: InstagramAccountRow): void {
  if (account.paused_until && new Date(account.paused_until).getTime() > Date.now()) {
    debugLog('worker', 'warn', 'circuit_breaker', 'skipped',
      `Account @${account.username ?? account.id} is paused until ${account.paused_until} (${account.pause_reason ?? 'policy block'})`,
      { accountId: account.id, pausedUntil: account.paused_until });
    throw new AccountOnPause(new Date(account.paused_until).getTime());
  }
}

/** Opens the circuit breaker: pause all sends for this account. */
export async function pauseAccount(accountId: string, reason: string, hours = 24): Promise<void> {
  const db = createServiceClient();
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  await db
    .from('instagram_accounts')
    .update({ paused_until: until, pause_reason: reason.slice(0, 500) })
    .eq('id', accountId);
  debugLog('worker', 'error', 'circuit_breaker', 'error',
    `CIRCUIT BREAKER OPENED — account paused for ${hours}h: ${reason}`,
    { accountId, pausedUntil: until });
}

// ═══════════════════════════════════════════════════════════════════════════
// Opening DM processor
// ═══════════════════════════════════════════════════════════════════════════

export async function processAutoDmJob(payload: AutoDmJobPayload, attempt: number): Promise<void> {
  const db = createServiceClient();
  const env = getEnv();

  debugLog('worker', 'info', 'job_started', 'processing', `AutoDM job started — ${payload.triggerType} trigger`, {
    automationId: payload.automationId,
    triggerType: payload.triggerType,
    triggerUserId: payload.triggerUserId,
    triggerEventId: payload.triggerEventId,
    attempt,
  });

  // ── 1: 24-hour window ────────────────────────────────────────────────────
  const eventAge = Date.now() - payload.triggerTimestamp;
  if (eventAge > MAX_EVENT_AGE_MS) {
    debugLog('worker', 'warn', 'window_check', 'skipped', `Event ${Math.round(eventAge / 3600000)}h old — outside 24h DM window`, {
      ageHours: Math.round(eventAge / 3600000),
    });
    await markJobStatus(db, payload, 'skipped', 'Event outside 24-hour DM window');
    return;
  }

  // ── 2: Dedup (application-level; DB unique constraints are the backstop) ─
  const { data: existingLog } = await db
    .from('dm_sent_log')
    .select('id')
    .eq('automation_id', payload.automationId)
    .eq('trigger_event_id', payload.triggerEventId)
    .maybeSingle();
  if (existingLog) {
    debugLog('worker', 'info', 'dedup_check', 'skipped', `Event ${payload.triggerEventId} already processed`, {});
    await markJobStatus(db, payload, 'skipped', 'Duplicate event');
    return;
  }

  const { data: userLog } = await db
    .from('dm_sent_log')
    .select('id')
    .eq('automation_id', payload.automationId)
    .eq('trigger_user_id', payload.triggerUserId)
    .maybeSingle();
  if (userLog) {
    debugLog('worker', 'info', 'dedup_check', 'skipped', `User ${payload.triggerUserId} already received this automation`, {});
    await markJobStatus(db, payload, 'skipped', 'User already received this automation');
    return;
  }

  // ── 3: Load automation + account, verify circuit breaker ─────────────────
  const { data: automation } = await db
    .from('automations')
    .select('*')
    .eq('id', payload.automationId)
    .eq('is_active', true)
    .single<AutomationRow>();
  if (!automation) {
    debugLog('worker', 'warn', 'automation_fetch', 'skipped', `Automation ${payload.automationId} not found or inactive`, {});
    await markJobStatus(db, payload, 'skipped', 'Automation not found or inactive');
    return;
  }

  const { data: igAccount } = await db
    .from('instagram_accounts')
    .select('*')
    .eq('id', payload.instagramAccountId)
    .eq('is_active', true)
    .single<InstagramAccountRow>();
  if (!igAccount) {
    debugLog('worker', 'error', 'ig_account_fetch', 'error', `IG account ${payload.instagramAccountId} not found`, {});
    throw new Error('Instagram account not found or inactive');
  }

  assertAccountNotPaused(igAccount);

  // ── 4: Rate limit (atomic, per-account) ──────────────────────────────────
  await checkRateLimit(db, payload.instagramAccountId);

  // ── 5: Decrypt token ─────────────────────────────────────────────────────
  let accessToken: string;
  try {
    accessToken = decrypt(igAccount.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    debugLog('worker', 'error', 'token_decrypt', 'error', 'Token decryption failed — TOKEN_ENCRYPTION_KEY mismatch?', {});
    throw new Error('Token decryption failed');
  }

  await markJobStatus(db, payload, 'processing', null);

  // ── 6: Human-like jitter before touching Meta ────────────────────────────
  await jitter();

  // ── 7: Public comment reply (random pick, idempotent across retries) ─────
  // Posted BEFORE the DM and tracked via public_reply_sent_at so a retried
  // job never spams a second visible reply under the same comment.
  if (payload.triggerType === 'comment' && automation.comment_reply_options.length > 0) {
    const { data: jobRow } = await db
      .from('dm_jobs')
      .select('public_reply_sent_at')
      .eq('automation_id', payload.automationId)
      .eq('trigger_event_id', payload.triggerEventId)
      .maybeSingle();

    if (!jobRow?.public_reply_sent_at) {
      const randomReply =
        automation.comment_reply_options[Math.floor(Math.random() * automation.comment_reply_options.length)];
      if (randomReply && payload.triggerEventId) {
        await replyToComment(payload.triggerEventId, renderTemplate(randomReply, payload.triggerUsername), accessToken);
        await db
          .from('dm_jobs')
          .update({ public_reply_sent_at: new Date().toISOString() })
          .eq('automation_id', payload.automationId)
          .eq('trigger_event_id', payload.triggerEventId);
      }
    } else {
      debugLog('worker', 'info', 'comment_reply', 'skipped', 'Public reply already posted on an earlier attempt', {});
    }
  }

  // ── 8: Compose + send the opening DM ─────────────────────────────────────
  if (!automation.dm_opening_message_enabled || !automation.dm_opening_message.trim()) {
    // Opening message is off — the FIRST response becomes the initial DM.
    const responses = automation.dm_responses ?? [];
    const firstResponse = responses.find((r) => r.content?.trim() || r.type === 'card');
    if (!firstResponse) {
      debugLog('worker', 'info', 'opening_dm', 'skipped', 'Opening DM disabled and no responses configured — nothing to send', {});
      await markJobStatus(db, payload, 'skipped', 'DM disabled');
      return;
    }

    // Comment triggers deliver the initial contact via private reply.
    const directRecipient: DmRecipient =
      payload.triggerType === 'comment' && payload.triggerEventId && firstResponse.type !== 'card'
        ? { commentId: payload.triggerEventId }
        : { id: payload.triggerUserId };

    debugLog('worker', 'info', 'opening_dm', 'processing', 'Opening message off — sending first response directly', {
      recipientId: payload.triggerUserId,
      viaPrivateReply: 'commentId' in directRecipient,
    });

    try {
      await sendOneResponse(
        payload.igAccountIgsid,
        directRecipient,
        payload.triggerUserId,
        firstResponse,
        payload.triggerUsername,
        accessToken
      );
    } catch (err) {
      await markJobStatus(db, payload, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }

    const { error: directLogError } = await db.from('dm_sent_log').insert({
      instagram_account_id: payload.instagramAccountId,
      automation_id: payload.automationId,
      trigger_user_id: payload.triggerUserId,
      trigger_event_id: payload.triggerEventId,
    });
    if (directLogError && directLogError.code !== '23505') {
      logger.error({ err: directLogError }, 'Failed to insert dm_sent_log entry (direct response)');
    }
    await markJobStatus(db, payload, 'sent', null, new Date());
    await db.rpc('increment_automation_dms_sent', { automation_id: payload.automationId });
    debugLog('worker', 'info', 'job_completed', 'ok', `Direct response delivered to ${payload.triggerUserId}`, {
      automationId: payload.automationId,
    });
    return;
  }

  const hasQuickReply = !!automation.dm_opening_message_button_title?.trim();
  let sessionId: string | null = null;
  let quickReplyPayload: string | undefined;

  if (hasQuickReply) {
    // Session row FIRST — its ID is the routing key embedded in the button payload.
    const expiresAt = new Date(Date.now() + MAX_EVENT_AGE_MS);
    const { data: session, error: sessionError } = await db
      .from('automation_sessions')
      .insert({
        automation_id: payload.automationId,
        instagram_account_id: payload.instagramAccountId,
        audience_ig_user_id: payload.triggerUserId,
        current_step: 1,
        completed: false,
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (sessionError) {
      if (sessionError.code === '23505') {
        debugLog('worker', 'info', 'session_create', 'skipped', `Active session already exists for ${payload.triggerUserId}`, {});
        await markJobStatus(db, payload, 'skipped', 'Session already active');
        return;
      }
      logger.warn({ err: sessionError }, 'Session insert failed — degrading to plain DM');
      debugLog('worker', 'warn', 'session_create', 'error', 'Session insert failed — sending plain DM without button', {
        error: sessionError.message,
      });
    } else {
      sessionId = session.id as string;
      quickReplyPayload = `SESSION_${sessionId}_STEP_1`;
      debugLog('worker', 'info', 'session_create', 'ok', `Session created — id=${sessionId}`, { sessionId });
    }
  }

  const messageText = renderTemplate(automation.dm_opening_message.trim(), payload.triggerUsername);
  const openingLink = automation.dm_opening_message_button_link?.trim();

  // Comment triggers go out as PRIVATE REPLIES (recipient: comment_id) —
  // Meta's purpose-built comment-to-DM channel: separate 750/h allowance,
  // valid 7 days after the comment, more deliverable than general messaging.
  const recipient: DmRecipient =
    payload.triggerType === 'comment' && payload.triggerEventId
      ? { commentId: payload.triggerEventId }
      : { id: payload.triggerUserId };

  debugLog('worker', 'info', 'opening_dm', 'processing', `Sending opening DM to ${payload.triggerUserId}`, {
    recipientId: payload.triggerUserId,
    viaPrivateReply: 'commentId' in recipient,
    hasQuickReply,
    sessionId,
  });

  let messageId: string;
  try {
    if (hasQuickReply && quickReplyPayload) {
      // 2-step flow: opening message + postback button ("Send me the link")
      messageId = await sendInstagramDm(payload.igAccountIgsid, recipient, messageText, accessToken, {
        title: automation.dm_opening_message_button_title!.trim(),
        payload: quickReplyPayload,
      });
    } else if (openingLink) {
      // 1-step flow with a link: try a tappable web_url button template first;
      // if Meta rejects it for this recipient, fall back to an inline link.
      const buttonTitle = automation.dm_opening_message_button_title?.trim() || 'Open link';
      try {
        messageId = await sendInstagramLinkButtonDm(
          payload.igAccountIgsid,
          recipient,
          messageText,
          buttonTitle,
          openingLink,
          accessToken
        );
      } catch (buttonErr) {
        if (!shouldFallBackToInlineLink(buttonErr)) throw buttonErr;
        debugLog('worker', 'warn', 'opening_dm', 'processing', 'Link button rejected — falling back to inline link', {});
        messageId = await sendInstagramDm(
          payload.igAccountIgsid,
          recipient,
          `${messageText}\n\n${buttonTitle}: ${openingLink}`,
          accessToken
        );
      }
    } else {
      messageId = await sendInstagramDm(payload.igAccountIgsid, recipient, messageText, accessToken);
    }
  } catch (err) {
    // Orphaned session cleanup on hard failures — the engine classifies the error
    if (sessionId) {
      await db.from('automation_sessions').delete().eq('id', sessionId);
    }
    await markJobStatus(db, payload, 'failed', err instanceof Error ? err.message : String(err));
    throw err;
  }

  // ── 9: Record the send ───────────────────────────────────────────────────
  const { error: logError } = await db.from('dm_sent_log').insert({
    instagram_account_id: payload.instagramAccountId,
    automation_id: payload.automationId,
    trigger_user_id: payload.triggerUserId,
    trigger_event_id: payload.triggerEventId,
  });
  if (logError && logError.code !== '23505') {
    logger.error({ err: logError }, 'Failed to insert dm_sent_log entry');
  }

  await markJobStatus(db, payload, 'sent', null, new Date());

  if (sessionId) {
    await db.from('dm_logs').insert({
      session_id: sessionId,
      direction: 'outbound',
      step: 1,
      message_text: messageText,
    });
  }

  const { error: counterError } = await db.rpc('increment_automation_dms_sent', {
    automation_id: payload.automationId,
  });
  if (counterError) logger.warn({ err: counterError }, 'Failed to increment DM counter');

  // 1-step flow: no reveal button (or session creation degraded) → there is
  // no tap coming, so deliver the configured responses right away.
  if (!sessionId && automation.dm_responses?.length) {
    debugLog('worker', 'info', 'responses_send', 'processing',
      `No reveal button — delivering ${automation.dm_responses.length} response(s) immediately`, {
        responseCount: automation.dm_responses.length,
      });
    await deliverResponsesBestEffort(payload, automation.dm_responses, accessToken);
  }

  // Contacts: DM/story webhooks don't carry a username — enrich it (and the
  // follow flag) from the profile API now that they've messaged us.
  if (payload.triggerType !== 'comment') {
    void getAudienceProfile(payload.triggerUserId, accessToken).then((p) => {
      if (p) {
        updateContactProfile({
          instagramAccountId: payload.instagramAccountId,
          audienceIgUserId: payload.triggerUserId,
          username: p.username,
          followsBusiness: p.followsBusiness,
        });
      }
    });
  }

  debugLog('worker', 'info', 'job_completed', 'ok', `Opening DM delivered to ${payload.triggerUserId}`, {
    automationId: payload.automationId,
    messageId,
    sessionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Follow-up processor (quick-reply / postback tap)
// ═══════════════════════════════════════════════════════════════════════════

export async function processFollowUpDmJob(payload: AutoDmJobPayload): Promise<void> {
  const db = createServiceClient();
  const env = getEnv();

  debugLog('worker', 'info', 'followup_started', 'processing', `Follow-up job started — step ${payload.sessionStep}`, {
    sessionId: payload.sessionId ?? null,
    sessionStep: payload.sessionStep ?? null,
    triggerUserId: payload.triggerUserId,
  });

  if (!payload.sessionId) {
    debugLog('worker', 'warn', 'followup_started', 'error', 'Follow-up job has no sessionId — dropping', {});
    return;
  }

  // ── 1: Verify session ────────────────────────────────────────────────────
  const { data: session } = await db
    .from('automation_sessions')
    .select('id, automation_id, instagram_account_id, audience_ig_user_id, current_step, expires_at, completed')
    .eq('id', payload.sessionId)
    .maybeSingle();

  if (!session) {
    debugLog('worker', 'warn', 'session_verify', 'error', `Session ${payload.sessionId} not found`, {});
    return;
  }
  if (session.completed as boolean) {
    debugLog('worker', 'info', 'session_verify', 'skipped', `Session ${payload.sessionId} already completed`, {});
    return;
  }
  if (new Date(session.expires_at as string) < new Date()) {
    debugLog('worker', 'warn', 'session_verify', 'skipped', `Session ${payload.sessionId} expired`, {});
    await db.from('automation_sessions').update({ completed: true }).eq('id', payload.sessionId);
    return;
  }

  const expectedStep = session.current_step as number;
  if (payload.sessionStep !== undefined && payload.sessionStep !== expectedStep) {
    debugLog('worker', 'warn', 'session_verify', 'skipped',
      `Step mismatch: tap says ${payload.sessionStep}, session expects ${expectedStep} — stale button tap`, {});
    return;
  }

  // ── 2: Load automation + account, breaker + rate limit ───────────────────
  const { data: automation } = await db
    .from('automations')
    .select('dm_responses, dm_opening_message_button_link, ask_to_follow_enabled, ask_to_follow_message, ask_to_follow_visit_profile_button, ask_to_follow_confirm_button')
    .eq('id', payload.automationId)
    .eq('is_active', true)
    .single<AutomationRow>();
  if (!automation) {
    debugLog('worker', 'warn', 'automation_fetch', 'skipped', `Automation ${payload.automationId} inactive — completing session`, {});
    await db.from('automation_sessions').update({ completed: true }).eq('id', payload.sessionId);
    return;
  }

  const { data: igAccount } = await db
    .from('instagram_accounts')
    .select('*')
    .eq('id', payload.instagramAccountId)
    .eq('is_active', true)
    .single<InstagramAccountRow>();
  if (!igAccount) {
    throw new Error('Instagram account not found');
  }

  assertAccountNotPaused(igAccount);
  await checkRateLimit(db, payload.instagramAccountId);

  let accessToken: string;
  try {
    accessToken = decrypt(igAccount.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    throw new Error('Token decryption failed');
  }

  await jitter();

  // ── 3: Ask-to-follow gate (REAL follow check) ────────────────────────────
  // Instagram's User Profile API exposes is_user_follow_business for anyone
  // who has messaged the account — and a button tap IS a message, so we can
  // genuinely verify. Flow:
  //   step 1 tap → check: follower? deliver straight away : send ask card, step 2
  //   step 2 tap ("I'm following") → RE-CHECK: follower? deliver : gentle nudge
  // Unknown check results FAIL OPEN (deliver) — never block a real person
  // because Meta's profile endpoint hiccuped.
  if (automation.ask_to_follow_enabled && expectedStep === 1) {
    const audienceProfile = await getAudienceProfile(payload.triggerUserId, accessToken);
    const follows = audienceProfile?.followsBusiness ?? null;
    updateContactProfile({
      instagramAccountId: payload.instagramAccountId,
      audienceIgUserId: payload.triggerUserId,
      username: audienceProfile?.username ?? null,
      followsBusiness: follows,
    });

    if (follows === false) {
      const confirmPayload = `SESSION_${payload.sessionId}_STEP_2`;
      await sendAskToFollowDm(payload.igAccountIgsid, payload.triggerUserId, accessToken, {
        message: automation.ask_to_follow_message,
        creatorUsername: igAccount.username ?? '',
        visitProfileButtonTitle: automation.ask_to_follow_visit_profile_button,
        confirmButtonTitle: automation.ask_to_follow_confirm_button,
        confirmPayload,
      });

      await db
        .from('automation_sessions')
        .update({ current_step: 2, last_activity_at: new Date().toISOString() })
        .eq('id', payload.sessionId);

      debugLog('worker', 'info', 'ask_to_follow_dm', 'ok', 'Not a follower — ask-to-follow card sent, session at step 2', {
        sessionId: payload.sessionId,
      });
      return;
    }

    debugLog('worker', 'info', 'follow_check', 'ok',
      follows === true
        ? 'Audience member already follows — skipping ask-to-follow, delivering content'
        : 'Follow status unknown — failing open, delivering content',
      { sessionId: payload.sessionId, triggerUserId: payload.triggerUserId });
    // Fall through to responses
  }

  if (automation.ask_to_follow_enabled && expectedStep === 2) {
    const audienceProfile = await getAudienceProfile(payload.triggerUserId, accessToken);
    const follows = audienceProfile?.followsBusiness ?? null;
    updateContactProfile({
      instagramAccountId: payload.instagramAccountId,
      audienceIgUserId: payload.triggerUserId,
      username: audienceProfile?.username ?? null,
      followsBusiness: follows,
    });

    if (follows === false) {
      // Still not following — nudge and keep the session at step 2 so the
      // card's buttons stay live and they can tap "I'm following" again.
      await sendInstagramDm(
        payload.igAccountIgsid,
        { id: payload.triggerUserId },
        `Hmm, I still can't see your follow 👀 Tap "${automation.ask_to_follow_visit_profile_button}" above, hit Follow, then tap "${automation.ask_to_follow_confirm_button}" again 🙏`,
        accessToken
      );
      await db
        .from('automation_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', payload.sessionId);

      debugLog('worker', 'info', 'follow_check', 'skipped', 'Re-check: still not following — nudge sent, session stays at step 2', {
        sessionId: payload.sessionId,
        triggerUserId: payload.triggerUserId,
      });
      return;
    }

    debugLog('worker', 'info', 'follow_check', 'ok',
      follows === true ? 'Re-check passed — audience member now follows, delivering content' : 'Re-check unknown — failing open, delivering content',
      { sessionId: payload.sessionId });
    // Fall through to responses
  }

  // ── 4: Deliver dm_responses sequentially ─────────────────────────────────
  if (!automation.dm_responses?.length) {
    debugLog('worker', 'warn', 'responses_send', 'skipped', 'Automation has 0 dm_responses — session completed with no content', {
      hint: 'Add at least one response (text or card) in the automation configuration',
    });
    await db.from('automation_sessions').update({ completed: true, last_activity_at: new Date().toISOString() }).eq('id', payload.sessionId);
    return;
  }

  debugLog('worker', 'info', 'responses_send', 'processing', `Sending ${automation.dm_responses.length} response(s) to ${payload.triggerUserId}`, {
    sessionId: payload.sessionId,
    responseCount: automation.dm_responses.length,
  });

  let lastMessageText = '';
  for (const [idx, response] of automation.dm_responses.entries()) {
    if (!response.content?.trim() && response.type !== 'card') continue;

    if (response.type === 'card') {
      const cardImageUrl = response.cardImage?.startsWith('http') ? response.cardImage : undefined;
      await sendInstagramCardDm(payload.igAccountIgsid, payload.triggerUserId, accessToken, {
        title: response.cardTitle ?? response.content,
        ...(cardImageUrl !== undefined ? { imageUrl: cardImageUrl } : {}),
        ...(response.cardSubtitle !== undefined ? { subtitle: response.cardSubtitle } : {}),
        ...(response.cardButtons !== undefined
          ? { buttons: response.cardButtons.map((b) => ({ title: b.title, url: b.link })) }
          : {}),
      });
      lastMessageText = response.cardTitle ?? response.content ?? 'Card message';
    } else {
      const messageText = renderTemplate(response.content.trim(), payload.triggerUsername);
      const link = response.buttonLink?.trim();
      if (link) {
        // Tappable link button first; inline-link fallback if Meta rejects it.
        const buttonTitle = response.buttonTitle?.trim() || 'Open link';
        try {
          await sendInstagramLinkButtonDm(
            payload.igAccountIgsid,
            { id: payload.triggerUserId },
            messageText,
            buttonTitle,
            link,
            accessToken
          );
          lastMessageText = messageText;
        } catch (buttonErr) {
          if (!shouldFallBackToInlineLink(buttonErr)) throw buttonErr;
          debugLog('worker', 'warn', 'responses_send', 'processing', 'Link button rejected — falling back to inline link', {});
          const fallback = `${messageText}\n\n${buttonTitle}: ${link}`;
          await sendInstagramDm(payload.igAccountIgsid, { id: payload.triggerUserId }, fallback, accessToken);
          lastMessageText = fallback;
        }
      } else {
        await sendInstagramDm(payload.igAccountIgsid, { id: payload.triggerUserId }, messageText, accessToken);
        lastMessageText = messageText;
      }
    }
    debugLog('worker', 'info', 'responses_send', 'ok', `Response ${idx + 1}/${automation.dm_responses.length} sent`, {
      responseIndex: idx + 1,
      type: response.type,
    });
  }

  // ── 5: Log + complete session ────────────────────────────────────────────
  if (payload.messageText) {
    await db.from('dm_logs').insert({
      session_id: payload.sessionId,
      direction: 'inbound',
      step: expectedStep,
      message_text: payload.messageText,
    });
  }
  if (lastMessageText) {
    await db.from('dm_logs').insert({
      session_id: payload.sessionId,
      direction: 'outbound',
      step: expectedStep,
      message_text: lastMessageText,
    });
  }

  await db
    .from('automation_sessions')
    .update({ completed: true, last_activity_at: new Date().toISOString() })
    .eq('id', payload.sessionId);

  await db.rpc('increment_automation_dms_sent', { automation_id: payload.automationId });

  debugLog('worker', 'info', 'session_completed', 'ok', `All responses delivered to ${payload.triggerUserId}`, {
    sessionId: payload.sessionId,
    step: expectedStep,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type JobStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'skipped';

export async function markJobStatus(
  db: SupabaseClient,
  payload: AutoDmJobPayload,
  status: JobStatus,
  errorMessage: string | null,
  sentAt?: Date
): Promise<void> {
  const { error } = await db.from('dm_jobs').upsert(
    {
      automation_id: payload.automationId,
      instagram_account_id: payload.instagramAccountId,
      trigger_type: payload.triggerType,
      trigger_user_id: payload.triggerUserId,
      trigger_event_id: payload.triggerEventId,
      trigger_timestamp: new Date(payload.triggerTimestamp).toISOString(),
      status,
      error_message: errorMessage,
      sent_at: sentAt?.toISOString() ?? null,
    },
    { onConflict: 'automation_id,trigger_event_id', ignoreDuplicates: false }
  );
  if (error) logger.warn({ err: error, status }, 'Failed to upsert dm_job status');
}
