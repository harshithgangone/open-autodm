/**
 * Webhook payload processing — routes Meta events to queue jobs.
 *
 * Runs AFTER the 200 response has been sent to Meta (via `after()`), so
 * nothing here is latency-critical. Ported 1:1 from the proven receiver:
 *
 *  comment events → keyword/post match → auto_dm job
 *  DM events      → quick-reply/postback session routing → follow_up job
 *                 → story replies (message.reply_to.story) → story_reply keyword match
 *                 → plain DMs → dm_reply keyword match
 */

import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import { keywordMatches } from '@/lib/automation/keywordMatch';
import { enqueueJob } from '@/lib/automation/queue';
import { recordContactInteraction } from '@/lib/automation/contacts';
import type {
  MetaWebhookBody,
  MetaCommentChangeValue,
  MetaWebhookMessaging,
  AutoDmJobPayload,
} from '@/lib/types';

const logger = createLogger('webhook');

/** Max event age accepted for processing: 24h window + 1h queue buffer. */
const MAX_EVENT_AGE_MS = 25 * 60 * 60 * 1000;

export async function processWebhookPayload(body: MetaWebhookBody): Promise<number> {
  if (body.object !== 'instagram') {
    debugLog('webhook', 'info', 'payload_routing', 'skipped', `Webhook object "${body.object}" is not instagram — ignoring`, {});
    return 0;
  }

  debugLog('webhook', 'info', 'payload_routing', 'ok', `Processing instagram webhook — ${body.entry.length} entr${body.entry.length === 1 ? 'y' : 'ies'}`, {
    entryIds: body.entry.map((e) => e.id),
  });

  const db = createServiceClient();
  let enqueued = 0;

  for (const entry of body.entry) {
    debugLog('webhook', 'info', 'entry_processing', 'processing', `Entry for IG account ${entry.id}`, {
      entryId: entry.id,
      changeFields: entry.changes?.map((c) => c.field) ?? [],
      messagingCount: entry.messaging?.length ?? 0,
    });

    const { data: igAccount, error } = await db
      .from('instagram_accounts')
      .select('id, instagram_user_id')
      .eq('instagram_user_id', entry.id)
      .eq('is_active', true)
      .single();

    if (error || !igAccount) {
      debugLog('webhook', 'warn', 'ig_account_lookup', 'skipped', `No active IG account for entry.id=${entry.id}`, {
        entryId: entry.id,
        hint: 'Meta console "Test" button sends entry.id=0 (fake) — real comments from the connected account are required.',
      });
      continue;
    }

    if (entry.changes?.length) {
      for (const change of entry.changes) {
        if (change.field === 'comments') {
          enqueued += await processCommentEvent(igAccount.id as string, entry.id, change.value, entry.time);
        } else {
          debugLog('webhook', 'info', 'change_field_ignored', 'skipped', `Ignoring change field "${change.field}"`, {
            field: change.field,
          });
        }
      }
    } else if (!entry.messaging?.length) {
      debugLog('webhook', 'warn', 'entry_empty', 'skipped', `Entry ${entry.id} has no changes and no messaging`, {
        hint: 'Likely a read-receipt or unsupported event. Check the per-account subscription includes "comments".',
      });
    }

    if (entry.messaging) {
      for (const messaging of entry.messaging) {
        enqueued += await processDmEvent(igAccount.id as string, entry.id, messaging);
      }
    }
  }

  return enqueued;
}

