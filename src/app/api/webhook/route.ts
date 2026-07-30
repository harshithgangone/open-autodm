/**
 * Meta webhook endpoint.
 *
 * GET  → subscription verification challenge (Meta portal setup)
 * POST → live events (comments, DMs, postbacks)
 *
 * Non-negotiable contract with Meta:
 *  1. HMAC-SHA256 signature verified over the RAW body BEFORE any processing.
 *     Invalid → 403 immediately. No DB queries before this check.
 *  2. 200 returned within 5 seconds. All real work happens in `after()` -
 *     the response is sent first, processing continues in the background of
 *     the same invocation (supported on Vercel and Cloudflare via OpenNext).
 */

import { after } from 'next/server';
import { getMetaSettings } from '@/lib/settings';
import { hmacSha256Hex, safeCompare } from '@/lib/crypto';
import { processWebhookPayload } from '@/lib/automation/processWebhook';
import { processDueJobs } from '@/lib/automation/engine';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import type { MetaWebhookBody } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const logger = createLogger('webhook-route');

// ── GET /api/webhook - Meta verification challenge ──────────────────────────
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = url.searchParams.get('hub.verify_token');

  const settings = await getMetaSettings();

  if (mode === 'subscribe' && settings && verifyToken === settings.webhookVerifyToken) {
    debugLog('webhook', 'info', 'webhook_verify', 'ok', 'Meta webhook verification successful', {});
    return new Response(challenge ?? '', { status: 200 });
  }

  debugLog('webhook', 'warn', 'webhook_verify', 'error', 'Webhook verification failed - token mismatch or setup incomplete', {
    mode,
    configured: !!settings,
  });
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

// ── POST /api/webhook - live events ─────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('x-hub-signature-256');
  const rawBody = await request.text();

  debugLog('webhook', 'info', 'webhook_received', 'processing', 'POST /api/webhook received from Meta', {
    hasSignature: !!signature,
    bytes: rawBody.length,
  });

  if (!signature) {
    debugLog('webhook', 'error', 'signature_check', 'error', 'Missing x-hub-signature-256 header', {});
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = await getMetaSettings();
  if (!settings) {
    // Setup wizard not completed - we cannot verify anything. Reject.
    debugLog('webhook', 'error', 'signature_check', 'error', 'Meta credentials not configured - complete the Setup Wizard first', {});
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Meta signs with the Instagram app secret for IG-Login apps and the
  // Facebook app secret for FB-Login apps. Accept a match against either
  // configured secret - avoids a config guess that silently kills webhooks.
  const signingSecrets = [settings.metaAppSecret, settings.metaFbAppSecret].filter(
    (s): s is string => Boolean(s)
  );
  const bodyBuffer = Buffer.from(rawBody, 'utf8');
  const signatureValid = signingSecrets.some((secret) =>
    safeCompare(signature, `sha256=${hmacSha256Hex(secret, bodyBuffer)}`)
  );
  if (!signatureValid) {
    logger.warn({}, 'Webhook signature verification FAILED - rejecting');
    debugLog('webhook', 'error', 'signature_check', 'error',
      'HMAC-SHA256 signature mismatch - request rejected', {
        hint: 'If this keeps happening on real events, add your Facebook App Secret in the Setup Wizard - some Meta apps sign webhooks with it instead of the Instagram app secret.',
      });
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  debugLog('webhook', 'info', 'signature_check', 'ok', 'HMAC-SHA256 signature verified', {});

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody) as MetaWebhookBody;
  } catch {
    // Signed but unparseable - acknowledge so Meta doesn't retry forever.
    return Response.json({ status: 'ignored' }, { status: 200 });
  }

  // All heavy lifting AFTER the 200 is on the wire.
  after(async () => {
    try {
      const enqueued = await processWebhookPayload(body);
      // Fast path: drain what we just enqueued (plus any other due jobs).
      if (enqueued > 0) {
        await processDueJobs(Math.max(enqueued, 5));
      }
    } catch (err) {
      logger.error({ err }, 'Webhook background processing failed (200 already sent)');
      debugLog('webhook', 'error', 'payload_processing', 'error',
        `Unhandled error during background processing: ${err instanceof Error ? err.message : String(err)}`, {});
    }
  });

  return Response.json({ status: 'ok' }, { status: 200 });
}
