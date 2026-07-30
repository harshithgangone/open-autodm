/**
 * App settings service - the self-hoster's Meta app credentials.
 *
 * Credentials are entered once through the Setup Wizard and stored in the
 * single-row app_settings table. The App Secret is AES-256-GCM encrypted with
 * TOKEN_ENCRYPTION_KEY before insert and decrypted only here, at read time.
 *
 * A short in-memory cache keeps webhook signature verification fast without
 * re-querying the DB on every event (serverless instances are reused).
 */

import { createServiceClient } from '@/lib/supabase/service';
import { decrypt, encrypt } from '@/lib/crypto';
import { getEnv } from '@/lib/env';

export interface MetaSettings {
  metaAppId: string;
  metaAppSecret: string; // decrypted - never log
  /**
   * Optional Facebook App Secret. Meta signs webhooks with the Instagram app
   * secret for IG-Login apps but the Facebook app secret for FB-Login apps -
   * verification accepts a signature matching either.
   */
  metaFbAppSecret: string | null;
  webhookVerifyToken: string;
  setupCompleted: boolean;
}

interface SettingsRow {
  meta_app_id: string | null;
  meta_app_secret_encrypted: string | null;
  meta_fb_app_secret_encrypted: string | null;
  webhook_verify_token: string | null;
  setup_completed: boolean;
}

const CACHE_TTL_MS = 60_000;
let cache: { value: MetaSettings | null; at: number } | null = null;

/** Returns decrypted Meta settings, or null if setup has not been completed. */
export async function getMetaSettings(): Promise<MetaSettings | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const db = createServiceClient();
  const { data, error } = await db
    .from('app_settings')
    .select('meta_app_id, meta_app_secret_encrypted, meta_fb_app_secret_encrypted, webhook_verify_token, setup_completed')
    .eq('id', 1)
    .maybeSingle<SettingsRow>();

  if (error || !data || !data.meta_app_id || !data.meta_app_secret_encrypted || !data.webhook_verify_token) {
    cache = { value: null, at: Date.now() };
    return null;
  }

  const env = getEnv();
  let secret: string;
  let fbSecret: string | null = null;
  try {
    secret = decrypt(data.meta_app_secret_encrypted, env.TOKEN_ENCRYPTION_KEY);
    if (data.meta_fb_app_secret_encrypted) {
      fbSecret = decrypt(data.meta_fb_app_secret_encrypted, env.TOKEN_ENCRYPTION_KEY);
    }
  } catch {
    // TOKEN_ENCRYPTION_KEY changed after setup - treat as not configured
    cache = { value: null, at: Date.now() };
    return null;
  }

  const value: MetaSettings = {
    metaAppId: data.meta_app_id,
    metaAppSecret: secret,
    metaFbAppSecret: fbSecret,
    webhookVerifyToken: data.webhook_verify_token,
    setupCompleted: data.setup_completed,
  };
  cache = { value, at: Date.now() };
  return value;
}

export async function saveMetaSettings(input: {
  metaAppId: string;
  metaAppSecret: string;
  metaFbAppSecret?: string | null;
  webhookVerifyToken: string;
}): Promise<void> {
  const env = getEnv();
  const db = createServiceClient();
  const fbSecret = input.metaFbAppSecret?.trim();
  const { error } = await db
    .from('app_settings')
    .upsert(
      {
        id: 1,
        meta_app_id: input.metaAppId.trim(),
        meta_app_secret_encrypted: encrypt(input.metaAppSecret.trim(), env.TOKEN_ENCRYPTION_KEY),
        meta_fb_app_secret_encrypted: fbSecret ? encrypt(fbSecret, env.TOKEN_ENCRYPTION_KEY) : null,
        webhook_verify_token: input.webhookVerifyToken,
        setup_completed: true,
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(`Failed to save settings: ${error.message}`);
  cache = null; // bust the cache immediately
}

/** Test-only escape hatch: clears the settings cache. */
export function invalidateSettingsCache(): void {
  cache = null;
}
