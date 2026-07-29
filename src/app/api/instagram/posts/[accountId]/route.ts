/**
 * GET /api/instagram/posts/:accountId — the creator's media grid.
 * Cursor-paginated from the Meta Graph API, with a short in-memory cache
 * (per warm serverless instance) so browsing the picker doesn't hammer Meta.
 */

import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { decrypt } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { META_API_VERSION } from '@/lib/instagram/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:posts');
const META_GRAPH_BASE = `https://graph.instagram.com/${META_API_VERSION}`;

interface MetaMediaItem {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  thumbnail_url?: string;
  media_url?: string;
  permalink: string;
  timestamp: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
}

interface MetaMediaResponse {
  data: MetaMediaItem[];
  paging?: { cursors?: { before: string; after: string }; next?: string };
}

interface PostsPage {
  posts: Array<{
    id: string;
    type: 'reel' | 'image' | 'carousel';
    thumbnail_url: string | null;
    media_url: string | null;
    permalink: string;
    timestamp: string;
    caption: string;
    like_count: number;
    comments_count: number;
  }>;
  nextCursor: string | null;
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: PostsPage; at: number }>();

type RouteContext = { params: Promise<{ accountId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const { accountId } = await context.params;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
  const after = url.searchParams.get('after');

  const db = createServiceClient();
  const { data: igAccount, error: igError } = await db
    .from('instagram_accounts')
    .select('id, instagram_user_id, access_token_encrypted')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (igError || !igAccount) {
    return Response.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  const cacheKey = `${accountId}:${limit}:${after ?? 'first'}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json({ ...hit.value, cached: true });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(igAccount.access_token_encrypted as string, getEnv().TOKEN_ENCRYPTION_KEY);
  } catch {
    logger.error({ accountId }, 'Failed to decrypt token — account needs reconnection');
    return Response.json({ error: 'Failed to access Instagram account — please reconnect' }, { status: 500 });
  }

  const fields = 'id,media_type,thumbnail_url,media_url,permalink,timestamp,caption,like_count,comments_count';
  const afterParam = after ? `&after=${encodeURIComponent(after)}` : '';
  const mediaUrl = `${META_GRAPH_BASE}/${igAccount.instagram_user_id}/media?fields=${fields}&limit=${limit}${afterParam}&access_token=${accessToken}`;

  let metaResponse: MetaMediaResponse;
  try {
    const res = await fetch(mediaUrl);
    if (!res.ok) {
      const body = await res.text();
      logger.error({ accountId, status: res.status, body: body.slice(0, 300) }, 'Meta media fetch failed');
      return Response.json({ error: 'Failed to fetch posts from Instagram' }, { status: 502 });
    }
    metaResponse = (await res.json()) as MetaMediaResponse;
  } catch (err) {
    logger.error({ err, accountId }, 'Network error fetching Instagram media');
    return Response.json({ error: 'Failed to reach Instagram API' }, { status: 502 });
  }

  const posts = (metaResponse.data ?? []).map((item) => ({
    id: item.id,
    type: (item.media_type === 'VIDEO' ? 'reel' : item.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image') as
      | 'reel'
      | 'image'
      | 'carousel',
    thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
    media_url: item.media_url ?? null,
    permalink: item.permalink,
    timestamp: item.timestamp,
    caption: item.caption ?? '',
    like_count: item.like_count ?? 0,
    comments_count: item.comments_count ?? 0,
  }));

  const hasNextPage = !!metaResponse.paging?.next;
  const pageData: PostsPage = {
    posts,
    nextCursor: hasNextPage ? metaResponse.paging?.cursors?.after ?? null : null,
  };

  cache.set(cacheKey, { value: pageData, at: Date.now() });
  // Bound the per-instance cache
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  return Response.json({ ...pageData, cached: false });
}
