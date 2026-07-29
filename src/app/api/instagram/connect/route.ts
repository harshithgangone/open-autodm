/**
 * GET /api/instagram/connect — build the Instagram Business Login URL.
 * Returns { url }; the frontend navigates the browser there.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { getMetaSettings } from '@/lib/settings';
import { buildOAuthUrl, signOAuthState } from '@/lib/instagram/oauth';
import { getAppUrl } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const settings = await getMetaSettings();
  if (!settings) {
    return Response.json(
      { error: 'setup_required', message: 'Complete the Setup Wizard (Meta App ID + Secret) before connecting Instagram.' },
      { status: 409 }
    );
  }

  const state = await signOAuthState(user.id);
  const redirectUri = `${getAppUrl(request)}/api/instagram/callback`;
  const url = buildOAuthUrl(settings.metaAppId, redirectUri, state);

  return Response.json({ url });
}
