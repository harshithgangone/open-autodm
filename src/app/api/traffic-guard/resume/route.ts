import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { resumeAccountAutomations } from '@/lib/trafficGuard/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ResumeSchema = z.object({
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

  const parsed = ResumeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { accountId, incidentId } = parsed.data;
  const db = createServiceClient();

  const { data: account, error: accountError } = await db
    .from('instagram_accounts')
    .select('id, user_id, traffic_guard_paused, traffic_guard_incident_id')
    .eq('id', accountId)
    .single();

  if (accountError || !account) {
    return Response.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  if (account.user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Do not let an old dashboard tab resume jobs for a newer incident, or
  // replay a resume after the current incident has already been released.
  if (
    account.traffic_guard_paused !== true ||
    account.traffic_guard_incident_id !== incidentId
  ) {
    return Response.json(
      { error: 'This incident is no longer the active paused incident' },
      { status: 409 }
    );
  }

  const { data: incident, error: incidentError } = await db
    .from('comment_traffic_incidents')
    .select('id, paused_at, resumed_at')
    .eq('id', incidentId)
    .eq('instagram_account_id', accountId)
    .single();

  if (
    incidentError ||
    !incident ||
    !incident.paused_at ||
    incident.resumed_at
  ) {
    return Response.json(
      { error: 'This incident is not awaiting resumption' },
      { status: 409 }
    );
  }

  try {
    const result = await resumeAccountAutomations(accountId, incidentId);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resume account automations';
    const isConflict = /incident|paused/i.test(message);
    return Response.json({ error: message }, { status: isConflict ? 409 : 500 });
  }
}
