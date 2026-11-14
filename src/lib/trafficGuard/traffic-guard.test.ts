import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordAndEvaluateCommentTraffic,
  evaluateOpenIncidents,
  getAccountTrafficGuardStatus,
  pauseAccountAutomations,
  resumeAccountAutomations,
  markNotificationRead,
} from './tracker';

// Mock Supabase service client
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

vi.mock('@/lib/debugLog', () => ({
  debugLog: vi.fn(),
}));

describe('Smart Comment Traffic Guard — Domain Logic & Safeguards', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  describe('1. Threshold & Alert Logic', () => {
    it('does not trigger an alert when 19 comments arrive in 60 seconds', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 19, current_60s_count: 19 }, error: null }) // record_comment_traffic_events
        .mockResolvedValueOnce({
          data: {
            state: 'normal',
            current_60s_count: 19,
            incident_id: null,
            notification_emitted: null,
          },
          error: null,
        }); // evaluate_traffic_guard_state

      const commentIds = Array.from({ length: 19 }, (_, i) => `c_${i}`);
      const result = await recordAndEvaluateCommentTraffic('acc_123', commentIds);

      expect(result.state).toBe('normal');
      expect(result.current60sCount).toBe(19);
      expect(result.incidentId).toBeNull();
      expect(result.notificationEmitted).toBeNull();
    });

    it('triggers exactly one high-traffic alert when 20 unique comments arrive in 60 seconds', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 20, current_60s_count: 20 }, error: null })
        .mockResolvedValueOnce({
          data: {
            state: 'high_traffic',
            current_60s_count: 20,
            incident_id: 'inc_999',
            notification_emitted: 'high_traffic',
          },
          error: null,
        });

      const commentIds = Array.from({ length: 20 }, (_, i) => `c_${i}`);
      const result = await recordAndEvaluateCommentTraffic('acc_123', commentIds);

      expect(result.state).toBe('high_traffic');
      expect(result.current60sCount).toBe(20);
      expect(result.incidentId).toBe('inc_999');
      expect(result.notificationEmitted).toBe('high_traffic');
    });

    it('deduplicates repeated comment IDs and does not inflate the count', async () => {
      // If same comment IDs are sent multiple times, DB on conflict returns inserted_count = 0
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 0, current_60s_count: 5 }, error: null })
        .mockResolvedValueOnce({
          data: {
            state: 'normal',
            current_60s_count: 5,
            incident_id: null,
            notification_emitted: null,
          },
          error: null,
        });

      const duplicateCommentIds = ['comment_dup_1', 'comment_dup_1', 'comment_dup_1'];
      const result = await recordAndEvaluateCommentTraffic('acc_123', duplicateCommentIds);

      expect(result.current60sCount).toBe(5);
      expect(result.state).toBe('normal');
    });

    it('correctly handles batched webhooks with multiple unique comments', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 25, current_60s_count: 25 }, error: null })
        .mockResolvedValueOnce({
          data: {
            state: 'high_traffic',
            current_60s_count: 25,
            incident_id: 'inc_batch_1',
            notification_emitted: 'high_traffic',
          },
          error: null,
        });

      const batch = Array.from({ length: 25 }, (_, i) => `batch_comment_${i}`);
      const result = await recordAndEvaluateCommentTraffic('acc_123', batch);

      expect(result.state).toBe('high_traffic');
      expect(result.current60sCount).toBe(25);
    });

    it('sustained high traffic does not cause an alert storm (notification_emitted is null when incident already open)', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 10, current_60s_count: 35 }, error: null })
        .mockResolvedValueOnce({
          data: {
            state: 'high_traffic',
            current_60s_count: 35,
            incident_id: 'inc_existing_1',
            notification_emitted: null, // No new alert emitted!
          },
          error: null,
        });

      const commentIds = Array.from({ length: 10 }, (_, i) => `extra_c_${i}`);
      const result = await recordAndEvaluateCommentTraffic('acc_123', commentIds);

      expect(result.state).toBe('high_traffic');
      expect(result.incidentId).toBe('inc_existing_1');
      expect(result.notificationEmitted).toBeNull();
    });

    it('fluctuating traffic around threshold does not cause state flapping', async () => {
      // Rate is between 5 and 19 (e.g. 12 comments / 60s) while incident is open
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 2, current_60s_count: 12 }, error: null })
        .mockResolvedValueOnce({
          data: {
            state: 'high_traffic',
            current_60s_count: 12,
            incident_id: 'inc_existing_1',
            notification_emitted: null,
          },
          error: null,
        });

      const result = await recordAndEvaluateCommentTraffic('acc_123', ['c_fluct_1', 'c_fluct_2']);

      expect(result.state).toBe('high_traffic');
      expect(result.notificationEmitted).toBeNull();
    });

    it('generates a recovery notification when traffic remains below threshold for 5 consecutive minutes', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          state: 'recovered',
          current_60s_count: 2,
          incident_id: 'inc_existing_1',
          notification_emitted: 'recovered',
        },
        error: null,
      });

      const result = await recordAndEvaluateCommentTraffic('acc_123', []);

      expect(result.state).toBe('recovered');
      expect(result.notificationEmitted).toBe('recovered');
    });

    it('does not generate a recovery notification if there was no preceding incident', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 1, current_60s_count: 1 }, error: null })
        .mockResolvedValueOnce({
          data: {
            state: 'normal',
            current_60s_count: 1,
            incident_id: null,
            notification_emitted: null,
          },
          error: null,
        });

      const result = await recordAndEvaluateCommentTraffic('acc_123', ['single_comment']);

      expect(result.state).toBe('normal');
      expect(result.incidentId).toBeNull();
      expect(result.notificationEmitted).toBeNull();
    });
  });

  describe('2. Account Isolation', () => {
    it('isolates counters and incidents between different Instagram accounts', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 25, current_60s_count: 25 }, error: null })
        .mockResolvedValueOnce({
          data: { state: 'high_traffic', current_60s_count: 25, incident_id: 'inc_acc_A', notification_emitted: 'high_traffic' },
          error: null,
        });

      const resultA = await recordAndEvaluateCommentTraffic('acc_A', Array.from({ length: 25 }, (_, i) => `cA_${i}`));
      expect(resultA.state).toBe('high_traffic');
      expect(resultA.incidentId).toBe('inc_acc_A');

      // Account B receives 2 comments
      mockRpc
        .mockResolvedValueOnce({ data: { inserted_count: 2, current_60s_count: 2 }, error: null })
        .mockResolvedValueOnce({
          data: { state: 'normal', current_60s_count: 2, incident_id: null, notification_emitted: null },
          error: null,
        });

      const resultB = await recordAndEvaluateCommentTraffic('acc_B', ['cB_1', 'cB_2']);
      expect(resultB.state).toBe('normal');
      expect(resultB.incidentId).toBeNull();
    });
  });

  describe('3. Pause & Resume Controls', () => {
    it('pauseAccountAutomations calls RPC and records paused automations and held jobs', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          paused_automation_ids: ['auto_1', 'auto_2'],
          held_jobs_count: 4,
        },
        error: null,
      });

      const res = await pauseAccountAutomations('acc_123', 'inc_456');

      expect(mockRpc).toHaveBeenCalledWith('traffic_guard_pause_account', {
        p_instagram_account_id: 'acc_123',
        p_incident_id: 'inc_456',
      });
      expect(res.success).toBe(true);
      expect(res.pausedAutomationIds).toEqual(['auto_1', 'auto_2']);
      expect(res.heldJobsCount).toBe(4);
    });

    it('resumeAccountAutomations calls RPC and restores paused automations and held jobs', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          resumed_automation_ids: ['auto_1', 'auto_2'],
          resumed_jobs_count: 4,
        },
        error: null,
      });

      const res = await resumeAccountAutomations('acc_123', 'inc_456');

      expect(mockRpc).toHaveBeenCalledWith('traffic_guard_resume_account', {
        p_instagram_account_id: 'acc_123',
        p_incident_id: 'inc_456',
      });
      expect(res.success).toBe(true);
      expect(res.resumedAutomationIds).toEqual(['auto_1', 'auto_2']);
      expect(res.resumedJobsCount).toBe(4);
    });

    it('throws when pauseAccountAutomations RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' },
      });

      await expect(pauseAccountAutomations('acc_123', 'inc_456')).rejects.toThrow('Database connection failed');
    });
  });

  describe('4. Status and Maintenance', () => {
    it('getAccountTrafficGuardStatus returns metrics and notifications', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          account_id: 'acc_123',
          traffic_status: 'normal',
          is_paused: false,
          current_60s_count: 3,
          settings: {
            high_traffic_threshold: 20,
            recovery_threshold: 5,
            recovery_duration_seconds: 300,
            window_seconds: 60,
          },
          active_automations_count: 2,
          paused_by_guard_count: 0,
          held_jobs_count: 0,
          incident: null,
        },
        error: null,
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'notif_1',
              title: 'Instagram comment traffic has normalized',
              message: 'Comment volume has remained below the recovery threshold.',
              is_read: false,
              created_at: '2026-10-23T10:00:00Z',
            },
          ],
        }),
      });

      const status = await getAccountTrafficGuardStatus('acc_123');

      expect(status).not.toBeNull();
      expect(status?.traffic_status).toBe('normal');
      expect(status?.notifications).toHaveLength(1);
      expect(status?.notifications?.[0]?.id).toBe('notif_1');
    });

    it('evaluateOpenIncidents drains open incidents via RPC', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ instagram_account_id: 'acc_1' }, { instagram_account_id: 'acc_2' }],
          error: null,
        }),
      });

      mockRpc.mockResolvedValue({
        data: { state: 'high_traffic', current_60s_count: 8, incident_id: 'inc_1', notification_emitted: null },
        error: null,
      });

      const count = await evaluateOpenIncidents();
      expect(count).toBe(2);
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('markNotificationRead updates is_read flag', async () => {
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq1 = vi.fn().mockReturnThis();
      const mockEq2 = vi.fn().mockResolvedValue({ error: null });

      mockFrom.mockReturnValue({
        update: mockUpdate,
      });
      mockUpdate.mockReturnValue({ eq: mockEq1 });
      mockEq1.mockReturnValue({ eq: mockEq2 });

      await markNotificationRead('notif_1', 'user_123');

      expect(mockFrom).toHaveBeenCalledWith('traffic_guard_notifications');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_read: true }));
      expect(mockEq1).toHaveBeenCalledWith('id', 'notif_1');
      expect(mockEq2).toHaveBeenCalledWith('user_id', 'user_123');
    });
  });
});
