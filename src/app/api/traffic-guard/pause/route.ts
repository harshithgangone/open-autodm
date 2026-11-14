import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { pauseAccountAutomations } from '@/lib/trafficGuard/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PauseSchema = z.object({
  accountId: z.string().uuid(),
  incidentId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PauseSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { accountId, incidentId } = parsed.data;

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

  // Validate the incident/account pair before invoking the privileged pause RPC.
  // The SQL function repeats this check so direct backend calls also fail closed.
  const { data: incident, error: incidentError } = await db
    .from('comment_traffic_incidents')
    .select('id')
    .eq('id', incidentId)
    .eq('instagram_account_id', accountId)
    .single();

  if (incidentError || !incident) {
    return Response.json({ error: 'Traffic Guard incident not found for this account' }, { status: 404 });
  }

  try {
    const result = await pauseAccountAutomations(accountId, incidentId);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to pause account automations' },
      { status: 500 }
    );
  }
}
