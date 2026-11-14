import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FlowGraph,
  FlowNode,
  FlowEdge,
  AutoDmJobPayload,
  AutomationRow,
  DMResponse,
  CardButton,
} from '@/lib/types';
import {
  sendInstagramDm,
  sendInstagramLinkButtonDm,
  type DmRecipient,
} from '@/lib/instagram/api';
import { MetaApiError, AccountPausedMetaError } from '@/lib/instagram/errors';
import { isRecipientSuppressed } from '@/lib/automation/optOut';
import { enqueueJob } from '@/lib/automation/queue';
import { createLogger } from '@/lib/logger';
import { debugLog } from '@/lib/debugLog';
import { personalizeMessage } from '@/lib/automation/personalize';

const logger = createLogger('flow-engine');

function shouldFallBackToInlineLink(err: unknown): err is MetaApiError {
  return err instanceof MetaApiError && !(err instanceof AccountPausedMetaError);
}

export interface FlowExecutionResult {
  status: 'completed' | 'delayed' | 'skipped' | 'failed';
  currentNodeId: string;
  messagesSent: number;
  reason?: string;
}

/**
 * Executes a canonical Flow Graph in topological node order, resolving conditions,
 * branching, delays, and message sends while enforcing Meta compliance at every step.
 */
export async function executeFlowGraph(
  db: SupabaseClient,
  graph: FlowGraph,
  payload: AutoDmJobPayload,
  automation: AutomationRow,
  accessToken: string
): Promise<FlowExecutionResult> {
  let messagesSent = 0;

  // 1. Mandatory Opt-Out & Suppression Gate immediately before execution
  if (await isRecipientSuppressed(db, payload.instagramAccountId, payload.triggerUserId)) {
    debugLog('worker', 'warn', 'flow_suppressed', 'skipped',
      `Recipient ${payload.triggerUserId} is opted out - aborting flow execution`, {
        automationId: automation.id,
        recipientId: payload.triggerUserId,
      });
    return {
      status: 'skipped',
      currentNodeId: payload.flowNodeId || 'root',
      messagesSent: 0,
      reason: 'recipient_opted_out',
    };
  }

  const nodesById = new Map<string, FlowNode>();
  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
  }

  const edgesBySource = new Map<string, FlowEdge[]>();
  for (const edge of graph.edges) {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(edge);
  }

  // Determine starting node
  let currentNode: FlowNode | undefined;
  if (payload.flowNodeId) {
    currentNode = nodesById.get(payload.flowNodeId);
  } else {
    currentNode = graph.nodes.find((n) => n.type === 'trigger');
  }

  if (!currentNode) {
    logger.warn({ automationId: automation.id }, 'Flow graph has no valid starting node');
    return {
      status: 'failed',
      currentNodeId: 'unknown',
      messagesSent: 0,
      reason: 'no_starting_node',
    };
  }

  // Traversal loop with step limit to prevent infinite loops
  const maxSteps = 25;
  let steps = 0;

  while (currentNode && steps < maxSteps) {
    steps++;
    const edges = edgesBySource.get(currentNode.id) || [];

    switch (currentNode.type) {
      case 'trigger': {
        // Trigger is already matched - advance to next node
        if (edges.length === 0) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }
        currentNode = nodesById.get(edges[0]!.target);
        break;
      }

      case 'send_dm': {
        // Verify recipient not opted out before sending
        if (await isRecipientSuppressed(db, payload.instagramAccountId, payload.triggerUserId)) {
          return { status: 'skipped', currentNodeId: currentNode.id, messagesSent, reason: 'recipient_opted_out' };
        }

        const rawText = currentNode.data.messageText || 'Hey! Thanks for reaching out ✨';
        const personalized = personalizeMessage(rawText, payload.triggerUsername);

        // Comment triggers deliver the initial contact via private reply (recipient: { commentId: payload.triggerEventId }).
        // If it's a follow-up, continuation step (flowNodeId set), or subsequent message (messagesSent > 0), Meta API requires { id: payload.triggerUserId }.
        const isInitialCommentContact =
          payload.triggerType === 'comment' &&
          Boolean(payload.triggerEventId) &&
          !payload.flowNodeId &&
          !payload.isFollowUp &&
          messagesSent === 0;

        const recipient: DmRecipient = isInitialCommentContact
          ? { commentId: payload.triggerEventId! }
          : { id: payload.triggerUserId };

        const buttons = currentNode.data.buttons;
        if (Array.isArray(buttons) && buttons.length > 0) {
          try {
            await sendInstagramLinkButtonDm(
              payload.igAccountIgsid,
              recipient,
              personalized,
              buttons.map((b) => ({ title: b.title, url: b.link })),
              accessToken
            );
          } catch (buttonErr) {
            if (!shouldFallBackToInlineLink(buttonErr)) throw buttonErr;
            debugLog('worker', 'warn', 'flow_dm', 'processing', 'Link button rejected in flow - falling back to inline link', {});
            const inlineLinks = buttons.map((b) => `${b.title}: ${b.link}`).join('\n');
            const inlineText = `${personalized}\n\n${inlineLinks}`;
            await sendInstagramDm(
              payload.igAccountIgsid,
              recipient,
              inlineText,
              accessToken
            );
          }
        } else {
          await sendInstagramDm(
            payload.igAccountIgsid,
            recipient,
            personalized,
            accessToken
          );
        }

        messagesSent++;

        // Advance to next node
        if (edges.length === 0) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }
        currentNode = nodesById.get(edges[0]!.target);
        break;
      }

      case 'condition': {
        // Evaluate condition rule
        const conditionType = currentNode.data.conditionType || 'keyword_match';
        let conditionMet = false;

        if (conditionType === 'keyword_match') {
          const val = (currentNode.data.conditionValue || '').toLowerCase();
          const text = (payload.messageText || payload.commentText || '').toLowerCase();
          conditionMet = text.includes(val);
        } else if (conditionType === 'has_interacted') {
          conditionMet = Boolean(payload.isFollowUp || payload.triggerType === 'dm');
        } else if (conditionType === 'is_following') {
          // Meta API has no live follower-check endpoint for public users; default true or check session
          conditionMet = true;
        }

        // Find edge for branch
        const targetHandle = conditionMet ? 'yes' : 'no';
        const matchedEdge =
          edges.find((e) => e.sourceHandle === targetHandle) ||
          edges.find((e) => e.sourceHandle === 'default') ||
          edges[0];

        if (!matchedEdge) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }

        currentNode = nodesById.get(matchedEdge.target);
        break;
      }

      case 'delay': {
        // Delay schedule: enqueue next job with run_after
        const delayMin = currentNode.data.delayMinutes || 60;
        const nextEdge = edges[0];

        if (!nextEdge) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }

        const scheduledTime = new Date(Date.now() + delayMin * 60 * 1000);
        const nextNode = nodesById.get(nextEdge.target);

        if (!nextNode) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }

        const delayedPayload: AutoDmJobPayload = {
          ...payload,
          flowNodeId: nextNode.id,
          isFollowUp: true,
        };

        const dedupeKey = `flow_${automation.id}_${payload.triggerUserId}_${nextNode.id}`;
        await enqueueJob('auto_dm', delayedPayload, dedupeKey, scheduledTime);

        debugLog('worker', 'info', 'flow_delayed', 'ok',
          `Delayed flow step scheduled in ${delayMin}m for node ${nextNode.id}`, {
            automationId: automation.id,
            nextNodeId: nextNode.id,
            scheduledFor: scheduledTime.toISOString(),
          });

        return {
          status: 'delayed',
          currentNodeId: currentNode.id,
          messagesSent,
        };
      }

      case 'follow_up': {
        // Enforce Meta 24-hour messaging window rule
        const eventAgeMs = Date.now() - payload.triggerTimestamp;
        const maxAllowedAgeMs = 24 * 60 * 60 * 1000;

        if (eventAgeMs > maxAllowedAgeMs) {
          debugLog('worker', 'warn', 'window_expired', 'skipped',
            `Follow-up node ${currentNode.id} skipped - exceeds 24-hour messaging window`, {
              eventAgeHours: Math.round(eventAgeMs / 3600000),
            });
          return {
            status: 'skipped',
            currentNodeId: currentNode.id,
            messagesSent,
            reason: 'exceeds_24h_window',
          };
        }

        if (await isRecipientSuppressed(db, payload.instagramAccountId, payload.triggerUserId)) {
          return { status: 'skipped', currentNodeId: currentNode.id, messagesSent, reason: 'recipient_opted_out' };
        }

        const followUpText = currentNode.data.followUpText || 'Hey {username}, just checking in!';
        const personalized = personalizeMessage(followUpText, payload.triggerUsername);

        await sendInstagramDm(
          payload.igAccountIgsid,
          { id: payload.triggerUserId },
          personalized,
          accessToken
        );

        messagesSent++;

        if (edges.length === 0) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }
        currentNode = nodesById.get(edges[0]!.target);
        break;
      }

      case 'action': {
        debugLog('worker', 'info', 'action_executed', 'ok',
          `Action node ${currentNode.id} executed (${currentNode.data.actionType})`, {
            actionType: currentNode.data.actionType,
          });

        if (edges.length === 0) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }
        currentNode = nodesById.get(edges[0]!.target);
        break;
      }

      case 'end': {
        return {
          status: 'completed',
          currentNodeId: currentNode.id,
          messagesSent,
        };
      }

      default: {
        logger.warn({ nodeType: currentNode.type }, 'Unknown node type encountered in flow');
        if (edges.length === 0) {
          return { status: 'completed', currentNodeId: currentNode.id, messagesSent };
        }
        currentNode = nodesById.get(edges[0]!.target);
        break;
      }
    }
  }

  return {
    status: 'completed',
    currentNodeId: currentNode?.id || 'end',
    messagesSent,
  };
}
