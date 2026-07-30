/**
 * Automations CRUD - list + create.
 * Identity always from the verified JWT; ownership always checked in SQL.
 */

import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { DMResponseSchema } from '@/lib/api/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:automations');

const CreateAutomationSchema = z.object({
  instagramAccountId: z.string().uuid('instagramAccountId must be a UUID'),
  name: z.string().min(1, 'name is required').max(200),
  type: z.enum(['comment_dm', 'dm_reply', 'story_reply']),
  isActive: z.boolean().default(true),
  postId: z.string().nullable().optional(),
  postThumbnailUrl: z.string().nullable().optional(),
  postCaption: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  commentReplyOptions: z.array(z.string()).default([]),
  dmOpeningMessageEnabled: z.boolean().default(true),
  dmOpeningMessage: z.string().default(''),
  dmOpeningMessageButtonTitle: z.string().nullable().optional(),
  dmOpeningMessageButtonLink: z.string().nullable().optional(),
  askToFollowEnabled: z.boolean().default(false),
  askToFollowMessage: z.string().default(''),
  askToFollowVisitProfileButton: z.string().default('Visit Profile'),
  askToFollowConfirmButton: z.string().default("I'm following ✅"),
  dmResponses: z.array(DMResponseSchema).default([]),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const db = createServiceClient();

  // Optional per-account scoping. SECURITY: verify the account belongs to
  // this user before filtering by it - never trust a client-sent id.
  const requestedAccountId = new URL(request.url).searchParams.get('accountId');
  if (requestedAccountId) {
    const { data: owned } = await db
      .from('instagram_accounts')
      .select('id')
      .eq('id', requestedAccountId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) {
      return Response.json({ error: 'Instagram account not found' }, { status: 404 });
    }
  }

  let query = db
    .from('automations')
    .select(`
      id, name, type, is_active, post_id, post_thumbnail_url, post_caption, keywords,
      comment_reply_options, dm_opening_message_enabled,
      dm_opening_message, dm_opening_message_button_title, dm_opening_message_button_link,
      ask_to_follow_enabled, ask_to_follow_message,
      ask_to_follow_visit_profile_button, ask_to_follow_confirm_button,
      dm_responses, total_dms_sent, created_at, updated_at,
      instagram_account_id,
      instagram_accounts ( id, username, profile_picture_url )
    `)
    .eq('user_id', user.id);
  if (requestedAccountId) query = query.eq('instagram_account_id', requestedAccountId);
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to fetch automations');
    return Response.json({ error: 'Failed to fetch automations' }, { status: 500 });
  }
  return Response.json({ automations: data ?? [] });
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

  const parsed = CreateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return Response.json({ error: `Validation failed - ${detail}`, details: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const db = createServiceClient();

  // Ownership: the IG account being attached must belong to this user
  const { data: igAccount, error: igError } = await db
    .from('instagram_accounts')
    .select('id')
    .eq('id', data.instagramAccountId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (igError || !igAccount) {
    return Response.json({ error: 'Instagram account not found or not yours' }, { status: 403 });
  }

  const { data: created, error } = await db
    .from('automations')
    .insert({
      user_id: user.id,
      instagram_account_id: data.instagramAccountId,
      name: data.name,
      type: data.type,
      post_id: data.postId ?? null,
      post_thumbnail_url: data.postThumbnailUrl ?? null,
      post_caption: data.postCaption ?? null,
      keywords: data.keywords ?? null,
      comment_reply_options: data.commentReplyOptions,
      dm_opening_message_enabled: data.dmOpeningMessageEnabled,
      dm_opening_message: data.dmOpeningMessage,
      dm_opening_message_button_title: data.dmOpeningMessageButtonTitle ?? null,
      dm_opening_message_button_link: data.dmOpeningMessageButtonLink ?? null,
      ask_to_follow_enabled: data.askToFollowEnabled,
      ask_to_follow_message: data.askToFollowMessage,
      ask_to_follow_visit_profile_button: data.askToFollowVisitProfileButton,
      ask_to_follow_confirm_button: data.askToFollowConfirmButton,
      dm_responses: data.dmResponses,
      is_active: data.isActive,
      total_dms_sent: 0,
    })
    .select('id, name, type, is_active, total_dms_sent, created_at')
    .single();

  if (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to create automation');
    return Response.json({ error: 'Failed to create automation' }, { status: 500 });
  }

  logger.info({ userId: user.id, automationId: created?.id, type: data.type }, 'Automation created');
  return Response.json({ automation: created }, { status: 201 });
}
