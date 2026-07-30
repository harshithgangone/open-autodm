/**
 * Service-role Supabase client - server-side only.
 *
 * Bypasses RLS. Used by the automation engine, webhook processing, and API
 * routes after the user's identity has been verified from their JWT.
 * NEVER import this from client components.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
