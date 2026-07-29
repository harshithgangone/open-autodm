/**
 * GET /api/instagram/callback — Instagram redirects here after consent.
 *
 * Flow (identity comes exclusively from the signed state JWT — CSRF-safe):
 *   verify state → code → short-lived token → long-lived token (60d)
 *   → fetch profile → AES-256-GCM encrypt token → upsert instagram_accounts
 *   → subscribe account to webhook fields → redirect to /settings
 */

import { getMetaSettings } from '@/lib/settings';
import { createServiceClient } from '@/lib/supabase/service';
import {
  verifyOAuthState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getInstagramProfile,
} from '@/lib/instagram/oauth';
import { subscribeToWebhookFields } from '@/lib/instagram/api';
import { encrypt } from '@/lib/crypto';
import { getAppUrl, getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const logger = createLogger('oauth-callback');

export async function GET(request: Request): Promise<Response> {
  const appUrl = getAppUrl(request);
  const settingsRedirect = (params: string): Response =>
    Response.redirect(`${appUrl}/settings?${params}`, 302);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const igError = url.searchParams.get('error');

  if (igError) {
    logger.warn({ igError }, 'User denied Instagram authorization');
    return settingsRedirect('instagram_error=access_denied');
  }
  if (!code || !stateToken) {
    return settingsRedirect('instagram_error=invalid_callback');
  }

  let userId: string;
  try {
    ({ userId } = await verifyOAuthState(stateToken));
  } catch {
    logger.warn({}, 'OAuth state JWT verification failed');
    return settingsRedirect('instagram_error=state_mismatch');
  }

  const settings = await getMetaSettings();
  if (!settings) {
    return settingsRedirect('instagram_error=setup_required');
  }

  try {
    const redirectUri = `${appUrl}/api/instagram/callback`;

    debugLog('oauth', 'info', 'oauth_exchange', 'processing', 'Exchanging authorization code for tokens', { userId });
    const shortLived = await exchangeCodeForToken(code, settings.metaAppId, settings.metaAppSecret, redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token, settings.metaAppId, settings.metaAppSecret);
    const profile = await getInstagramProfile(longLived.access_token);

    const env = getEnv();
    const db = createServiceClient();
    const encryptedToken = encrypt(longLived.access_token, env.TOKEN_ENCRYPTION_KEY);
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000);

    // Guarantee the FK target exists. Users created in the Supabase dashboard
    // BEFORE the migrations were applied have no profiles row (the auto-create
    // trigger didn't exist yet) — backfill it here so the account insert can
    // never hit a foreign-key violation.
    await db.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

    const { error } = await db.from('instagram_accounts').upsert(
      {
        user_id: userId,
        instagram_user_id: profile.user_id,
        username: profile.username,
        name: profile.name ?? null,
        profile_picture_url: profile.profile_picture_url ?? null,
        access_token_encrypted: encryptedToken,
        token_expires_at: expiresAt.toISOString(),
        is_active: true,
        paused_until: null,
        pause_reason: null,
      },
      { onConflict: 'instagram_user_id', ignoreDuplicates: false }
    );

    if (error) {
      if (error.code === '23505') {
        return settingsRedirect('instagram_error=account_already_connected');
      }
      throw error;
    }

    // Per-account webhook subscription — without this NO events are delivered.
    await subscribeToWebhookFields(profile.user_id, longLived.access_token);

    debugLog('oauth', 'info', 'oauth_complete', 'ok', `Instagram @${profile.username} connected`, { userId });
    logger.info({ userId, username: profile.username }, 'Instagram account connected');
    return settingsRedirect('instagram_connected=true');
  } catch (err) {
    const message = describeError(err);
    logger.error({ err, userId }, 'Instagram OAuth callback failed');
    debugLog('oauth', 'error', 'oauth_failed', 'error', `OAuth exchange failed: ${message.slice(0, 300)}`, { userId });
    return settingsRedirect(`instagram_error=server_error&debug=${encodeURIComponent(message.slice(0, 200))}`);
  }
}

/**
 * Human-readable message from anything thrown — including Supabase/Postgrest
 * error objects, which are not Error instances and stringify to
 * "[object Object]" otherwise.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.code ? `(code ${e.code})` : null].filter(Boolean);
    if (parts.length) return parts.join(' — ');
    try {
      return JSON.stringify(err).slice(0, 300);
    } catch {
      /* fall through */
    }
  }
  return String(err);
}
