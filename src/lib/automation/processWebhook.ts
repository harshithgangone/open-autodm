/**
* Webhook payload processing - routes Meta events to queue jobs.
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
import { keywordMatches, isExplicitWildcardAutomation } from '@/lib/automation/keywordMatch';
import { enqueueJob } from '@/lib/automation/queue';
import { recordContactInteraction } from '@/lib/automation/contacts';
import { recordAndEvaluateCommentTraffic } from '@/lib/trafficGuard/tracker';
import { isOptOutIntent, recordRecipientOptOut, isRecipientSuppressed } from '@/lib/automation/optOut';
import type {
MetaWebhookBody,
MetaCommentChangeValue,
MetaWebhookMessaging,
AutoDmJobPayload,
} from '@/lib/types';

const logger = createLogger('webhook');

/** Standard 24h window for DM / Story reply triggers (+1h safety buffer). */
export const STANDARD_EVENT_AGE_MS = 25 * 60 * 60 * 1000;

/** Meta's 7-day window for post/Reel comment private replies (+2h safety buffer). */
export const COMMENT_EVENT_AGE_MS = (7 * 24 + 2) * 60 * 60 * 1000;

/** Meta's window for private replies to Instagram Live comments (active broadcast / 1 hour). */
export const LIVE_COMMENT_EVENT_AGE_MS = 60 * 60 * 1000;

