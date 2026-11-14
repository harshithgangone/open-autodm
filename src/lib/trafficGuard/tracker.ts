/**
 * Smart Comment Traffic Guard — Domain Logic & DB RPC Interop
 *
 * Implements:
 * 1. Per-account unique comment counting over rolling 60s windows.
 * 2. High-traffic detection (>= 20 unique comments / 60s).
 * 3. Recovery detection (< 5 unique comments / 60s for 5 consecutive minutes).
 * 4. Deduplicated persistent notifications (no alert storms).
 * 5. Safe pause & selective resume (preserving inactive automations and holding queued jobs).
 */

import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import type { TrafficGuardStatusResponse, TrafficNotificationRow } from '@/lib/types';

const logger = createLogger('traffic-guard');

export interface TrafficEvaluationResult {
  state: 'normal' | 'high_traffic' | 'recovered';
  current60sCount: number;
  incidentId: string | null;
  notificationEmitted: 'high_traffic' | 'recovered' | null;
}

/**
 * Records verified comment IDs and evaluates the account traffic state.
 * Deduplicates repeated comment deliveries at the database level.
 */
export async function recordAndEvaluateCommentTraffic(
  instagramAccountId: string,
  commentIds: string[]
): Promise<TrafficEvaluationResult> {
  const db = createServiceClient();

  try {
    // 1. Record unique comment events if any are provided
    if (commentIds && commentIds.length > 0) {
      const { error: recordError } = await db.rpc('record_comment_traffic_events', {
        p_instagram_account_id: instagramAccountId,
        p_comment_ids: commentIds,
      });

      if (recordError) {
        logger.error({ err: recordError, instagramAccountId }, 'Failed to record comment traffic events');
        return { state: 'normal', current60sCount: 0, incidentId: null, notificationEmitted: null };
      }
    }

    // 2. Evaluate race-safe state machine
    const { data: evalData, error: evalError } = await db.rpc('evaluate_traffic_guard_state', {
      p_instagram_account_id: instagramAccountId,
    });

    if (evalError) {
      logger.error({ err: evalError, instagramAccountId }, 'Failed to evaluate traffic guard state');
      return { state: 'normal', current60sCount: 0, incidentId: null, notificationEmitted: null };
    }

    const res = evalData as {
      state: 'normal' | 'high_traffic' | 'recovered';
      current_60s_count: number;
      incident_id: string | null;
      notification_emitted: 'high_traffic' | 'recovered' | null;
    } | null;

    if (res?.notification_emitted === 'high_traffic') {
      debugLog('worker', 'warn', 'high_traffic_detected', 'error',
        `High Instagram comment traffic detected: ${res.current_60s_count} unique comments / 60s`, {
          instagramAccountId,
          count60s: res.current_60s_count,
          incidentId: res.incident_id,
        });
    } else if (res?.notification_emitted === 'recovered') {
      debugLog('worker', 'info', 'traffic_normalized', 'ok',
        `Instagram comment traffic normalized below recovery threshold for 5m`, {
          instagramAccountId,
          count60s: res.current_60s_count,
          incidentId: res.incident_id,
        });
    }

    return {
      state: res?.state ?? 'normal',
      current60sCount: res?.current_60s_count ?? 0,
      incidentId: res?.incident_id ?? null,
      notificationEmitted: res?.notification_emitted ?? null,
    };
  } catch (err) {
    logger.error({ err, instagramAccountId }, 'Unexpected error in recordAndEvaluateCommentTraffic');
    return { state: 'normal', current60sCount: 0, incidentId: null, notificationEmitted: null };
  }
}

/**
 * Periodically evaluates open high_traffic incidents (e.g. from pg_cron).
 */
export async function evaluateOpenIncidents(): Promise<number> {
  const db = createServiceClient();
  const { data: openIncidents, error } = await db
    .from('comment_traffic_incidents')
    .select('instagram_account_id')
    .eq('status', 'high_traffic');

  if (error || !openIncidents || openIncidents.length === 0) {
    return 0;
  }

  let evaluated = 0;
  for (const inc of openIncidents) {
    try {
      await db.rpc('evaluate_traffic_guard_state', {
        p_instagram_account_id: inc.instagram_account_id,
      });
      evaluated += 1;
    } catch (err) {
      logger.warn({ err, accountId: inc.instagram_account_id }, 'Failed to evaluate open incident');
    }
  }

  return evaluated;
}

