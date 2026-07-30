/**
 * POST /api/instagram/resubscribe/:accountId - re-run the per-account webhook
 * field subscription ("Fix Webhooks" button). Use when comments stop arriving.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { subscribeToWebhookFields, WEBHOOK_SUBSCRIBED_FIELDS } from '@/lib/instagram/api';
import { decrypt } from '@/lib/crypto';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ accountId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const { accountId } = await context.params;
  const db = createServiceClient();

  const { data: account, error: fetchError } = await db
    .from('instagram_accounts')
    .select('id, user_id, username, instagram_user_id, access_token_encrypted')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (fetchError || !account) {
    return Response.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(account.access_token_encrypted as string, getEnv().TOKEN_ENCRYPTION_KEY);
  } catch {
    return Response.json({ error: 'Failed to decrypt token' }, { status: 500 });
  }

  const result = await subscribeToWebhookFields(account.instagram_user_id as string, accessToken);
  if (!result.ok) {
    return Response.json(
      { error: 'resubscription_failed', message: `Meta API error: ${result.body.slice(0, 300)}` },
      { status: 502 }
    );
  }

  return Response.json({ success: true, subscribedFields: WEBHOOK_SUBSCRIBED_FIELDS, meta: result.body });
}