export async function processWebhookPayload(body: MetaWebhookBody): Promise<number> {
if (body.object !== 'instagram') {
debugLog('webhook', 'info', 'payload_routing', 'skipped', `Webhook object "${body.object}" is not instagram - ignoring`, {});
return 0;
}

debugLog('webhook', 'info', 'payload_routing', 'ok', `Processing instagram webhook - ${body.entry.length} entr${body.entry.length === 1 ? 'y' : 'ies'}`, {
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
.select('id, instagram_user_id, traffic_guard_paused')
.eq('instagram_user_id', entry.id)
.eq('is_active', true)
.single();

if (error || !igAccount) {
debugLog('webhook', 'warn', 'ig_account_lookup', 'skipped', `No active IG account for entry.id=${entry.id}`, {
entryId: entry.id,
hint: 'Meta console "Test" button sends entry.id=0 (fake) - real comments from the connected account are required.',
});
continue;
}

// Monitor comment traffic volume (Smart Comment Traffic Guard)
const commentIds: string[] = [];
if (entry.changes?.length) {
for (const change of entry.changes) {
if (change.field === 'comments' && change.value?.id) {
// Do not count the account's own comments
if (change.value.from?.id !== entry.id) {
commentIds.push(change.value.id);
}
}
}
}
if (commentIds.length > 0) {
await recordAndEvaluateCommentTraffic(igAccount.id as string, commentIds);
}

if (entry.changes?.length) {
if (igAccount.traffic_guard_paused) {
debugLog('webhook', 'warn', 'traffic_guard_paused', 'skipped',
`Account ${entry.id} is paused by Traffic Guard - skipping comment automation processing`, {
accountId: igAccount.id,
});
} else {
for (const change of entry.changes) {
if (change.field === 'comments') {
enqueued += await processCommentEvent(igAccount.id as string, entry.id, change.value, entry.time);
} else {
debugLog('webhook', 'info', 'change_field_ignored', 'skipped', `Ignoring change field "${change.field}"`, {
field: change.field,
});
}
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
if (!comment || !comment.id || !comment.from?.id || !comment.text) {
debugLog('webhook', 'warn', 'comment_event', 'skipped', 'Comment event missing required fields (id, from, or text) - ignored', {});
return 0;
}

// Only top-level comments trigger - replies are ignored (incl. our own replies)
if (comment.parent_id) {
debugLog('webhook', 'info', 'comment_event', 'skipped', `Comment ${comment.id} is a reply - ignored`, {
commentId: comment.id,
});
return 0;
}

// Never react to the account's own comments (self-trigger loop guard)
if (comment.from?.id === igAccountIgsid) {
debugLog('webhook', 'info', 'comment_event', 'skipped', 'Comment authored by the connected account itself - ignored', {});
return 0;
}

// Meta may omit comment.timestamp on IG comment webhooks - fall back to entry.time
const triggerTimestamp = (comment.timestamp ?? entryTime) * 1000;
const eventAgeMs = Date.now() - triggerTimestamp;

debugLog('webhook', 'info', 'comment_event', 'processing', `Comment received: "${comment.text.slice(0, 80)}"`, {
commentId: comment.id,
commenterId: comment.from.id,
commenterUsername: comment.from.username ?? null,
postId: comment.media?.id ?? null,
ageSeconds: Math.round(eventAgeMs / 1000),
});

const isLive = comment.media?.media_product_type === 'LIVE';
if (isLive) {
debugLog('webhook', 'warn', 'live_comment_disabled', 'skipped',
'Live-comment automation disabled for MVP: active-broadcast status cannot be verified without polling Live endpoints. Meta policy strictly restricts Live private replies to active broadcasts only.',
{ commentId: comment.id, mediaProductType: comment.media?.media_product_type }
);
return 0;
}

if (eventAgeMs > COMMENT_EVENT_AGE_MS) {
debugLog('webhook', 'warn', 'window_check', 'skipped',
`Comment ${Math.round(eventAgeMs / 3600000)}h old - beyond 7-day processing window`, {});
return 0;
}

const db = createServiceClient();

  // ── Opt-Out & Suppression Gate (Takes precedence over EVERY trigger) ──────
  if (isOptOutIntent(comment.text)) {
    await recordRecipientOptOut(db, {
      instagramAccountId,
      recipientId: comment.from.id,
      triggerEventId: comment.id,
      text: comment.text,
      reason: 'comment_keyword',
    });
    debugLog('webhook', 'warn', 'comment_opt_out', 'skipped',
      `Commenter ${comment.from.id} opted out via comment: "${comment.text.slice(0, 60)}" - suppression recorded`, {
        commentId: comment.id,
        commenterId: comment.from.id,
      });
    return 0;
  }

  if (await isRecipientSuppressed(db, instagramAccountId, comment.from.id)) {
    debugLog('webhook', 'info', 'comment_suppressed', 'skipped',
      `Commenter ${comment.from.id} is suppressed (opted out) - skipping automations`, {
        commentId: comment.id,
        commenterId: comment.from.id,
      });
    return 0;
  }

const { data: automations, error } = await db
.from('automations')
.select('id, post_id, keywords, trigger_config, flow_graph')
.eq('instagram_account_id', instagramAccountId)
.eq('type', 'comment_dm')
.eq('is_active', true)
.eq('is_traffic_guard_paused', false);

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
if (automation.post_id && comment.media?.id && automation.post_id !== comment.media.id) {
debugLog('webhook', 'info', 'post_filter', 'skipped', `Automation ${automation.id}: different post`, {
automationId: automation.id,
});
continue;
}
if (automation.post_id && !comment.media?.id) {
debugLog('webhook', 'info', 'post_filter', 'skipped', `Automation ${automation.id}: comment has no media metadata`, {
automationId: automation.id,
});
continue;
}

const isAnyComment = isExplicitWildcardAutomation(automation);

const excluded = (automation as any).trigger_config?.excluded_keywords;
if (Array.isArray(excluded) && excluded.length > 0 && keywordMatches(comment.text, excluded)) {
  debugLog('webhook', 'info', 'keyword_exclude', 'skipped', `Automation ${automation.id}: comment matches excluded keyword`, {
    automationId: automation.id,
  });
  continue;
}

if (!isAnyComment && !keywordMatches(comment.text, automation.keywords as string[] | null, { exactStandalone: true })) {
debugLog('webhook', 'info', 'keyword_match', 'skipped', `Automation ${automation.id}: no keyword match`, {
automationId: automation.id,
keywords: automation.keywords ?? null,
});
continue;
}

debugLog('webhook', 'info', 'keyword_match', 'ok', `Automation ${automation.id}: ${isAnyComment ? 'any comment' : 'keyword'} matched - enqueuing`, {
automationId: automation.id,
isAnyComment,
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
postId: comment.media?.id ?? null,
commentText: comment.text,
messageText: null,
isLive,
mediaProductType: comment.media?.media_product_type,
};

const jobId = await enqueueJob('auto_dm', payload, `event_${automation.id}_${comment.id}`);
if (jobId) {
enqueued += 1;
capturedAutomationId = capturedAutomationId ?? (automation.id as string);
debugLog('webhook', 'info', 'job_enqueued', 'ok', `AutoDM job enqueued - ${jobId}`, { jobId });
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
debugLog('webhook', 'info', 'dm_event_filtered', 'skipped', `DM event filtered - ${kind}`, { kind });
return 0;
}
// Guard missing sender or recipient and self-messaging loop
if (!messaging.sender?.id || !messaging.recipient?.id) return 0;
if (messaging.sender.id === messaging.recipient.id) return 0;

const message = messaging.message;
const triggerTimestamp = messaging.timestamp;
const eventAgeMs = Date.now() - triggerTimestamp;

debugLog('webhook', 'info', 'dm_event', 'processing', `DM received from ${messaging.sender.id}`, {
senderId: messaging.sender.id,
hasQuickReply: !!message?.quick_reply,
hasPostback: !!messaging.postback,
});

if (eventAgeMs > STANDARD_EVENT_AGE_MS) {
debugLog('webhook', 'warn', 'window_check', 'skipped', `DM event ${Math.round(eventAgeMs / 3600000)}h old - beyond window`, {});
return 0;
}

const db = createServiceClient();

  // ── Opt-Out & Suppression Gate for Inbound DMs ─────────────────────────────
  if (message?.text && isOptOutIntent(message.text)) {
    await recordRecipientOptOut(db, {
      instagramAccountId,
      recipientId: messaging.sender.id,
      triggerEventId: message.mid,
      text: message.text,
      reason: 'dm_keyword',
    });
    debugLog('webhook', 'warn', 'dm_opt_out', 'skipped',
      `User ${messaging.sender.id} opted out via DM: "${message.text.slice(0, 60)}" - suppression recorded`, {
        mid: message.mid,
        senderId: messaging.sender.id,
      });
    return 0;
  }

  if (await isRecipientSuppressed(db, instagramAccountId, messaging.sender.id)) {
    debugLog('webhook', 'info', 'dm_suppressed', 'skipped',
      `User ${messaging.sender.id} is suppressed (opted out) - skipping DM event`, {
        senderId: messaging.sender.id,
      });
    return 0;
  }


// ── Priority: session button tap (quick_reply OR postback) ───────────────
// Both carry "SESSION_{uuid}_STEP_{n}". NEVER route on message.text - the
// visible label could collide across automations.
const tapPayload = messaging.message?.quick_reply?.payload ?? messaging.postback?.payload;
if (tapPayload) {
const sessionMatch = /^SESSION_([0-9a-f-]+)_STEP_(\d+)$/i.exec(tapPayload);
if (sessionMatch) {
const sessionId = sessionMatch[1] as string;
const sessionStep = parseInt(sessionMatch[2] as string, 10);
const eventMid = message?.mid ?? `postback_${messaging.sender.id}_${triggerTimestamp}`;
const eventText = message?.text ?? messaging.postback?.title ?? null;

debugLog('webhook', 'info', 'quick_reply_tap', 'processing', `Button tap - session ${sessionId} step ${sessionStep}`, {
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
debugLog('webhook', 'warn', 'session_lookup', 'skipped', `Session ${sessionId} not found - tap ignored`, { sessionId });
return 0;
} else if (session.completed || new Date(session.expires_at as string) < new Date()) {
debugLog('webhook', 'info', 'session_lookup', 'skipped',
`Session ${sessionId} is ${session.completed ? 'completed' : 'expired'} - tap ignored`, { sessionId });
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
debugLog('webhook', 'info', 'job_enqueued', jobId ? 'ok' : 'skipped', `Follow-up job ${jobId ? `enqueued (${jobId})` : 'duplicate - ignored'}`, {
sessionId,
sessionStep,
});

// ── Check if automation has follow-up check-in messages enabled ───────
// The button tap is a verified qualifying inbound response from the recipient!
const { data: auto } = await db
.from('automations')
.select('id, is_active, follow_up_enabled, follow_up_delay_minutes, follow_up_message')
.eq('id', session.automation_id)
.maybeSingle();

if (auto?.is_active && auto.follow_up_enabled && auto.follow_up_message?.trim()) {
const delayMinutes = auto.follow_up_delay_minutes || 60;
const scheduledFor = new Date(triggerTimestamp + delayMinutes * 60 * 1000);
const maxAllowedWindow = triggerTimestamp + 24 * 60 * 60 * 1000;

if (scheduledFor.getTime() <= maxAllowedWindow) {
await db.from('automation_follow_ups').upsert({
automation_id: auto.id,
instagram_account_id: instagramAccountId,
session_id: sessionId,
recipient_id: messaging.sender.id,
qualified_event_id: eventMid,
qualified_timestamp: new Date(triggerTimestamp).toISOString(),
scheduled_for: scheduledFor.toISOString(),
status: 'scheduled',
message_snapshot: auto.follow_up_message,
}, { onConflict: 'automation_id,recipient_id,qualified_event_id' });

const scheduledPayload: AutoDmJobPayload = {
automationId: auto.id as string,
instagramAccountId,
igAccountIgsid,
triggerType: 'dm_reply_followup',
triggerUserId: messaging.sender.id,
triggerUsername: null,
triggerEventId: `scheduled_${eventMid}`,
triggerTimestamp,
postId: null,
commentText: null,
messageText: null,
isFollowUp: true,
sessionId,
sessionStep: 99,
isScheduledFollowUp: true,
followUpText: auto.follow_up_message,
};

await enqueueJob(
'follow_up',
scheduledPayload,
`scheduled_followup_${auto.id}_${messaging.sender.id}_${eventMid}`,
scheduledFor
);

debugLog('webhook', 'info', 'followup_scheduled', 'ok',
`Scheduled follow-up job in ${delayMinutes}m for ${messaging.sender.id}`, {
automationId: auto.id,
delayMinutes,
scheduledFor: scheduledFor.toISOString(),
});
} else {
await db.from('automation_follow_ups').upsert({
automation_id: auto.id,
instagram_account_id: instagramAccountId,
session_id: sessionId,
recipient_id: messaging.sender.id,
qualified_event_id: eventMid,
qualified_timestamp: new Date(triggerTimestamp).toISOString(),
scheduled_for: scheduledFor.toISOString(),
status: 'skipped',
error_reason: 'Scheduled delay exceeds 24-hour messaging window',
message_snapshot: auto.follow_up_message,
}, { onConflict: 'automation_id,recipient_id,qualified_event_id' });
}
}

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

// ── Incoming Shared-Reel DM Trigger ──────────────────────────────────────
// When a user shares a Reel into DM with the account, Meta delivers an attachment
// with type "ig_reel", "reel", or corroborated "share" (where URL/title identifies it as a Reel).
const reelAttachment = message?.attachments?.find((att) => {
  if (att.type === 'ig_reel' || att.type === 'reel') return true;
  if (att.type === 'share') {
    const url = att.payload?.url?.toLowerCase() || '';
    const title = att.payload?.title?.toLowerCase() || '';
    return url.includes('/reel/') || url.includes('/reels/') || title.includes('reel');
  }
  return false;
});

if (reelAttachment && message) {
  const reelId = reelAttachment.payload?.id ?? null;
  const reelUrl = reelAttachment.payload?.url ?? null;
  const reelTitle = reelAttachment.payload?.title ?? message.text ?? null;

  debugLog('webhook', 'info', 'shared_reel_event', 'processing',
    `Incoming shared Reel received from ${messaging.sender.id} (reelId=${reelId ?? 'unknown'})`, {
      senderId: messaging.sender.id,
      reelId,
      reelTitle: reelTitle?.slice(0, 50),
      attachmentType: reelAttachment.type,
    });

  // Query active reel_dm automations (and dm_reply automations matching this reel)
  const { data: reelAutomations, error: reelError } = await db
    .from('automations')
    .select('id, type, post_id, keywords, trigger_config, flow_graph, follow_up_enabled, follow_up_delay_minutes, follow_up_message')
    .eq('instagram_account_id', instagramAccountId)
    .in('type', ['reel_dm', 'dm_reply'])
    .eq('is_active', true);

  if (reelError) {
    debugLog('webhook', 'error', 'reel_automations_fetch', 'error',
      `DB error fetching reel automations: ${reelError.message}`, {});
  } else if (reelAutomations && reelAutomations.length > 0) {
    let enqueuedReel = 0;
    for (const auto of reelAutomations) {
      // Must be explicitly a reel_dm automation OR have a post_id matching reelId
      const isReelAuto = auto.type === 'reel_dm' || (auto.post_id && auto.post_id === reelId);
      if (!isReelAuto) continue;

      // Per-Reel filter: If automation targets a specific Reel, verify reelId matches
      if (auto.post_id && auto.post_id !== reelId) {
        debugLog('webhook', 'info', 'reel_filter', 'skipped',
          `Automation ${auto.id} targets reel ${auto.post_id}, received ${reelId}`, {
            automationId: auto.id,
            targetReelId: auto.post_id,
            receivedReelId: reelId,
          });
        continue;
      }

      // Keyword filter:
      // A reel_dm automation triggers on any shared Reel by default unless specific non-wildcard keywords are configured.
      const isWildcard = isExplicitWildcardAutomation(auto);
      const hasSpecificKeywords = Boolean(auto.keywords && auto.keywords.length > 0 && !isWildcard);

      if (hasSpecificKeywords) {
        const textToMatch = message.text || reelTitle || '';
        if (!keywordMatches(textToMatch, auto.keywords as string[] | null)) {
          debugLog('webhook', 'info', 'reel_keyword_filter', 'skipped',
            `Automation ${auto.id}: keyword does not match text "${textToMatch}"`, {});
          continue;
        }
      }

      const payload: AutoDmJobPayload = {
        automationId: auto.id as string,
        instagramAccountId,
        igAccountIgsid,
        triggerType: 'reel_dm',
        triggerUserId: messaging.sender.id,
        triggerUsername: null,
        triggerEventId: message.mid,
        triggerTimestamp,
        postId: reelId,
        commentText: null,
        messageText: reelTitle,
        sharedReelId: reelId,
        sharedReelUrl: reelUrl,
        sharedReelTitle: reelTitle,
      };

      const dedupeKey = `event_${auto.id}_${message.mid}`;
      const jobId = await enqueueJob('auto_dm', payload, dedupeKey);
      if (jobId) {
        enqueuedReel += 1;
        debugLog('webhook', 'info', 'job_enqueued', 'ok',
          `Shared-Reel AutoDM job enqueued - ${jobId}`, { jobId, reelId });
        recordContactInteraction({
          instagramAccountId,
          audienceIgUserId: messaging.sender.id,
          triggerType: 'button',
          automationId: auto.id as string,
        });
      }
    }

    if (enqueuedReel > 0) {
      return enqueuedReel;
    }
  }
}

// ── Keyword matching - story replies vs plain DMs ────────────────────────
// A story reply arrives as a normal messaging event with message.reply_to.story
// set. It routes ONLY to story_reply automations; plain DMs route ONLY to
// dm_reply automations - one event never fires both types.
if (!message?.text) {
debugLog('webhook', 'info', 'dm_event', 'skipped', 'DM has no text - skipping keyword match', {});
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
    .select('id, keywords, trigger_config, flow_graph, follow_up_enabled, follow_up_delay_minutes, follow_up_message')
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
    const isAnyDm = isExplicitWildcardAutomation(automation);

    const excluded = (automation as any).trigger_config?.excluded_keywords;
    if (Array.isArray(excluded) && excluded.length > 0 && keywordMatches(message.text, excluded)) {
      debugLog('webhook', 'info', 'keyword_exclude', 'skipped', `${automationType} ${automation.id}: message matches excluded keyword`, {
        automationId: automation.id,
      });
      continue;
    }

    if (!isAnyDm && !keywordMatches(message.text, automation.keywords as string[] | null)) {
      debugLog('webhook', 'info', 'keyword_match', 'skipped', `${automationType} ${automation.id}: no keyword match`, {
        automationId: automation.id,
      });
      continue;
    }

    debugLog('webhook', 'info', 'keyword_match', 'ok', `${automationType} ${automation.id}: ${isAnyDm ? 'any mode' : 'keyword'} matched - enqueuing`, {
      automationId: automation.id,
      isAnyDm,
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

      // Schedule follow-up if enabled on this direct DM / story reply automation
      if (automation.follow_up_enabled && automation.follow_up_message?.trim()) {
        const delayMinutes = automation.follow_up_delay_minutes || 60;
        const scheduledFor = new Date(triggerTimestamp + delayMinutes * 60 * 1000);
        const maxAllowedWindow = triggerTimestamp + 24 * 60 * 60 * 1000;

        if (scheduledFor.getTime() <= maxAllowedWindow) {
          await db.from('automation_follow_ups').upsert({
            automation_id: automation.id,
            instagram_account_id: instagramAccountId,
            session_id: null,
            recipient_id: messaging.sender.id,
            qualified_event_id: message.mid,
            qualified_timestamp: new Date(triggerTimestamp).toISOString(),
            scheduled_for: scheduledFor.toISOString(),
            status: 'scheduled',
            message_snapshot: automation.follow_up_message,
          }, { onConflict: 'automation_id,recipient_id,qualified_event_id' });

          const scheduledPayload: AutoDmJobPayload = {
            automationId: automation.id as string,
            instagramAccountId,
            igAccountIgsid,
            triggerType: 'dm_reply_followup',
            triggerUserId: messaging.sender.id,
            triggerUsername: null,
            triggerEventId: `scheduled_${message.mid}`,
            triggerTimestamp,
            postId: null,
            commentText: null,
            messageText: null,
            isFollowUp: true,
            sessionStep: 99,
            isScheduledFollowUp: true,
            followUpText: automation.follow_up_message,
          };

          await enqueueJob(
            'follow_up',
            scheduledPayload,
            `scheduled_followup_${automation.id}_${messaging.sender.id}_${message.mid}`,
            scheduledFor
          );
        }
      }
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
