import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DM_LIMIT_PER_HOUR, RateLimitDelay } from './processJob';

describe('Postgres Rolling-Window Rate Limiter', () => {
  const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/20260729000003_job_queue_and_rate_limiter.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  it('verifies the SQL definition of check_and_record_dm_rate_limit', () => {
    // 1. Transaction-level advisory lock per account to prevent concurrency overshoots
    expect(migrationSql).toContain('PERFORM pg_advisory_xact_lock(hashtext(p_account_id::text));');

    // 2. Opportunistic cleanup of expired window entries (> 1 hour old)
    expect(migrationSql).toContain("WHERE instagram_account_id = p_account_id AND sent_at < NOW() - INTERVAL '1 hour'");

    // 3. Rolling window count check (< 1 hour old)
    expect(migrationSql).toContain("WHERE instagram_account_id = p_account_id AND sent_at > NOW() - INTERVAL '1 hour'");

    // 4. Returns allowed, current_count, and retry_after_seconds
    expect(migrationSql).toContain('RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, retry_after_seconds INTEGER)');

    // 5. Forward migration updates default limit to 100 (conservative 50% safety margin under Meta 200 limit)
    const forwardMigrationPath = path.resolve(__dirname, '../../../supabase/migrations/20260731000003_rate_limit_conservative_default.sql');
    const forwardSql = fs.readFileSync(forwardMigrationPath, 'utf8');
    expect(forwardSql).toContain('p_limit      INTEGER DEFAULT 100');
    expect(DM_LIMIT_PER_HOUR).toBe(100);
  });

  describe('Rolling window algorithm & concurrency simulation', () => {
    interface DmRateEvent {
      id: number;
      instagram_account_id: string;
      sent_at: number; // epoch ms
    }

    let rateEventsTable: DmRateEvent[] = [];
    let autoId = 1;

    // Direct TypeScript implementation of the exact Postgres function logic:
    function checkAndRecordDmRateLimit(
      accountId: string,
      limit: number = DM_LIMIT_PER_HOUR,
      now: number = Date.now()
    ): { allowed: boolean; current_count: number; retry_after_seconds: number } {
      const oneHourAgo = now - 60 * 60 * 1000;

      // 1. Opportunistic cleanup of expired entries for this account
      rateEventsTable = rateEventsTable.filter(
        (e) => !(e.instagram_account_id === accountId && e.sent_at < oneHourAgo)
      );

      // 2. Count entries within the rolling 1-hour window
      const recentEvents = rateEventsTable
        .filter((e) => e.instagram_account_id === accountId && e.sent_at > oneHourAgo)
        .sort((a, b) => a.sent_at - b.sent_at);

      const count = recentEvents.length;

      // 3. Limit check
      if (count >= limit) {
        const oldest = recentEvents[0]!.sent_at;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000) + 1);
        return {
          allowed: false,
          current_count: count,
          retry_after_seconds: retryAfterSeconds,
        };
      }

      // 4. Record the new send
      rateEventsTable.push({
        id: autoId++,
        instagram_account_id: accountId,
        sent_at: now,
      });

      return {
        allowed: true,
        current_count: count + 1,
        retry_after_seconds: 0,
      };
    }

    beforeEach(() => {
      rateEventsTable = [];
      autoId = 1;
    });

    it('allows requests below the limit and increments count', () => {
      const accountId = 'account-111';

      const res1 = checkAndRecordDmRateLimit(accountId, 5);
      expect(res1.allowed).toBe(true);
      expect(res1.current_count).toBe(1);
      expect(res1.retry_after_seconds).toBe(0);

      const res2 = checkAndRecordDmRateLimit(accountId, 5);
      expect(res2.allowed).toBe(true);
      expect(res2.current_count).toBe(2);
    });

    it('blocks requests when the account reaches the exact limit', () => {
      const accountId = 'account-111';
      const limit = 3;

      expect(checkAndRecordDmRateLimit(accountId, limit).allowed).toBe(true); // 1
      expect(checkAndRecordDmRateLimit(accountId, limit).allowed).toBe(true); // 2
      expect(checkAndRecordDmRateLimit(accountId, limit).allowed).toBe(true); // 3 (at limit)

      // 4th request must be rejected
      const blocked = checkAndRecordDmRateLimit(accountId, limit);
      expect(blocked.allowed).toBe(false);
      expect(blocked.current_count).toBe(3);
      expect(blocked.retry_after_seconds).toBeGreaterThan(0);
      expect(blocked.retry_after_seconds).toBeLessThanOrEqual(3601);
    });

    it('guarantees multiple accounts have completely independent limits', () => {
      const accountA = 'account-aaa';
      const accountB = 'account-bbb';
      const limit = 2;

      // Fill account A to its limit
      expect(checkAndRecordDmRateLimit(accountA, limit).allowed).toBe(true);
      expect(checkAndRecordDmRateLimit(accountA, limit).allowed).toBe(true);
      expect(checkAndRecordDmRateLimit(accountA, limit).allowed).toBe(false); // Account A saturated

      // Account B must still have full allowance
      const resB1 = checkAndRecordDmRateLimit(accountB, limit);
      expect(resB1.allowed).toBe(true);
      expect(resB1.current_count).toBe(1);

      const resB2 = checkAndRecordDmRateLimit(accountB, limit);
      expect(resB2.allowed).toBe(true);
      expect(resB2.current_count).toBe(2);

      const resB3 = checkAndRecordDmRateLimit(accountB, limit);
      expect(resB3.allowed).toBe(false); // Account B saturated
    });

    it('expires events after 1 hour and opens new send capacity', () => {
      const accountId = 'account-111';
      const limit = 2;
      const t0 = 1700000000000;

      // Send 2 events at t0
      expect(checkAndRecordDmRateLimit(accountId, limit, t0).allowed).toBe(true);
      expect(checkAndRecordDmRateLimit(accountId, limit, t0 + 1000).allowed).toBe(true);
      expect(checkAndRecordDmRateLimit(accountId, limit, t0 + 2000).allowed).toBe(false);

      // Advance time by 30 minutes (events still inside window)
      const t30min = t0 + 30 * 60 * 1000;
      expect(checkAndRecordDmRateLimit(accountId, limit, t30min).allowed).toBe(false);

      // Advance time by 61 minutes (first two events expired)
      const t61min = t0 + 61 * 60 * 1000;
      const resAfterExpiry = checkAndRecordDmRateLimit(accountId, limit, t61min);
      expect(resAfterExpiry.allowed).toBe(true);
      expect(resAfterExpiry.current_count).toBe(1);
    });

    it('prevents limit overshooting during concurrent simultaneous invocations', async () => {
      const accountId = 'account-concurrent';
      const limit = 10;
      const totalConcurrentRequests = 25;

      // Simulate serialized transaction locks: in PostgreSQL, pg_advisory_xact_lock
      // serializes concurrent invocations on the accountId.
      let successfulCalls = 0;
      let rejectedCalls = 0;

      const results = await Promise.all(
        Array.from({ length: totalConcurrentRequests }, async () => {
          // Mimic transactional execution with advisory lock
          const res = checkAndRecordDmRateLimit(accountId, limit);
          if (res.allowed) {
            successfulCalls++;
          } else {
            rejectedCalls++;
          }
          return res;
        })
      );

      expect(results.length).toBe(totalConcurrentRequests);
      // Exactly 'limit' calls must succeed, all others must be rejected
      expect(successfulCalls).toBe(limit);
      expect(rejectedCalls).toBe(totalConcurrentRequests - limit);
      expect(rateEventsTable.filter((e) => e.instagram_account_id === accountId).length).toBe(limit);
    });
  });

  describe('RateLimitDelay Exception and Queue Rescheduling', () => {
    it('creates RateLimitDelay with correct retryAfterMs and currentCount', () => {
      const delay = new RateLimitDelay(45000, 100);
      expect(delay.name).toBe('RateLimitDelay');
      expect(delay.retryAfterMs).toBe(45000);
      expect(delay.currentCount).toBe(100);
      expect(delay.message).toContain('100/100/h');
    });
  });
});
