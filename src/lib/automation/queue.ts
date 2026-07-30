/**
 * Postgres-native job queue (replaces BullMQ + Redis).
 *
 * Jobs live in the job_queue table. Claiming uses the claim_due_jobs RPC
 * (FOR UPDATE SKIP LOCKED) so any number of concurrent serverless invocations
 * can drain the queue without double-processing.
 *
 * Idempotency: dedupe_key is unique - Meta webhook retries for the same event
 * can never create a second job (mirrors BullMQ's jobId dedupe).
 */

import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import type { AutoDmJobPayload, JobQueueRow } from '@/lib/types';

const logger = createLogger('queue');

/** Retry backoff: 5s → 25s → 125s (matches the original BullMQ config). */
export function retryBackoffMs(attempts: number): number {
  return 5000 * Math.pow(5, Math.max(0, attempts - 1));
}

export async function enqueueJob(
  jobType: 'auto_dm' | 'follow_up',
  payload: AutoDmJobPayload,
  dedupeKey: string
): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('job_queue')
    .insert({ job_type: jobType, payload, dedupe_key: dedupeKey })
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      // Duplicate event (Meta webhook retry) - already queued or processed
      logger.info({ dedupeKey }, 'Job already exists - duplicate event ignored');
      return null;
    }
    logger.error({ err: error, dedupeKey }, 'Failed to enqueue job');
    debugLog('webhook', 'error', 'job_enqueue_error', 'error', `job_queue insert failed: ${error.message}`, {
      dedupeKey,
      error: error.message,
    });
    return null;
  }
  return (data?.id as string) ?? null;
}

/** Atomically claims up to `limit` due jobs for this invocation. */
export async function claimDueJobs(limit: number): Promise<JobQueueRow[]> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('claim_due_jobs', { p_limit: limit });
  if (error) {
    logger.error({ err: error }, 'claim_due_jobs RPC failed');
    return [];
  }
  return (data ?? []) as JobQueueRow[];
}

export async function markJobDone(jobId: string): Promise<void> {
  const db = createServiceClient();
  await db.from('job_queue').update({ status: 'done', locked_at: null }).eq('id', jobId);
}

export async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from('job_queue')
    .update({ status: 'failed', locked_at: null, last_error: errorMessage.slice(0, 2000) })
    .eq('id', jobId);
}

/**
 * Re-schedules a job. `countAttempt=false` is used for rate-limit delays -
 * waiting for the window to free up is not a failure.
 */
export async function rescheduleJob(
  job: JobQueueRow,
  delayMs: number,
  errorMessage: string | null,
  countAttempt: boolean
): Promise<void> {
  const db = createServiceClient();
  const attempts = countAttempt ? job.attempts + 1 : job.attempts;

  if (countAttempt && attempts >= job.max_attempts) {
    await markJobFailed(job.id, errorMessage ?? 'Max attempts exceeded');
    return;
  }

  await db
    .from('job_queue')
    .update({
      status: 'pending',
      locked_at: null,
      attempts,
      run_after: new Date(Date.now() + delayMs).toISOString(),
      last_error: errorMessage ? errorMessage.slice(0, 2000) : job.last_error,
    })
    .eq('id', job.id);
}
