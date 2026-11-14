/**
 * AI Generation Endpoint
 *
 * Provides on-demand generation for:
 *  - 5 Opening DM variations
 *  - 5 Public comment replies
 *  - DM response draft
 *
 * Uses Cloudflare Workers AI free tier with automatic fallback.
 * Strictly requires authenticated owner session.
 */

import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import {
  generateOpeningVariations,
  generatePublicReplies,
  generateResponseDraft,
  generateFollowUpDraft,
  DEFAULT_AI_MODEL,
} from '@/lib/ai/workersAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:ai:generate');

const RequestSchema = z.object({
  action: z.enum(['opening_variations', 'public_replies', 'response_draft', 'follow_up_draft']).optional(),
  type: z.string().optional(),
  prompt: z.string().max(1000).optional().default(''),
  postCaption: z.string().max(1000).optional(),
  creatorUsername: z.string().max(100).optional(),
  automationName: z.string().max(200).optional(),
  count: z.number().int().min(1).max(10).optional().default(5),
  mode: z.enum(['custom', 'auto']).optional().default('auto'),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  let action = parsed.data.action;
  if (!action && parsed.data.type) {
    if (parsed.data.type === 'public_replies' || parsed.data.type === 'public_reply' || parsed.data.type === 'comment_reply_options') {
      action = 'public_replies';
    } else if (parsed.data.type === 'opening_variations') {
      action = 'opening_variations';
    } else if (parsed.data.type === 'response_draft') {
      action = 'response_draft';
    } else if (parsed.data.type === 'follow_up_draft') {
      action = 'follow_up_draft';
    }
  }

  if (!action) {
    return Response.json({ error: 'Validation failed: action or supported type required' }, { status: 400 });
  }

  const { prompt, postCaption, creatorUsername, automationName, count } = parsed.data;

  try {
    if (action === 'opening_variations') {
      const result = await generateOpeningVariations(prompt, count, {
        postCaption,
        creatorUsername,
        automationName,
      });

      // Best-effort usage logging
      try {
        const db = createServiceClient();
        await db.from('ai_usage_log').insert({
          user_id: user.id,
          feature: 'opening_variations',
          model: result.model,
          status: result.status,
        });
      } catch (e: unknown) {
        logger.warn({ err: e }, 'Failed to record AI usage log');
      }

      return Response.json({
        success: true,
        variations: result.data,
        status: result.status,
        model: result.model,
      });
    }

    if (action === 'public_replies') {
      const result = await generatePublicReplies(prompt, count);

      try {
        const db = createServiceClient();
        await db.from('ai_usage_log').insert({
          user_id: user.id,
          feature: 'public_reply_draft',
          model: result.model,
          status: result.status,
        });
      } catch (e: unknown) {
        logger.warn({ err: e }, 'Failed to record AI usage log');
      }

      if (result.status === 'fallback') {
        return Response.json(
          {
            success: false,
            error: 'AI generation is currently unavailable. Cloudflare Workers AI binding is not connected or quota is exceeded. Please use the predefined templates or try again later.',
            status: 'fallback',
          },
          { status: 503 }
        );
      }

      return Response.json({
        success: true,
        variations: result.data,
        options: result.data,
        status: 'success',
        model: result.model,
      });
    }

    if (action === 'response_draft') {
      const result = await generateResponseDraft(prompt, {
        postCaption,
        creatorUsername,
        automationName,
      });

      try {
        const db = createServiceClient();
        await db.from('ai_usage_log').insert({
          user_id: user.id,
          feature: 'runtime_response',
          model: result.model,
          status: result.status,
        });
      } catch (e: unknown) {
        logger.warn({ err: e }, 'Failed to record AI usage log');
      }

      return Response.json({
        success: true,
        draft: result.data,
        status: result.status,
        model: result.model,
      });
    }

    if (action === 'follow_up_draft') {
      const result = await generateFollowUpDraft(prompt, {
        automationName,
        creatorUsername,
      });

      try {
        const db = createServiceClient();
        await db.from('ai_usage_log').insert({
          user_id: user.id,
          feature: 'follow_up_draft',
          model: result.model,
          status: result.status,
        });
      } catch (e: unknown) {
        logger.warn({ err: e }, 'Failed to record AI usage log');
      }

      return Response.json({
        success: true,
        draft: result.data,
        status: result.status,
        model: result.model,
      });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err) {
    logger.error({ err }, 'Error handling AI generate request');
    return Response.json({ error: 'Failed to generate AI content' }, { status: 500 });
  }
}
