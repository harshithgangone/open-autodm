/**
 * Supabase client factories.
 *
 * Two separate client factories are needed because Next.js App Router
 * requires different cookie handling in Server Components vs Client Components:
 *
 * - createBrowserClient: for Client Components ('use client')
 *   Uses @supabase/ssr's browser-aware client.
 *
 * - createServerClient: for Server Components, Route Handlers, and middleware.
 *   Must receive the cookies() store from next/headers.
 */

import { createBrowserClient as _createBrowserClient, createServerClient as _createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
const SUPABASE_ANON_KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;

export function createBrowserClient() {
  return _createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export function createServerClient(cookies: { getAll(): { name: string; value: string }[]; set?(name: string, value: string, options?: Record<string, unknown>): void }) {
  return _createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet) {
        // In server components, we can't set cookies — this is expected.
        // Cookie mutations happen in middleware and route handlers.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            // @ts-expect-error — cookies in Server Components is read-only
            cookies.set(name, value, options)
          );
        } catch {
          // Ignored — read-only context
        }
      },
    },
  });
}
