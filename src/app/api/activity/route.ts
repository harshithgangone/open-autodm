/**
 * GET /api/activity?accountId=<id>&limit=25
 *
 * Authenticated endpoint returning real recent automation activity:
 *  - DM jobs: sent, failed, skipped, processing
 *  - Follow-up check-in states: scheduled, waiting_response, sent, held, expired
 *
 * Scoped strictly to the authenticated owner's connected Instagram accounts.
 * Message content is sanitized to prevent private conversation exposure.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:activity');

export interface ActivityItem {
  id: string;
  type: 'dm' | 'comment_private_reply' | 'story_reply' | 'follow_up';
  status: 'sent' | 'processing' | 'failed' | 'skipped' | 'scheduled' | 'held' | 'waiting_response' | 'expired';
  automationId: string;
  automationName: string;
  automationType: string;
  timestamp: string;
  errorMessage: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const requestedAccountId = url.searchParams.get('accountId');
  const limitParam = parseInt(url.searchParams.get('limit') || '25', 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 25 : limitParam), 50);

  const db = createServiceClient();

  // Validate owner accounts
  const { data: accounts, error: accErr } = await db
    .from('instagram_accounts')
    .select('id')
    .eq('user_id', user.id);

  if (accErr) {
    logger.error({ err: accErr }, 'Failed to fetch accounts for activity');
    return Response.json({ error: 'Failed to load activity' }, { status: 500 });
  }

  const ownedAccountIds = (accounts ?? []).map((a) => a.id as string);
  if (ownedAccountIds.length === 0) {
    return Response.json({ activities: [] });
  }

  let targetAccountIds = ownedAccountIds;
  if (requestedAccountId) {
    if (!ownedAccountIds.includes(requestedAccountId)) {
      return Response.json({ error: 'Instagram account not found' }, { status: 404 });
    }
    targetAccountIds = [requestedAccountId];
  }

  // 1. Fetch recent DM jobs
  const { data: jobs, error: jobsErr } = await db
    .from('dm_jobs')
    .select(`
      id,
      trigger_type,
      status,
      error_message,
      sent_at,
      created_at,
      automation_id,
      automations ( id, name, type )
    `)
    .in('instagram_account_id', targetAccountIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (jobsErr) {
    logger.error({ err: jobsErr }, 'Failed to fetch dm_jobs for activity');
  }

  // 2. Fetch recent follow-up records
  const { data: followUps, error: fuErr } = await db
    .from('automation_follow_ups')
    .select(`
      id,
      status,
      error_reason,
      scheduled_for,
      sent_at,
      created_at,
      automation_id,
      automations ( id, name, type )
    `)
    .in('instagram_account_id', targetAccountIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (fuErr && fuErr.code !== '42P01') {
    logger.warn({ err: fuErr }, 'Failed to fetch follow_ups for activity');
  }

  const activities: ActivityItem[] = [];

  for (const j of jobs ?? []) {
    const auto = Array.isArray(j.automations) ? j.automations[0] : j.automations;
    let mappedType: ActivityItem['type'] = 'dm';
    if (j.trigger_type === 'comment') mappedType = 'comment_private_reply';
    else if (j.trigger_type === 'story_reply') mappedType = 'story_reply';
    else if (j.trigger_type === 'dm_reply_followup') mappedType = 'follow_up';

    activities.push({
      id: `job_${j.id}`,
      type: mappedType,
      status: (j.status as ActivityItem['status']) || 'processing',
      automationId: j.automation_id,
      automationName: (auto as { name?: string })?.name ?? 'Automation',
      automationType: (auto as { type?: string })?.type ?? j.trigger_type,
      timestamp: j.sent_at || j.created_at,
      errorMessage: j.error_message ?? null,
    });
  }

  for (const fu of followUps ?? []) {
    const auto = Array.isArray(fu.automations) ? fu.automations[0] : fu.automations;
    activities.push({
      id: `fu_${fu.id}`,
      type: 'follow_up',
      status: (fu.status as ActivityItem['status']) || 'scheduled',
      automationId: fu.automation_id,
      automationName: (auto as { name?: string })?.name ?? 'Follow-up Check-in',
      automationType: (auto as { type?: string })?.type ?? 'follow_up',
      timestamp: fu.sent_at || fu.scheduled_for || fu.created_at,
      errorMessage: fu.error_reason ?? null,
    });
  }

  // Sort unified activities chronologically (newest first) and take top `limit`
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return Response.json({ activities: activities.slice(0, limit) });
}
