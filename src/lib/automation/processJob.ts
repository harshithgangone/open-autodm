/**
 * AutoDM job processors - battle-tested logic, adapted
 * for serverless execution with three extra safety layers:
 *
 *  1. Postgres rate limiter - check_and_record_dm_rate_limit RPC, atomic,
 *     100 DMs/hour rolling window per account (conservative 50% buffer under Meta's 200).
 *  2. Human-like jitter - a randomized 2-5s pause before every send, so
 *     automated replies never look machine-instant to Instagram.
 *  3. Circuit breaker - if Meta returns a policy/spam block (code 368), the
 *     entire account is paused for 24h instead of retrying into a ban.
 *
 * processAutoDmJob   - opening DM (comment / dm_reply keyword trigger)
 * processFollowUpDmJob - follow-up after a quick-reply / postback tap
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
import {
  generateRuntimePublicReply,
  generateRuntimeDmResponse,
  DEFAULT_PUBLIC_REPLIES,
  DEFAULT_OPENING_VARIATIONS,
} from '@/lib/ai/workersAi';
import { updateContactProfile } from '@/lib/automation/contacts';
import { isRecipientSuppressed } from '@/lib/automation/optOut';
import { executeFlowGraph } from '@/lib/automation/flowEngine';
import {
  MetaApiError,
  AccountPausedMetaError,
  NonRetryableMetaError,
  META_RATE_LIMIT_CODES,
  AmbiguousDeliveryError,
} from '@/lib/instagram/errors';

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

  // Extract link buttons: multiple buttons via response.buttons (up to 3) or single via buttonLink
  const linkButtons: Array<{ title: string; url: string }> = [];
  if (response.buttons && response.buttons.length > 0) {
    for (const b of response.buttons) {
      if (b.link?.trim()) {
        linkButtons.push({ title: b.title?.trim() || 'Open link', url: b.link.trim() });
      }
    }
  } else if (response.buttonLink?.trim()) {
    linkButtons.push({
      title: response.buttonTitle?.trim() || 'Open link',
      url: response.buttonLink.trim(),
    });
  }

  if (linkButtons.length > 0) {
    try {
      await sendInstagramLinkButtonDm(igAccountIgsid, recipient, messageText, linkButtons, accessToken);
    } catch (buttonErr) {
      if (!shouldFallBackToInlineLink(buttonErr)) throw buttonErr;
      const inlineLinks = linkButtons.map((b) => `${b.title}: ${b.url}`).join('\n');
      await sendInstagramDm(igAccountIgsid, recipient, `${messageText}\n\n${inlineLinks}`, accessToken);
    }
  } else {
    await sendInstagramDm(igAccountIgsid, recipient, messageText, accessToken);
  }
}

/**
 * Best-effort sequential delivery of configured responses for the 1-step flow
 * (no reveal button). Per-response failures are logged and skipped rather than
 * thrown - the opening DM already went out and is dedup-recorded, so a retry
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
      if (sent > 0) await interMessageJitter();
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

/** Standard 24-hour messaging window for direct messages, story replies, and follow-ups. */
export const STANDARD_DM_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta's 7-day window for initial private replies to post/Reel comments. */
export const COMMENT_PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Meta's window for private replies to Instagram Live comments (active broadcast / 1 hour). */
export const LIVE_COMMENT_WINDOW_MS = 60 * 60 * 1000;

/** Alias for backwards compatibility. */
export const MAX_EVENT_AGE_MS = STANDARD_DM_WINDOW_MS;

/** Hourly DM cap per account (Meta limit ~200; conservative 100 provides a 50% safety margin). */
export const DM_LIMIT_PER_HOUR = 100;

/** Randomized pre-send delay - automation that behaves like a human. */
const JITTER_MIN_MS = 2000;
const JITTER_MAX_MS = 5000;

/** Thrown when the hourly window is full - engine reschedules, no attempt counted. */
export class RateLimitDelay extends Error {
  constructor(public readonly retryAfterMs: number, public readonly currentCount: number) {
    super(`Rate limit reached (${currentCount}/${DM_LIMIT_PER_HOUR}/h)`);
    this.name = 'RateLimitDelay';
  }
}

/** Thrown when the account's circuit breaker is open - engine delays the job. */
export class AccountOnPause extends Error {
  constructor(public readonly resumeAtMs: number) {
    super('Account is paused by the safety circuit breaker');
    this.name = 'AccountOnPause';
  }
}

/** Thrown when the account or automation is paused by Smart Comment Traffic Guard. */
export class AccountOnTrafficGuardPause extends Error {
  constructor(public readonly accountId: string, public readonly automationId?: string) {
    super(`Account ${accountId} is paused by Smart Comment Traffic Guard`);
    this.name = 'AccountOnTrafficGuardPause';
  }
}

