/**
 * Instagram Business Login OAuth helpers.
 *
 * Uses instagram.com/oauth/authorize — NOT Facebook's dialog/oauth. This
 * yields an Instagram User Access Token, which is what the Instagram API
 * with Instagram Login requires for DMs and comment management.
 *
 * Hard-won facts preserved from the original build:
 *  - The code→token exchange MUST be multipart/form-data (FormData). Meta's
 *    docs use curl -F; x-www-form-urlencoded fails silently.
 *  - Short-lived token (1h) → long-lived (60d) via graph.instagram.com.
 *  - page_id does not exist under Instagram Business Login — never expect it.
 *  - A wrong client_secret surfaces as a misleading "redirect_uri not
 *    identical" error from Meta.
 */

import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import type { IgShortLivedTokenResponse, IgLongLivedTokenResponse, IgUserProfile } from '@/lib/types';

const IG_OAUTH_URL = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_LONG_LIVED_URL = 'https://graph.instagram.com/access_token';
const IG_GRAPH_BASE = 'https://graph.instagram.com';

/** Scopes required for AutoDM (Instagram Business Login permission names). */
export const REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');

// ── CSRF state JWT ──────────────────────────────────────────────────────────

function stateSecret(): Uint8Array {
  // HMAC key derived from the deployment's encryption key — one less env var
  // for self-hosters, and the state JWT is short-lived (10 minutes) anyway.
  return new TextEncoder().encode(`state:${getEnv().TOKEN_ENCRYPTION_KEY}`);
}

export async function signOAuthState(userId: string): Promise<string> {
  return new SignJWT({ userId, nonce: randomToken(8) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(stateSecret());
}

export async function verifyOAuthState(token: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, stateSecret());
  if (typeof payload['userId'] !== 'string') throw new Error('Invalid state payload');
  return { userId: payload['userId'] };
}

// ── OAuth URL + token exchange ──────────────────────────────────────────────

export function buildOAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: REQUIRED_SCOPES,
    response_type: 'code',
    state,
  });
  return `${IG_OAUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<IgShortLivedTokenResponse> {
  // Meta requires multipart/form-data for this endpoint
  const form = new FormData();
  form.append('client_id', appId);
  form.append('client_secret', appSecret);
  form.append('grant_type', 'authorization_code');
  form.append('redirect_uri', redirectUri);
  form.append('code', code);

  const res = await fetch(IG_TOKEN_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Instagram token exchange failed: ${res.status} ${body} | redirect_uri="${redirectUri}". ` +
        'If Meta says "redirect_uri not identical", double-check your App Secret — a wrong secret produces this exact misleading error.'
    );
  }
  return (await res.json()) as IgShortLivedTokenResponse;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<IgLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    access_token: shortLivedToken,
  });
  const res = await fetch(`${IG_LONG_LIVED_URL}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram long-lived token exchange failed: ${res.status} ${body}`);
  }
  return (await res.json()) as IgLongLivedTokenResponse;
}

export async function getInstagramProfile(accessToken: string): Promise<IgUserProfile> {
  const fields = 'user_id,username,name,profile_picture_url';
  const res = await fetch(`${IG_GRAPH_BASE}/me?fields=${fields}&access_token=${accessToken}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram profile fetch failed: ${res.status} ${body}`);
  }
  return (await res.json()) as IgUserProfile;
}

/** Refreshes a still-valid long-lived token for another 60 days. */
export async function refreshLongLivedToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number } | { error: 'invalid' | 'failed'; status: number; body: string }> {
  const res = await fetch(
    `${IG_GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
  );
  if (!res.ok) {
    const body = await res.text();
    return { error: res.status === 400 || res.status === 401 ? 'invalid' : 'failed', status: res.status, body };
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}
