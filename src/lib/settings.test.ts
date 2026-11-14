import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isInstallationOwner } from './settings';

describe('isInstallationOwner', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['CRON_SECRET'] = 'mock_cron_secret_12345';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'mock_service_role_key_length_at_least_20';
    process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://mock-project.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'mock_anon_key_length_at_least_20';
    delete process.env['OWNER_USER_ID'];
    delete process.env['OWNER_EMAIL'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows any user when installation has no recorded owner or env restriction (first-time setup)', () => {
    const user = { id: 'user-123', email: 'first@example.com' };
    expect(isInstallationOwner(user, null)).toBe(true);
  });

  it('restricts to recordedOwnerId when set in database', () => {
    const owner = { id: 'owner-uuid-1', email: 'owner@example.com' };
    const intruder = { id: 'other-uuid-2', email: 'intruder@example.com' };

    expect(isInstallationOwner(owner, 'owner-uuid-1')).toBe(true);
    expect(isInstallationOwner(intruder, 'owner-uuid-1')).toBe(false);
  });

  it('prioritizes OWNER_USER_ID environment variable over recorded database owner', () => {
    process.env['OWNER_USER_ID'] = 'env-owner-uuid';

    const envOwner = { id: 'env-owner-uuid', email: 'any@example.com' };
    const dbOwner = { id: 'db-owner-uuid', email: 'db@example.com' };

    expect(isInstallationOwner(envOwner, 'db-owner-uuid')).toBe(true);
    expect(isInstallationOwner(dbOwner, 'db-owner-uuid')).toBe(false);
  });

  it('prioritizes OWNER_EMAIL environment variable case-insensitively', () => {
    process.env['OWNER_EMAIL'] = 'admin@mycompany.com';

    const matchingUser = { id: 'some-uuid-1', email: 'ADMIN@MyCompany.com' };
    const otherUser = { id: 'some-uuid-2', email: 'user@mycompany.com' };

    expect(isInstallationOwner(matchingUser, 'some-other-db-id')).toBe(true);
    expect(isInstallationOwner(otherUser, 'some-other-db-id')).toBe(false);
  });
});
