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

export const FOLLOW_UP_DELAYS = [10, 20, 60, 120] as const;
export type FollowUpDelayMinutes = typeof FOLLOW_UP_DELAYS[number];

export const FollowUpDelaySchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(60),
  z.literal(120),
]);

export const DMResponseSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'card', 'ask_follow', 'lead_form']),
  content: z.string(),
  buttonTitle: z.string().optional(),
  buttonLink: z.string().optional(),
  buttons: z.array(z.object({ id: z.string(), title: z.string(), link: z.string() })).max(3).optional(),
  cardImage: z.string().optional(),
  cardTitle: z.string().optional(),
  cardSubtitle: z.string().optional(),
  cardButtons: z.array(z.object({ id: z.string(), title: z.string(), link: z.string() })).max(3).optional(),
});

export const FlowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['trigger', 'send_dm', 'delay', 'condition', 'action', 'follow_up', 'end']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

export const FlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
});

export const FlowGraphSchema = z.object({
  version: z.literal(1).default(1),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
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