function jitter(): Promise<void> {
  const ms = JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shorter humanized pause BETWEEN consecutive responses in one flow. */
function interMessageJitter(): Promise<void> {
  const ms = 1200 + Math.floor(Math.random() * 1300);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truthful rate accounting: each flow reserves ONE window slot up front, but a
 * flow can deliver several messages. Record the extras so the next jobs see
 * the real send count and throttle correctly (fire-and-forget - accounting
 * must never break a delivery that already happened).
 */
function recordExtraSends(accountId: string, extraCount: number): void {
  if (extraCount <= 0) return;
  void (async (): Promise<void> => {
    try {
      const db = createServiceClient();
      await db.from('dm_rate_events').insert(
        Array.from({ length: extraCount }, () => ({ instagram_account_id: accountId }))
      );
    } catch (err) {
      logger.warn({ err, accountId, extraCount }, 'Failed to record extra rate events');
    }
  })();
}

async function checkRateLimit(db: SupabaseClient, accountId: string): Promise<void> {
  const { data, error } = await db.rpc('check_and_record_dm_rate_limit', {
    p_account_id: accountId,
    p_limit: DM_LIMIT_PER_HOUR,
  });
  if (error) {
    // Fail open with a warning - better to send than silently drop on a DB blip
    logger.error({ err: error, accountId }, 'Rate limiter RPC error - allowing send');
    return;
  }
  const row = (data as Array<{ allowed: boolean; current_count: number; retry_after_seconds: number }> | null)?.[0];
  if (row && !row.allowed) {
    debugLog('worker', 'warn', 'rate_limit_check', 'skipped',
      `Rate limit reached (${row.current_count}/${DM_LIMIT_PER_HOUR}/h) - delaying ${Math.ceil(row.retry_after_seconds / 60)}min`,
      { accountId, currentCount: row.current_count });
    throw new RateLimitDelay(row.retry_after_seconds * 1000, row.current_count);
  }
  debugLog('worker', 'info', 'rate_limit_check', 'ok', `Rate limit OK - ${row?.current_count ?? '?'}/${DM_LIMIT_PER_HOUR} this hour`, {
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
    `CIRCUIT BREAKER OPENED - account paused for ${hours}h: ${reason}`,
    { accountId, pausedUntil: until });
}

// ── Comment Private Reply Reservation Helpers ──────────────────────────────
export interface ReservationResult {
  authorized: boolean;
  status: string;
  reason: string;
}

export async function reserveCommentPrivateReply(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  automationId: string
): Promise<ReservationResult> {
  const { data, error } = await db.rpc('reserve_comment_private_reply', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_automation_id: automationId,
  });
  if (error) {
    logger.error({ err: error, accountId, commentId, automationId }, 'Failed to invoke reserve_comment_private_reply');
    throw new Error(`Reservation RPC error: ${error.message}`);
  }
  return data as ReservationResult;
}

export async function confirmCommentPrivateReply(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  automationId: string
): Promise<void> {
  const { error } = await db.rpc('confirm_comment_private_reply_sent', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_automation_id: automationId,
  });
  if (error) {
    logger.warn({ err: error, accountId, commentId, automationId }, 'Failed to confirm comment private reply sent');
  }
}

export async function releaseCommentPrivateReply(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  automationId: string
): Promise<void> {
  const { error } = await db.rpc('release_comment_private_reply', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_automation_id: automationId,
  });
  if (error) {
    logger.warn({ err: error, accountId, commentId, automationId }, 'Failed to release comment private reply reservation');
  }
}

export async function markCommentPrivateReplyFailed(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  automationId: string,
  reason?: string
): Promise<void> {
  const { error } = await db.rpc('mark_comment_private_reply_failed', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_automation_id: automationId,
    p_failure_reason: reason ?? null,
  });
  if (error) {
    logger.warn({ err: error, accountId, commentId, automationId }, 'Failed to mark comment private reply failed');
  }
}

// ── Comment Public Reply Reservation Helpers ───────────────────────────────
export async function reserveCommentPublicReply(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  automationId: string
): Promise<ReservationResult> {
  const { data, error } = await db.rpc('reserve_comment_public_reply', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_automation_id: automationId,
  });
  if (error) {
    logger.error({ err: error, accountId, commentId, automationId }, 'Failed to invoke reserve_comment_public_reply');
    return { authorized: false, status: 'error', reason: error.message };
  }
  return data as ReservationResult;
}

export async function confirmCommentPublicReply(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  replyCommentId?: string
): Promise<void> {
  const { error } = await db.rpc('confirm_comment_public_reply_sent', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_reply_comment_id: replyCommentId ?? null,
  });
  if (error) {
    logger.warn({ err: error, accountId, commentId }, 'Failed to confirm comment public reply sent');
  }
}

export async function releaseCommentPublicReply(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  automationId: string
): Promise<void> {
  const { error } = await db.rpc('release_comment_public_reply', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_automation_id: automationId,
  });
  if (error) {
    logger.warn({ err: error, accountId, commentId, automationId }, 'Failed to release comment public reply reservation');
  }
}

export async function markCommentPublicReplyFailed(
  db: SupabaseClient,
  accountId: string,
  commentId: string,
  reason?: string
): Promise<void> {
  const { error } = await db.rpc('mark_comment_public_reply_failed', {
    p_instagram_account_id: accountId,
    p_comment_id: commentId,
    p_failure_reason: reason ?? null,
  });
  if (error) {
    logger.warn({ err: error, accountId, commentId }, 'Failed to mark comment public reply failed');
  }
}

/** Deterministically select an opening DM variation for stability on retries and distribution across comments. */
export function selectOpeningVariation(
  variations: string[] | undefined,
  fallbackMessage: string,
  seedKey: string,
  persistedIndex?: number
): { text: string; index: number } {
  const cleanVariations = (variations ?? []).map((v) => v.trim()).filter(Boolean);
  if (cleanVariations.length === 0) {
    return { text: fallbackMessage.trim(), index: 0 };
  }

  if (persistedIndex !== undefined && persistedIndex >= 0 && persistedIndex < cleanVariations.length) {
    const text = cleanVariations[persistedIndex] ?? fallbackMessage.trim();
    return { text, index: persistedIndex };
  }

  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash << 5) - hash + seedKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % cleanVariations.length;
  const text = cleanVariations[index] ?? fallbackMessage.trim();
  return { text, index };
}

