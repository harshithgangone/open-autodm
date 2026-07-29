/**
 * GET /api/instagram/accounts — connected accounts with token + pause status.
 * The token itself is never returned.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { computeTokenStatus } from '@/lib/api/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:accounts');

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const db = createServiceClient();
  const { data, error } = await db
    .from('instagram_accounts')
    .select('id, instagram_user_id, username, name, profile_picture_url, is_active, token_expires_at, paused_until, pause_reason, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to fetch Instagram accounts');
    return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  const accounts = (data ?? []).map((account) => {
    const { status, daysRemaining } = computeTokenStatus(account.token_expires_at as string | null);
    const pausedUntil = account.paused_until as string | null;
    const isPaused = !!pausedUntil && new Date(pausedUntil).getTime() > Date.now();
    return {
      ...account,
      token_status: status,
      token_days_remaining: daysRemaining,
      is_paused: isPaused,
      paused_until: isPaused ? pausedUntil : null,
      pause_reason: isPaused ? (account.pause_reason as string | null) : null,
    };
  });

  return Response.json({ accounts });
}
