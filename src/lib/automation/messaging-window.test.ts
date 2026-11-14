import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  processAutoDmJob,
  processFollowUpDmJob,
  RateLimitDelay,
  COMMENT_PRIVATE_REPLY_WINDOW_MS,
  STANDARD_DM_WINDOW_MS,
} from './processJob';
import { sendInstagramDm } from '@/lib/instagram/api';
import { MetaApiError, NonRetryableMetaError, AmbiguousDeliveryError } from '@/lib/instagram/errors';
import type { AutoDmJobPayload, AutomationRow, InstagramAccountRow } from '@/lib/types';

interface MetaSentCall {
  igAccountIgsid: string;
  recipient: unknown;
  messageText: string;
  accessToken: string;
  quickReply?: unknown;
}

let metaSentCalls: MetaSentCall[] = [];
let mockDmSentLog: Array<{ id?: string; automation_id: string; trigger_event_id: string; trigger_user_id: string; instagram_account_id?: string }> = [];
let mockDmJobs: Array<{ status: string; error_message: string | null }> = [];
let mockSessions: Array<{
  id: string;
  automation_id: string;
  instagram_account_id: string;
  audience_ig_user_id: string;
  current_step: number;
  expires_at: string;
  completed: boolean;
}> = [];
let mockReservations: Array<{
  account_id: string;
  comment_id: string;
  automation_id: string;
  status: string;
}> = [];
let rpcCalls: Array<{ fn: string; params: any }> = [];
let mockRateLimitResult: { allowed: boolean; current_count: number; retry_after_seconds: number } | null = null;
let mockDmSentLogError: any = null;