/**
 * Fetches status, incident metrics, and unread notifications for the owner dashboard.
 */
export async function getAccountTrafficGuardStatus(
  instagramAccountId: string
): Promise<TrafficGuardStatusResponse | null> {
  const db = createServiceClient();

  const { data, error } = await db.rpc('get_traffic_guard_status', {
    p_instagram_account_id: instagramAccountId,
  });

  if (error || !data) {
    logger.error({ err: error, instagramAccountId }, 'Failed to fetch traffic guard status');
    return null;
  }

  const status = data as TrafficGuardStatusResponse;

  // Also fetch recent notifications for this account
  const { data: notifs } = await db
    .from('traffic_guard_notifications')
    .select('*')
    .eq('instagram_account_id', instagramAccountId)
    .order('created_at', { ascending: false })
    .limit(10);

  status.notifications = (notifs ?? []) as TrafficNotificationRow[];
  return status;
}

/**
 * Confirms pausing automations for an affected account.
 * Holds pending queue jobs without deleting them.
 */
export async function pauseAccountAutomations(
  instagramAccountId: string,
  incidentId: string
): Promise<{ success: boolean; pausedAutomationIds: string[]; heldJobsCount: number }> {
  const db = createServiceClient();

  const { data, error } = await db.rpc('traffic_guard_pause_account', {
    p_instagram_account_id: instagramAccountId,
    p_incident_id: incidentId,
  });

  if (error) {
    logger.error({ err: error, instagramAccountId, incidentId }, 'Failed to pause account automations');
    throw new Error(`Failed to pause automations: ${error.message}`);
  }

  const res = data as {
    success: boolean;
    paused_automation_ids: string[];
    held_jobs_count: number;
  };

  debugLog('worker', 'info', 'automations_paused', 'ok',
    `Traffic Guard paused ${res.paused_automation_ids?.length ?? 0} automations, holding ${res.held_jobs_count ?? 0} jobs`, {
      instagramAccountId,
      incidentId,
      pausedIds: res.paused_automation_ids,
      heldJobsCount: res.held_jobs_count,
    });

  return {
    success: res.success ?? true,
    pausedAutomationIds: res.paused_automation_ids ?? [],
    heldJobsCount: res.held_jobs_count ?? 0,
  };
}

/**
 * Confirms resuming automations previously paused by Traffic Guard.
 * Restores held queue jobs to pending.
 */
export async function resumeAccountAutomations(
  instagramAccountId: string,
  incidentId: string
): Promise<{ success: boolean; resumedAutomationIds: string[]; resumedJobsCount: number }> {
  const db = createServiceClient();

  const { data, error } = await db.rpc('traffic_guard_resume_account', {
    p_instagram_account_id: instagramAccountId,
    p_incident_id: incidentId,
  });

  if (error) {
    logger.error({ err: error, instagramAccountId, incidentId }, 'Failed to resume account automations');
    throw new Error(`Failed to resume automations: ${error.message}`);
  }

  const res = data as {
    success: boolean;
    resumed_automation_ids: string[];
    resumed_jobs_count: number;
  };

  debugLog('worker', 'info', 'automations_resumed', 'ok',
    `Traffic Guard resumed ${res.resumed_automation_ids?.length ?? 0} automations and ${res.resumed_jobs_count ?? 0} held jobs`, {
      instagramAccountId,
      incidentId,
      resumedIds: res.resumed_automation_ids,
      resumedJobsCount: res.resumed_jobs_count,
    });

  return {
    success: res.success ?? true,
    resumedAutomationIds: res.resumed_automation_ids ?? [],
    resumedJobsCount: res.resumed_jobs_count ?? 0,
  };
}

/**
 * Marks a notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<void> {
  const db = createServiceClient();
  await db
    .from('traffic_guard_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);
}
