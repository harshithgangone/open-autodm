import { describe, it, expect, beforeAll } from 'vitest';
import { verifyCronAuthorization } from '@/lib/auth';

describe('cron route authorization', () => {
  const CRON_SECRET = 'super_secret_cron_token_12345';

  beforeAll(() => {
    process.env['CRON_SECRET'] = CRON_SECRET;
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'mock_service_role_key_length_at_least_20';
    process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://mock-project.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'mock_anon_key_length_at_least_20';
  });

  it('authorizes request with valid Bearer token header', () => {
    const request = new Request('https://example.com/api/cron/process-jobs', {
      headers: {
        authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    expect(verifyCronAuthorization(request)).toBe(true);
  });

  it('rejects request with invalid Bearer token', () => {
    const request = new Request('https://example.com/api/cron/process-jobs', {
      headers: {
        authorization: 'Bearer wrong_token_value_xyz',
      },
    });
    expect(verifyCronAuthorization(request)).toBe(false);
  });

  it('rejects request with missing authorization header', () => {
    const request = new Request('https://example.com/api/cron/process-jobs');
    expect(verifyCronAuthorization(request)).toBe(false);
  });

  it('strictly rejects secret provided via query parameter', () => {
    // Security requirement: query parameter authentication is prohibited
    const request = new Request(`https://example.com/api/cron/process-jobs?secret=${CRON_SECRET}`);
    expect(verifyCronAuthorization(request)).toBe(false);
  });

  it('rejects query parameter secret even when header is empty', () => {
    const request = new Request(`https://example.com/api/cron/process-jobs?secret=${CRON_SECRET}`, {
      headers: {
        authorization: '',
      },
    });
    expect(verifyCronAuthorization(request)).toBe(false);
  });
});