async function processCommentEvent(
  instagramAccountId: string,
  igAccountIgsid: string,
  comment: MetaCommentChangeValue,
  entryTime: number
): Promise<number> {
  // Only top-level comments trigger — replies are ignored (incl. our own replies)
  if (comment.parent_id) {
    debugLog('webhook', 'info', 'comment_event', 'skipped', `Comment ${comment.id} is a reply — ignored`, {
      commentId: comment.id,
    });
    return 0;
  }

  // Never react to the account's own comments (self-trigger loop guard)
  if (comment.from.id === igAccountIgsid) {
    debugLog('webhook', 'info', 'comment_event', 'skipped', 'Comment authored by the connected account itself — ignored', {});
    return 0;
  }

  // Meta may omit comment.timestamp on IG comment webhooks — fall back to entry.time
  const triggerTimestamp = (comment.timestamp ?? entryTime) * 1000;
  const eventAgeMs = Date.now() - triggerTimestamp;

  debugLog('webhook', 'info', 'comment_event', 'processing', `Comment received: "${comment.text.slice(0, 80)}"`, {
    commentId: comment.id,
    commenterId: comment.from.id,
    commenterUsername: comment.from.username ?? null,
    postId: comment.media.id,
    ageSeconds: Math.round(eventAgeMs / 1000),
  });

  if (eventAgeMs > MAX_EVENT_AGE_MS) {
    debugLog('webhook', 'warn', 'window_check', 'skipped', `Comment ${Math.round(eventAgeMs / 3600000)}h old — beyond processing window`, {});
    return 0;
  }

  const db = createServiceClient();
  const { data: automations, error } = await db
    .from('automations')
    .select('id, post_id, keywords')
    .eq('instagram_account_id', instagramAccountId)
    .eq('type', 'comment_dm')
    .eq('is_active', true);

  if (error) {
    debugLog('webhook', 'error', 'automations_fetch', 'error', `DB error fetching automations: ${error.message}`, {});
    return 0;
  }
  if (!automations?.length) {
    debugLog('webhook', 'info', 'automations_fetch', 'skipped', 'No active comment_dm automations for this account', {});
    return 0;
  }

  debugLog('webhook', 'info', 'automations_fetch', 'ok', `Checking ${automations.length} active automation(s)`, {
    automationIds: automations.map((a) => a.id),
  });

  let enqueued = 0;
  let capturedAutomationId: string | null = null;
  for (const automation of automations) {
    if (automation.post_id && automation.post_id !== comment.media.id) {
      debugLog('webhook', 'info', 'post_filter', 'skipped', `Automation ${automation.id}: different post`, {
        automationId: automation.id,
      });
      continue;
    }

    if (!keywordMatches(comment.text, automation.keywords as string[] | null)) {
      debugLog('webhook', 'info', 'keyword_match', 'skipped', `Automation ${automation.id}: no keyword match`, {
        automationId: automation.id,
        keywords: automation.keywords ?? null,
      });
      continue;
    }

    debugLog('webhook', 'info', 'keyword_match', 'ok', `Automation ${automation.id}: keyword matched — enqueuing`, {
      automationId: automation.id,
    });

    const payload: AutoDmJobPayload = {
      automationId: automation.id as string,
      instagramAccountId,
      igAccountIgsid,
      triggerType: 'comment',
      triggerUserId: comment.from.id,
      triggerUsername: comment.from.username ?? null,
      triggerEventId: comment.id,
      triggerTimestamp,
      postId: comment.media.id,
      commentText: comment.text,
      messageText: null,
    };

    const jobId = await enqueueJob('auto_dm', payload, `event_${automation.id}_${comment.id}`);
    if (jobId) {
      enqueued += 1;
      capturedAutomationId = capturedAutomationId ?? (automation.id as string);
      debugLog('webhook', 'info', 'job_enqueued', 'ok', `AutoDM job enqueued — ${jobId}`, { jobId });
    }
  }

  if (enqueued > 0) {
    recordContactInteraction({
      instagramAccountId,
      audienceIgUserId: comment.from.id,
      username: comment.from.username ?? null,
      triggerType: 'comment',
      automationId: capturedAutomationId,
    });
  }
  return enqueued;
}

