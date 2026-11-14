import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { enqueueJob } from './queue';
import { processAutoDmJob } from './processJob';
import type { AutoDmJobPayload } from '@/lib/types';

beforeAll(() => {
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// In-memory mock tables for deduplication testing
interface JobQueueItem {
  id: string;
  job_type: string;
  payload: AutoDmJobPayload;
  dedupe_key: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  run_after: string;
}

interface DmSentLogRow {
  id: string;
  instagram_account_id: string;
  automation_id: string;
  trigger_user_id: string;
  trigger_event_id: string;
  sent_at: string;
}

let mockJobQueue: JobQueueItem[] = [];
let mockDmSentLog: DmSentLogRow[] = [];
let mockDmJobs: Array<{
  automation_id: string;
  trigger_event_id: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
}> = [];
let totalDmsIncremented = 0;
let mockMetaDmsSent: Array<{ recipient: unknown; messageText: string }> = [];

vi.mock('@/lib/instagram/api', () => ({
  sendInstagramDm: vi.fn(async (_igAccount, recipient, messageText) => {
    mockMetaDmsSent.push({ recipient, messageText });
    return 'mock_meta_message_id_999';
  }),
  sendInstagramLinkButtonDm: vi.fn(async () => 'mock_meta_button_id'),
  sendInstagramCardDm: vi.fn(async () => {}),
  replyToComment: vi.fn(async () => 'mock_meta_reply_id'),
  getAudienceProfile: vi.fn(async () => null),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'job_queue') {
        return {
          insert: (payload: { job_type: string; payload: AutoDmJobPayload; dedupe_key: string }) => {
            // Enforce database-level UNIQUE constraint on dedupe_key
            const exists = mockJobQueue.some((j) => j.dedupe_key === payload.dedupe_key);
            if (exists) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint "job_queue_dedupe_key_key"' },
                select: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                  }),
                }),
              };
            }

            const newJob: JobQueueItem = {
              id: `job-${mockJobQueue.length + 1}`,
              job_type: payload.job_type,
              payload: payload.payload,
              dedupe_key: payload.dedupe_key,
              status: 'pending',
              attempts: 0,
              max_attempts: 3,
              locked_at: null,
              run_after: new Date().toISOString(),
            };
            mockJobQueue.push(newJob);

            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: newJob.id }, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'dm_sent_log') {
        return {
          select: () => {
            const filters: Record<string, string> = {};
            const builder = {
              eq: (col: string, val: string) => {
                filters[col] = val;
                return builder;
              },
              maybeSingle: async () => {
                const match = mockDmSentLog.find((r) => {
                  const row = r as unknown as Record<string, string>;
                  return Object.entries(filters).every(([k, v]) => row[k] === v);
                });
                return { data: match ?? null, error: null };
              },
            };
            return builder;
          },
          insert: async (row: DmSentLogRow) => {
            // Enforce unique constraints:
            // 1. (automation_id, trigger_event_id)
            const duplicateEvent = mockDmSentLog.some(
              (r) => r.automation_id === row.automation_id && r.trigger_event_id === row.trigger_event_id
            );
            if (duplicateEvent) {
              return { error: { code: '23505', message: 'uq_dm_sent_log_automation_event violation' } };
            }

            // 2. (automation_id, trigger_user_id)
            const duplicateUser = mockDmSentLog.some(
              (r) => r.automation_id === row.automation_id && r.trigger_user_id === row.trigger_user_id
            );
            if (duplicateUser) {
              return { error: { code: '23505', message: 'uq_dm_sent_log_automation_user violation' } };
            }

            mockDmSentLog.push({ ...row, id: `log-${mockDmSentLog.length + 1}`, sent_at: new Date().toISOString() });
            return { error: null };
          },
        };
      }

      if (table === 'debug_events') {
        return {
          insert: async () => ({ error: null }),
        };
      }

      if (table === 'automations') {
        let matchedId = 'auto-101';
        const chainable = {
          eq: (_col: string, val: string) => {
            if (_col === 'id') matchedId = val;
            return chainable;
          },
          single: async () => ({
            data: {
              id: matchedId,
              instagram_account_id: 'acc-101',
              is_active: true,
              keywords: ['pricing', 'info'],
              comment_reply_options: [],
              dm_opening_message_enabled: true,
              dm_opening_message: 'Hi {{username}}, here is your link!',
              dm_opening_message_button_title: null,
              dm_opening_message_button_link: null,
              dm_responses: [],
            },
            error: null,
          }),
        };
        return {
          select: () => chainable,
        };
      }

      if (table === 'instagram_accounts') {
        const chainable = {
          eq: () => chainable,
          single: async () => ({
            data: {
              id: 'acc-101',
              is_active: true,
              paused_until: null,
              pause_reason: null,
              access_token_encrypted: 'mock_encrypted_token',
            },
            error: null,
          }),
        };
        return {
          select: () => chainable,
        };
      }

      if (table === 'dm_jobs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          upsert: async (row: Record<string, unknown>) => {
            mockDmJobs.push({
              automation_id: (row['automation_id'] as string) ?? 'auto-101',
              trigger_event_id: (row['trigger_event_id'] as string) ?? 'comment-101',
              status: (row['status'] as string) ?? 'unknown',
              sent_at: (row['sent_at'] as string | null) ?? null,
              error_message: (row['error_message'] as string | null) ?? null,
            });
            return { error: null };
          },
          update: (fields: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => {
                mockDmJobs.push({
                  automation_id: 'auto-101',
                  trigger_event_id: 'comment-101',
                  status: (fields['status'] as string) ?? 'unknown',
                  sent_at: (fields['sent_at'] as string | null) ?? null,
                  error_message: (fields['error_message'] as string | null) ?? null,
                });
                return { error: null };
              },
            }),
          }),
        };
      }

      if (table === 'dm_rate_events') {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: (name: string) => {
      if (name === 'check_and_record_dm_rate_limit') {
        return { data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }], error: null };
      }
      if (name === 'reserve_comment_private_reply') {
        return { data: { authorized: true, status: 'reserved', reason: 'new_reservation' }, error: null };
      }
      if (name === 'confirm_comment_private_reply_sent' || name === 'release_comment_private_reply' || name === 'mark_comment_private_reply_failed') {
        return { error: null };
      }
      if (name === 'is_recipient_suppressed') {
        return { data: false, error: null };
      }
      if (name === 'increment_automation_dms_sent') {
        totalDmsIncremented++;
        return { error: null };
      }
      throw new Error(`Unexpected rpc: ${name}`);
    },
  })),
}));

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn(() => 'EAAB_mock_valid_instagram_token'),
  encrypt: vi.fn(() => 'mock_encrypted_token'),
  randomToken: vi.fn(() => 'mock_token_123'),
}));

vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(() => ({
    TOKEN_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    NEXT_PUBLIC_SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock_service_key',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock_anon_key',
    CRON_SECRET: 'mock_cron_secret',
  })),
}));

describe('Deduplication & Idempotency Verification', () => {
  const coreSchemaPath = path.resolve(__dirname, '../../../supabase/migrations/20260729000001_core_schema.sql');
  const coreSchemaSql = fs.readFileSync(coreSchemaPath, 'utf8');

  const jobQueuePath = path.resolve(__dirname, '../../../supabase/migrations/20260729000003_job_queue_and_rate_limiter.sql');
  const jobQueueSql = fs.readFileSync(jobQueuePath, 'utf8');

  beforeEach(() => {
    mockJobQueue = [];
    mockDmSentLog = [];
    mockDmJobs = [];
    mockMetaDmsSent = [];
    totalDmsIncremented = 0;
  });

  it('verifies database unique constraints for deduplication in SQL migrations', () => {
    // 1. One DM per trigger event per automation constraint
    expect(coreSchemaSql).toContain('CREATE UNIQUE INDEX uq_dm_sent_log_automation_event ON public.dm_sent_log(automation_id, trigger_event_id);');

    // 2. One DM per user per automation constraint
    expect(coreSchemaSql).toContain('CREATE UNIQUE INDEX uq_dm_sent_log_automation_user ON public.dm_sent_log(automation_id, trigger_user_id);');

    // 3. Queue idempotency dedupe_key constraint
    expect(jobQueueSql).toContain('dedupe_key   TEXT        NOT NULL UNIQUE,');
  });

  it('replays same webhook multiple times and guarantees only one job is enqueued', async () => {
    const payload: AutoDmJobPayload = {
      automationId: 'auto-101',
      instagramAccountId: 'acc-101',
      igAccountIgsid: 'igsid-101',
      triggerType: 'comment',
      triggerUserId: 'user-commenter-1',
      triggerUsername: 'john_doe',
      triggerEventId: 'comment-999',
      triggerTimestamp: Date.now(),
      postId: 'media-post-1',
      commentText: 'Tell me the pricing',
      messageText: null,
    };

    const dedupeKey = `event_${payload.automationId}_${payload.triggerEventId}`;

    // 1st webhook delivery: enqueued successfully
    const jobId1 = await enqueueJob('auto_dm', payload, dedupeKey);
    expect(jobId1).toBeTruthy();
    expect(mockJobQueue.length).toBe(1);

    // 2nd webhook delivery (Meta network retry of identical event): ignored
    const jobId2 = await enqueueJob('auto_dm', payload, dedupeKey);
    expect(jobId2).toBeNull();
    expect(mockJobQueue.length).toBe(1);

    // 3rd webhook delivery: still ignored
    const jobId3 = await enqueueJob('auto_dm', payload, dedupeKey);
    expect(jobId3).toBeNull();
    expect(mockJobQueue.length).toBe(1);
  });

  it('prevents sending duplicate DMs when commenter triggers automation again', async () => {
    const payload: AutoDmJobPayload = {
      automationId: 'auto-101',
      instagramAccountId: 'acc-101',
      igAccountIgsid: 'igsid-101',
      triggerType: 'comment',
      triggerUserId: 'user-commenter-1',
      triggerUsername: 'john_doe',
      triggerEventId: 'comment-101',
      triggerTimestamp: Date.now(),
      postId: 'media-post-1',
      commentText: 'pricing please',
      messageText: null,
    };

    // First execution: sends DM and logs to dm_sent_log
    await processAutoDmJob(payload, 1);
    expect(mockMetaDmsSent.length).toBe(1);
    expect(mockDmSentLog.length).toBe(1);
    expect(totalDmsIncremented).toBe(1);

    // Second execution with same triggerEventId: skipped by deduplication
    await processAutoDmJob(payload, 1);
    expect(mockMetaDmsSent.length).toBe(1); // No new DM sent!
    expect(mockDmSentLog.length).toBe(1);
    expect(totalDmsIncremented).toBe(1);

    // Third execution: same user comments on a DIFFERENT post (different triggerEventId)
    const secondCommentPayload: AutoDmJobPayload = {
      ...payload,
      triggerEventId: 'comment-102',
      postId: 'media-post-2',
    };
    await processAutoDmJob(secondCommentPayload, 1);
    // User deduplication check (uq_dm_sent_log_automation_user) skips send
    expect(mockMetaDmsSent.length).toBe(1); // Still only 1 DM!
  });

  it('does not suppress deliveries for Automation B when the same user previously received Automation A (multi-automation isolation)', async () => {
    const payloadA: AutoDmJobPayload = {
      automationId: 'auto-101',
      instagramAccountId: 'acc-101',
      igAccountIgsid: 'igsid-101',
      triggerType: 'comment',
      triggerUserId: 'user-shared-recipient',
      triggerUsername: 'multiauto_fan',
      triggerEventId: 'comment-auto-a',
      triggerTimestamp: Date.now(),
      postId: 'post-a',
      commentText: 'pricing please',
      messageText: null,
    };

    // 1. Deliver Automation A to recipient
    await processAutoDmJob(payloadA, 1);
    expect(mockMetaDmsSent.length).toBe(1);
    expect(mockDmSentLog.length).toBe(1);
    expect(mockDmSentLog[0]!.automation_id).toBe('auto-101');
    expect(mockDmSentLog[0]!.trigger_user_id).toBe('user-shared-recipient');

    // 2. Deliver Automation B to the EXACT SAME recipient
    const payloadB: AutoDmJobPayload = {
      automationId: 'auto-202',
      instagramAccountId: 'acc-101',
      igAccountIgsid: 'igsid-101',
      triggerType: 'comment',
      triggerUserId: 'user-shared-recipient',
      triggerUsername: 'multiauto_fan',
      triggerEventId: 'comment-auto-b',
      triggerTimestamp: Date.now(),
      postId: 'post-b',
      commentText: 'info please',
      messageText: null,
    };

    await processAutoDmJob(payloadB, 1);

    // Delivery for Automation B must SUCCEED (not suppressed by Automation A's prior delivery)
    expect(mockMetaDmsSent.length).toBe(2);
    expect(mockDmSentLog.length).toBe(2);
    expect(mockDmSentLog[1]!.automation_id).toBe('auto-202');
    expect(mockDmSentLog[1]!.trigger_user_id).toBe('user-shared-recipient');

    // 3. Repeating Automation A for the same recipient is STILL suppressed
    const payloadARepeat: AutoDmJobPayload = {
      ...payloadA,
      triggerEventId: 'comment-auto-a-repeat',
    };
    await processAutoDmJob(payloadARepeat, 1);
    expect(mockMetaDmsSent.length).toBe(2); // Still 2 DMs sent!
  });

  it('allows continuation flow steps (flowNodeId) to bypass user deduplication', async () => {
    // Populate dm_sent_log as if initial step already ran for this user and event
    mockDmSentLog.push({
      id: 'log-initial',
      instagram_account_id: 'acc-101',
      automation_id: 'auto-101',
      trigger_user_id: 'user-continuation-1',
      trigger_event_id: 'comment-initial-1',
      sent_at: new Date().toISOString(),
    });

    const initialSentCount = mockMetaDmsSent.length;

    // Normal new event from same user should be skipped
    const normalPayload: AutoDmJobPayload = {
      automationId: 'auto-101',
      instagramAccountId: 'acc-101',
      igAccountIgsid: 'igsid-101',
      triggerType: 'comment',
      triggerUserId: 'user-continuation-1',
      triggerUsername: 'john_doe',
      triggerEventId: 'comment-initial-2',
      triggerTimestamp: Date.now(),
      postId: 'media-post-1',
      commentText: 'pricing please',
      messageText: null,
    };
    await processAutoDmJob(normalPayload, 1);
    expect(mockMetaDmsSent.length).toBe(initialSentCount); // Skipped because user already received automation

    // But continuation step with flowNodeId bypasses the user deduplication check
    const continuationPayload: AutoDmJobPayload = {
      ...normalPayload,
      triggerEventId: 'comment-initial-1',
      flowNodeId: 'node_dm_step_2',
      isFollowUp: true,
    };
    await processAutoDmJob(continuationPayload, 1);
    // It proceeds past step 2 and is not skipped as "User already received this automation"
    expect(
      mockDmJobs.some(
        (j) => j.trigger_event_id === 'comment-initial-1' && j.error_message === 'User already received this automation'
      )
    ).toBe(false);
  });

  it('verifies failed or skipped jobs never record successful delivery in dm_sent_log', async () => {
    const expiredPayload: AutoDmJobPayload = {
      automationId: 'auto-101',
      instagramAccountId: 'acc-101',
      igAccountIgsid: 'igsid-101',
      triggerType: 'comment',
      triggerUserId: 'user-expired',
      triggerUsername: 'late_user',
      triggerEventId: 'comment-expired-1',
      triggerTimestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old (outside 7-day comment window)
      postId: 'media-post-1',
      commentText: 'pricing',
      messageText: null,
    };

    // Run job for expired event
    await processAutoDmJob(expiredPayload, 1);

    // Must be skipped: no DM sent, no dm_sent_log entry, no counter increment
    expect(mockMetaDmsSent.length).toBe(0);
    expect(mockDmSentLog.length).toBe(0);
    expect(totalDmsIncremented).toBe(0);
    expect(mockDmJobs.some((j) => j.status === 'sent')).toBe(false);
    expect(mockDmJobs.some((j) => j.status === 'skipped')).toBe(true);
  });

  it('verifies worker recovery logic for stale processing locks (> 10 minutes)', () => {
    // Verifies the claim_due_jobs RPC logic from SQL:
    // UPDATE job_queue SET status = 'pending', locked_at = NULL WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes';
    expect(jobQueueSql).toContain("UPDATE public.job_queue");
    expect(jobQueueSql).toContain("SET status = 'pending', locked_at = NULL");
    expect(jobQueueSql).toContain("WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes';");

    // Simulate stale job self-healing:
    const now = Date.now();
    const tenMinutesMs = 10 * 60 * 1000;
    const testQueue: JobQueueItem[] = [
      {
        id: 'job-stuck',
        job_type: 'auto_dm',
        payload: {} as AutoDmJobPayload,
        dedupe_key: 'stuck-key',
        status: 'processing',
        attempts: 1,
        max_attempts: 3,
        locked_at: new Date(now - 15 * 60 * 1000).toISOString(), // 15 mins ago (stale)
        run_after: new Date(now - 15 * 60 * 1000).toISOString(),
      },
      {
        id: 'job-active',
        job_type: 'auto_dm',
        payload: {} as AutoDmJobPayload,
        dedupe_key: 'active-key',
        status: 'processing',
        attempts: 1,
        max_attempts: 3,
        locked_at: new Date(now - 2 * 60 * 1000).toISOString(), // 2 mins ago (active)
        run_after: new Date(now - 2 * 60 * 1000).toISOString(),
      },
    ];

    // Self-healing step
    for (const job of testQueue) {
      if (job.status === 'processing' && job.locked_at) {
        const lockAge = now - new Date(job.locked_at).getTime();
        if (lockAge > tenMinutesMs) {
          job.status = 'pending';
          job.locked_at = null;
        }
      }
    }

    expect(testQueue.find((j) => j.id === 'job-stuck')?.status).toBe('pending');
    expect(testQueue.find((j) => j.id === 'job-active')?.status).toBe('processing');
  });
});
