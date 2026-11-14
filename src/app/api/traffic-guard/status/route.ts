import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getAccountTrafficGuardStatus } from '@/lib/trafficGuard/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId');

  if (!accountId) {
    return Response.json({ error: 'accountId query param is required' }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: account, error } = await db
    .from('instagram_accounts')
    .select('id, user_id')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    return Response.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  if (account.user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = await getAccountTrafficGuardStatus(accountId);
  if (!status) {
    return Response.json({ error: 'Failed to retrieve traffic guard status' }, { status: 500 });
  }

  return Response.json(status);
}
