/**
 * Setup Wizard API.
 *
 * GET  → current setup status + the exact values to paste into the Meta portal
 *        (webhook URL, verify token, OAuth redirect URI, pg_cron snippet).
 * POST → save Meta App ID + App Secret (secret is AES-256-GCM encrypted
 *        before it touches the DB). Generates a webhook verify token on
 *        first save and PRESERVES it on later saves so Meta's existing
 *        webhook subscription keeps validating.
 */

import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getMetaSettings, isEnvironmentOwner, isInstallationOwner, saveMetaSettings } from '@/lib/settings';
import { randomToken } from '@/lib/crypto';
import { getAppUrl, getEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SaveSetupSchema = z.object({
  metaAppId: z.string().regex(/^\d{5,25}$/, 'Meta App ID must be numeric'),
  metaAppSecret: z.string().regex(/^[0-9a-f]{32}$/i, 'Meta App Secret must be 32 hex characters'),
  // Optional: some Meta apps sign webhooks with the Facebook app secret.
  metaFbAppSecret: z
    .string()
    .regex(/^[0-9a-f]{32}$/i, 'Facebook App Secret must be 32 hex characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

function cronSnippet(appUrl: string): string {
  return `-- Run this ONCE in your Supabase project's SQL Editor.
-- It makes Supabase call your deployment every minute to process
-- queued/delayed DM jobs and auto-refresh Instagram tokens.
-- Existing installations that already have pg_net in public need the
-- dedicated guarded move_pg_net_to_extensions migration before this is used.
create extension if not exists pg_cron;
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'open-autodm-process-jobs',
  '* * * * *',
  $$
  select net.http_post(
    url := '${appUrl}/api/cron/process-jobs',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);`;
}

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  // Read owner metadata before returning the webhook verify token or other
  // setup details. Fail closed if the database lookup itself fails.
  const db = createServiceClient();
  const { data: row, error } = await db
    .from('app_settings')
    .select('meta_app_id, webhook_verify_token, setup_completed, owner_user_id')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return Response.json({ error: 'Unable to verify installation ownership' }, { status: 500 });
  }
  const recordedOwnerId = (row?.owner_user_id as string | null) ?? null;
  const envOwner = isEnvironmentOwner(user);
  // The ownerless fallback is only for a genuinely fresh setup. Do not let an
  // arbitrary authenticated user claim a legacy installation that is already
  // configured but never recorded an owner; that requires explicit env-owner
  // configuration first.
  if (
    (Boolean(row?.setup_completed) && !recordedOwnerId && !envOwner) ||
    !isInstallationOwner(user, recordedOwnerId)
  ) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = await getMetaSettings();
  const appUrl = getAppUrl(request);

  return Response.json({
    configured: !!settings,
    metaAppId: (row?.meta_app_id as string | null) ?? null,
    webhookVerifyToken: (row?.webhook_verify_token as string | null) ?? null,
    webhookUrl: `${appUrl}/api/webhook`,
    oauthRedirectUri: `${appUrl}/api/instagram/callback`,
    appUrl,
    cronSnippet: cronSnippet(appUrl),
  });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SaveSetupSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return Response.json({ error: `Validation failed - ${detail}` }, { status: 400 });
  }

  try {
    // Ensure env is valid before accepting credentials (fail loudly, but with
    // the actual list of missing vars so the self-hoster can fix it).
    getEnv();

    // Preserve the existing verify token if one was generated before -
    // regenerating it would silently break the webhook registered in Meta.
    const db = createServiceClient();
    const { data: existing, error: lookupError } = await db
      .from('app_settings')
      .select('webhook_verify_token, owner_user_id, setup_completed')
      .eq('id', 1)
      .maybeSingle();

    if (lookupError) {
      return Response.json({ error: 'Unable to verify installation ownership' }, { status: 500 });
    }
    const recordedOwnerId = (existing?.owner_user_id as string | null) ?? null;
    const envOwner = isEnvironmentOwner(user);
    if (
      (Boolean(existing?.setup_completed) && !recordedOwnerId && !envOwner) ||
      !isInstallationOwner(user, recordedOwnerId)
    ) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const verifyToken = (existing?.webhook_verify_token as string | null) ?? randomToken(16);

    // Atomically claim an unowned installation on first setup; if another
    // user won that race, saveMetaSettings returns success=false.
    const saved = await saveMetaSettings({
      metaAppId: parsed.data.metaAppId,
      metaAppSecret: parsed.data.metaAppSecret,
      metaFbAppSecret: parsed.data.metaFbAppSecret ?? null,
      webhookVerifyToken: verifyToken,
      ownerUserId: user.id,
      isEnvOwner: envOwner,
    });
    if (!saved.success) {
      return Response.json(
        { error: 'Installation ownership changed or setup row is missing; reload and retry as the owner.' },
        { status: 409 }
      );
    }

    const appUrl = getAppUrl(request);
    return Response.json({
      success: true,
      webhookVerifyToken: verifyToken,
      webhookUrl: `${appUrl}/api/webhook`,
      oauthRedirectUri: `${appUrl}/api/instagram/callback`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The single most common self-hosting mistake: migrations not applied yet.
    if (/app_settings/i.test(message) && /(find|exist|schema)/i.test(message)) {
      return Response.json(
        {
          error:
            'Database schema is missing - the migrations have not been applied to your Supabase project. ' +
            'Run: supabase link --project-ref <your-ref> && supabase db push, then try again.',
        },
        { status: 500 }
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
