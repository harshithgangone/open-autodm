/**
 * Shared Zod schemas + helpers used across API routes.
 * (Route files may only export HTTP handlers - shared pieces live here.)
 */

import { z } from 'zod';

/**
 * Max responses per automation flow. Every response is its own Meta API send;
 * a long burst to one person both eats the hourly send budget and looks like
 * bot behavior to Instagram's spam heuristics. 5 is in line with what
 * commercial automation tools deliver per flow.
 */
export const MAX_DM_RESPONSES = 5;

export const DMResponseSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'card', 'ask_follow', 'lead_form']),
  content: z.string(),
  buttonTitle: z.string().optional(),
  buttonLink: z.string().optional(),
  cardImage: z.string().optional(),
  cardTitle: z.string().optional(),
  cardSubtitle: z.string().optional(),
  cardButtons: z.array(z.object({ id: z.string(), title: z.string(), link: z.string() })).optional(),
});

export type TokenStatus = 'ok' | 'expiring' | 'expired';

const EXPIRY_WARNING_DAYS = 10;

export function computeTokenStatus(expiresAt: string | null): { status: TokenStatus; daysRemaining: number | null } {
  if (!expiresAt) return { status: 'ok', daysRemaining: null };
  const msRemaining = new Date(expiresAt).getTime() - Date.now();
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  if (daysRemaining <= 0) return { status: 'expired', daysRemaining: 0 };
  if (daysRemaining <= EXPIRY_WARNING_DAYS) return { status: 'expiring', daysRemaining };
  return { status: 'ok', daysRemaining };
}