async function processDmEvent(
  instagramAccountId: string,
  igAccountIgsid: string,
  messaging: MetaWebhookMessaging
): Promise<number> {
  // Filter echoes (our own sends), read receipts, delivery receipts
  if (messaging.message?.is_echo || messaging.read || messaging.delivery) {
    const kind = messaging.message?.is_echo ? 'echo' : messaging.read ? 'read_receipt' : 'delivery_receipt';
    debugLog('webhook', 'info', 'dm_event_filtered', 'skipped', `DM event filtered — ${kind}`, { kind });
    return 0;
  }
  // Self-messaging loop guard
  if (messaging.sender.id === messaging.recipient.id) return 0;

  const message = messaging.message;
  const triggerTimestamp = messaging.timestamp;
  const eventAgeMs = Date.now() - triggerTimestamp;

  debugLog('webhook', 'info', 'dm_event', 'processing', `DM received from ${messaging.sender.id}`, {
    senderId: messaging.sender.id,
    hasQuickReply: !!message?.quick_reply,
    hasPostback: !!messaging.postback,
  });

  if (eventAgeMs > MAX_EVENT_AGE_MS) {
    debugLog('webhook', 'warn', 'window_check', 'skipped', `DM event ${Math.round(eventAgeMs / 3600000)}h old — beyond window`, {});
    return 0;
  }

  const db = createServiceClient();

  // ── Priority: session button tap (quick_reply OR postback) ───────────────
  // Both carry "SESSION_{uuid}_STEP_{n}". NEVER route on message.text — the
  // visible label could collide across automations.
  const tapPayload = messaging.message?.quick_reply?.payload ?? messaging.postback?.payload;
  if (tapPayload) {
    const sessionMatch = /^SESSION_([0-9a-f-]+)_STEP_(\d+)$/i.exec(tapPayload);
    if (sessionMatch) {
      const sessionId = sessionMatch[1] as string;
      const sessionStep = parseInt(sessionMatch[2] as string, 10);
      const eventMid = message?.mid ?? `postback_${messaging.sender.id}_${triggerTimestamp}`;
      const eventText = message?.text ?? messaging.postback?.title ?? null;

      debugLog('webhook', 'info', 'quick_reply_tap', 'processing', `Button tap — session ${sessionId} step ${sessionStep}`, {
        sessionId,
        sessionStep,
        senderId: messaging.sender.id,
      });

      const { data: session, error: sessionError } = await db
        .from('automation_sessions')
        .select('id, automation_id, completed, expires_at')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) {
        debugLog('webhook', 'error', 'session_lookup', 'error', `DB error fetching session: ${sessionError.message}`, {
          sessionId,
        });
        // Fall through to keyword matching rather than dropping the event
      } else if (!session) {
        debugLog('webhook', 'warn', 'session_lookup', 'skipped', `Session ${sessionId} not found — tap ignored`, { sessionId });
        return 0;
      } else if (session.completed || new Date(session.expires_at as string) < new Date()) {
        debugLog('webhook', 'info', 'session_lookup', 'skipped',
          `Session ${sessionId} is ${session.completed ? 'completed' : 'expired'} — tap ignored`, { sessionId });
        return 0;
      } else {
        const followUpPayload: AutoDmJobPayload = {
          automationId: session.automation_id as string,
          instagramAccountId,
          igAccountIgsid,
          triggerType: 'dm_reply_followup',
          triggerUserId: messaging.sender.id,
          triggerEventId: eventMid,
          triggerTimestamp,
          postId: null,
          commentText: null,
          messageText: eventText,
          isFollowUp: true,
          sessionId,
          sessionStep,
        };
        const jobId = await enqueueJob('follow_up', followUpPayload, `followup_${sessionId}_${sessionStep}_${eventMid}`);
        debugLog('webhook', 'info', 'job_enqueued', jobId ? 'ok' : 'skipped', `Follow-up job ${jobId ? `enqueued (${jobId})` : 'duplicate — ignored'}`, {
          sessionId,
          sessionStep,
        });
        if (jobId) {
          recordContactInteraction({
            instagramAccountId,
            audienceIgUserId: messaging.sender.id,
            triggerType: 'button',
            automationId: session.automation_id as string,
          });
        }
        return jobId ? 1 : 0;
      }
    }
  }

  // ── Keyword matching — story replies vs plain DMs ────────────────────────
  // A story reply arrives as a normal messaging event with message.reply_to.story
  // set. It routes ONLY to story_reply automations; plain DMs route ONLY to
  // dm_reply automations — one event never fires both types.
  if (!message?.text) {
    debugLog('webhook', 'info', 'dm_event', 'skipped', 'DM has no text — skipping keyword match', {});
    return 0;
  }

  const isStoryReply = !!message.reply_to?.story;
  const automationType = isStoryReply ? 'story_reply' : 'dm_reply';
  const triggerType = isStoryReply ? 'story_reply' : 'dm';

  if (isStoryReply) {
    debugLog('webhook', 'info', 'story_reply_event', 'processing', `Story reply received: "${message.text.slice(0, 60)}"`, {
      senderId: messaging.sender.id,
      storyId: message.reply_to?.story?.id ?? null,
    });
  }

  const { data: automations, error } = await db
    .from('automations')
    .select('id, keywords')
    .eq('instagram_account_id', instagramAccountId)
    .eq('type', automationType)
    .eq('is_active', true);

  if (error) {
    debugLog('webhook', 'error', 'automations_fetch', 'error', `DB error fetching ${automationType} automations: ${error.message}`, {});
    return 0;
  }
  if (!automations?.length) {
    debugLog('webhook', 'info', 'automations_fetch', 'skipped', `No active ${automationType} automations`, {});
    return 0;
  }

  let enqueued = 0;
  let capturedAutomationId: string | null = null;
  for (const automation of automations) {
    if (!keywordMatches(message.text, automation.keywords as string[] | null)) {
      debugLog('webhook', 'info', 'keyword_match', 'skipped', `${automationType} ${automation.id}: no keyword match`, {
        automationId: automation.id,
      });
      continue;
    }

    debugLog('webhook', 'info', 'keyword_match', 'ok', `${automationType} ${automation.id}: matched — enqueuing`, {
      automationId: automation.id,
    });

    const payload: AutoDmJobPayload = {
      automationId: automation.id as string,
      instagramAccountId,
      igAccountIgsid,
      triggerType,
      triggerUserId: messaging.sender.id,
      triggerUsername: null,
      triggerEventId: message.mid,
      triggerTimestamp,
      postId: null,
      commentText: null,
      messageText: message.text,
    };
    const jobId = await enqueueJob('auto_dm', payload, `event_${automation.id}_${message.mid}`);
    if (jobId) {
      enqueued += 1;
      capturedAutomationId = capturedAutomationId ?? (automation.id as string);
    }
  }

  if (enqueued > 0) {
    recordContactInteraction({
      instagramAccountId,
      audienceIgUserId: messaging.sender.id,
      triggerType: isStoryReply ? 'story_reply' : 'dm',
      automationId: capturedAutomationId,
    });
  }

  if (enqueued === 0 && automations.length > 0) {
    logger.debug({ senderId: messaging.sender.id, automationType }, 'Message matched no automations');
  }
  return enqueued;
}
