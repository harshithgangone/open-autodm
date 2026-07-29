/**
 * Meta Graph API client for Instagram messaging.
 *
 * Battle-tested against the live Instagram API. Key facts this
 * module encodes (learned the hard way — do not "simplify" them away):
 *
 *  - Instagram Business Login tokens call graph.instagram.com, NOT graph.facebook.com.
 *  - Button templates (postback buttons) work on graph.instagram.com with
 *    Instagram Login user access tokens — used for the 2-step quick-reply flow.
 *  - Postback payloads carry "SESSION_{uuid}_STEP_{n}" — routing is ALWAYS by
 *    payload, never by visible button text.
 *  - Access tokens are decrypted at call time and never logged.
 */

import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import { classifyMetaError } from '@/lib/instagram/errors';

const logger = createLogger('instagram');

export const META_API_VERSION = 'v23.0';
const META_GRAPH_BASE = `https://graph.instagram.com/${META_API_VERSION}`;

interface MetaSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

interface MetaErrorResponse {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface QuickReply {
  /** Visible button label — Meta limit: 20 characters */
  title: string;
  /** Hidden payload: "SESSION_{uuid}_STEP_{n}". The routing key. */
  payload: string;
}

/**
 * Who receives the message.
 *
 *  - { id }        → general messaging (requires the 24h engagement window)
 *  - { commentId } → a PRIVATE REPLY to a comment. This is Meta's purpose-built
 *    comment-to-DM channel: its own allowance (750 private replies/hour,
 *    separate from the ~200/h messaging cap) and it is valid for 7 days after
 *    the comment. Always prefer this for comment-triggered opening DMs.
 */
export type DmRecipient = { id: string } | { commentId: string };

function recipientJson(recipient: DmRecipient): Record<string, string> {
  return 'commentId' in recipient ? { comment_id: recipient.commentId } : { id: recipient.id };
}

function recipientLabel(recipient: DmRecipient): string {
  return 'commentId' in recipient ? `comment ${recipient.commentId} (private reply)` : recipient.id;
}

function throwFromMetaResponse(context: string, status: number, body: MetaErrorResponse): never {
  const code = body.error?.code;
  const subcode = body.error?.error_subcode;
  const message = body.error?.message ?? `Unknown Meta API error (${context}, HTTP ${status})`;
  throw classifyMetaError(message, code, subcode);
}

/** Sends a text DM (optionally with a postback button via button template). */
export async function sendInstagramDm(
  igAccountIgsid: string,
  recipient: DmRecipient,
  messageText: string,
  accessToken: string,
  quickReply?: QuickReply
): Promise<string> {
  let messageBody: Record<string, unknown>;
  if (quickReply?.title.trim()) {
    messageBody = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: messageText.slice(0, 640), // button template text limit
          buttons: [
            {
              type: 'postback',
              title: quickReply.title.trim().slice(0, 20),
              payload: quickReply.payload,
            },
          ],
        },
      },
    };
  } else {
    messageBody = { text: messageText };
  }

  const to = recipientLabel(recipient);
  debugLog('instagram', 'info', 'dm_send_attempt', 'processing', `Sending DM to ${to}`, {
    igAccountIgsid,
    recipient: to,
    hasQuickReply: !!quickReply,
    messagePreview: messageText.slice(0, 80),
  });

  const res = await fetch(`${META_GRAPH_BASE}/${igAccountIgsid}/messages?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: recipientJson(recipient), message: messageBody }),
  });

  const data = (await res.json()) as MetaSendMessageResponse & MetaErrorResponse;

  if (!res.ok) {
    logger.error(
      { igAccountIgsid, recipient: to, status: res.status, metaCode: data.error?.code, metaMessage: data.error?.message },
      'DM send failed'
    );
    debugLog('instagram', 'error', 'dm_send_failed', 'error',
      `DM to ${to} FAILED — Meta error ${data.error?.code}: ${data.error?.message ?? 'unknown'}`,
      { igAccountIgsid, recipient: to, httpStatus: res.status, metaErrorCode: data.error?.code, fbtrace_id: data.error?.fbtrace_id });
    throwFromMetaResponse('sendInstagramDm', res.status, data);
  }

  debugLog('instagram', 'info', 'dm_sent', 'ok', `DM sent to ${to} — messageId=${data.message_id}`, {
    igAccountIgsid,
    recipient: to,
    messageId: data.message_id,
  });
  return data.message_id;
}

/**
 * Sends a DM as a button template with a single tappable web_url LINK button —
 * far cleaner than pasting a raw URL into the text.
 *
 * IMPORTANT (learned from production tools): Meta occasionally rejects button
 * templates for certain recipients/URL combinations. Callers should catch
 * MetaApiError and fall back to sendInstagramDm with the link inline.
 */
export async function sendInstagramLinkButtonDm(
  igAccountIgsid: string,
  recipient: DmRecipient,
  messageText: string,
  buttonTitle: string,
  url: string,
  accessToken: string
): Promise<string> {
  const to = recipientLabel(recipient);
  const body = {
    recipient: recipientJson(recipient),
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: messageText.slice(0, 640),
          buttons: [{ type: 'web_url', url, title: buttonTitle.trim().slice(0, 20) || 'Open link' }],
        },
      },
    },
  };

  debugLog('instagram', 'info', 'link_button_dm_attempt', 'processing', `Sending link-button DM to ${to}`, {
    igAccountIgsid,
    recipient: to,
    buttonTitle,
  });

  const res = await fetch(`${META_GRAPH_BASE}/${igAccountIgsid}/messages?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as MetaSendMessageResponse & MetaErrorResponse;
  if (!res.ok) {
    debugLog('instagram', 'warn', 'link_button_dm_failed', 'error',
      `Link-button DM to ${to} rejected — ${data.error?.code}: ${data.error?.message ?? 'unknown'} (caller falls back to inline link)`,
      { igAccountIgsid, recipient: to, httpStatus: res.status, metaErrorCode: data.error?.code });
    throwFromMetaResponse('sendInstagramLinkButtonDm', res.status, data);
  }

  debugLog('instagram', 'info', 'link_button_dm_sent', 'ok', `Link-button DM sent to ${to} — messageId=${data.message_id}`, {
    igAccountIgsid,
    recipient: to,
    messageId: data.message_id,
  });
  return data.message_id;
}