/** Deterministically select a public reply template from the pool. */
export function selectPublicReplyOption(
  options: string[] | undefined,
  fallbackOptions: string[],
  seedKey: string
): string {
  const cleanOptions = (options ?? []).map((o) => o.trim()).filter(Boolean);
  const pool = cleanOptions.length > 0 ? cleanOptions : fallbackOptions;
  if (pool.length === 0) return '';

  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash << 5) - hash + seedKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % pool.length;
  return pool[index] ?? fallbackOptions[0] ?? '';
}

// ═══════════════════════════════════════════════════════════════════════════
// Opening DM processor
// ═══════════════════════════════════════════════════════════════════════════

export async function processAutoDmJob(payload: AutoDmJobPayload, attempt: number): Promise<void> {
  const db = createServiceClient();
  const env = getEnv();

  debugLog('worker', 'info', 'job_started', 'processing', `AutoDM job started - ${payload.triggerType} trigger`, {
    automationId: payload.automationId,
    triggerType: payload.triggerType,
    triggerUserId: payload.triggerUserId,
    triggerEventId: payload.triggerEventId,
    attempt,
  });

  // ── 1: Messaging window check ────────────────────────────────────────────
  const eventAge = Date.now() - payload.triggerTimestamp;
  const isComment = payload.triggerType === 'comment';
  const isLiveComment = isComment && Boolean(payload.isLive || payload.mediaProductType === 'LIVE');

  if (isLiveComment) {
    debugLog('worker', 'warn', 'live_comment_disabled', 'skipped',
      'Live-comment automation disabled for MVP: active-broadcast status cannot be verified without polling Live endpoints. Meta policy strictly restricts Live private replies to active broadcasts only.', {
        triggerType: payload.triggerType,
        commentId: payload.triggerEventId,
      });
    await markJobStatus(db, payload, 'skipped', 'Live-comment automation disabled (active-broadcast unverifiable)');
    return;
  }

  const maxAllowedAgeMs = isComment
    ? COMMENT_PRIVATE_REPLY_WINDOW_MS
    : STANDARD_DM_WINDOW_MS;

  const windowDescription = isComment
    ? '7-day comment private reply window'
    : '24-hour DM window';

  if (eventAge > maxAllowedAgeMs) {
    debugLog('worker', 'warn', 'window_check', 'skipped',
      `Event ${Math.round(eventAge / 3600000)}h old - outside ${windowDescription}`, {
        ageHours: Math.round(eventAge / 3600000),
        triggerType: payload.triggerType,
      });
    await markJobStatus(db, payload, 'skipped', `Event outside ${windowDescription}`);
    return;
  }

  // ── 2: Dedup checks ──────────────────────────────────────────────────────
  // Continuation steps (flow graph node resumptions or follow-up jobs) bypass initial
  // contact deduplication since the initial DM was already sent and logged.
  const isContinuationStep = Boolean(payload.flowNodeId || payload.isFollowUp);

  if (!isContinuationStep) {
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
  }

  // ── 3: Load automation + account, verify circuit breaker ─────────────────
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

  if (igAccount.traffic_guard_paused) {
    debugLog('worker', 'warn', 'traffic_guard_hold', 'skipped',
      `Account @${igAccount.username ?? igAccount.id} is paused by Traffic Guard - holding job`, {
        accountId: igAccount.id,
      });
    throw new AccountOnTrafficGuardPause(igAccount.id);
  }

  assertAccountNotPaused(igAccount);

  const { data: automation } = await db
    .from('automations')
    .select('*')
    .eq('id', payload.automationId)
    .eq('is_active', true)
    .single<AutomationRow>();
  if (!automation) {
    const { data: tgPaused } = await db
      .from('automations')
      .select('id')
      .eq('id', payload.automationId)
      .eq('is_traffic_guard_paused', true)
      .maybeSingle();
    if (tgPaused) {
      throw new AccountOnTrafficGuardPause(payload.instagramAccountId, payload.automationId);
    }
    debugLog('worker', 'warn', 'automation_fetch', 'skipped', `Automation ${payload.automationId} not found or inactive`, {});
    await markJobStatus(db, payload, 'skipped', 'Automation not found or inactive');
    return;
  }

  // ── 3.5: Recipient Opt-Out Suppression Guard ────────────────────────────
  if (await isRecipientSuppressed(db, payload.instagramAccountId, payload.triggerUserId)) {
    debugLog('worker', 'warn', 'recipient_suppressed', 'skipped',
      `Recipient ${payload.triggerUserId} is opted-out/suppressed - blocking outbound auto_dm`, {
        recipientId: payload.triggerUserId,
        automationId: payload.automationId,
      });
    await markJobStatus(db, payload, 'skipped', 'Recipient has opted out of automated messages');
    return;
  }

  // ── 4: Atomic Comment Private Reply Reservation ─────────────────────────
  // Meta policy invariant: AT MOST ONE private reply per comment across ALL
  // automations on the account. An atomic reservation in PostgreSQL eliminates
  // TOCTOU race windows between concurrent workers or multiple automations.
  let isReservationHeld = false;
  let sendAttemptInitiated = false;
  if (isComment && payload.triggerEventId) {
    const reservation = await reserveCommentPrivateReply(
      db,
      payload.instagramAccountId,
      payload.triggerEventId,
      payload.automationId
    );
    if (!reservation.authorized) {
      debugLog('worker', 'info', 'comment_reservation_denied', 'skipped',
        `Comment ${payload.triggerEventId} cannot be reserved (${reservation.reason}) - one-private-reply-per-comment enforced`, {
          commentId: payload.triggerEventId,
          status: reservation.status,
          reason: reservation.reason,
        });
      await markJobStatus(db, payload, 'skipped', 'Comment already received a private reply');
      return;
    }
    isReservationHeld = true;
  }

  try {
    // ── 5: Rate limit (atomic, per-account) ──────────────────────────────────
    await checkRateLimit(db, payload.instagramAccountId);

    // ── 6: Decrypt token ─────────────────────────────────────────────────────
    let accessToken: string;
    try {
      accessToken = decrypt(igAccount.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      debugLog('worker', 'error', 'token_decrypt', 'error', 'Token decryption failed - TOKEN_ENCRYPTION_KEY mismatch?', {});
      throw new Error('Token decryption failed');
    }

    await markJobStatus(db, payload, 'processing', null);

    // ── 7: Human-like jitter before touching Meta ────────────────────────────
    await jitter();

    // ── 8: Public comment reply (isolated, independent ON/OFF, atomic reservation) ───
    if (!payload.flowNodeId && !payload.isFollowUp && payload.triggerType === 'comment' && automation.public_reply_enabled && payload.triggerEventId) {
      const pubRes = await reserveCommentPublicReply(
        db,
        payload.instagramAccountId,
        payload.triggerEventId,
        payload.automationId
      );

      if (pubRes.authorized) {
        let replyText = '';
        if (automation.public_reply_mode === 'ai_generated') {
          const aiRes = await generateRuntimePublicReply(
            automation.public_reply_ai_instructions,
            payload.commentText || '',
            payload.triggerUsername || undefined,
            automation.public_reply_options?.length ? automation.public_reply_options : DEFAULT_PUBLIC_REPLIES
          );
          replyText = aiRes.data;
        } else {
          const options = automation.public_reply_options?.length
            ? automation.public_reply_options
            : automation.comment_reply_options;
          replyText = selectPublicReplyOption(options, DEFAULT_PUBLIC_REPLIES, payload.triggerEventId);
        }

        if (replyText.trim()) {
          const renderedReply = renderTemplate(replyText.trim(), payload.triggerUsername);
          const replyResult = await replyToComment(payload.triggerEventId, renderedReply, accessToken);
          if (replyResult.success) {
            await confirmCommentPublicReply(db, payload.instagramAccountId, payload.triggerEventId, replyResult.replyId);
            try {
              await db
                .from('dm_jobs')
                .update({ public_reply_sent_at: new Date().toISOString() })
                .eq('automation_id', payload.automationId)
                .eq('trigger_event_id', payload.triggerEventId);
            } catch {
              // best effort audit update
            }
            debugLog('worker', 'info', 'comment_public_reply', 'ok', `Public reply posted to comment ${payload.triggerEventId}`, {
              replyId: replyResult.replyId,
            });
          } else {
            await markCommentPublicReplyFailed(
              db,
              payload.instagramAccountId,
              payload.triggerEventId,
              replyResult.error?.message ?? 'Unknown Meta error'
            );
            debugLog('worker', 'warn', 'comment_public_reply', 'error',
              `Public reply to comment ${payload.triggerEventId} failed (${replyResult.error?.code}: ${replyResult.error?.message}) - proceeding to send private DM`,
              { commentId: payload.triggerEventId, error: replyResult.error });
          }
        }
      } else {
        debugLog('worker', 'info', 'comment_public_reply', 'skipped',
          `Public reply reservation denied (${pubRes.reason}) - skipping duplicate public reply`,
          { commentId: payload.triggerEventId, reason: pubRes.reason });
      }
    }

    // ── 8.5: Flow Graph Execution Engine ─────────────────────────────────────
    if (automation.flow_graph && Array.isArray(automation.flow_graph.nodes) && automation.flow_graph.nodes.length > 0) {
      debugLog('worker', 'info', 'flow_graph_execution', 'processing',
        `Executing flow graph for automation ${automation.id}`, {
          nodeCount: automation.flow_graph.nodes.length,
          startNodeId: payload.flowNodeId || 'root',
        });

      const flowResult = await executeFlowGraph(db, automation.flow_graph, payload, automation, accessToken);
      if (flowResult.status === 'completed' || flowResult.status === 'delayed' || flowResult.status === 'skipped') {
        if (flowResult.messagesSent > 0 && !payload.flowNodeId) {
          if (payload.triggerEventId) {
            const { error: logErr } = await db.from('dm_sent_log').insert({
              instagram_account_id: payload.instagramAccountId,
              automation_id: payload.automationId,
              trigger_user_id: payload.triggerUserId,
              trigger_event_id: payload.triggerEventId,
            });
            if (logErr && (logErr as any).code !== '23505') {
              logger.error({ err: logErr }, 'Failed to insert dm_sent_log for flow graph');
            }
          }

          const { error: counterError } = await db.rpc('increment_automation_dms_sent', {
            automation_id: payload.automationId,
          });
          if (counterError) logger.warn({ err: counterError }, 'Failed to increment DM counter for flow graph');

          if (isReservationHeld && payload.triggerEventId) {
            await confirmCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
          }
        }

        if (flowResult.status === 'skipped' && isReservationHeld && payload.triggerEventId) {
          await releaseCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
        }

        const jobStatus: JobStatus = flowResult.status === 'skipped' ? 'skipped' : 'sent';
        await markJobStatus(db, payload, jobStatus, flowResult.reason ?? null, flowResult.status === 'completed' ? new Date() : undefined);
        return;
      }
    }

    // ── 9: Compose + send the opening DM ─────────────────────────────────────
    const selectedVariation = selectOpeningVariation(
      automation.dm_opening_message_variations,
      automation.dm_opening_message,
      payload.triggerEventId || payload.triggerUserId,
      payload.selectedVariationIndex
    );
    const chosenOpeningMessage = selectedVariation.text;

    if (!automation.dm_opening_message_enabled || !chosenOpeningMessage.trim()) {
      // Opening message is off - the FIRST response becomes the initial DM.
      const responses = automation.dm_responses ?? [];
      const firstResponse = responses.find((r) => r.content?.trim() || r.type === 'card');
      if (!firstResponse) {
        debugLog('worker', 'info', 'opening_dm', 'skipped', 'Opening DM disabled and no responses configured - nothing to send', {});
        await markJobStatus(db, payload, 'skipped', 'DM disabled');
        if (isReservationHeld && payload.triggerEventId) {
          await releaseCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
        }
        return;
      }

      // Comment triggers deliver the initial contact via private reply.
      const directRecipient: DmRecipient =
        payload.triggerType === 'comment' && payload.triggerEventId && firstResponse.type !== 'card'
          ? { commentId: payload.triggerEventId }
          : { id: payload.triggerUserId };

      debugLog('worker', 'info', 'opening_dm', 'processing', 'Opening message off - sending first response directly', {
        recipientId: payload.triggerUserId,
        viaPrivateReply: 'commentId' in directRecipient,
      });

      sendAttemptInitiated = true;
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

      if (isReservationHeld && payload.triggerEventId) {
        await confirmCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
      }

      debugLog('worker', 'info', 'job_completed', 'ok', `Direct response delivered to ${payload.triggerUserId}`, {
        automationId: payload.automationId,
      });
      return;
    }

    const hasQuickReply = !!automation.dm_opening_message_button_title?.trim();
    let sessionId: string | null = null;
    let quickReplyPayload: string | undefined;

    if (hasQuickReply) {
      // Session row FIRST - its ID is the routing key embedded in the button payload.
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
          if (isReservationHeld && payload.triggerEventId) {
            await releaseCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
          }
          return;
        }
        logger.warn({ err: sessionError }, 'Session insert failed - degrading to plain DM');
        debugLog('worker', 'warn', 'session_create', 'error', 'Session insert failed - sending plain DM without button', {
          error: sessionError.message,
        });
      } else {
        sessionId = session.id as string;
        quickReplyPayload = `SESSION_${sessionId}_STEP_1`;
        debugLog('worker', 'info', 'session_create', 'ok', `Session created - id=${sessionId}`, { sessionId });
      }
    }

    const messageText = renderTemplate(chosenOpeningMessage.trim().slice(0, 1000), payload.triggerUsername);
    const openingLink = automation.dm_opening_message_button_link?.trim();

    // Comment triggers go out as PRIVATE REPLIES (recipient: comment_id) -
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
    sendAttemptInitiated = true;
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
          debugLog('worker', 'warn', 'opening_dm', 'processing', 'Link button rejected - falling back to inline link', {});
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
      // Orphaned session cleanup on hard failures - the engine classifies the error
      if (sessionId) {
        await db.from('automation_sessions').delete().eq('id', sessionId);
      }
      await markJobStatus(db, payload, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }

    // ── 10: Record the send ──────────────────────────────────────────────────
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

    if (isReservationHeld && payload.triggerEventId) {
      await confirmCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
    }

    // Follow-up compliance: comment-triggered flows start in 'waiting_response'.
    // A follow-up is NOT scheduled until the recipient genuinely responds.
    if (payload.triggerType === 'comment' && automation.follow_up_enabled && automation.follow_up_message?.trim()) {
      await db.from('automation_follow_ups').upsert({
        automation_id: payload.automationId,
        instagram_account_id: payload.instagramAccountId,
        session_id: sessionId ?? null,
        recipient_id: payload.triggerUserId,
        recipient_username: payload.triggerUsername ?? null,
        qualified_event_id: payload.triggerEventId,
        qualified_timestamp: new Date(payload.triggerTimestamp).toISOString(),
        scheduled_for: new Date(payload.triggerTimestamp + (automation.follow_up_delay_minutes || 60) * 60 * 1000).toISOString(),
        status: 'waiting_response',
        message_snapshot: automation.follow_up_message,
      }, { onConflict: 'automation_id,recipient_id,qualified_event_id' });
    }

    // 1-step flow: no reveal button (or session creation degraded) → there is
    // no tap coming.
    if (!sessionId && automation.dm_responses?.length) {
      if (payload.triggerType === 'comment') {
        // META RULE: Only ONE private reply is allowed per comment.
        // Unsolicited follow-up messages directly to triggerUserId are prohibited
        // until the recipient responds in the DM thread.
        debugLog('worker', 'info', 'responses_send', 'skipped',
          'Comment triggers permit only one initial private reply; follow-up messages require recipient response in DM', {
            triggerType: payload.triggerType,
            responseCount: automation.dm_responses.length,
          });
      } else {
        debugLog('worker', 'info', 'responses_send', 'processing',
          `No reveal button - delivering ${automation.dm_responses.length} response(s) immediately`, {
            responseCount: automation.dm_responses.length,
          });
        const sentCount = await deliverResponsesBestEffort(payload, automation.dm_responses, accessToken);
        // Opening DM used the reserved slot; responses are extra sends.
        recordExtraSends(payload.instagramAccountId, sentCount);
      }
    }

    // Contacts: DM/story webhooks don't carry a username - enrich it (and the
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
  } catch (err) {
    if (isReservationHeld && payload.triggerEventId) {
      if (!sendAttemptInitiated) {
        // Sending never began: safe to release reservation (RateLimitDelay, AccountOnPause, decrypt failure, jitter)
        await releaseCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
      } else {
        // Send attempt was initiated to Meta
        if (
          err instanceof MetaApiError &&
          err.code !== undefined &&
          (META_RATE_LIMIT_CODES as readonly number[]).includes(err.code)
        ) {
          // Definitive Meta-side rate limit: Meta explicitly rejected the send before delivering.
          // No message was delivered; releasing reservation for delayed retry is safe.
          await releaseCommentPrivateReply(db, payload.instagramAccountId, payload.triggerEventId, payload.automationId);
        } else if (err instanceof AccountPausedMetaError || err instanceof NonRetryableMetaError) {
          // Definitive Meta permanent failure (policy block, invalid token, bad params)
          await markCommentPrivateReplyFailed(
            db,
            payload.instagramAccountId,
            payload.triggerEventId,
            payload.automationId,
            err instanceof Error ? err.message : String(err)
          );
        } else {
          // AMBIGUOUS OUTCOME: Network timeout, socket hangup, connection drop, 5xx, or unhandled exception.
          // FAIL CLOSED: Meta may have accepted and delivered the DM!
          // NEVER release the reservation and authorize a duplicate send.
          const errorMsg = err instanceof Error ? err.message : String(err);
          await markCommentPrivateReplyFailed(
            db,
            payload.instagramAccountId,
            payload.triggerEventId,
            payload.automationId,
            `Ambiguous delivery failure: ${errorMsg}`
          );
          await markJobStatus(db, payload, 'failed', `Ambiguous delivery outcome: ${errorMsg}`);
          throw new AmbiguousDeliveryError(`Ambiguous send outcome for comment ${payload.triggerEventId}: ${errorMsg}`);
        }
      }
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Follow-up processor (quick-reply / postback tap & scheduled follow-up check-in)
// ═══════════════════════════════════════════════════════════════════════════

async function markFollowUpStatus(
  db: SupabaseClient,
  automationId: string,
  recipientId: string,
  qualifiedEventId: string,
  status: 'waiting_response' | 'scheduled' | 'sending' | 'sent' | 'skipped' | 'expired' | 'held' | 'failed',
  errorReason: string | null,
  sentAt?: Date
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    status,
    error_reason: errorReason,
    updated_at: new Date().toISOString(),
  };
  if (sentAt) {
    updatePayload.sent_at = sentAt.toISOString();
  }
  await db
    .from('automation_follow_ups')
    .update(updatePayload)
    .eq('automation_id', automationId)
    .eq('recipient_id', recipientId)
    .eq('qualified_event_id', qualifiedEventId);
}

async function processScheduledFollowUpDm(payload: AutoDmJobPayload): Promise<void> {
  const db = createServiceClient();
  const env = getEnv();

  const originalEventId = payload.triggerEventId.replace(/^scheduled_/, '');

  debugLog('worker', 'info', 'scheduled_followup_start', 'processing',
    `Executing scheduled follow-up for recipient ${payload.triggerUserId}`, {
      automationId: payload.automationId,
      triggerUserId: payload.triggerUserId,
      triggerEventId: payload.triggerEventId,
    });

  // 1. Enforce 24-hour messaging window from qualified response timestamp
  if (!payload.triggerTimestamp || typeof payload.triggerTimestamp !== 'number') {
    debugLog('worker', 'warn', 'scheduled_followup', 'error', 'Invalid triggerTimestamp - dropping', {});
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'failed', 'Invalid trigger timestamp');
    return;
  }

  const responseAge = Date.now() - payload.triggerTimestamp;
  if (responseAge < 0 || responseAge > STANDARD_DM_WINDOW_MS) {
    debugLog('worker', 'warn', 'window_check', 'skipped',
      `Qualified response is ${Math.round(responseAge / 3600000)}h old - 24h messaging window closed`, {
        responseAgeHours: Math.round(responseAge / 3600000),
      });
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'expired', 'Messaging window closed');
    await markJobStatus(db, payload, 'skipped', 'Messaging window expired');
    return;
  }

  // 2. Automation active & follow-up enabled check
  const { data: automation } = await db
    .from('automations')
    .select('id, is_active, follow_up_enabled, follow_up_message, is_traffic_guard_paused')
    .eq('id', payload.automationId)
    .maybeSingle();

  if (!automation || !automation.is_active || !automation.follow_up_enabled) {
    debugLog('worker', 'warn', 'automation_check', 'skipped',
      `Automation ${payload.automationId} is inactive or follow-up disabled - skipping follow-up`, {});
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'skipped', 'Automation inactive or follow-up disabled');
    await markJobStatus(db, payload, 'skipped', 'Automation inactive or follow-up disabled');
    return;
  }

  // 2.5 Recipient Opt-Out Suppression Guard
  if (await isRecipientSuppressed(db, payload.instagramAccountId, payload.triggerUserId)) {
    debugLog('worker', 'warn', 'scheduled_followup_suppressed', 'skipped',
      `Recipient ${payload.triggerUserId} is suppressed (opted out) - cancelling scheduled follow-up`, {
        recipientId: payload.triggerUserId,
        automationId: payload.automationId,
      });
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'skipped', 'Recipient has opted out');
    await markJobStatus(db, payload, 'skipped', 'Recipient has opted out of automated messages');
    return;
  }

  // 3. Instagram account active check
  const { data: igAccount } = await db
    .from('instagram_accounts')
    .select('*')
    .eq('id', payload.instagramAccountId)
    .eq('is_active', true)
    .maybeSingle<InstagramAccountRow>();

  if (!igAccount) {
    debugLog('worker', 'warn', 'account_check', 'skipped',
      `Instagram account ${payload.instagramAccountId} not found or inactive`, {});
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'skipped', 'Account inactive or disconnected');
    await markJobStatus(db, payload, 'skipped', 'Account inactive or disconnected');
    return;
  }

  // 4. Smart Comment Traffic Guard check
  if (igAccount.traffic_guard_paused || automation.is_traffic_guard_paused) {
    debugLog('worker', 'warn', 'traffic_guard_hold', 'skipped',
      `Account @${igAccount.username ?? igAccount.id} is paused by Traffic Guard - holding follow-up job`, {
        accountId: igAccount.id,
      });
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'held', 'Held by Traffic Guard pause');
    throw new AccountOnTrafficGuardPause(igAccount.id);
  }

  // 5. Assert not paused by circuit breaker & rate limit check
  assertAccountNotPaused(igAccount);
  await checkRateLimit(db, payload.instagramAccountId);

  // 6. Decrypt access token
  let accessToken: string;
  try {
    accessToken = decrypt(igAccount.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    throw new Error('Token decryption failed');
  }

  // 7. Human-like jitter
  await jitter();

  // 8. Render follow-up message text
  const rawText = payload.followUpText || automation.follow_up_message;
  if (!rawText?.trim()) {
    debugLog('worker', 'warn', 'followup_message', 'skipped', 'Follow-up message is empty - skipping send', {});
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'skipped', 'Follow-up message is empty');
    return;
  }

  const messageText = renderTemplate(rawText.trim(), payload.triggerUsername);

  // 9. Mark sending in durable schedule table
  await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'sending', null);

  // 10. Send Instagram DM
  try {
    await sendInstagramDm(payload.igAccountIgsid, { id: payload.triggerUserId }, messageText, accessToken);
  } catch (err) {
    if (
      err instanceof MetaApiError &&
      err.code !== undefined &&
      (META_RATE_LIMIT_CODES as readonly number[]).includes(err.code)
    ) {
      throw err;
    }
    if (err instanceof AccountPausedMetaError || err instanceof NonRetryableMetaError) {
      await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'failed', err.message);
      await markJobStatus(db, payload, 'failed', err.message);
      throw err;
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'failed', `Ambiguous outcome: ${errorMsg}`);
    await markJobStatus(db, payload, 'failed', `Ambiguous outcome: ${errorMsg}`);
    throw new AmbiguousDeliveryError(`Ambiguous delivery outcome for follow-up: ${errorMsg}`);
  }

  // 11. Record send success
  const sentAt = new Date();
  await markFollowUpStatus(db, payload.automationId, payload.triggerUserId, originalEventId, 'sent', null, sentAt);
  await markJobStatus(db, payload, 'sent', null, sentAt);
  await db.rpc('increment_automation_dms_sent', { automation_id: payload.automationId });

  if (payload.sessionId) {
    await db.from('dm_logs').insert({
      session_id: payload.sessionId,
      direction: 'outbound',
      step: 99,
      message_text: messageText,
    });
  }

  debugLog('worker', 'info', 'scheduled_followup_delivered', 'ok',
    `Follow-up message delivered to ${payload.triggerUserId}`, {
      automationId: payload.automationId,
      triggerUserId: payload.triggerUserId,
    });
}

