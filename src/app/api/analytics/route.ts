/**
 * GET /api/analytics?from=ISO&to=ISO&automationId=<uuid|all>
 *
 * Aggregates the engine's own event trail into dashboard metrics:
 *  - dm_jobs            → triggers by type, deliveries, failures (time series)
 *  - automation_sessions → button-flow starts/completions + follows gained
 *                          (a session that reached the ask-to-follow card AND
 *                          completed means the follow re-check passed)
 *  - contacts           → new contacts captured + their follow status
 *
 * All scoping is by the authenticated user's Instagram accounts; the optional
 * automation filter narrows every source. Aggregation happens here in JS -
 * at self-hosted scale the row counts are small (guarded by hard limits).
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:analytics');

const ROW_LIMIT = 20000;
const MAX_DAYS = 400;

interface JobRow {
  trigger_type: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  automation_id: string;
}

interface SessionRow {
  automation_id: string;
  current_step: number;
  completed: boolean;
  started_at: string;
}

interface ContactRow {
  first_interaction_at: string;
  follows_business: boolean | null;
  last_automation_id: string | null;
}

interface AutomationMeta {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  instagram_account_id: string;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const toParam = url.searchParams.get('to');
  const fromParam = url.searchParams.get('from');
  const automationId = url.searchParams.get('automationId') ?? 'all';
  const requestedAccountId = url.searchParams.get('accountId');

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 86400_000);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return Response.json({ error: 'Invalid date range' }, { status: 400 });
  }
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const db = createServiceClient();

  const { data: accounts, error: accErr } = await db
    .from('instagram_accounts')
    .select('id')
    .eq('user_id', user.id);
  if (accErr) {
    logger.error({ err: accErr }, 'Failed to fetch accounts');
    return Response.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
  const ownedIds = (accounts ?? []).map((a) => a.id as string);

  // Optional per-account scoping. SECURITY: the id must be user-owned.
  let accountIds = ownedIds;
  if (requestedAccountId) {
    if (!ownedIds.includes(requestedAccountId)) {
      return Response.json({ error: 'Instagram account not found' }, { status: 404 });
    }
    accountIds = [requestedAccountId];
  }

  const { data: automations } = await db
    .from('automations')
    .select('id, name, type, is_active, instagram_account_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  const automationMeta = ((automations ?? []) as AutomationMeta[]).filter(
    (a) => !requestedAccountId || a.instagram_account_id === requestedAccountId
  );

  const empty = accountIds.length === 0;

  let jobsQ = db
    .from('dm_jobs')
    .select('trigger_type, status, created_at, sent_at, automation_id')
    .in('instagram_account_id', accountIds)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .limit(ROW_LIMIT);
  if (automationId !== 'all') jobsQ = jobsQ.eq('automation_id', automationId);

  let sessionsQ = db
    .from('automation_sessions')
    .select('automation_id, current_step, completed, started_at')
    .in('instagram_account_id', accountIds)
    .gte('started_at', fromIso)
    .lte('started_at', toIso)
    .limit(ROW_LIMIT);
  if (automationId !== 'all') sessionsQ = sessionsQ.eq('automation_id', automationId);

  let contactsQ = db
    .from('contacts')
    .select('first_interaction_at, follows_business, last_automation_id')
    .in('instagram_account_id', accountIds)
    .gte('first_interaction_at', fromIso)
    .lte('first_interaction_at', toIso)
    .limit(ROW_LIMIT);
  if (automationId !== 'all') contactsQ = contactsQ.eq('last_automation_id', automationId);

  const [jobsRes, sessionsRes, contactsRes] = empty
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([jobsQ, sessionsQ, contactsQ]);

  const jobs = ((jobsRes.data ?? []) as JobRow[]);
  const sessions = ((sessionsRes.data ?? []) as SessionRow[]);
  const contacts = ((contactsRes.data ?? []) as ContactRow[]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const triggerTypes = ['comment', 'dm', 'story_reply'];
  const totals = {
    triggers: jobs.filter((j) => triggerTypes.includes(j.trigger_type)).length,
    comments: jobs.filter((j) => j.trigger_type === 'comment').length,
    dmKeywords: jobs.filter((j) => j.trigger_type === 'dm').length,
    storyReplies: jobs.filter((j) => j.trigger_type === 'story_reply').length,
    delivered: jobs.filter((j) => j.status === 'sent').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    flowsStarted: sessions.length,
    flowsCompleted: sessions.filter((s) => s.completed).length,
    askToFollowShown: sessions.filter((s) => s.current_step >= 2).length,
    followsGained: sessions.filter((s) => s.current_step >= 2 && s.completed).length,
    newContacts: contacts.length,
    newContactFollowers: contacts.filter((c) => c.follows_business === true).length,
  };

  // ── Daily series (zero-filled across the range) ───────────────────────────
  const days: Record<string, { date: string; comments: number; dms: number; stories: number; delivered: number; contacts: number }> = {};
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  let guard = 0;
  while (cursor <= end && guard < MAX_DAYS) {
    const key = cursor.toISOString().slice(0, 10);
    days[key] = { date: key, comments: 0, dms: 0, stories: 0, delivered: 0, contacts: 0 };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  for (const j of jobs) {
    const d = days[dayKey(j.created_at)];
    if (!d) continue;
    if (j.trigger_type === 'comment') d.comments += 1;
    else if (j.trigger_type === 'dm') d.dms += 1;
    else if (j.trigger_type === 'story_reply') d.stories += 1;
    if (j.status === 'sent') {
      const sd = days[dayKey(j.sent_at ?? j.created_at)];
      if (sd) sd.delivered += 1;
    }
  }
  for (const c of contacts) {
    const d = days[dayKey(c.first_interaction_at)];
    if (d) d.contacts += 1;
  }

  // ── Per-automation breakdown ──────────────────────────────────────────────
  const byAutomation = new Map<string, { triggers: number; delivered: number; failed: number; flowsCompleted: number; follows: number }>();
  for (const j of jobs) {
    const row = byAutomation.get(j.automation_id) ?? { triggers: 0, delivered: 0, failed: 0, flowsCompleted: 0, follows: 0 };
    if (triggerTypes.includes(j.trigger_type)) row.triggers += 1;
    if (j.status === 'sent') row.delivered += 1;
    if (j.status === 'failed') row.failed += 1;
    byAutomation.set(j.automation_id, row);
  }
  for (const s of sessions) {
    const row = byAutomation.get(s.automation_id) ?? { triggers: 0, delivered: 0, failed: 0, flowsCompleted: 0, follows: 0 };
    if (s.completed) row.flowsCompleted += 1;
    if (s.current_step >= 2 && s.completed) row.follows += 1;
    byAutomation.set(s.automation_id, row);
  }

  const perAutomation = automationMeta
    .filter((a) => automationId === 'all' || a.id === automationId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      isActive: a.is_active,
      ...(byAutomation.get(a.id) ?? { triggers: 0, delivered: 0, failed: 0, flowsCompleted: 0, follows: 0 }),
    }))
    .sort((a, b) => b.triggers - a.triggers);

  return Response.json({
    range: { from: fromIso, to: toIso },
    totals,
    daily: Object.values(days),
    perAutomation,
    automations: automationMeta.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    truncated: jobs.length >= ROW_LIMIT || sessions.length >= ROW_LIMIT || contacts.length >= ROW_LIMIT,
  });
}