/** Posts a public reply to a comment. Non-fatal — DM still sends on failure. */
export async function replyToComment(commentId: string, replyText: string, accessToken: string): Promise<void> {
  debugLog('instagram', 'info', 'comment_reply_attempt', 'processing', `Replying to comment ${commentId}`, {
    commentId,
    replyPreview: replyText.slice(0, 80),
  });

  const res = await fetch(`${META_GRAPH_BASE}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: replyText, access_token: accessToken }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as MetaErrorResponse;
    logger.warn({ commentId, status: res.status, metaCode: body.error?.code }, 'Comment reply failed — continuing');
    debugLog('instagram', 'warn', 'comment_reply_failed', 'error',
      `Comment reply to ${commentId} failed — ${body.error?.code}: ${body.error?.message ?? 'unknown'} (DM will still send)`,
      { commentId, httpStatus: res.status });
  } else {
    debugLog('instagram', 'info', 'comment_reply_sent', 'ok', `Public reply posted to comment ${commentId}`, { commentId });
  }
}

/** Sends the ask-to-follow generic template (Visit Profile + confirm postback). */
export async function sendAskToFollowDm(
  igAccountIgsid: string,
  recipientIgsid: string,
  accessToken: string,
  options: {
    message: string;
    creatorUsername: string;
    visitProfileButtonTitle: string;
    confirmButtonTitle: string;
    confirmPayload: string;
  }
): Promise<string> {
  // Generic template title limit: 80 chars
  const title = options.message.length <= 80 ? options.message : options.message.slice(0, 77) + '…';

  const body = {
    recipient: { id: recipientIgsid },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [
            {
              title,
              buttons: [
                {
                  type: 'web_url',
                  url: `https://www.instagram.com/${options.creatorUsername}/`,
                  title: options.visitProfileButtonTitle.slice(0, 20),
                },
                {
                  type: 'postback',
                  payload: options.confirmPayload,
                  title: options.confirmButtonTitle.slice(0, 20),
                },
              ],
            },
          ],
        },
      },
    },
  };

  const res = await fetch(`${META_GRAPH_BASE}/${igAccountIgsid}/messages?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as MetaSendMessageResponse & MetaErrorResponse;
  if (!res.ok) {
    debugLog('instagram', 'error', 'ask_follow_dm_failed', 'error',
      `Ask-to-follow DM to ${recipientIgsid} FAILED — ${data.error?.code}: ${data.error?.message ?? 'unknown'}`,
      { igAccountIgsid, recipientIgsid, httpStatus: res.status });
    throwFromMetaResponse('sendAskToFollowDm', res.status, data);
  }
  debugLog('instagram', 'info', 'ask_follow_dm_sent', 'ok', `Ask-to-follow DM sent to ${recipientIgsid}`, {
    igAccountIgsid,
    recipientIgsid,
    messageId: data.message_id,
  });
  return data.message_id;
}

/** Sends a card (generic template) DM with image/title/subtitle/URL buttons. */
export async function sendInstagramCardDm(
  igAccountIgsid: string,
  recipientIgsid: string,
  accessToken: string,
  card: { imageUrl?: string; title?: string; subtitle?: string; buttons?: { title: string; url: string }[] }
): Promise<string> {
  const element: Record<string, unknown> = {
    title: (card.title ?? '').slice(0, 80) || ' ',
  };
  if (card.subtitle) element['subtitle'] = card.subtitle.slice(0, 80);
  if (card.imageUrl) element['image_url'] = card.imageUrl;
  if (card.buttons?.length) {
    element['buttons'] = card.buttons.slice(0, 3).map((btn) => ({
      type: 'web_url',
      url: btn.url,
      title: btn.title.slice(0, 20),
    }));
  }

  const res = await fetch(`${META_GRAPH_BASE}/${igAccountIgsid}/messages?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [element] } } },
    }),
  });

  const data = (await res.json()) as MetaSendMessageResponse & MetaErrorResponse;
  if (!res.ok) {
    debugLog('instagram', 'error', 'card_dm_failed', 'error',
      `Card DM to ${recipientIgsid} FAILED — ${data.error?.code}: ${data.error?.message ?? 'unknown'}`,
      { igAccountIgsid, recipientIgsid, httpStatus: res.status });
    throwFromMetaResponse('sendInstagramCardDm', res.status, data);
  }
  debugLog('instagram', 'info', 'card_dm_sent', 'ok', `Card DM sent to ${recipientIgsid}`, {
    igAccountIgsid,
    recipientIgsid,
    messageId: data.message_id,
  });
  return data.message_id;
}