vi.mock('@/lib/instagram/api', () => ({
  sendInstagramDm: vi.fn(async (igAccountIgsid, recipient, messageText, accessToken, quickReply) => {
    metaSentCalls.push({ igAccountIgsid, recipient, messageText, accessToken, quickReply });
    return 'mock_meta_mid_window_test';
  }),
  sendInstagramLinkButtonDm: vi.fn(async () => 'mock_button_mid'),
  sendInstagramCardDm: vi.fn(async () => {}),
  replyToComment: vi.fn(async () => 'mock_reply_mid'),
  getAudienceProfile: vi.fn(async () => null),
}));

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
    TOKEN_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    NEXT_PUBLIC_SUPABASE_URL: 'https://mock.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
  })),
  getAppUrl: vi.fn(() => 'https://open-autodm-staging.parvez-autodm-staging.workers.dev'),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
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
          insert: async (row: any) => {
            if (mockDmSentLogError) {
              return { error: mockDmSentLogError };
            }
            mockDmSentLog.push(row);
            return { error: null };
          },
        };
      }

      if (table === 'dm_jobs') {
        return {
          upsert: async (fields: any) => {
            mockDmJobs.push({ status: fields.status, error_message: fields.error_message });
            return { error: null };
          },
          update: (fields: any) => ({
            eq: () => ({
              eq: () => {
                mockDmJobs.push({ status: fields.status, error_message: fields.error_message });
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }

      if (table === 'automations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'auto-window-1',
                    instagram_account_id: 'acc-window-1',
                    type: 'comment_dm',
                    dm_opening_message: 'Thanks for your comment! Here is your link.',
                    dm_opening_message_button_title: null,
                    dm_opening_message_button_link: null,
                    dm_responses: [{ type: 'text', content: 'Follow-up catalog link' }],
                    is_active: true,
                  } as AutomationRow,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'instagram_accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'acc-window-1',
                    instagram_user_id: 'igsid-123',
                    is_active: true,
                    paused_until: null,
                    pause_reason: null,
                    access_token_encrypted: 'mock_enc_token',
                  } as InstagramAccountRow,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'automation_sessions') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                const s = mockSessions.find((sess) => sess.id === val);
                return { data: s || null, error: null };
              },
            }),
          }),
          update: (fields: any) => ({
            eq: (_col: string, val: string) => {
              const s = mockSessions.find((sess) => sess.id === val);
              if (s) Object.assign(s, fields);
              return Promise.resolve({ error: null });
            },
          }),
          insert: async (row: any) => {
            mockSessions.push({ ...row, id: row.id || 'sess-window-1' });
            return { data: { id: row.id || 'sess-window-1' }, error: null };
          },
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }

      if (table === 'dm_logs') {
        return {
          insert: async () => ({ error: null }),
        };
      }

      const fallbackBuilder = {
        eq: () => fallbackBuilder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
      };

      return {
        select: () => fallbackBuilder,
        insert: async () => ({ error: null }),
      };
    },
    rpc: async (fn: string, params: any) => {
      rpcCalls.push({ fn, params });
      if (fn === 'is_recipient_suppressed') {
        return { data: false, error: null };
      }
      if (fn === 'record_recipient_opt_out') {
        return { data: true, error: null };
      }
      if (fn === 'check_and_record_dm_rate_limit') {
        if (mockRateLimitResult) {
          return { data: [mockRateLimitResult], error: null };
        }
        return { data: [{ allowed: true, current_count: 5, retry_after_seconds: 0 }], error: null };
      }
      if (fn === 'reserve_comment_private_reply') {
        const existing = mockReservations.find(
          (r) => r.account_id === params?.p_instagram_account_id && r.comment_id === params?.p_comment_id
        );
        if (existing) {
          return {
            data: {
              authorized: false,
              status: existing.status,
              reason:
                existing.status === 'sent'
                  ? 'already_sent'
                  : existing.status === 'failed'
                    ? 'previously_failed'
                    : 'reserved_by_other_or_active',
            },
            error: null,
          };
        }
        mockReservations.push({
          account_id: params?.p_instagram_account_id,
          comment_id: params?.p_comment_id,
          automation_id: params?.p_automation_id,
          status: 'reserved',
        });
        return { data: { authorized: true, status: 'reserved', reason: 'new_reservation' }, error: null };
      }
      if (fn === 'confirm_comment_private_reply_sent') {
        const existing = mockReservations.find(
          (r) => r.account_id === params?.p_instagram_account_id && r.comment_id === params?.p_comment_id
        );
        if (existing) existing.status = 'sent';
        return { error: null };
      }
      if (fn === 'release_comment_private_reply') {
        mockReservations = mockReservations.filter(
          (r) => !(r.account_id === params?.p_instagram_account_id && r.comment_id === params?.p_comment_id && r.status === 'reserved')
        );
        return { error: null };
      }
      if (fn === 'mark_comment_private_reply_failed') {
        const existing = mockReservations.find(
          (r) => r.account_id === params?.p_instagram_account_id && r.comment_id === params?.p_comment_id
        );
        if (existing) existing.status = 'failed';
        return { error: null };
      }
      if (fn === 'increment_automation_dms_sent') {
        return { error: null };
      }
      return { data: null, error: null };
    },
  })),
}));

