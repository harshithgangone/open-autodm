/**
 * DELETE /api/instagram/disconnect/:accountId — remove a connected account.
 * Cascades to automations, jobs, logs, and sessions via FK ON DELETE CASCADE.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:disconnect');

type RouteContext = { params: Promise<{ accountId: string }> };

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const { accountId } = await context.params;
  const db = createServiceClient();

  const { data: account, error: fetchError } = await db
    .from('instagram_accounts')
    .select('id, user_id, username')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !account) {
    return Response.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  const { error: deleteError } = await db
    .from('instagram_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id);

  if (deleteError) {
    logger.error({ err: deleteError, accountId }, 'Failed to disconnect account');
    return Response.json({ error: 'Failed to disconnect account' }, { status: 500 });
  }

  logger.info({ userId: user.id, username: account.username }, 'Instagram account disconnected');
  return Response.json({ success: true });
}