export async function processFollowUpDmJob(payload: AutoDmJobPayload): Promise<void> {
  if (payload.isScheduledFollowUp) {
    return processScheduledFollowUpDm(payload);
  }

  const db = createServiceClient();
  const env = getEnv();

  debugLog('worker', 'info', 'followup_started', 'processing', `Follow-up job started - step ${payload.sessionStep}`, {
    sessionId: payload.sessionId ?? null,
    sessionStep: payload.sessionStep ?? null,
    triggerUserId: payload.triggerUserId,
  });

  if (!payload.sessionId) {
    debugLog('worker', 'warn', 'followup_started', 'error', 'Follow-up job has no sessionId - dropping', {});
    return;
  }

  // Follow-up messages require a verified inbound user response event
  if (payload.triggerType !== 'dm_reply_followup' || !payload.triggerEventId) {
    debugLog('worker', 'warn', 'followup_started', 'error',
      'Follow-up attempt without a verified inbound user response event - dropping', {
        triggerType: payload.triggerType,
        hasEventId: Boolean(payload.triggerEventId),
      });
    return;
  }

  // Enforce the 24-hour messaging window from the recipient's verified response timestamp
  if (!payload.triggerTimestamp || typeof payload.triggerTimestamp !== 'number') {
    debugLog('worker', 'warn', 'followup_started', 'error',
      'Follow-up job has invalid or missing triggerTimestamp - dropping', {});
    return;
  }

  const responseAge = Date.now() - payload.triggerTimestamp;
  if (responseAge < 0 || responseAge > STANDARD_DM_WINDOW_MS) {
    debugLog('worker', 'warn', 'window_check', 'skipped',
      `User response is ${Math.round(responseAge / 3600000)}h old - outside 24h window for follow-up`, {
        responseAgeHours: Math.round(responseAge / 3600000),
      });
    await db.from('automation_sessions').update({ completed: true }).eq('id', payload.sessionId);
    return;
  }

  // ── 0.5: Recipient Opt-Out Suppression Guard ─────────────────────────────
  if (await isRecipientSuppressed(db, payload.instagramAccountId, payload.triggerUserId)) {
    debugLog('worker', 'warn', 'followup_suppressed', 'skipped',
      `Recipient ${payload.triggerUserId} is suppressed (opted out) - dropping follow-up`, {
        recipientId: payload.triggerUserId,
        sessionId: payload.sessionId,
      });
    await db.from('automation_sessions').update({ completed: true }).eq('id', payload.sessionId);
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

  // Audience identity verification: Ensure the interacting user is the intended session recipient
  if (session.audience_ig_user_id !== payload.triggerUserId) {
    debugLog('worker', 'error', 'session_verify', 'error',
      `Audience ID mismatch: session belongs to ${session.audience_ig_user_id}, but event trigger user is ${payload.triggerUserId} - dropping`, {
        sessionId: payload.sessionId,
        sessionAudience: session.audience_ig_user_id,
        triggerUserId: payload.triggerUserId,
      });
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
      `Step mismatch: tap says ${payload.sessionStep}, session expects ${expectedStep} - stale button tap`, {});
    return;
  }

  // ── 2: Load automation + account, breaker + rate limit ───────────────────
  const { data: automation } = await db
    .from('automations')
    .select('dm_responses, dm_opening_message_button_link, ask_to_follow_enabled, ask_to_follow_message, ask_to_follow_visit_profile_button, ask_to_follow_confirm_button, ai_runtime_mode_enabled, ai_runtime_instructions')
    .eq('id', payload.automationId)
    .eq('is_active', true)
    .single<AutomationRow>();
  if (!automation) {
    debugLog('worker', 'warn', 'automation_fetch', 'skipped', `Automation ${payload.automationId} inactive - completing session`, {});
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

  if (igAccount.traffic_guard_paused) {
    debugLog('worker', 'warn', 'traffic_guard_hold', 'skipped',
      `Account @${igAccount.username ?? igAccount.id} is paused by Traffic Guard - holding follow-up job`, {
        accountId: igAccount.id,
      });
    throw new AccountOnTrafficGuardPause(igAccount.id);
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
  // who has messaged the account - and a button tap IS a message, so we can
  // genuinely verify. Flow:
  //   step 1 tap → check: follower? deliver straight away : send ask card, step 2
  //   step 2 tap ("I'm following") → RE-CHECK: follower? deliver : gentle nudge
  // Unknown check results FAIL OPEN (deliver) - never block a real person
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

      debugLog('worker', 'info', 'ask_to_follow_dm', 'ok', 'Not a follower - ask-to-follow card sent, session at step 2', {
        sessionId: payload.sessionId,
      });
      return;
    }

    debugLog('worker', 'info', 'follow_check', 'ok',
      follows === true
        ? 'Audience member already follows - skipping ask-to-follow, delivering content'
        : 'Follow status unknown - failing open, delivering content',
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
      // Still not following - nudge and keep the session at step 2 so the
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

      debugLog('worker', 'info', 'follow_check', 'skipped', 'Re-check: still not following - nudge sent, session stays at step 2', {
        sessionId: payload.sessionId,
        triggerUserId: payload.triggerUserId,
      });
      return;
    }

    debugLog('worker', 'info', 'follow_check', 'ok',
      follows === true ? 'Re-check passed - audience member now follows, delivering content' : 'Re-check unknown - failing open, delivering content',
      { sessionId: payload.sessionId });
    // Fall through to responses
  }

  // ── 3B: Optional AI Runtime Response Mode ────────────────────────────────
  if (automation.ai_runtime_mode_enabled && automation.ai_runtime_instructions?.trim()) {
    const userPrompt = payload.messageText || payload.commentText || '';
    const aiResult = await generateRuntimeDmResponse(
      automation.ai_runtime_instructions,
      userPrompt,
      { commenterName: payload.triggerUsername ?? undefined }
    );
    if (aiResult.status === 'success' && aiResult.data.trim()) {
      await sendInstagramDm(
        payload.igAccountIgsid,
        { id: payload.triggerUserId },
        aiResult.data.trim(),
        accessToken
      );
      await db
        .from('automation_sessions')
        .update({ completed: true, last_activity_at: new Date().toISOString() })
        .eq('id', payload.sessionId);
      await db.rpc('increment_automation_dms_sent', { automation_id: payload.automationId });
      debugLog('worker', 'info', 'responses_send', 'ok', `AI runtime response delivered to ${payload.triggerUserId}`, {
        sessionId: payload.sessionId,
      });
      return;
    }
    debugLog('worker', 'warn', 'responses_send', 'processing',
      'AI runtime response returned fallback or empty - falling back to static dm_responses', {
        sessionId: payload.sessionId,
      });
  }

  // ── 4: Deliver dm_responses sequentially ─────────────────────────────────
  if (!automation.dm_responses?.length) {
    debugLog('worker', 'warn', 'responses_send', 'skipped', 'Automation has 0 dm_responses - session completed with no content', {
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
  let deliveredCount = 0;
  for (const [idx, response] of automation.dm_responses.entries()) {
    if (!response.content?.trim() && response.type !== 'card') continue;
    if (deliveredCount > 0) await interMessageJitter();

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
          debugLog('worker', 'warn', 'responses_send', 'processing', 'Link button rejected - falling back to inline link', {});
          const fallback = `${messageText}\n\n${buttonTitle}: ${link}`;
          await sendInstagramDm(payload.igAccountIgsid, { id: payload.triggerUserId }, fallback, accessToken);
          lastMessageText = fallback;
        }
      } else {
        await sendInstagramDm(payload.igAccountIgsid, { id: payload.triggerUserId }, messageText, accessToken);
        lastMessageText = messageText;
      }
    }
    deliveredCount += 1;
    debugLog('worker', 'info', 'responses_send', 'ok', `Response ${idx + 1}/${automation.dm_responses.length} sent`, {
      responseIndex: idx + 1,
      type: response.type,
    });
  }

  // The tap reserved one slot; anything beyond the first message is extra.
  recordExtraSends(payload.instagramAccountId, deliveredCount - 1);

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
