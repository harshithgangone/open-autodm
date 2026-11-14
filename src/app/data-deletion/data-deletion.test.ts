import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDashboardLink } from '@/lib/env';

describe('Data Deletion Page Link Safety & Resolution', () => {
  const originalEnv = process.env['NEXT_PUBLIC_APP_URL'];

  beforeEach(() => {
    delete process.env['NEXT_PUBLIC_APP_URL'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['NEXT_PUBLIC_APP_URL'] = originalEnv;
    } else {
      delete process.env['NEXT_PUBLIC_APP_URL'];
    }
  });

  it('returns safe site-relative href and fallback label when NEXT_PUBLIC_APP_URL is not set', () => {
    const result = getDashboardLink();
    expect(result).toEqual({
      href: '/',
      label: 'the dashboard',
    });
  });

  it('resolves production Worker URL dynamically without trailing slash', () => {
    const prodUrl = 'https://open-autodm-production.parvez-autodm-staging.workers.dev';
    process.env['NEXT_PUBLIC_APP_URL'] = `${prodUrl}/`;

    const result = getDashboardLink();
    expect(result).toEqual({
      href: '/',
      label: prodUrl,
    });
  });

  it('resolves custom SaaS domain dynamically without trailing slash', () => {
    const customDomain = 'https://app.autodm.com';
    process.env['NEXT_PUBLIC_APP_URL'] = customDomain;

    const result = getDashboardLink();
    expect(result).toEqual({
      href: '/',
      label: customDomain,
    });
  });

  it('resolves approved production domain app.opendm.in dynamically', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.opendm.in';

    const result = getDashboardLink();
    expect(result).toEqual({
      href: '/',
      label: 'https://app.opendm.in',
    });
  });

  it('accepts explicit override parameter', () => {
    const result = getDashboardLink('https://custom-instance.example.com/');
    expect(result).toEqual({
      href: '/',
      label: 'https://custom-instance.example.com',
    });
  });

  it('guarantees href is always site-relative root to prevent cross-origin redirect escapes', () => {
    const environments = [
      undefined,
      '',
      'https://open-autodm-staging.parvez-autodm-staging.workers.dev',
      'https://open-autodm-production.parvez-autodm-staging.workers.dev',
      'https://saas.example.com',
    ];

    for (const envUrl of environments) {
      const { href } = getDashboardLink(envUrl);
      expect(href).toBe('/');
    }
  });
});
