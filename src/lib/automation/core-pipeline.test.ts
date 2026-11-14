import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { GET as webhookGET, POST as webhookPOST } from '@/app/api/webhook/route';
import { processAutoDmJob, RateLimitDelay, AccountOnPause } from './processJob';
import { processDueJobs } from './engine';
import { MetaApiError, AccountPausedMetaError, NonRetryableMetaError } from '@/lib/instagram/errors';
import { replyToComment } from '@/lib/instagram/api';
import type { AutoDmJobPayload, JobQueueRow } from '@/lib/types';

beforeAll(() => {
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

let pendingAfterPromises: Promise<void>[] = [];

// Mock next/server after() to capture background work so tests can await it
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    const p = Promise.resolve().then(cb);
    pendingAfterPromises.push(p as Promise<void>);
  }),
}));

const META_APP_SECRET = '0123456789abcdef0123456789abcdef';
const WEBHOOK_VERIFY_TOKEN = 'test_webhook_verify_token_123';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Track Meta API calls
interface MetaSentCall {
  igAccountIgsid: string;
  recipient: unknown;
  messageText: string;
  accessToken: string;
  quickReply?: unknown;
}

let metaSentCalls: MetaSentCall[] = [];
let metaDmErrorToThrow: Error | null = null;
let mockAutomationOverride: Record<string, unknown> | null = null;

vi.mock('@/lib/instagram/api', () => ({
  sendInstagramDm: vi.fn(async (igAccountIgsid, recipient, messageText, accessToken, quickReply) => {
    if (metaDmErrorToThrow) {
      throw metaDmErrorToThrow;
    }
    metaSentCalls.push({ igAccountIgsid, recipient, messageText, accessToken, quickReply });
    return 'mock_meta_mid_12345';
  }),
  sendInstagramLinkButtonDm: vi.fn(async () => 'mock_button_mid'),
  sendInstagramCardDm: vi.fn(async () => {}),
  replyToComment: vi.fn(async () => ({ success: true, replyId: 'mock_reply_mid' })),
  getAudienceProfile: vi.fn(async () => null),
}));

// In-memory tables
let mockJobQueue: JobQueueRow[] = [];
let mockDmSentLog: Array<{ automation_id: string; trigger_event_id: string; trigger_user_id: string }> = [];
let mockDmJobs: Array<{ status: string; error_message: string | null }> = [];
let mockRecipientOptOuts: Array<{ instagram_account_id: string; recipient_id: string; opt_out_text?: string | null }> = [];
let mockAccounts: Array<{
  id: string;
  instagram_user_id: string;
  is_active: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  access_token_encrypted: string;
}> = [];

vi.mock('@/lib/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/settings')>();
  return {
    ...actual,
    getMetaSettings: vi.fn(async () => ({
      metaAppId: '123456789012345',
      metaAppSecret: META_APP_SECRET,
      metaFbAppSecret: null,
      webhookVerifyToken: WEBHOOK_VERIFY_TOKEN,
      setupCompleted: true,
      ownerUserId: 'owner-uuid',
    })),
  };
});

vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto')>();
  return {
    ...actual,
    decrypt: vi.fn(() => 'EAAB_mock_valid_access_token'),
    encrypt: vi.fn(() => 'mock_encrypted_token'),
  };
});

vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(() => ({
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    NEXT_PUBLIC_SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock_service_key',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock_anon_key',
    CRON_SECRET: 'mock_cron_secret',
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'instagram_accounts') {
        return {
          select: () => {
            const chainable = {
              eq: (col: string, val: unknown) => {
                const filtered = mockAccounts.filter((a) => {
                  const record = a as unknown as Record<string, unknown>;
                  return record[col] === val;
                });
                return {
                  ...chainable,
                  single: async () => ({ data: filtered[0] ?? null, error: filtered[0] ? null : { message: 'Not found' } }),
                };
              },
              single: async () => ({ data: mockAccounts[0] ?? null, error: mockAccounts[0] ? null : { message: 'Not found' } }),
            };
            return chainable;
          },
          update: (fields: Record<string, unknown>) => ({
            eq: (_col: string, val: unknown) => {
              const acc = mockAccounts.find((a) => a.id === val);
              if (acc) {
                Object.assign(acc, fields);
              }
              return { error: null };
            },
          }),
        };
      }

      if (table === 'automations') {
        const autoData = {
          id: 'auto-vip',
          instagram_account_id: 'acc-vip',
          post_id: null,
          type: 'comment_dm',
          is_active: true,
          keywords: ['vip', 'discount', '#exclusive'],
          comment_reply_options: ['Thanks! Sent you a DM.'],
          public_reply_enabled: false,
          public_reply_mode: 'manual',
          public_reply_options: ['Thanks! Sent you a DM.'],
          dm_opening_message_enabled: true,
          dm_opening_message: 'Hey {{username}}! Here is your exclusive link.',
          dm_opening_message_button_title: null,
          dm_opening_message_button_link: null,
          dm_responses: [],
          ...(mockAutomationOverride || {}),
        };
        const queryChain: any = {
          eq: () => queryChain,
          single: async () => ({ data: autoData, error: null }),
          maybeSingle: async () => ({ data: autoData, error: null }),
          then: (resolve: any) => resolve({ data: [autoData], error: null }),
        };
        return {
          select: () => queryChain,
        };
      }

      if (table === 'job_queue') {
        return {
          insert: (item: { job_type: 'auto_dm' | 'follow_up'; payload: AutoDmJobPayload; dedupe_key: string }) => {
            const exists = mockJobQueue.some((j) => j.dedupe_key === item.dedupe_key);
            if (exists) {
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: { code: '23505' } }),
                }),
              };
            }
            const newJob: JobQueueRow = {
              id: `job-${mockJobQueue.length + 1}`,
              job_type: item.job_type,
              payload: item.payload,
              dedupe_key: item.dedupe_key,
              status: 'pending',
              run_after: new Date().toISOString(),
              attempts: 0,
              max_attempts: 3,
              last_error: null,
              locked_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            mockJobQueue.push(newJob);
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: newJob.id }, error: null }),
              }),
            };
          },
          update: (fields: Record<string, unknown>) => ({
            eq: (_col: string, val: unknown) => {
              const job = mockJobQueue.find((j) => j.id === val);
              if (job) {
                Object.assign(job, fields);
              }
              return { error: null };
            },
          }),
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
                  const row = r as Record<string, string>;
                  return Object.entries(filters).every(([k, v]) => row[k] === v);
                });
                return { data: match ?? null, error: null };
              },
            };
            return builder;
          },
          insert: async (row: { automation_id: string; trigger_event_id: string; trigger_user_id: string }) => {
            mockDmSentLog.push(row);
            return { error: null };
          },
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
          upsert: async (row: { status: string; error_message?: string | null }) => {
            mockDmJobs.push({ status: row.status, error_message: row.error_message ?? null });
            return { error: null };
          },
          update: () => ({
            eq: () => ({
              eq: () => ({ error: null }),
            }),
          }),
        };
      }

      if (table === 'recipient_opt_outs') {
        return {
          select: () => {
            const filters: Record<string, string> = {};
            const builder = {
              eq: (col: string, val: string) => {
                filters[col] = val;
                return builder;
              },
              maybeSingle: async () => {
                const match = mockRecipientOptOuts.find((r) =>
                  (!filters['instagram_account_id'] || r.instagram_account_id === filters['instagram_account_id']) &&
                  (!filters['recipient_id'] || r.recipient_id === filters['recipient_id'])
                );
                return { data: match ?? null, error: null };
              },
            };
            return builder;
          },
          upsert: async (row: { instagram_account_id: string; recipient_id: string; opt_out_text?: string | null }) => {
            const idx = mockRecipientOptOuts.findIndex(
              (r) => r.instagram_account_id === row.instagram_account_id && r.recipient_id === row.recipient_id
            );
            if (idx >= 0) {
              mockRecipientOptOuts[idx] = row;
            } else {
              mockRecipientOptOuts.push(row);
            }
            return { error: null };
          },
        };
      }

      if (table === 'debug_events' || table === 'dm_rate_events') {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: (name: string, params: Record<string, unknown>) => {
      if (name === 'is_recipient_suppressed') {
        const isSuppressed = mockRecipientOptOuts.some(
          (r) => r.instagram_account_id === params['p_instagram_account_id'] && r.recipient_id === params['p_recipient_id']
        );
        return { data: isSuppressed, error: null };
      }
      if (name === 'record_recipient_opt_out') {
        const row = {
          instagram_account_id: params['p_instagram_account_id'] as string,
          recipient_id: params['p_recipient_id'] as string,
          opt_out_text: params['p_opt_out_text'] as string | null,
        };
        const idx = mockRecipientOptOuts.findIndex(
          (r) => r.instagram_account_id === row.instagram_account_id && r.recipient_id === row.recipient_id
        );
        if (idx >= 0) {
          mockRecipientOptOuts[idx] = row;
        } else {
          mockRecipientOptOuts.push(row);
        }
        return { data: true, error: null };
      }
      if (name === 'check_and_record_dm_rate_limit') {
        return { data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }], error: null };
      }
      if (name === 'reserve_comment_private_reply' || name === 'reserve_comment_public_reply') {
        return { data: { authorized: true, status: 'reserved', reason: 'new_reservation' }, error: null };
      }
      if (
        name === 'confirm_comment_private_reply_sent' ||
        name === 'release_comment_private_reply' ||
        name === 'mark_comment_private_reply_failed' ||
        name === 'confirm_comment_public_reply_sent' ||
        name === 'release_comment_public_reply' ||
        name === 'mark_comment_public_reply_failed'
      ) {
        return { error: null };
      }
      if (name === 'increment_automation_dms_sent') {
        return { error: null };
      }
      if (name === 'record_contact_interaction' || name === 'update_contact_profile') {
        return { error: null };
      }
      if (name === 'claim_due_jobs') {
        const limit = (params['p_limit'] as number) ?? 10;
        const claimed = mockJobQueue.filter((j) => j.status === 'pending').slice(0, limit);
        for (const job of claimed) {
          job.status = 'processing';
          job.locked_at = new Date().toISOString();
        }
        return { data: claimed, error: null };
      }
      return { data: null, error: null };
    },
  })),
}));