describe('Instagram Messaging Window & Private Reply Safety Verification', () => {
  beforeAll(() => {
    vi.stubGlobal('setTimeout', (fn: () => void) => {
      fn();
      return 1;
    });
  });

  beforeEach(() => {
    metaSentCalls = [];
    mockDmSentLog = [];
    mockDmJobs = [];
    mockSessions = [];
    mockReservations = [];
    rpcCalls = [];
    mockRateLimitResult = null;
    mockDmSentLogError = null;
    vi.clearAllMocks();
  });

  // 1. Valid comment private reply inside the 7-day window, including one beyond 24 hours
  it('delivers comment private reply when comment is older than 24 hours but within the 7-day window (e.g. 48 hours old)', async () => {
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-commenter-48h',
      triggerUsername: 'user_48h',
      triggerEventId: 'comment-48h-1',
      triggerTimestamp: fortyEightHoursAgo,
      postId: 'post-1',
      commentText: 'link please',
      messageText: null,
    };

    await processAutoDmJob(payload, 1);

    expect(metaSentCalls.length).toBe(1);
    expect(metaSentCalls[0]!.recipient).toEqual({ commentId: 'comment-48h-1' });
    expect(mockDmSentLog.length).toBe(1);
    expect(mockDmJobs).toContainEqual({ status: 'sent', error_message: null });
  });

  // 2. Comment private reply outside its permitted window
  it('skips comment private reply when comment is outside the 7-day window (e.g. 8 days old)', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-commenter-8d',
      triggerUsername: 'user_8d',
      triggerEventId: 'comment-8d-1',
      triggerTimestamp: eightDaysAgo,
      postId: 'post-1',
      commentText: 'expired comment',
      messageText: null,
    };

    await processAutoDmJob(payload, 1);

    expect(metaSentCalls.length).toBe(0);
    expect(mockDmSentLog.length).toBe(0);
    expect(mockDmJobs).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        error_message: expect.stringContaining('7-day comment private reply window'),
      })
    );
  });

  it('disables Instagram Live comment private reply for MVP due to active broadcast status unverifiability', async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-live-commenter',
      triggerUsername: 'user_live',
      triggerEventId: 'comment-live-1',
      triggerTimestamp: twoHoursAgo,
      postId: 'live-video-1',
      commentText: 'live comment',
      messageText: null,
      isLive: true,
      mediaProductType: 'LIVE',
    };

    await processAutoDmJob(payload, 1);

    expect(metaSentCalls.length).toBe(0);
    expect(mockDmSentLog.length).toBe(0);
    expect(mockDmJobs).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        error_message: 'Live-comment automation disabled (active-broadcast unverifiable)',
      })
    );
  });

  // 3. Duplicate private replies to the same comment (one-private-reply-per-comment rule)
  it('enforces one-private-reply-per-comment rule: rejects duplicate private reply to the same comment across automations', async () => {
    // Record that comment-999 already received a private reply under automation A
    mockReservations.push({
      account_id: 'acc-window-1',
      comment_id: 'comment-single-reply-999',
      automation_id: 'auto-original',
      status: 'sent',
    });
    mockDmSentLog.push({
      id: 'existing-log-1',
      automation_id: 'auto-original',
      trigger_event_id: 'comment-single-reply-999',
      trigger_user_id: 'user-100',
      instagram_account_id: 'acc-window-1',
    });

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1', // Different automation attempting a second reply to same comment
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-100',
      triggerUsername: 'user_100',
      triggerEventId: 'comment-single-reply-999',
      triggerTimestamp: Date.now() - 5000,
      postId: 'post-1',
      commentText: 'hello again',
      messageText: null,
    };

    await processAutoDmJob(payload, 1);

    // ZERO DMs sent - Meta forbids sending more than 1 private reply per comment
    expect(metaSentCalls.length).toBe(0);
    expect(mockDmJobs).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        error_message: 'Comment already received a private reply',
      })
    );
  });

  it('enforces one-private-reply rule on 1-step flow: does NOT send unsolicited follow-up DMs without recipient response', async () => {
    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-101',
      triggerUsername: 'user_101',
      triggerEventId: 'comment-1step-101',
      triggerTimestamp: Date.now() - 1000,
      postId: 'post-1',
      commentText: 'send info',
      messageText: null,
    };

    await processAutoDmJob(payload, 1);

    // Exactly 1 DM sent as private reply to commentId; unsolicited follow-up was NOT blasted to user ID
    expect(metaSentCalls.length).toBe(1);
    expect(metaSentCalls[0]!.recipient).toEqual({ commentId: 'comment-1step-101' });
    expect(mockDmSentLog.length).toBe(1);
  });

  // 4. Follow-up attempts before the user responds
  it('drops follow-up attempts when user has not responded (missing session or non-followup triggerType)', async () => {
    const payloadNoSession: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user-102',
      triggerEventId: 'mid-1',
      triggerTimestamp: Date.now() - 1000,
      postId: null,
      commentText: null,
      messageText: null,
      // No sessionId
    };

    await processFollowUpDmJob(payloadNoSession);
    expect(metaSentCalls.length).toBe(0);

    const payloadNotFollowup: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment', // Not a user response
      triggerUserId: 'user-102',
      triggerEventId: 'mid-1',
      triggerTimestamp: Date.now() - 1000,
      postId: null,
      commentText: null,
      messageText: null,
      sessionId: 'sess-invalid',
    };

    await processFollowUpDmJob(payloadNotFollowup);
    expect(metaSentCalls.length).toBe(0);
  });

  // 5. Follow-up attempts outside the 24-hour window after the user's response
  it('skips follow-up attempts when user response is older than 24 hours', async () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    mockSessions.push({
      id: 'sess-expired-user-response',
      automation_id: 'auto-window-1',
      instagram_account_id: 'acc-window-1',
      audience_ig_user_id: 'user-103',
      current_step: 1,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      completed: false,
    });

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user-103',
      triggerEventId: 'postback-tap-late',
      triggerTimestamp: twentyFiveHoursAgo, // User response happened 25 hours ago
      postId: null,
      commentText: null,
      messageText: 'Send link',
      isFollowUp: true,
      sessionId: 'sess-expired-user-response',
      sessionStep: 1,
    };

    await processFollowUpDmJob(payload);

    expect(metaSentCalls.length).toBe(0);
    // Session is marked completed to stop further processing
    const session = mockSessions.find((s) => s.id === 'sess-expired-user-response');
    expect(session?.completed).toBe(true);
  });

  it('delivers follow-up message when user response is inside the 24-hour window', async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    mockSessions.push({
      id: 'sess-valid-user-response',
      automation_id: 'auto-window-1',
      instagram_account_id: 'acc-window-1',
      audience_ig_user_id: 'user-104',
      current_step: 1,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      completed: false,
    });

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user-104',
      triggerEventId: 'postback-tap-fresh',
      triggerTimestamp: twoHoursAgo, // User responded 2 hours ago (within 24h window)
      postId: null,
      commentText: null,
      messageText: 'Send link',
      isFollowUp: true,
      sessionId: 'sess-valid-user-response',
      sessionStep: 1,
    };

    await processFollowUpDmJob(payload);

    expect(metaSentCalls.length).toBe(1);
    expect(metaSentCalls[0]!.recipient).toEqual({ id: 'user-104' });
    const session = mockSessions.find((s) => s.id === 'sess-valid-user-response');
    expect(session?.completed).toBe(true);
  });

  it('drops follow-up attempts when interacting user does not match the session audience ID', async () => {
    mockSessions.push({
      id: 'sess-mismatch-audience',
      automation_id: 'auto-window-1',
      instagram_account_id: 'acc-window-1',
      audience_ig_user_id: 'user-original-owner',
      current_step: 1,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      completed: false,
    });

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'dm_reply_followup',
      triggerUserId: 'user-impostor', // Does NOT match user-original-owner
      triggerEventId: 'postback-tap-mismatch',
      triggerTimestamp: Date.now() - 1000,
      postId: null,
      commentText: null,
      messageText: 'Send link',
      isFollowUp: true,
      sessionId: 'sess-mismatch-audience',
      sessionStep: 1,
    };

    await processFollowUpDmJob(payload);

    expect(metaSentCalls.length).toBe(0);
    const session = mockSessions.find((s) => s.id === 'sess-mismatch-audience');
    expect(session?.completed).toBe(false);
  });

  // 6. Fail-closed on ambiguous delivery outcomes & reservation lifecycle
  it('releases reservation when rate limited pre-send so that retries can successfully re-reserve', async () => {
    mockRateLimitResult = { allowed: false, current_count: 100, retry_after_seconds: 300 };
    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-ratelimited',
      triggerUsername: 'user_rl',
      triggerEventId: 'comment-rl-1',
      triggerTimestamp: Date.now() - 1000,
      postId: 'post-1',
      commentText: 'link please',
      messageText: null,
    };

    await expect(processAutoDmJob(payload, 1)).rejects.toThrow(RateLimitDelay);

    // DM was not sent
    expect(metaSentCalls.length).toBe(0);
    // Reservation was released
    expect(rpcCalls.some((c) => c.fn === 'release_comment_private_reply')).toBe(true);
    expect(mockReservations.length).toBe(0);
  });

  it('fails closed on ambiguous delivery outcome (network timeout after send initiated): marks reservation failed, throws AmbiguousDeliveryError, and blocks replay', async () => {
    vi.mocked(sendInstagramDm).mockRejectedValueOnce(new Error('FetchError: network timeout at https://graph.facebook.com/v21.0'));

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-timeout',
      triggerUsername: 'user_timeout',
      triggerEventId: 'comment-timeout-1',
      triggerTimestamp: Date.now() - 1000,
      postId: 'post-1',
      commentText: 'link please',
      messageText: null,
    };

    await expect(processAutoDmJob(payload, 1)).rejects.toThrow(AmbiguousDeliveryError);

    // Reservation must NOT have been released!
    expect(rpcCalls.some((c) => c.fn === 'release_comment_private_reply')).toBe(false);
    // Reservation must have been marked failed
    expect(rpcCalls.some((c) => c.fn === 'mark_comment_private_reply_failed')).toBe(true);
    expect(mockReservations.find((r) => r.comment_id === 'comment-timeout-1')?.status).toBe('failed');

    // On event replay or retried attempt: reservation must reject and prevent duplicate send
    metaSentCalls = [];
    await processAutoDmJob(payload, 2);

    expect(metaSentCalls.length).toBe(0);
    expect(mockDmJobs).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        error_message: 'Comment already received a private reply',
      })
    );
  });

  it('releases reservation when Meta returns definitive rate-limit error (code 613) so retry backoff can re-reserve', async () => {
    vi.mocked(sendInstagramDm).mockRejectedValueOnce(
      new MetaApiError('Calls to this api have exceeded the rate limit', 613, undefined)
    );

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-meta-rl',
      triggerUsername: 'user_meta_rl',
      triggerEventId: 'comment-meta-rl-1',
      triggerTimestamp: Date.now() - 1000,
      postId: 'post-1',
      commentText: 'link please',
      messageText: null,
    };

    await expect(processAutoDmJob(payload, 1)).rejects.toThrow(MetaApiError);

    // Meta definitively rejected the send before processing, so releasing is safe
    expect(rpcCalls.some((c) => c.fn === 'release_comment_private_reply')).toBe(true);
    expect(mockReservations.length).toBe(0);
  });

  it('marks reservation permanently failed on definitive non-retryable Meta error (code 190)', async () => {
    vi.mocked(sendInstagramDm).mockRejectedValueOnce(
      new NonRetryableMetaError('Error validating access token: Session has expired', 190, undefined)
    );

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-meta-perm',
      triggerUsername: 'user_meta_perm',
      triggerEventId: 'comment-meta-perm-1',
      triggerTimestamp: Date.now() - 1000,
      postId: 'post-1',
      commentText: 'link please',
      messageText: null,
    };

    await expect(processAutoDmJob(payload, 1)).rejects.toThrow(NonRetryableMetaError);

    // Releasing is NOT called
    expect(rpcCalls.some((c) => c.fn === 'release_comment_private_reply')).toBe(false);
    // Marked permanently failed
    expect(rpcCalls.some((c) => c.fn === 'mark_comment_private_reply_failed')).toBe(true);
    expect(mockReservations.find((r) => r.comment_id === 'comment-meta-perm-1')?.status).toBe('failed');
  });

  it('keeps reservation intact when sending succeeds but DB logging fails, blocking duplicate send on replay', async () => {
    mockDmSentLogError = { message: 'Database connection blip', code: '500' };

    const payload: AutoDmJobPayload = {
      automationId: 'auto-window-1',
      instagramAccountId: 'acc-window-1',
      igAccountIgsid: 'igsid-123',
      triggerType: 'comment',
      triggerUserId: 'user-logging-failure',
      triggerUsername: 'user_logging_failure',
      triggerEventId: 'comment-log-fail-1',
      triggerTimestamp: Date.now() - 1000,
      postId: 'post-1',
      commentText: 'link please',
      messageText: null,
    };

    await processAutoDmJob(payload, 1);

    // DM was sent
    expect(metaSentCalls.length).toBe(1);
    // Reservation was confirmed sent
    expect(mockReservations.find((r) => r.comment_id === 'comment-log-fail-1')?.status).toBe('sent');
    // Reservation was NOT released
    expect(rpcCalls.some((c) => c.fn === 'release_comment_private_reply')).toBe(false);

    // Event replay attempt must be blocked
    metaSentCalls = [];
    await processAutoDmJob(payload, 2);

    expect(metaSentCalls.length).toBe(0);
    expect(mockDmJobs).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        error_message: 'Comment already received a private reply',
      })
    );
  });
});
