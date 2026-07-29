/**
 * Automations CRUD — update + delete a single automation.
 */

import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { DMResponseSchema } from '@/lib/api/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:automations:id');

const UpdateAutomationSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
  keywords: z.array(z.string()).nullable().optional(),
  comment_reply_options: z.array(z.string()).optional(),
  dm_opening_message_enabled: z.boolean().optional(),
  dm_opening_message: z.string().optional(),
  dm_opening_message_button_title: z.string().nullable().optional(),
  dm_opening_message_button_link: z.string().nullable().optional(),
  post_thumbnail_url: z.string().nullable().optional(),
  post_caption: z.string().nullable().optional(),
  ask_to_follow_enabled: z.boolean().optional(),
  ask_to_follow_message: z.string().optional(),
  ask_to_follow_visit_profile_button: z.string().optional(),
  ask_to_follow_confirm_button: z.string().optional(),
  dm_responses: z.array(DMResponseSchema).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return Response.json({ error: `Validation failed — ${detail}`, details: parsed.error.issues }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: existing, error: fetchError } = await db
    .from('automations')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (fetchError || !existing) {
    return Response.json({ error: 'Automation not found' }, { status: 404 });
  }

  const { data: updated, error: updateError } = await db
    .from('automations')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, type, is_active, total_dms_sent, updated_at')
    .single();

  if (updateError) {
    logger.error({ err: updateError, automationId: id }, 'Failed to update automation');
    return Response.json({ error: 'Failed to update automation' }, { status: 500 });
  }
  return Response.json({ automation: updated });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const db = createServiceClient();

  const { data: existing, error: fetchError } = await db
    .from('automations')
    .select('id, user_id, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (fetchError || !existing) {
    return Response.json({ error: 'Automation not found' }, { status: 404 });
  }

  const { error: deleteError } = await db.from('automations').delete().eq('id', id).eq('user_id', user.id);
  if (deleteError) {
    logger.error({ err: deleteError, automationId: id }, 'Failed to delete automation');
    return Response.json({ error: 'Failed to delete automation' }, { status: 500 });
  }

  logger.info({ userId: user.id, automationId: id }, 'Automation deleted');
  return Response.json({ success: true });
}
