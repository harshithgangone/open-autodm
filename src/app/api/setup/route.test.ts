import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  from: vi.fn(),
  getMetaSettings: vi.fn(),
  isEnvironmentOwner: vi.fn(),
  isInstallationOwner: vi.fn(),
  saveMetaSettings: vi.fn(),
  randomToken: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: (request: Request) => mocks.getAuthenticatedUser(request),
  unauthorized: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mocks.from }),
}));

vi.mock('@/lib/settings', () => ({
  getMetaSettings: mocks.getMetaSettings,
  isEnvironmentOwner: mocks.isEnvironmentOwner,
  isInstallationOwner: mocks.isInstallationOwner,
  saveMetaSettings: mocks.saveMetaSettings,
}));

vi.mock('@/lib/crypto', () => ({
  randomToken: mocks.randomToken,
}));

vi.mock('@/lib/env', () => ({
  getAppUrl: () => 'https://staging.example.test',
  getEnv: () => ({}),
}));

function setSettingsRow(
  row: Record<string, unknown> | null,
  error: { message: string } | null = null
) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
  };
  mocks.from.mockReturnValue(query);
  return query;
}

function setupPostRequest(body: Record<string, unknown>) {
  return new Request('https://staging.example.test/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validSetup = {
  metaAppId: '123456789012345',
  metaAppSecret: 'a'.repeat(32),
};

describe('Setup API installation-owner authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: 'owner-user-id', email: 'owner@example.test' });
    mocks.getMetaSettings.mockResolvedValue({
      metaAppId: validSetup.metaAppId,
      webhookVerifyToken: 'verify-token',
      setupCompleted: true,
      ownerUserId: 'owner-user-id',
    });
    mocks.isInstallationOwner.mockReturnValue(true);
    mocks.isEnvironmentOwner.mockReturnValue(false);
    mocks.saveMetaSettings.mockResolvedValue({ success: true });
    mocks.randomToken.mockReturnValue('generated-verify-token');
  });

  it('does not disclose setup details to a non-owner', async () => {
    setSettingsRow({
      meta_app_id: validSetup.metaAppId,
      webhook_verify_token: 'sensitive-verify-token',
      setup_completed: true,
      owner_user_id: 'different-owner',
    });
    mocks.getAuthenticatedUser.mockResolvedValueOnce({ id: 'attacker-user-id', email: 'attacker@example.test' });
    mocks.isInstallationOwner.mockReturnValueOnce(false);

    const response = await GET(new Request('https://staging.example.test/api/setup'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(mocks.getMetaSettings).not.toHaveBeenCalled();
  });

  it('generates pg_net setup SQL using the extensions schema', async () => {
    setSettingsRow({
      meta_app_id: validSetup.metaAppId,
      webhook_verify_token: 'existing-verify-token',
      setup_completed: true,
      owner_user_id: 'owner-user-id',
    });

    const response = await GET(new Request('https://staging.example.test/api/setup'));

    expect(response.status).toBe(200);
    const body = await response.json() as { cronSnippet: string };
    expect(body.cronSnippet).toContain('create schema if not exists extensions;');
    expect(body.cronSnippet).toContain('create extension if not exists pg_net with schema extensions;');
    expect(body.cronSnippet).toContain('select net.http_post(');
  });

  it('fails closed when the owner lookup errors', async () => {
    setSettingsRow(null, { message: 'database unavailable' });

    const response = await GET(new Request('https://staging.example.test/api/setup'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to verify installation ownership' });
    expect(mocks.getMetaSettings).not.toHaveBeenCalled();
  });

  it('blocks non-environment owners from claiming a completed legacy setup with no owner record', async () => {
    setSettingsRow({ webhook_verify_token: 'existing-token', owner_user_id: null, setup_completed: true });
    // isInstallationOwner defaults to allowing first-time setup, so this test
    // specifically protects the additional legacy-configured fail-closed rule.
    mocks.isInstallationOwner.mockReturnValueOnce(true);
    mocks.isEnvironmentOwner.mockReturnValueOnce(false);

    const response = await POST(setupPostRequest(validSetup));

    expect(response.status).toBe(403);
    expect(mocks.saveMetaSettings).not.toHaveBeenCalled();
  });

  it('allows an environment-defined owner to recover a completed legacy setup', async () => {
    setSettingsRow({ webhook_verify_token: 'existing-token', owner_user_id: null, setup_completed: true });
    mocks.isEnvironmentOwner.mockReturnValue(true);
    mocks.isInstallationOwner.mockReturnValue(true);

    const response = await POST(setupPostRequest(validSetup));

    expect(response.status).toBe(200);
    expect(mocks.saveMetaSettings).toHaveBeenCalledWith({
      ...validSetup,
      metaFbAppSecret: null,
      webhookVerifyToken: 'existing-token',
      ownerUserId: 'owner-user-id',
      isEnvOwner: true,
    });
  });

  it('claims an unowned installation atomically during first setup', async () => {
    setSettingsRow({ webhook_verify_token: null, owner_user_id: null, setup_completed: false });

    const response = await POST(setupPostRequest(validSetup));

    expect(response.status).toBe(200);
    expect(mocks.saveMetaSettings).toHaveBeenCalledWith({
      ...validSetup,
      metaFbAppSecret: null,
      webhookVerifyToken: 'generated-verify-token',
      ownerUserId: 'owner-user-id',
      isEnvOwner: false,
    });
    expect((await response.json()).success).toBe(true);
  });

  it('does not report success if the atomic owner claim loses a race', async () => {
    setSettingsRow({ webhook_verify_token: null, owner_user_id: null, setup_completed: false });
    mocks.saveMetaSettings.mockResolvedValueOnce({ success: false });

    const response = await POST(setupPostRequest(validSetup));

    expect(response.status).toBe(409);
    expect(mocks.saveMetaSettings).toHaveBeenCalledTimes(1);
    expect((await response.json()).error).toMatch(/ownership changed/i);
  });

  it('rejects non-owner setup changes before saving credentials', async () => {
    setSettingsRow({ webhook_verify_token: 'existing-token', owner_user_id: 'real-owner-id', setup_completed: true });
    mocks.getAuthenticatedUser.mockResolvedValueOnce({ id: 'attacker-user-id', email: 'attacker@example.test' });
    mocks.isInstallationOwner.mockReturnValueOnce(false);

    const response = await POST(setupPostRequest(validSetup));

    expect(response.status).toBe(403);
    expect(mocks.saveMetaSettings).not.toHaveBeenCalled();
  });
});
