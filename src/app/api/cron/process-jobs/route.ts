/**
 * Background maintenance endpoint. Secured by CRON_SECRET.
 *
 * Called by:
 *  - Supabase pg_cron every minute (primary — the Setup Wizard generates the
 *    exact SQL snippet), and/or
 *  - Vercel daily cron (vercel.json) as a safety net.
 *
 * Does three things:
 *  1. Drains due queue jobs (rate-limit overflow, retries, stuck jobs).
 *  2. Silently refreshes Instagram tokens expiring within 10 days.
 *  3. Housekeeping: prunes old debug events / rate events / finished jobs.
 */

import { processDueJobs } from '@/lib/automation/engine';
import { createServiceClient } from '@/lib/supabase/service';
import { refreshLongLivedToken } from '@/lib/instagram/oauth';
import { decrypt, encrypt, safeCompare } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import type { InstagramAccountRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const logger = createLogger('cron');

function isAuthorized(request: Request): boolean {
  const env = getEnv();
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : new URL(request.url).searchParams.get('secret') ?? '';
  return provided.length > 0 && safeCompare(provided, env.CRON_SECRET);
}

async function refreshExpiringTokens(): Promise<number> {
  const env = getEnv();
  const db = createServiceClient();
  const threshold = new Date(Date.now() + 10 * 24 * 3600_000).toISOString();

  const { data: accounts } = await db
    .from('instagram_accounts')
    .select('*')
    .eq('is_active', true)
    .not('token_expires_at', 'is', null)
    .lt('token_expires_at', threshold);

  let refreshed = 0;
  for (const account of (accounts ?? []) as InstagramAccountRow[]) {
    // Skip already-expired tokens — Meta cannot refresh those; user must reconnect.
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) continue;

    try {
      const current = decrypt(account.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
      const result = await refreshLongLivedToken(current);
      if ('error' in result) {
        debugLog('cron', 'warn', 'token_refresh', 'error',
          `Token refresh failed for @${account.username ?? account.id} (${result.error}, HTTP ${result.status})`,
          { accountId: account.id });
        continue;
      }
      await db
        .from('instagram_accounts')
        .update({
          access_token_encrypted: encrypt(result.access_token, env.TOKEN_ENCRYPTION_KEY),
          token_expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
        })
        .eq('id', account.id);
      refreshed += 1;
      debugLog('cron', 'info', 'token_refresh', 'ok', `Token auto-refreshed for @${account.username ?? account.id}`, {
        accountId: account.id,
        daysRemaining: Math.floor(result.expires_in / 86400),
      });
    } catch (err) {
      logger.warn({ err, accountId: account.id }, 'Token refresh attempt errored');
    }
  }
  return refreshed;
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const drain = await processDueJobs(25);
  const tokensRefreshed = await refreshExpiringTokens();

  const db = createServiceClient();
  const { error: cleanupError } = await db.rpc('cleanup_old_rows');
  if (cleanupError) logger.warn({ err: cleanupError }, 'cleanup_old_rows failed');

  return Response.json({
    ok: true,
    jobs: drain,
    tokensRefreshed,
    at: new Date().toISOString(),
  });
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
