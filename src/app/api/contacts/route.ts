/**
 * GET /api/contacts — the automation-captured audience list.
 * Contacts are scoped to the authenticated user's connected accounts.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:contacts');

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const db = createServiceClient();

  // Resolve the user's accounts first, then fetch their contacts.
  const { data: accounts, error: accountsError } = await db
    .from('instagram_accounts')
    .select('id, username')
    .eq('user_id', user.id);

  if (accountsError) {
    logger.error({ err: accountsError, userId: user.id }, 'Failed to fetch accounts for contacts');
    return Response.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }

  const accountIds = (accounts ?? []).map((a) => a.id as string);
  if (accountIds.length === 0) {
    return Response.json({ contacts: [] });
  }

  const { data, error } = await db
    .from('contacts')
    .select(`
      id, instagram_account_id, audience_ig_user_id, username, follows_business,
      first_interaction_at, last_interaction_at, last_trigger_type, total_triggers,
      automations ( id, name )
    `)
    .in('instagram_account_id', accountIds)
    .order('last_interaction_at', { ascending: false })
    .limit(500);

  if (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to fetch contacts');
    return Response.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }

  return Response.json({ contacts: data ?? [] });
}
