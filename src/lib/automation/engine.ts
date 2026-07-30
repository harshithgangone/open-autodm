/**
 * Queue engine - claims due jobs and runs them with full error classification.
 *
 * Called from two places:
 *  1. The webhook route (via `after()`) right after enqueuing new jobs - this
 *     is the fast path: 95% of DMs send seconds after the comment.
 *  2. The cron endpoint - drains delayed jobs (rate-limit overflow, retries)
 *     and acts as the safety net if a webhook invocation died mid-flight.
 */

import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import { claimDueJobs, markJobDone, markJobFailed, rescheduleJob, retryBackoffMs } from '@/lib/automation/queue';
import {
  processAutoDmJob,
  processFollowUpDmJob,
  pauseAccount,
  RateLimitDelay,
  AccountOnPause,
} from '@/lib/automation/processJob';
import { AccountPausedMetaError, NonRetryableMetaError, MetaApiError, META_RATE_LIMIT_CODES } from '@/lib/instagram/errors';
import type { JobQueueRow } from '@/lib/types';

const logger = createLogger('engine');

export interface DrainResult {
  claimed: number;
  done: number;
  rescheduled: number;
  failed: number;
}

export async function processDueJobs(limit: number): Promise<DrainResult> {
  const jobs = await claimDueJobs(limit);
  const result: DrainResult = { claimed: jobs.length, done: 0, rescheduled: 0, failed: 0 };

  // Sequential on purpose: preserves jitter spacing between sends and keeps a
  // single invocation from bursting DMs to Meta in parallel.
  for (const job of jobs) {
    await runJob(job, result);
  }

  if (result.claimed > 0) {
    logger.info({ ...result }, 'Queue drain finished');
  }
  return result;
}

async function runJob(job: JobQueueRow, result: DrainResult): Promise<void> {
  try {
    if (job.job_type === 'follow_up') {
      await processFollowUpDmJob(job.payload);
    } else {
      await processAutoDmJob(job.payload, job.attempts + 1);
    }
    await markJobDone(job.id);
    result.done += 1;
  } catch (err) {
    if (err instanceof RateLimitDelay) {
      // Hourly window full - wait it out. Not a failure, no attempt counted.
      await rescheduleJob(job, err.retryAfterMs, null, false);
      result.rescheduled += 1;
      return;
    }

    if (err instanceof AccountOnPause) {
      // Circuit breaker is open - try again shortly after it closes.
      const delayMs = Math.max(60_000, err.resumeAtMs - Date.now() + 60_000);
      await rescheduleJob(job, delayMs, 'Account paused by circuit breaker', false);
      result.rescheduled += 1;
      return;
    }

    if (err instanceof AccountPausedMetaError) {
      // Meta says this account is policy-blocked - open the breaker for 24h
      // and stop retrying. Protecting the creator's account beats delivering
      // one more DM.
      await pauseAccount(
        job.payload.instagramAccountId,
        `Meta policy block (code ${err.code}${err.subcode ? `/${err.subcode}` : ''}): ${err.message}`
      );
      await markJobFailed(job.id, err.message);
      result.failed += 1;
      return;
    }

    if (err instanceof NonRetryableMetaError) {
      debugLog('worker', 'error', 'job_failed', 'error',
        `Non-retryable Meta error - code ${err.code}: ${err.message}`,
        { jobId: job.id, metaCode: err.code, hint: 'Code 190 = expired token, 10 = permission denied, 100 = invalid param' });
      await markJobFailed(job.id, err.message);
      result.failed += 1;
      return;
    }

    if (err instanceof MetaApiError && err.code !== undefined && (META_RATE_LIMIT_CODES as readonly number[]).includes(err.code)) {
      // Meta-side rate limiting - back off generously without burning attempts.
      await rescheduleJob(job, 15 * 60_000, `Meta rate limit (code ${err.code})`, false);
      result.rescheduled += 1;
      return;
    }

    // Anything else: transient - retry with exponential backoff.
    const message = err instanceof Error ? err.message : String(err);
    debugLog('worker', 'error', 'job_retry', 'error', `Job errored (attempt ${job.attempts + 1}/${job.max_attempts}) - ${message}`, {
      jobId: job.id,
    });
    await rescheduleJob(job, retryBackoffMs(job.attempts + 1), message, true);
    result.rescheduled += 1;
  }
}
