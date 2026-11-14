/**
 * Automations CRUD - list + create.
 * Identity always from the verified JWT; ownership always checked in SQL.
 */

import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { DMResponseSchema, MAX_DM_RESPONSES, FlowGraphSchema } from '@/lib/api/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:automations');

const CreateAutomationSchema = z.object({
  instagramAccountId: z.string().uuid('instagramAccountId must be a UUID'),
  name: z.string().min(1, 'name is required').max(200),
  type: z.enum(['comment_dm', 'dm_reply', 'story_reply', 'reel_dm']),
  isActive: z.boolean().default(true),
  postId: z.string().nullable().optional(),
  postThumbnailUrl: z.string().nullable().optional(),
  postCaption: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  commentReplyOptions: z.array(z.string()).default([]),
  publicReplyEnabled: z.boolean().default(false),
  publicReplyMode: z.enum(['manual', 'ai_generated']).default('manual'),
  publicReplyOptions: z.array(z.string()).default([]),
  publicReplyAiInstructions: z.string().nullable().optional(),
  dmOpeningMessageEnabled: z.boolean().default(true),
  dmOpeningMessage: z.string().default(''),
  dmOpeningMessageVariations: z.array(z.string()).default([]),
  dmOpeningMessageButtonTitle: z.string().nullable().optional(),
  dmOpeningMessageButtonLink: z.string().nullable().optional(),
  askToFollowEnabled: z.boolean().default(false),
  askToFollowMessage: z.string().default(''),
  askToFollowVisitProfileButton: z.string().default('Visit Profile'),
  askToFollowConfirmButton: z.string().default("I'm following ✅"),
  dmResponses: z.array(DMResponseSchema).max(MAX_DM_RESPONSES, `Max ${MAX_DM_RESPONSES} responses per automation`).default([]),
  followUpEnabled: z.boolean().default(false),
  followUpDelayMinutes: z.union([z.literal(10), z.literal(20), z.literal(60), z.literal(120)]).default(60),
  followUpMessage: z.string().max(1000).default(''),
  followUpAiInstructions: z.string().max(500).nullable().optional(),
  aiRuntimeModeEnabled: z.boolean().default(false),
  aiRuntimeInstructions: z.string().nullable().optional(),
  aiModel: z.string().default('@cf/meta/llama-3.2-3b-instruct'),
  flowGraph: FlowGraphSchema.nullable().optional(),
  triggerConfig: z.record(z.unknown()).nullable().optional(),
}).refine((data) => {
  // If keywords are provided, ensure they don't contain empty or blank strings
  if (Array.isArray(data.keywords) && data.keywords.length > 0) {
    return data.keywords.every((k) => k.trim().length > 0);
  }
  // null or empty array represents "Any comment / Any message" trigger mode
  return true;
}, {
  message: 'Keywords cannot contain empty values',
  path: ['keywords'],
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
      comment_reply_options, public_reply_enabled, public_reply_mode, public_reply_options, public_reply_ai_instructions,
      dm_opening_message_enabled, dm_opening_message, dm_opening_message_variations,
      dm_opening_message_button_title, dm_opening_message_button_link,
      ask_to_follow_enabled, ask_to_follow_message,
      ask_to_follow_visit_profile_button, ask_to_follow_confirm_button,
      dm_responses, follow_up_enabled, follow_up_delay_minutes, follow_up_message, follow_up_ai_instructions,
      ai_runtime_mode_enabled, ai_runtime_instructions, ai_model,
      total_dms_sent, created_at, updated_at,
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

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    instagram_account_id: data.instagramAccountId,
    name: data.name,
    type: data.type,
    post_id: data.postId ?? null,
    post_thumbnail_url: data.postThumbnailUrl ?? null,
    post_caption: data.postCaption ?? null,
    keywords: data.keywords && data.keywords.length > 0 && !data.keywords.includes('*ANY*')
      ? data.keywords.map((k) => k.trim().toUpperCase()).filter(Boolean)
      : null,
    comment_reply_options: data.commentReplyOptions,
    public_reply_enabled: data.publicReplyEnabled,
    public_reply_mode: data.publicReplyMode,
    public_reply_options: data.publicReplyOptions.length > 0 ? data.publicReplyOptions : data.commentReplyOptions,
    public_reply_ai_instructions: data.publicReplyAiInstructions ?? null,
    dm_opening_message_enabled: data.dmOpeningMessageEnabled,
    dm_opening_message: data.dmOpeningMessage,
    dm_opening_message_variations: data.dmOpeningMessageVariations,
    dm_opening_message_button_title: data.dmOpeningMessageButtonTitle ?? null,
    dm_opening_message_button_link: data.dmOpeningMessageButtonLink ?? null,
    ask_to_follow_enabled: data.askToFollowEnabled,
    ask_to_follow_message: data.askToFollowMessage,
    ask_to_follow_visit_profile_button: data.askToFollowVisitProfileButton,
    ask_to_follow_confirm_button: data.askToFollowConfirmButton,
    dm_responses: data.dmResponses,
    follow_up_enabled: data.followUpEnabled,
    follow_up_delay_minutes: data.followUpDelayMinutes,
    follow_up_message: data.followUpMessage,
    follow_up_ai_instructions: data.followUpAiInstructions ?? null,
    ai_runtime_mode_enabled: data.aiRuntimeModeEnabled,
    ai_runtime_instructions: data.aiRuntimeInstructions ?? null,
    ai_model: data.aiModel,
    is_active: data.isActive,
    total_dms_sent: 0,
  };

  if (data.flowGraph) {
    insertPayload.flow_graph = data.flowGraph;
  }
  if (data.triggerConfig) {
    insertPayload.trigger_config = data.triggerConfig;
  }

  let { data: created, error } = await db
    .from('automations')
    .insert(insertPayload)
    .select('id, name, type, is_active, total_dms_sent, created_at')
    .single();

  // Backward-compatibility fallbacks if remote DB has not yet applied migration:
  if (error && (error.message?.includes('flow_graph') || error.message?.includes('trigger_config') || error.message?.includes('schema'))) {
    delete insertPayload.flow_graph;
    delete insertPayload.trigger_config;
    const res = await db.from('automations').insert(insertPayload).select('id, name, type, is_active, total_dms_sent, created_at').single();
    created = res.data;
    error = res.error;
  }
  if (error && error.message?.includes('automation_type') && insertPayload.type === 'reel_dm') {
    insertPayload.type = 'dm_reply';
    const res = await db.from('automations').insert(insertPayload).select('id, name, type, is_active, total_dms_sent, created_at').single();
    created = res.data;
    error = res.error;
  }

  if (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to create automation');
    return Response.json({ error: 'Failed to create automation' }, { status: 500 });
  }

  logger.info({ userId: user.id, automationId: created?.id, type: data.type }, 'Automation created');
  return Response.json({ automation: created }, { status: 201 });
}