function signPayload(body: string, secret: string = META_APP_SECRET): string {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hash}`;
}

describe('Core Pipeline Integration Tests', () => {
  beforeEach(() => {
    metaSentCalls = [];
    metaDmErrorToThrow = null;
    mockAutomationOverride = null;
    pendingAfterPromises = [];
    mockJobQueue = [];
    mockDmSentLog = [];
    mockDmJobs = [];
    mockRecipientOptOuts = [];
    mockAccounts = [
      {
        id: 'acc-vip',
        instagram_user_id: 'igsid-business-123',
        is_active: true,
        paused_until: null,
        pause_reason: null,
        access_token_encrypted: 'mock_encrypted_token',
      },
    ];
  });

  describe('Webhook GET Challenge Verification', () => {
    it('returns challenge string on valid verify token', async () => {
      const req = new Request(
        `https://example.com/api/webhook?hub.mode=subscribe&hub.challenge=challenge_token_456&hub.verify_token=${WEBHOOK_VERIFY_TOKEN}`
      );
      const res = await webhookGET(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('challenge_token_456');
    });

    it('rejects GET verification with 403 on incorrect verify token', async () => {
      const req = new Request(
        'https://example.com/api/webhook?hub.mode=subscribe&hub.challenge=challenge_token_456&hub.verify_token=wrong_token'
      );
      const res = await webhookGET(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Webhook POST Signature Validation', () => {
    const validBody = JSON.stringify({
      object: 'instagram',
      entry: [],
    });

    it('rejects request with 403 when x-hub-signature-256 header is missing', async () => {
      const req = new Request('https://example.com/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: validBody,
      });
      const res = await webhookPOST(req);
      expect(res.status).toBe(403);
    });

    it('rejects request with 403 on invalid signature', async () => {
      const req = new Request('https://example.com/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid0000000000000000000000000000000000000000000000000000000000',
        },
        body: validBody,
      });
      const res = await webhookPOST(req);
      expect(res.status).toBe(403);
    });

    it('acknowledges malformed JSON with status 200 ignored to stop Meta retries', async () => {
      const invalidJson = '{ not-valid-json: ...';
      const signature = signPayload(invalidJson);

      const req = new Request('https://example.com/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: invalidJson,
      });

      const res = await webhookPOST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe('ignored');
    });
  });

  describe('End-to-End Pipeline: Webhook Comment to Meta Private Reply DM', () => {
    it('processes comment trigger, verifies private-reply payload, and delivers DM', async () => {
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-789',
                  text: 'VIP',
                  from: {
                    id: 'commenter-user-555',
                    username: 'sara_smith',
                  },
                  media: {
                    id: 'post-media-333',
                  },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = signPayload(rawBody);

      const req = new Request('https://example.com/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: rawBody,
      });

      // 1. Send webhook POST request
      const res = await webhookPOST(req);
      expect(res.status).toBe(200);
      const resBody = (await res.json()) as any;
      expect(resBody.status).toBe('ok');

      // Await background after() processing
      await Promise.all(pendingAfterPromises);

      // 2. Verify job was enqueued with deterministic dedupe key
      expect(mockJobQueue.length).toBe(1);
      const enqueuedJob = mockJobQueue[0]!;
      expect(enqueuedJob.dedupe_key).toBe('event_auto-vip_comment-789');
      expect(enqueuedJob.payload.triggerUserId).toBe('commenter-user-555');

      // 3. Verify Meta DM was called via private reply (recipient: { commentId: 'comment-789' })
      expect(metaSentCalls.length).toBe(1);
      const sendCall = metaSentCalls[0]!;
      expect(sendCall.igAccountIgsid).toBe('igsid-business-123');

      // Non-negotiable Meta contract: comment triggers MUST deliver via private reply commentId
      expect(sendCall.recipient).toEqual({ commentId: 'comment-789' });
      expect(sendCall.messageText).toContain('sara_smith');
      expect(sendCall.messageText).toContain('exclusive link');

      // 4. Verify delivery logged in dm_sent_log
      expect(mockDmSentLog.length).toBe(1);
      expect(mockDmSentLog[0]!.trigger_event_id).toBe('comment-789');
      expect(mockDmSentLog[0]!.trigger_user_id).toBe('commenter-user-555');
    });

    it('rejects comments where keyword is part of a sentence under exact standalone mode', async () => {
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-sentence-1',
                  text: 'Can I get the VIP discount?',
                  from: {
                    id: 'user-conversational',
                    username: 'chatter',
                  },
                  media: { id: 'post-media-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(webhookPayload);
      const res = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signPayload(rawBody) },
          body: rawBody,
        })
      );
      expect(res.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // Exact standalone rejected 'Can I get the VIP discount?' -> 0 jobs enqueued
      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);
    });

    it('detects opt-out comment, records recipient suppression, and enqueues 0 jobs', async () => {
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-optout-1',
                  text: 'STOP',
                  from: {
                    id: 'user-opting-out',
                    username: 'privacy_focused',
                  },
                  media: { id: 'post-media-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(webhookPayload);
      const res = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signPayload(rawBody) },
          body: rawBody,
        })
      );
      expect(res.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // 0 jobs enqueued
      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);

      // Recipient is recorded as opted out
      const optOut = mockRecipientOptOuts.find((r) => r.recipient_id === 'user-opting-out');
      expect(optOut).toBeDefined();
      expect(optOut?.instagram_account_id).toBe('acc-vip');
    });

    it('blocks already-suppressed recipients from triggering automations even with valid keyword', async () => {
      // Pre-seed suppression record
      mockRecipientOptOuts.push({
        instagram_account_id: 'acc-vip',
        recipient_id: 'suppressed-user-999',
        opt_out_text: 'unsubscribe',
      });

      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-suppressed-trigger',
                  text: 'VIP',
                  from: {
                    id: 'suppressed-user-999',
                    username: 'suppressed_person',
                  },
                  media: { id: 'post-media-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(webhookPayload);
      const res = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signPayload(rawBody) },
          body: rawBody,
        })
      );
      expect(res.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // Suppressed user -> 0 jobs enqueued
      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);
    });

    it('ignores comments authored by the business account itself (self-loop prevention)', async () => {
      const selfCommentPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-self-1',
                  text: 'vip info',
                  from: {
                    id: 'igsid-business-123', // Same as connected account!
                    username: 'business_official',
                  },
                  media: { id: 'post-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(selfCommentPayload);
      const signature = signPayload(rawBody);

      const res = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
          body: rawBody,
        })
      );
      expect(res.status).toBe(200);

      // No job enqueued, no DM sent
      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);
    });

    it('ignores sub-comments / comment replies (parent_id present)', async () => {
      const replyPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-reply-1',
                  parent_id: 'comment-parent-99', // Sub-comment
                  text: 'vip discount',
                  from: { id: 'user-222', username: 'bob' },
                  media: { id: 'post-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(replyPayload);
      const signature = signPayload(rawBody);

      const res = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
          body: rawBody,
        })
      );
      expect(res.status).toBe(200);

      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);
    });

    it('drops comment events older than seven days at the webhook boundary', async () => {
      const eightDaysAgoSeconds = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
      const stalePayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: eightDaysAgoSeconds,
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-stale-1',
                  timestamp: eightDaysAgoSeconds,
                  text: 'VIP',
                  from: { id: 'user-stale-999', username: 'late_user' },
                  media: { id: 'post-media-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(stalePayload);
      const signature = signPayload(rawBody);

      const res = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
          body: rawBody,
        })
      );
      expect(res.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // Stale comment beyond 7-day window -> 0 jobs enqueued, 0 DMs sent
      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);
    });

    it('handles duplicate webhook event submissions idempotently without duplicate jobs or DMs', async () => {
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-idempotent-boundary-1',
                  text: 'VIP',
                  from: {
                    id: 'user-repeat-1',
                    username: 'repeat_buyer',
                  },
                  media: {
                    id: 'post-media-333',
                  },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = signPayload(rawBody);

      const makeReq = () =>
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hub-signature-256': signature,
          },
          body: rawBody,
        });

      // 1st submission
      const res1 = await webhookPOST(makeReq());
      expect(res1.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      expect(mockJobQueue.length).toBe(1);
      expect(metaSentCalls.length).toBe(1);
      expect(mockDmSentLog.length).toBe(1);

      // Reset captured background work for the second invocation
      pendingAfterPromises = [];

      // 2nd submission (Meta network retry or duplicate delivery)
      const res2 = await webhookPOST(makeReq());
      expect(res2.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // Must remain exactly 1 job, 1 DM send, and 1 sent log record
      expect(mockJobQueue.length).toBe(1);
      expect(metaSentCalls.length).toBe(1);
      expect(mockDmSentLog.length).toBe(1);
    });

    it('skips automations when comment matches trigger_config.excluded_keywords', async () => {
      mockAutomationOverride = {
        keywords: ['VIP'],
        trigger_config: { excluded_keywords: ['scam', 'fake', 'bot'] },
      };

      const excludedCommentPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-excluded-1',
                  text: 'VIP is a scam',
                  from: { id: 'user-cynic-1', username: 'cynic' },
                  media: { id: 'post-media-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBodyExcluded = JSON.stringify(excludedCommentPayload);
      const signatureExcluded = signPayload(rawBodyExcluded);

      const resExcluded = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signatureExcluded },
          body: rawBodyExcluded,
        })
      );
      expect(resExcluded.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // Excluded keyword matched ('scam') -> 0 jobs enqueued, 0 DMs sent
      expect(mockJobQueue.length).toBe(0);
      expect(metaSentCalls.length).toBe(0);

      // Verify that a clean keyword comment without excluded words STILL triggers normally
      pendingAfterPromises = [];
      const cleanCommentPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'igsid-business-123',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-clean-1',
                  text: 'VIP',
                  from: { id: 'user-clean-1', username: 'real_fan' },
                  media: { id: 'post-media-333' },
                },
              },
            ],
          },
        ],
      };

      const rawBodyClean = JSON.stringify(cleanCommentPayload);
      const signatureClean = signPayload(rawBodyClean);

      const resClean = await webhookPOST(
        new Request('https://example.com/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signatureClean },
          body: rawBodyClean,
        })
      );
      expect(resClean.status).toBe(200);
      await Promise.all(pendingAfterPromises);

      // Clean keyword comment -> 1 job enqueued, 1 DM sent
      expect(mockJobQueue.length).toBe(1);
      expect(metaSentCalls.length).toBe(1);
    });
  });

  describe('Error Handling, Circuit Breaker & Retries', () => {
    it('opens circuit breaker for 24 hours on Meta policy-block error 368', async () => {
      // Simulate Meta policy block
      metaDmErrorToThrow = new AccountPausedMetaError('User or account blocked by Meta spam filters', 368, undefined);

      const job: JobQueueRow = {
        id: 'job-policy-block',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-blocked',
          triggerUsername: 'blocked_user',
          triggerEventId: 'comment-policy-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-policy-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.failed).toBe(1);

      // Verify circuit breaker opened: account paused for 24h
      const account = mockAccounts.find((a) => a.id === 'acc-vip')!;
      expect(account.paused_until).toBeTruthy();
      expect(new Date(account.paused_until!).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
      expect(account.pause_reason).toContain('code 368');

      // Verify job marked failed in queue
      expect(mockJobQueue[0]!.status).toBe('failed');
    });

    it('skips sends while circuit breaker is open', async () => {
      // Set account as paused until tomorrow
      const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
      mockAccounts[0]!.paused_until = tomorrow;
      mockAccounts[0]!.pause_reason = 'Previous policy block';

      const job: JobQueueRow = {
        id: 'job-during-pause',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-new',
          triggerUsername: 'new_user',
          triggerEventId: 'comment-during-pause',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-during-pause',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      // Run queue
      const drainResult = await processDueJobs(1);
      // Job is delayed until pause expires, NOT failed, NO attempts burned
      expect(drainResult.rescheduled).toBe(1);
      expect(mockJobQueue[0]!.status).toBe('pending');
      expect(mockJobQueue[0]!.attempts).toBe(0);
      // No Meta DM sent
      expect(metaSentCalls.length).toBe(0);
    });

    it('immediately fails without retrying on expired token (code 190)', async () => {
      metaDmErrorToThrow = new NonRetryableMetaError('Error validating access token: Session has expired', 190, undefined);

      const job: JobQueueRow = {
        id: 'job-token-expired',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-token',
          triggerUsername: 'test_user',
          triggerEventId: 'comment-token-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-token-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.failed).toBe(1);
      expect(mockJobQueue[0]!.status).toBe('failed');
      expect(mockJobQueue[0]!.last_error).toContain('Session has expired');
    });

    it('backs off 15 minutes without burning attempt count on Meta rate limit (code 613)', async () => {
      metaDmErrorToThrow = new MetaApiError('Calls to this api have exceeded the rate limit', 613, undefined);

      const job: JobQueueRow = {
        id: 'job-meta-ratelimit',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-ratelimit',
          triggerUsername: 'test_user',
          triggerEventId: 'comment-rl-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-rl-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.rescheduled).toBe(1);
      // Attempt count is preserved (not incremented)
      expect(mockJobQueue[0]!.attempts).toBe(0);
      expect(mockJobQueue[0]!.status).toBe('pending');
      // Rescheduled ~15 mins into the future
      const runAfterEpoch = new Date(mockJobQueue[0]!.run_after).getTime();
      expect(runAfterEpoch).toBeGreaterThanOrEqual(Date.now() + 14 * 60_000);
    });
  });

  describe('Public Comment Reply Controls & Failure Isolation', () => {
    it('does NOT call replyToComment when public_reply_enabled is false', async () => {
      mockAutomationOverride = {
        public_reply_enabled: false,
        comment_reply_options: ['This should not be posted'],
      };

      const job: JobQueueRow = {
        id: 'job-pub-off',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-pub-off',
          triggerUsername: 'user_pub_off',
          triggerEventId: 'comment-pub-off-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-pub-off-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.done).toBe(1);
      expect(replyToComment).not.toHaveBeenCalled();
      expect(metaSentCalls.length).toBe(1);
      expect(metaSentCalls[0]!.recipient).toEqual({ commentId: 'comment-pub-off-1' });
    });

    it('calls replyToComment when public_reply_enabled is true', async () => {
      vi.mocked(replyToComment).mockClear();
      vi.mocked(replyToComment).mockResolvedValueOnce({ success: true, replyId: 'pub_reply_id_100' });

      mockAutomationOverride = {
        public_reply_enabled: true,
        public_reply_options: ['Check your inbox! ✨'],
      };

      const job: JobQueueRow = {
        id: 'job-pub-on',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-pub-on',
          triggerUsername: 'user_pub_on',
          triggerEventId: 'comment-pub-on-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-pub-on-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.done).toBe(1);
      expect(replyToComment).toHaveBeenCalledWith('comment-pub-on-1', 'Check your inbox! ✨', expect.any(String));
      expect(metaSentCalls.length).toBe(1);
    });

    it('still delivers private DM even when public replyToComment fails (failure isolation)', async () => {
      vi.mocked(replyToComment).mockClear();
      vi.mocked(replyToComment).mockResolvedValueOnce({
        success: false,
        error: { message: 'Meta comment reply capability missing', code: 10 },
      });

      mockAutomationOverride = {
        public_reply_enabled: true,
        public_reply_options: ['Check your inbox! ✨'],
      };

      const job: JobQueueRow = {
        id: 'job-pub-fail',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-pub-fail',
          triggerUsername: 'user_pub_fail',
          triggerEventId: 'comment-pub-fail-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-pub-fail-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      // The job MUST still be considered done! Public reply failure does not block DM delivery.
      expect(drainResult.done).toBe(1);
      expect(drainResult.failed).toBe(0);
      expect(metaSentCalls.length).toBe(1);
      expect(metaSentCalls[0]!.recipient).toEqual({ commentId: 'comment-pub-fail-1' });
    });

    it('selects from 5 dm_opening_message_variations when configured', async () => {
      mockAutomationOverride = {
        public_reply_enabled: false,
        dm_opening_message_variations: [
          'Var 1: Hey {{username}}!',
          'Var 2: Hello {{username}}!',
          'Var 3: Welcome {{username}}!',
          'Var 4: Glad you reached out {{username}}!',
          'Var 5: Top secret link for {{username}}!',
        ],
      };

      const job: JobQueueRow = {
        id: 'job-vars',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-vars',
          triggerUsername: 'variations_user',
          triggerEventId: 'comment-vars-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
          selectedVariationIndex: 3, // strictly selects Var 4
        },
        dedupe_key: 'event-vars-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.done).toBe(1);
      expect(metaSentCalls.length).toBe(1);
      expect(metaSentCalls[0]!.messageText).toBe('Var 4: Glad you reached out {@variations_user}!');
    });

    it('skips queued job without calling Meta Graph API if recipient is suppressed prior to execution', async () => {
      // Pre-seed suppression record for this recipient
      mockRecipientOptOuts.push({
        instagram_account_id: 'acc-vip',
        recipient_id: 'user-late-opt-out',
        opt_out_text: 'stop',
      });

      const job: JobQueueRow = {
        id: 'job-opt-out-guard',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-late-opt-out',
          triggerUsername: 'late_opt_out_user',
          triggerEventId: 'comment-late-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-late-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.done).toBe(1);
      expect(metaSentCalls.length).toBe(0);
      expect(mockDmSentLog.length).toBe(0);
      expect(mockDmJobs[0]!.status).toBe('skipped');
      expect(mockDmJobs[0]!.error_message).toContain('opted out');
      expect(mockJobQueue[0]!.status).toBe('done');
    });

    it('executes automation with flow_graph, delivering comment private reply and recording sent log', async () => {
      mockAutomationOverride = {
        flow_graph: {
          version: 1,
          nodes: [
            { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
            { id: 'dm1', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'Send Flow DM', messageText: 'Flow DM to @{{username}}' } },
          ],
          edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
        },
      };

      const job: JobQueueRow = {
        id: 'job-flow-graph-1',
        job_type: 'auto_dm',
        payload: {
          automationId: 'auto-vip',
          instagramAccountId: 'acc-vip',
          igAccountIgsid: 'igsid-business-123',
          triggerType: 'comment',
          triggerUserId: 'user-flow-1',
          triggerUsername: 'flow_user',
          triggerEventId: 'comment-flow-1',
          triggerTimestamp: Date.now(),
          postId: 'post-333',
          commentText: 'vip',
          messageText: null,
        },
        dedupe_key: 'event-flow-1',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockJobQueue = [job];

      const drainResult = await processDueJobs(1);
      expect(drainResult.done).toBe(1);
      expect(metaSentCalls.length).toBe(1);
      expect(metaSentCalls[0]!.recipient).toEqual({ commentId: 'comment-flow-1' });
      expect(mockDmSentLog.length).toBe(1);
      expect(mockDmSentLog[0]!.trigger_event_id).toBe('comment-flow-1');
      expect(mockDmJobs.at(-1)!.status).toBe('sent');
      expect(mockJobQueue[0]!.status).toBe('done');
    });
  });
});