/**
 * Real follow check via Instagram's User Profile API.
 *
 * For any user who has messaged the business (which is always our case — they
 * just tapped a button, i.e. sent a postback), Meta exposes
 * `is_user_follow_business` on GET /{IGSID}. This is the same signal
 * commercial tools use for "require follow" gates.
 *
 * Returns:  true = follows · false = does not follow · null = unknown
 * (API error / field unavailable). Callers must FAIL OPEN on null — never
 * block a legitimate person because the check itself hiccuped.
 */
export async function checkUserFollowsBusiness(
  audienceIgsid: string,
  accessToken: string
): Promise<boolean | null> {
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${audienceIgsid}?fields=is_user_follow_business&access_token=${accessToken}`
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as MetaErrorResponse;
      debugLog('instagram', 'warn', 'follow_check_failed', 'error',
        `Follow check for ${audienceIgsid} failed — ${body.error?.code}: ${body.error?.message ?? `HTTP ${res.status}`} (treating as unknown)`,
        { audienceIgsid, httpStatus: res.status });
      return null;
    }
    const data = (await res.json()) as { is_user_follow_business?: boolean };
    if (typeof data.is_user_follow_business !== 'boolean') return null;
    debugLog('instagram', 'info', 'follow_check', 'ok',
      `Follow check: ${audienceIgsid} ${data.is_user_follow_business ? 'FOLLOWS' : 'does NOT follow'} the account`,
      { audienceIgsid, follows: data.is_user_follow_business });
    return data.is_user_follow_business;
  } catch (err) {
    logger.warn({ audienceIgsid, err }, 'Follow check network error — unknown');
    return null;
  }
}

/**
 * Subscribes an IG account to webhook fields. Meta requires this per-account
 * call in addition to the app-level webhook URL — without it, NO events fire.
 */
export const WEBHOOK_SUBSCRIBED_FIELDS = 'comments,messages,messaging_postbacks,message_reactions,message_edit';

export async function subscribeToWebhookFields(igUserId: string, accessToken: string): Promise<{ ok: boolean; body: string }> {
  const params = new URLSearchParams({ subscribed_fields: WEBHOOK_SUBSCRIBED_FIELDS, access_token: accessToken });
  const res = await fetch(`https://graph.instagram.com/${META_API_VERSION}/${igUserId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const body = await res.text();
  if (!res.ok) {
    logger.warn({ igUserId, status: res.status, body }, 'Webhook field subscription failed');
  } else {
    debugLog('oauth', 'info', 'webhook_subscribe', 'ok', `Webhook fields subscribed for ${igUserId}`, {
      fields: WEBHOOK_SUBSCRIBED_FIELDS,
    });
  }
  return { ok: res.ok, body };
}

export async function getSubscribedFields(igUserId: string, accessToken: string): Promise<{ ok: boolean; fields: string[]; raw: string }> {
  const res = await fetch(`https://graph.instagram.com/${META_API_VERSION}/${igUserId}/subscribed_apps?access_token=${accessToken}`);
  const raw = await res.text();
  if (!res.ok) return { ok: false, fields: [], raw };
  type SubscribedAppsResponse = { data?: Array<{ subscribed_fields?: string[] }>; subscribed_fields?: string[] };
  let parsed: SubscribedAppsResponse = {};
  try {
    parsed = JSON.parse(raw) as SubscribedAppsResponse;
  } catch {
    /* ignore */
  }
  const fields = parsed.data?.[0]?.subscribed_fields ?? parsed.subscribed_fields ?? [];
  return { ok: true, fields, raw };
}
