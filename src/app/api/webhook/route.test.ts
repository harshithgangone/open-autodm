import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { hmacSha256Hex } from '@/lib/crypto';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getMetaSettings: vi.fn(),
  processWebhookPayload: vi.fn(),
  processDueJobs: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => mocks.after(callback),
}));

vi.mock('@/lib/settings', () => ({
  getMetaSettings: mocks.getMetaSettings,
}));

vi.mock('@/lib/automation/processWebhook', () => ({
  processWebhookPayload: mocks.processWebhookPayload,
}));

vi.mock('@/lib/automation/engine', () => ({
  processDueJobs: mocks.processDueJobs,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/debugLog', () => ({
  debugLog: mocks.debugLog,
}));

const appSecret = 'test-meta-app-secret-only-for-unit-tests';
const verifyToken = 'test-webhook-verify-token';

describe('Meta webhook route signature and verification safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMetaSettings.mockResolvedValue({
      metaAppId: '123456789012345',
      metaAppSecret: appSecret,
      metaFbAppSecret: null,
      webhookVerifyToken: verifyToken,
      setupCompleted: true,
      ownerUserId: 'test-owner',
    });
    mocks.processWebhookPayload.mockResolvedValue(0);
    mocks.processDueJobs.mockResolvedValue({ processed: 0 });
    mocks.after.mockImplementation(() => undefined);
  });

  it('returns the exact challenge for a valid Meta verification token', async () => {
    const request = new Request(
      'https://staging.example.test/api/webhook?hub.mode=subscribe&hub.verify_token=test-webhook-verify-token&hub.challenge=challenge-123'
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('challenge-123');
  });

  it('rejects an invalid Meta verification token', async () => {
    const request = new Request(
      'https://staging.example.test/api/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123'
    );

    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('keeps the Meta GET verification challenge available when POST processing is disabled', async () => {
    vi.stubEnv('META_WEBHOOK_PROCESSING_ENABLED', 'false');

    try {
      const request = new Request(
        'https://staging.example.test/api/webhook?hub.mode=subscribe&hub.verify_token=test-webhook-verify-token&hub.challenge=staging-challenge'
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('staging-challenge');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('accepts a valid HMAC signature and defers the empty webhook payload', async () => {
    const rawBody = JSON.stringify({ object: 'instagram', entry: [] });
    const signature = `sha256=${hmacSha256Hex(appSecret, Buffer.from(rawBody, 'utf8'))}`;
    const request = new Request('https://staging.example.test/api/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signature, 'content-type': 'application/json' },
      body: rawBody,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processWebhookPayload).not.toHaveBeenCalled();

    const deferred = mocks.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    expect(deferred).toBeDefined();
    await deferred?.();
    expect(mocks.processWebhookPayload).toHaveBeenCalledWith({ object: 'instagram', entry: [] });
    expect(mocks.processDueJobs).not.toHaveBeenCalled();
  });

  it('acknowledges a valid signature without any processing when explicitly disabled', async () => {
    vi.stubEnv('META_WEBHOOK_PROCESSING_ENABLED', 'false');

    try {
      const rawBody = JSON.stringify({
        object: 'instagram',
        entry: [{ id: 'test-entry', changes: [{ field: 'comments', value: {} }] }],
      });
      const signature = `sha256=${hmacSha256Hex(appSecret, Buffer.from(rawBody, 'utf8'))}`;
      const request = new Request('https://staging.example.test/api/webhook', {
        method: 'POST',
        headers: { 'x-hub-signature-256': signature, 'content-type': 'application/json' },
        body: rawBody,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
      expect(mocks.after).not.toHaveBeenCalled();
      expect(mocks.debugLog).not.toHaveBeenCalled();
      expect(mocks.processWebhookPayload).not.toHaveBeenCalled();
      expect(mocks.processDueJobs).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('still rejects a bad HMAC signature when POST processing is disabled', async () => {
    vi.stubEnv('META_WEBHOOK_PROCESSING_ENABLED', 'false');

    try {
      const rawBody = JSON.stringify({ object: 'instagram', entry: [] });
      const request = new Request('https://staging.example.test/api/webhook', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
          'content-type': 'application/json',
        },
        body: rawBody,
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      expect(mocks.after).not.toHaveBeenCalled();
      expect(mocks.debugLog).not.toHaveBeenCalled();
      expect(mocks.processWebhookPayload).not.toHaveBeenCalled();
      expect(mocks.processDueJobs).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a bad HMAC signature before scheduling any processing', async () => {
    const rawBody = JSON.stringify({ object: 'instagram', entry: [] });
    const request = new Request('https://staging.example.test/api/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}`, 'content-type': 'application/json' },
      body: rawBody,
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.debugLog).not.toHaveBeenCalled();
    expect(mocks.processWebhookPayload).not.toHaveBeenCalled();
  });

  it('rejects an unsigned webhook before reading Meta credentials', async () => {
    const request = new Request('https://staging.example.test/api/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ object: 'instagram', entry: [] }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.getMetaSettings).not.toHaveBeenCalled();
    expect(mocks.debugLog).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('does not write debug events when Meta settings are unavailable', async () => {
    mocks.getMetaSettings.mockResolvedValue(null);
    const request = new Request('https://staging.example.test/api/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ object: 'instagram', entry: [] }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.debugLog).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.processWebhookPayload).not.toHaveBeenCalled();
  });
});
