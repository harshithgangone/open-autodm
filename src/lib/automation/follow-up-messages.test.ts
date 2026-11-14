import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { processFollowUpDmJob, processAutoDmJob, STANDARD_DM_WINDOW_MS, AccountOnTrafficGuardPause } from './processJob';
import { processWebhookPayload } from './processWebhook';
import { generateFollowUpDraft, DEFAULT_FOLLOW_UP_MESSAGE } from '@/lib/ai/workersAi';
import { FollowUpDelaySchema, FOLLOW_UP_DELAYS } from '@/lib/api/schemas';
import { MetaApiError, AmbiguousDeliveryError } from '@/lib/instagram/errors';
import type { AutoDmJobPayload, AutomationRow, InstagramAccountRow } from '@/lib/types';

beforeAll(() => {
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// Tracking structures
let metaSentDms: Array<{ igAccountIgsid: string; recipient: any; messageText: string }> = [];
let mockFollowUps: Array<any> = [];
let mockJobQueue: Array<any> = [];
let mockDmJobs: Array<any> = [];
let mockSessions: Array<any> = [];

let currentAutomation: Partial<AutomationRow> = {
  id: 'auto_followup_123',
  user_id: 'user_owner_1',
  instagram_account_id: 'acc_123',
  name: 'Follow-up Test Auto',
  type: 'comment_dm',
  is_active: true,
  is_traffic_guard_paused: false,
  keywords: ['LINK'],
  dm_opening_message_enabled: true,
  dm_opening_message: 'Hey {username}, here is the link!',
  dm_opening_message_button_title: 'Send me the link',
  follow_up_enabled: true,
  follow_up_delay_minutes: 20,
  follow_up_message: 'Hey {username}, did you get a chance to check the details I sent you?',
  dm_responses: [{ id: 'resp_1', type: 'text', content: 'Here is the link: https://example.com' }],
  total_dms_sent: 0,
};

let currentAccount: Partial<InstagramAccountRow> = {
  id: 'acc_123',
  user_id: 'user_owner_1',
  instagram_user_id: 'igsid_creator_123',
  username: 'creator_official',
  is_active: true,
  access_token_encrypted: 'mock_encrypted_token',
  traffic_guard_status: 'normal',
  traffic_guard_paused: false,
};

vi.mock('@/lib/instagram/api', () => ({
  sendInstagramDm: vi.fn(async (igAccountIgsid, recipient, messageText) => {
    metaSentDms.push({ igAccountIgsid, recipient, messageText });
    return 'mock_meta_dm_id_' + Math.random().toString(36).slice(2);
  }),
  sendInstagramLinkButtonDm: vi.fn(async () => 'mock_meta_btn_id'),
  sendInstagramCardDm: vi.fn(async () => {}),
  replyToComment: vi.fn(async () => 'mock_meta_comment_reply_id'),
  getAudienceProfile: vi.fn(async () => ({ username: 'recipient_user', followsBusiness: true })),
}));

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn(() => 'EAAB_mock_valid_token'),
  encrypt: vi.fn(() => 'mock_encrypted_token'),
}));

vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(() => ({
    TOKEN_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    NEXT_PUBLIC_SUPABASE_URL: 'https://mock.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
  })),
  getAppUrl: vi.fn(() => 'https://open-autodm-staging.parvez-autodm-staging.workers.dev'),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (cols: string) => {
        let filters: Record<string, any> = {};
        const builder = {
          eq: (col: string, val: any) => {
            filters[col] = val;
            return builder;
          },
          single: async () => {
            if (table === 'automations') {
              if (filters.id === currentAutomation.id && (filters.is_active === undefined || currentAutomation.is_active === filters.is_active)) {
                return { data: { ...currentAutomation }, error: null };
              }
              return { data: null, error: { message: 'Not found' } };
            }
            if (table === 'instagram_accounts') {
              if (
                (filters.id === currentAccount.id || filters.instagram_user_id === currentAccount.instagram_user_id) &&
                (filters.is_active === undefined || currentAccount.is_active === filters.is_active)
              ) {
                return { data: { ...currentAccount }, error: null };
              }
              return { data: null, error: { message: 'Not found' } };
            }
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === 'automations') {
              if (filters.id === currentAutomation.id && (filters.is_active === undefined || currentAutomation.is_active === filters.is_active)) {
                return { data: { ...currentAutomation }, error: null };
              }
              return { data: null, error: null };
            }
            if (table === 'instagram_accounts') {
              if (filters.id === currentAccount.id || filters.instagram_user_id === currentAccount.instagram_user_id) {
                return { data: { ...currentAccount }, error: null };
              }
              return { data: null, error: null };
            }
            if (table === 'automation_sessions') {
              const session = mockSessions.find((s) => s.id === filters.id);
              return { data: session ?? null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return builder;
      },
      upsert: async (row: any) => {
        if (table === 'automation_follow_ups') {
          const idx = mockFollowUps.findIndex(
            (f) => f.automation_id === row.automation_id && f.recipient_id === row.recipient_id && f.qualified_event_id === row.qualified_event_id
          );
          if (idx >= 0) {
            mockFollowUps[idx] = { ...mockFollowUps[idx], ...row };
          } else {
            mockFollowUps.push({ ...row, id: 'fu_' + Math.random().toString(36).slice(2) });
          }
          return { error: null };
        }
        if (table === 'dm_jobs') {
          mockDmJobs.push(row);
          return { error: null };
        }
        return { error: null };
      },
      insert: (row: any) => {
        let item: any = { ...row };
        let err: any = null;
        if (table === 'job_queue') {
          const dup = mockJobQueue.find((j) => j.dedupe_key === row.dedupe_key);
          if (dup) {
            err = { code: '23505', message: 'duplicate key' };
          } else {
            item = { ...row, id: 'jq_' + Math.random().toString(36).slice(2) };
            mockJobQueue.push(item);
          }
        } else if (table === 'automation_sessions') {
          item = { ...row, id: row.id || 'sess_' + Math.random().toString(36).slice(2) };
          mockSessions.push(item);
        }
        const res = { data: item, error: err };
        return {
          ...res,
          select: () => ({
            single: async () => res,
            maybeSingle: async () => res,
          }),
        };
      },
      update: (fields: any) => ({
        eq: (col1: string, val1: any) => ({
          eq: (col2: string, val2: any) => ({
            eq: async (col3: string, val3: any) => {
              if (table === 'automation_follow_ups') {
                const item = mockFollowUps.find(
                  (f) => f[col1] === val1 && f[col2] === val2 && f[col3] === val3
                );
                if (item) Object.assign(item, fields);
              }
              return { error: null };
            },
          }),
        }),
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    rpc: async (fn: string) => {
      if (fn === 'check_and_record_dm_rate_limit') {
        return { data: { allowed: true, current_count: 1, retry_after_seconds: 0 }, error: null };
      }
      if (fn === 'increment_automation_dms_sent') {
        return { data: null, error: null };
      }
      if (fn === 'record_comment_traffic_events') {
        return { data: { inserted_count: 1 }, error: null };
      }
      if (fn === 'evaluate_traffic_guard_state') {
        return { data: { status: 'normal', is_paused: false, incident_id: null }, error: null };
      }
      if (fn === 'reserve_comment_private_reply') {
        return { data: { authorized: true, status: 'reserved' }, error: null };
      }
      if (fn === 'confirm_comment_private_reply_sent') {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
  })),
}));

describe('Follow-up Messages — Builder, Scheduling & Meta Compliance', () => {
  beforeEach(() => {
    metaSentDms = [];
    mockFollowUps = [];
    mockJobQueue = [];
    mockDmJobs = [];
    mockSessions = [];
    currentAutomation = {
      id: 'auto_followup_123',
      user_id: 'user_owner_1',
      instagram_account_id: 'acc_123',
      name: 'Follow-up Test Auto',
      type: 'comment_dm',
      is_active: true,
      is_traffic_guard_paused: false,
      keywords: ['LINK'],
      dm_opening_message_enabled: true,
      dm_opening_message: 'Hey {username}, here is the link!',
      dm_opening_message_button_title: 'Send me the link',
      follow_up_enabled: true,
      follow_up_delay_minutes: 20,
      follow_up_message: 'Hey {username}, did you get a chance to check the details I sent you?',
      dm_responses: [{ id: 'resp_1', type: 'text', content: 'Here is the link: https://example.com' }],
      total_dms_sent: 0,
    };
    currentAccount = {
      id: 'acc_123',
      user_id: 'user_owner_1',
      instagram_user_id: 'igsid_creator_123',
      username: 'creator_official',
      is_active: true,
      access_token_encrypted: 'mock_encrypted_token',
      traffic_guard_status: 'normal',
      traffic_guard_paused: false,
    };
  });

  // ── 1. Delay Options Validation ─────────────────────────────────────────────
  it('validates exactly the 4 allowed delay options: 10m, 20m, 1h, 2h', () => {
    expect(FOLLOW_UP_DELAYS).toEqual([10, 20, 60, 120]);

    for (const validDelay of [10, 20, 60, 120]) {
      const parsed = FollowUpDelaySchema.safeParse(validDelay);
      expect(parsed.success).toBe(true);
    }

    // Invalid delays rejected by schema
    for (const invalidDelay of [0, 5, 15, 30, 90, 180, 1440]) {
      const parsed = FollowUpDelaySchema.safeParse(invalidDelay);
      expect(parsed.success).toBe(false);
    }
  });

  // ── 2. Comment Trigger Eligibility Isolation ────────────────────────────────
  it('comment-triggered private reply sets status to waiting_response and does NOT schedule a follow-up job', async () => {
    const commentPayload: AutoDmJobPayload = {
      automationId: currentAutomation.id!,
      instagramAccountId: currentAccount.id!,
      igAccountIgsid: currentAccount.instagram_user_id!,
      triggerType: 'comment',
      triggerUserId: 'user_recipient_456',
      triggerUsername: 'alex',
      triggerEventId: 'comment_9999',
      triggerTimestamp: Date.now(),
      postId: 'post_111',
      commentText: 'Send LINK please',
      messageText: null,
    };

    await processAutoDmJob(commentPayload, 1);

    // Initial private reply sent
    expect(metaSentDms.length).toBe(1);
    expect(metaSentDms[0]?.messageText).toContain('Hey @alex, here is the link!');

    // Follow-up status recorded as waiting_response
    const followUpRecord = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(followUpRecord).toBeDefined();
    expect(followUpRecord.status).toBe('waiting_response');

    // Job queue MUST NOT have any follow-up job enqueued
    const followUpJob = mockJobQueue.find((j) => j.payload?.isScheduledFollowUp);
    expect(followUpJob).toBeUndefined();
  });

  // ── 3. Qualifying Recipient Response Promotes to Scheduled ───────────────────
  it('button tap arriving via webhook promotes follow-up to scheduled and enqueues delayed job', async () => {
    const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    mockSessions.push({
      id: sessionId,
      automation_id: currentAutomation.id!,
      instagram_account_id: currentAccount.id!,
      audience_ig_user_id: 'user_recipient_456',
      current_step: 1,
      completed: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const now = Date.now();
    const webhookBody = {
      object: 'instagram' as const,
      entry: [
        {
          id: currentAccount.instagram_user_id!,
          time: Math.floor(now / 1000),
          messaging: [
            {
              sender: { id: 'user_recipient_456' },
              recipient: { id: currentAccount.instagram_user_id! },
              timestamp: now,
              postback: {
                payload: `SESSION_${sessionId}_STEP_1`,
                title: 'Send me the link',
              },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(webhookBody);

    // Follow-up record promoted to scheduled with run_after = now + 20m
    const followUpRecord = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(followUpRecord).toBeDefined();
    expect(followUpRecord.status).toBe('scheduled');
    expect(new Date(followUpRecord.scheduled_for).getTime()).toBe(now + 20 * 60 * 1000);

    // Job queue contains scheduled follow-up
    const scheduledJob = mockJobQueue.find((j) => j.payload?.isScheduledFollowUp);
    expect(scheduledJob).toBeDefined();
    expect(scheduledJob.payload.followUpText).toBe(currentAutomation.follow_up_message);
    expect(new Date(scheduledJob.run_after).getTime()).toBe(now + 20 * 60 * 1000);
  });

  // ── 4. Webhook Replay Deduplication ─────────────────────────────────────────
  it('duplicate webhook tap replays cannot create duplicate scheduled follow-ups', async () => {
    const sessionId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
    mockSessions.push({
      id: sessionId,
      automation_id: currentAutomation.id!,
      instagram_account_id: currentAccount.id!,
      audience_ig_user_id: 'user_recipient_456',
      current_step: 1,
      completed: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const now = Date.now();
    const webhookBody = {
      object: 'instagram' as const,
      entry: [
        {
          id: currentAccount.instagram_user_id!,
          time: Math.floor(now / 1000),
          messaging: [
            {
              sender: { id: 'user_recipient_456' },
              recipient: { id: currentAccount.instagram_user_id! },
              timestamp: now,
              postback: {
                payload: `SESSION_${sessionId}_STEP_1`,
                title: 'Send me the link',
              },
            },
          ],
        },
      ],
    };

    // First delivery
    await processWebhookPayload(webhookBody);
    const initialJobsCount = mockJobQueue.length;

    // Second delivery (Meta retry)
    await processWebhookPayload(webhookBody);
    expect(mockJobQueue.length).toBe(initialJobsCount);
  });

  // ── 5. Messaging Window Expiration Enforcement ──────────────────────────────
  it('skips and marks expired if scheduled time falls outside the 24-hour window', async () => {
    const staleTimestamp = Date.now() - (STANDARD_DM_WINDOW_MS + 10000); // 24h + 10s ago

    const scheduledPayload: AutoDmJobPayload = {
      automationId: currentAutomation.id!,
      instagramAccountId: currentAccount.id!,
      igAccountIgsid: currentAccount.instagram_user_id!,
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user_recipient_456',
      triggerUsername: 'alex',
      triggerEventId: 'scheduled_mid_123',
      triggerTimestamp: staleTimestamp,
      postId: null,
      commentText: null,
      messageText: null,
      isFollowUp: true,
      isScheduledFollowUp: true,
      followUpText: 'Checking in!',
    };

    mockFollowUps.push({
      automation_id: currentAutomation.id,
      recipient_id: 'user_recipient_456',
      qualified_event_id: 'mid_123',
      status: 'scheduled',
    });

    await processFollowUpDmJob(scheduledPayload);

    // Zero messages sent
    expect(metaSentDms.length).toBe(0);

    // Follow-up status marked expired
    const record = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(record.status).toBe('expired');
    expect(record.error_reason).toContain('Messaging window closed');
  });

  // ── 6. Inactive Automation Prevents Send ─────────────────────────────────────
  it('inactive automation safely skips follow-up delivery', async () => {
    currentAutomation.is_active = false;

    const scheduledPayload: AutoDmJobPayload = {
      automationId: currentAutomation.id!,
      instagramAccountId: currentAccount.id!,
      igAccountIgsid: currentAccount.instagram_user_id!,
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user_recipient_456',
      triggerUsername: 'alex',
      triggerEventId: 'scheduled_mid_123',
      triggerTimestamp: Date.now() - 60000,
      postId: null,
      commentText: null,
      messageText: null,
      isFollowUp: true,
      isScheduledFollowUp: true,
      followUpText: 'Checking in!',
    };

    mockFollowUps.push({
      automation_id: currentAutomation.id,
      recipient_id: 'user_recipient_456',
      qualified_event_id: 'mid_123',
      status: 'scheduled',
    });

    await processFollowUpDmJob(scheduledPayload);

    expect(metaSentDms.length).toBe(0);
    const record = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(record.status).toBe('skipped');
    expect(record.error_reason).toContain('Automation inactive');
  });

  // ── 7. Smart Comment Traffic Guard Pause Holds Job ──────────────────────────
  it('Traffic Guard pause marks status as held and throws AccountOnTrafficGuardPause without sending', async () => {
    currentAccount.traffic_guard_paused = true;

    const scheduledPayload: AutoDmJobPayload = {
      automationId: currentAutomation.id!,
      instagramAccountId: currentAccount.id!,
      igAccountIgsid: currentAccount.instagram_user_id!,
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user_recipient_456',
      triggerUsername: 'alex',
      triggerEventId: 'scheduled_mid_123',
      triggerTimestamp: Date.now() - 60000,
      postId: null,
      commentText: null,
      messageText: null,
      isFollowUp: true,
      isScheduledFollowUp: true,
      followUpText: 'Checking in!',
    };

    mockFollowUps.push({
      automation_id: currentAutomation.id,
      recipient_id: 'user_recipient_456',
      qualified_event_id: 'mid_123',
      status: 'scheduled',
    });

    await expect(processFollowUpDmJob(scheduledPayload)).rejects.toThrow(AccountOnTrafficGuardPause);

    expect(metaSentDms.length).toBe(0);
    const record = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(record.status).toBe('held');
  });

  // ── 8. Ambiguous Delivery Fails Closed ──────────────────────────────────────
  it('ambiguous delivery failure fails closed without releasing reservation or creating duplicates', async () => {
    const { sendInstagramDm } = await import('@/lib/instagram/api');
    vi.mocked(sendInstagramDm).mockRejectedValueOnce(new Error('Connection reset by peer'));

    const scheduledPayload: AutoDmJobPayload = {
      automationId: currentAutomation.id!,
      instagramAccountId: currentAccount.id!,
      igAccountIgsid: currentAccount.instagram_user_id!,
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user_recipient_456',
      triggerUsername: 'alex',
      triggerEventId: 'scheduled_mid_123',
      triggerTimestamp: Date.now() - 60000,
      postId: null,
      commentText: null,
      messageText: null,
      isFollowUp: true,
      isScheduledFollowUp: true,
      followUpText: 'Checking in!',
    };

    mockFollowUps.push({
      automation_id: currentAutomation.id,
      recipient_id: 'user_recipient_456',
      qualified_event_id: 'mid_123',
      status: 'scheduled',
    });

    await expect(processFollowUpDmJob(scheduledPayload)).rejects.toThrow(AmbiguousDeliveryError);

    const record = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(record.status).toBe('failed');
    expect(record.error_reason).toContain('Ambiguous');
  });

  // ── 9. Successful Follow-up Delivery ────────────────────────────────────────
  it('delivers follow-up message when eligible and records sent status', async () => {
    const scheduledPayload: AutoDmJobPayload = {
      automationId: currentAutomation.id!,
      instagramAccountId: currentAccount.id!,
      igAccountIgsid: currentAccount.instagram_user_id!,
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user_recipient_456',
      triggerUsername: 'alex',
      triggerEventId: 'scheduled_mid_123',
      triggerTimestamp: Date.now() - 60000,
      postId: null,
      commentText: null,
      messageText: null,
      isFollowUp: true,
      isScheduledFollowUp: true,
      followUpText: 'Hey {username}, did you get a chance to check the details I sent you?',
    };

    mockFollowUps.push({
      automation_id: currentAutomation.id,
      recipient_id: 'user_recipient_456',
      qualified_event_id: 'mid_123',
      status: 'scheduled',
    });

    await processFollowUpDmJob(scheduledPayload);

    expect(metaSentDms.length).toBe(1);
    expect(metaSentDms[0]?.messageText).toBe('Hey @alex, did you get a chance to check the details I sent you?');

    const record = mockFollowUps.find((f) => f.recipient_id === 'user_recipient_456');
    expect(record.status).toBe('sent');
    expect(record.sent_at).toBeDefined();
  });

  // ── 10. Workers AI Follow-up Draft Generation ───────────────────────────────
  it('generates follow-up draft with automatic fallback when AI binding is null', async () => {
    const result = await generateFollowUpDraft('Polite follow-up on the guide', {
      creatorUsername: 'coach_john',
      automationName: 'Fitness Guide',
    }, null);

    expect(result.data).toBe(DEFAULT_FOLLOW_UP_MESSAGE);
    expect(result.status).toBe('fallback');
  });
});
