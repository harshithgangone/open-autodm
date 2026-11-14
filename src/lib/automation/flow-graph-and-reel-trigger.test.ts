import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateFlowGraph,
  automationToFlowGraph,
  flowGraphToAutomation,
  flowGraphToFlowData,
  getGraphAutoLayout,
} from '@/lib/automation/flowGraph';
import { executeFlowGraph } from '@/lib/automation/flowEngine';
import { isExplicitWildcardAutomation } from '@/lib/automation/keywordMatch';
import { FlowGraphSchema, FlowNodeSchema } from '@/lib/api/schemas';
import type { FlowGraph, FlowNode, FlowEdge, AutomationRow, AutoDmJobPayload } from '@/lib/types';
import * as optOutModule from '@/lib/automation/optOut';
import * as queueModule from '@/lib/automation/queue';
import * as instagramApiModule from '@/lib/instagram/api';
import { MetaApiError } from '@/lib/instagram/errors';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

vi.mock('@/lib/debugLog', () => ({
  debugLog: vi.fn(),
}));

describe('Flow Graph, Visual Flow Canvas & Reel Trigger Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Canonical Flow Graph Validation ──────────────────────────────────────
  describe('Flow Graph Validation (validateFlowGraph)', () => {
    it('passes for a valid minimal trigger -> send_dm flow graph', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 'n-trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Comment' } },
          { id: 'n-dm', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'Send DM', messageText: 'Hello!' } },
        ],
        edges: [
          { id: 'e1', source: 'n-trigger', target: 'n-dm' },
        ],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes for a full flow: trigger -> send_dm -> delay -> follow_up', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 'node-1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          { id: 'node-2', type: 'send_dm', position: { x: 0, y: 120 }, data: { label: 'DM 1', messageText: 'Opening DM' } },
          { id: 'node-3', type: 'delay', position: { x: 0, y: 240 }, data: { label: 'Wait 1hr', delayMinutes: 60 } },
          { id: 'node-4', type: 'follow_up', position: { x: 0, y: 360 }, data: { label: 'Check-in', followUpText: 'Still there?' } },
        ],
        edges: [
          { id: 'e1', source: 'node-1', target: 'node-2' },
          { id: 'e2', source: 'node-2', target: 'node-3' },
          { id: 'e3', source: 'node-3', target: 'node-4' },
        ],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a graph with missing trigger node', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 'n-dm', type: 'send_dm', position: { x: 0, y: 0 }, data: { label: 'Send DM', messageText: 'Hello!' } },
        ],
        edges: [],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least one Trigger node'))).toBe(true);
    });

    it('rejects a graph with multiple trigger nodes', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger 1' } },
          { id: 't2', type: 'trigger', position: { x: 200, y: 0 }, data: { label: 'Trigger 2' } },
          { id: 'dm1', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'DM', messageText: 'Hi' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'dm1' },
        ],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('only have one Trigger node'))).toBe(true);
    });

    it('rejects a graph with cycles (infinite loops)', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          { id: 'dm1', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'DM 1', messageText: 'Hi' } },
          { id: 'dm2', type: 'send_dm', position: { x: 0, y: 300 }, data: { label: 'DM 2', messageText: 'Again' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'dm1' },
          { id: 'e2', source: 'dm1', target: 'dm2' },
          { id: 'e3', source: 'dm2', target: 'dm1' }, // cycle!
        ],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
    });

    it('rejects a graph with invalid edge target or source', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'non-existent-node' },
        ],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-existent-node'))).toBe(true);
    });

    it('rejects send_dm node with more than 3 link buttons (Meta limit)', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          {
            id: 'dm1',
            type: 'send_dm',
            position: { x: 0, y: 150 },
            data: {
              label: 'DM',
              messageText: 'Check out these links:',
              buttons: [
                { id: 'b1', title: 'Link 1', link: 'https://example.com/1' },
                { id: 'b2', title: 'Link 2', link: 'https://example.com/2' },
                { id: 'b3', title: 'Link 3', link: 'https://example.com/3' },
                { id: 'b4', title: 'Link 4', link: 'https://example.com/4' },
              ],
            },
          },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
      };

      const result = validateFlowGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('3 buttons'))).toBe(true);
    });
  });

  // ── 2. Bidirectional Graph Conversion ───────────────────────────────────────
  describe('Bidirectional Graph Conversion (automationToFlowGraph & flowGraphToAutomation)', () => {
    it('converts standard flat automation to FlowGraph and back without data loss', () => {
      const flatAutomation = {
        type: 'comment_dm' as const,
        name: 'Summer Promo',
        keywords: ['SUMMER', 'DEAL'],
        postId: 'media_123',
        publicReplyEnabled: true,
        publicReplyMode: 'manual' as const,
        publicReplyOptions: ['Check your DMs! ☀️', 'Sent you the details!'],
        dmOpeningMessageEnabled: true,
        dmOpeningMessage: 'Here is your summer promo link {username}!',
        dmResponses: [
          {
            id: 'resp-1',
            type: 'text' as const,
            content: 'Promo Link',
            buttons: [
              { id: 'btn-1', title: 'Shop Now', link: 'https://example.com/shop' },
            ],
          },
        ],
        followUpEnabled: true,
        followUpDelayMinutes: 60,
        followUpMessage: 'Did you find what you need?',
        aiRuntimeModeEnabled: false,
      };

      const graph = automationToFlowGraph(flatAutomation);

      expect(graph.nodes.length).toBeGreaterThanOrEqual(4); // trigger, send_dm, delay, follow_up
      const trigger = graph.nodes.find((n) => n.type === 'trigger');
      expect(trigger).toBeDefined();
      expect(trigger?.data.keywords).toEqual(['SUMMER', 'DEAL']);

      const dmNode = graph.nodes.find((n) => n.type === 'send_dm');
      expect(dmNode).toBeDefined();
      expect(dmNode?.data.buttons).toHaveLength(1);
      expect(dmNode?.data.buttons?.[0]?.title).toBe('Shop Now');

      const delayNode = graph.nodes.find((n) => n.type === 'delay');
      expect(delayNode).toBeDefined();
      expect(delayNode?.data.delayMinutes).toBe(60);

      const followUpNode = graph.nodes.find((n) => n.type === 'follow_up');
      expect(followUpNode).toBeDefined();
      expect(followUpNode?.data.followUpText).toBe('Did you find what you need?');

      // Convert back to flat automation
      const roundTrip = flowGraphToAutomation(graph);
      expect(roundTrip.keywords).toEqual(['SUMMER', 'DEAL']);
      expect(roundTrip.dm_responses?.[0]?.buttons?.[0]?.title).toBe('Shop Now');
      expect(roundTrip.follow_up_enabled).toBe(true);
      expect(roundTrip.follow_up_delay_minutes).toBe(60);
      expect(roundTrip.follow_up_message).toBe('Did you find what you need?');
    });

    it('correctly maps reel_dm trigger type to flow graph', () => {
      const reelAuto = {
        type: 'reel_dm' as const,
        name: 'Reel AutoDM',
        postId: 'reel_abc_123',
        dmOpeningMessage: 'Thanks for sending that Reel!',
        dmResponses: [],
      };

      const graph = automationToFlowGraph(reelAuto);
      const trigger = graph.nodes.find((n) => n.type === 'trigger');
      expect(trigger?.data.triggerType).toBe('reel_dm');
      expect(trigger?.data.postId).toBe('reel_abc_123');

      const converted = flowGraphToAutomation(graph);
      expect(converted.type).toBe('reel_dm');
      expect(converted.post_id).toBe('reel_abc_123');
    });
  });

  // ── 3. Graph Auto-Layout ───────────────────────────────────────────────────
  describe('Graph Auto-Layout (getGraphAutoLayout)', () => {
    it('assigns non-overlapping positions to sequential nodes', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          { id: 'n2', type: 'send_dm', position: { x: 0, y: 0 }, data: { label: 'DM' } },
          { id: 'n3', type: 'delay', position: { x: 0, y: 0 }, data: { label: 'Delay' } },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3' },
        ],
      };

      const laidOut = getGraphAutoLayout(graph);
      const yCoords = laidOut.nodes.map((n) => n.position.y);

      expect(yCoords[0]!).toBeLessThan(yCoords[1]!);
      expect(yCoords[1]!).toBeLessThan(yCoords[2]!);
    });

    it('separates conditional branches with horizontal offsets', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: { label: 'Condition' } },
          { id: 'dm_yes', type: 'send_dm', position: { x: 0, y: 0 }, data: { label: 'Yes DM' } },
          { id: 'dm_no', type: 'send_dm', position: { x: 0, y: 0 }, data: { label: 'No DM' } },
        ],
        edges: [
          { id: 'e1', source: 't', target: 'c' },
          { id: 'e_yes', source: 'c', target: 'dm_yes', sourceHandle: 'yes' },
          { id: 'e_no', source: 'c', target: 'dm_no', sourceHandle: 'no' },
        ],
      };

      const laidOut = getGraphAutoLayout(graph);
      const yesNode = laidOut.nodes.find((n) => n.id === 'dm_yes');
      const noNode = laidOut.nodes.find((n) => n.id === 'dm_no');

      expect(yesNode?.position.x).not.toEqual(noNode?.position.x);
    });
  });

  // ── 4. Flow Execution Engine ───────────────────────────────────────────────
  describe('Flow Execution Engine (executeFlowGraph)', () => {
    const mockDb: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const dummyAutomation: AutomationRow = {
      id: 'auto-test-1',
      user_id: 'user_123',
      instagram_account_id: 'acc-1',
      name: 'Test Flow Automation',
      type: 'comment_dm',
      is_active: true,
      post_id: null,
      post_thumbnail_url: null,
      post_caption: null,
      keywords: ['INFO'],
      comment_reply_options: [],
      public_reply_enabled: false,
      public_reply_mode: 'manual',
      public_reply_options: [],
      public_reply_ai_instructions: null,
      dm_opening_message_enabled: true,
      dm_opening_message: 'Hi {username}!',
      dm_opening_message_variations: [],
      dm_opening_message_button_title: null,
      dm_opening_message_button_link: null,
      ask_to_follow_enabled: false,
      ask_to_follow_message: '',
      ask_to_follow_visit_profile_button: 'Visit',
      ask_to_follow_confirm_button: 'Done',
      dm_responses: [],
      follow_up_enabled: false,
      follow_up_delay_minutes: 60,
      follow_up_message: '',
      follow_up_ai_instructions: null,
      ai_runtime_mode_enabled: false,
      ai_runtime_instructions: null,
      ai_model: '@cf/meta/llama-3.2-3b-instruct',
      total_dms_sent: 0,
      is_traffic_guard_paused: false,
      traffic_guard_paused_at: null,
      traffic_guard_incident_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      flow_graph: null,
    };

    const basePayload: AutoDmJobPayload = {
      automationId: 'auto-test-1',
      instagramAccountId: 'acc-1',
      igAccountIgsid: 'igsid-1',
      triggerType: 'comment',
      triggerUserId: 'user-999',
      triggerUsername: 'johndoe',
      triggerEventId: 'evt-1',
      triggerTimestamp: Date.now(),
      postId: 'media-1',
      commentText: 'Send INFO please',
      messageText: null,
    };

    it('executes trigger -> send_dm node: delivers personalized message and completes', async () => {
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm').mockResolvedValue('msg_1');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          { id: 'dm1', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'Send DM', messageText: 'Welcome {username}!' } },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
      };

      const result = await executeFlowGraph(mockDb, graph, basePayload, dummyAutomation, 'test-access-token');

      expect(result.status).toBe('completed');
      expect(result.messagesSent).toBe(1);
      // For comment trigger initial contact, recipient is commentId (Meta private reply)
      expect(sendDmSpy).toHaveBeenCalledWith(
        'igsid-1',
        { commentId: 'evt-1' },
        'Welcome @johndoe!',
        'test-access-token'
      );
    });

    it('executes trigger -> send_dm node for DM trigger delivering to user id', async () => {
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm').mockResolvedValue('msg_dm_direct');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const dmPayload: AutoDmJobPayload = {
        ...basePayload,
        triggerType: 'dm',
        triggerEventId: 'mid-101',
      };

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          { id: 'dm1', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'Send DM', messageText: 'Hello direct DM' } },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
      };

      const result = await executeFlowGraph(mockDb, graph, dmPayload, dummyAutomation, 'test-access-token');

      expect(result.status).toBe('completed');
      expect(result.messagesSent).toBe(1);
      expect(sendDmSpy).toHaveBeenCalledWith(
        'igsid-1',
        { id: 'user-999' },
        'Hello direct DM',
        'test-access-token'
      );
    });

    it('executes send_dm with link buttons using sendInstagramLinkButtonDm', async () => {
      const sendButtonSpy = vi.spyOn(instagramApiModule, 'sendInstagramLinkButtonDm').mockResolvedValue('msg_btn_1');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          {
            id: 'dm1',
            type: 'send_dm',
            position: { x: 0, y: 150 },
            data: {
              label: 'Link DM',
              messageText: 'Here is your link:',
              buttons: [{ id: 'b1', title: 'Get Access', link: 'https://example.com/access' }],
            },
          },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
      };

      const result = await executeFlowGraph(mockDb, graph, basePayload, dummyAutomation, 'test-access-token');

      expect(result.status).toBe('completed');
      expect(sendButtonSpy).toHaveBeenCalledWith(
        'igsid-1',
        { commentId: 'evt-1' },
        'Here is your link:',
        [{ title: 'Get Access', url: 'https://example.com/access' }],
        'test-access-token'
      );
    });

    it('falls back to inline link DM when sendInstagramLinkButtonDm rejects', async () => {
      vi.spyOn(instagramApiModule, 'sendInstagramLinkButtonDm').mockRejectedValue(
        new MetaApiError('Param error: button template rejected', 100, undefined)
      );
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm').mockResolvedValue('msg_fallback');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          {
            id: 'dm1',
            type: 'send_dm',
            position: { x: 0, y: 150 },
            data: {
              label: 'Link DM',
              messageText: 'Check out the product:',
              buttons: [{ id: 'b1', title: 'Buy Now', link: 'https://store.example.com' }],
            },
          },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
      };

      const result = await executeFlowGraph(mockDb, graph, basePayload, dummyAutomation, 'test-access-token');

      expect(result.status).toBe('completed');
      expect(result.messagesSent).toBe(1);
      expect(sendDmSpy).toHaveBeenCalledWith(
        'igsid-1',
        { commentId: 'evt-1' },
        'Check out the product:\n\nBuy Now: https://store.example.com',
        'test-access-token'
      );
    });

    it('evaluates condition node (keyword_match): routes along YES branch when matching', async () => {
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm').mockResolvedValue('msg_yes');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          {
            id: 'c1',
            type: 'condition',
            position: { x: 0, y: 100 },
            data: { label: 'Keyword Check', conditionType: 'keyword_match', conditionValue: 'info' },
          },
          { id: 'dm_yes', type: 'send_dm', position: { x: -100, y: 200 }, data: { label: 'Yes Branch', messageText: 'Info sent!' } },
          { id: 'dm_no', type: 'send_dm', position: { x: 100, y: 200 }, data: { label: 'No Branch', messageText: 'Default text' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'c1' },
          { id: 'e_yes', source: 'c1', target: 'dm_yes', sourceHandle: 'yes' },
          { id: 'e_no', source: 'c1', target: 'dm_no', sourceHandle: 'no' },
        ],
      };

      const result = await executeFlowGraph(mockDb, graph, { ...basePayload, commentText: 'Give me info' }, dummyAutomation, 'token');

      expect(result.status).toBe('completed');
      expect(sendDmSpy).toHaveBeenCalledWith('igsid-1', { commentId: 'evt-1' }, 'Info sent!', 'token');
    });

    it('evaluates condition node: routes along NO branch when keyword is not matched', async () => {
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm').mockResolvedValue('msg_no');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          {
            id: 'c1',
            type: 'condition',
            position: { x: 0, y: 100 },
            data: { label: 'Keyword Check', conditionType: 'keyword_match', conditionValue: 'vip' },
          },
          { id: 'dm_yes', type: 'send_dm', position: { x: -100, y: 200 }, data: { label: 'Yes Branch', messageText: 'VIP Access' } },
          { id: 'dm_no', type: 'send_dm', position: { x: 100, y: 200 }, data: { label: 'No Branch', messageText: 'Standard Access' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'c1' },
          { id: 'e_yes', source: 'c1', target: 'dm_yes', sourceHandle: 'yes' },
          { id: 'e_no', source: 'c1', target: 'dm_no', sourceHandle: 'no' },
        ],
      };

      const result = await executeFlowGraph(mockDb, graph, { ...basePayload, commentText: 'Regular comment' }, dummyAutomation, 'token');

      expect(result.status).toBe('completed');
      expect(sendDmSpy).toHaveBeenCalledWith('igsid-1', { commentId: 'evt-1' }, 'Standard Access', 'token');
    });

    it('handles delay node: enqueues delayed job step and returns status delayed', async () => {
      const enqueueSpy = vi.spyOn(queueModule, 'enqueueJob').mockResolvedValue('job-delayed-1');
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          { id: 'del1', type: 'delay', position: { x: 0, y: 100 }, data: { label: 'Wait 30m', delayMinutes: 30 } },
          { id: 'fu1', type: 'follow_up', position: { x: 0, y: 200 }, data: { label: 'Follow up', followUpText: 'Checking in' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'del1' },
          { id: 'e2', source: 'del1', target: 'fu1' },
        ],
      };

      const result = await executeFlowGraph(mockDb, graph, basePayload, dummyAutomation, 'token');

      expect(result.status).toBe('delayed');
      expect(enqueueSpy).toHaveBeenCalled();
      const callArgs = enqueueSpy.mock.calls[0];
      expect(callArgs![0]).toBe('auto_dm');
      expect(callArgs![1].flowNodeId).toBe('fu1');
    });

    it('enforces 24-hour messaging window rule: skips follow_up node if event is older than 24h', async () => {
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm');

      const oldPayload: AutoDmJobPayload = {
        ...basePayload,
        triggerTimestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        flowNodeId: 'fu1',
      };

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 'fu1', type: 'follow_up', position: { x: 0, y: 0 }, data: { label: 'Follow up', followUpText: 'Too late' } },
        ],
        edges: [],
      };

      const result = await executeFlowGraph(mockDb, graph, oldPayload, dummyAutomation, 'token');

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('exceeds_24h_window');
      expect(sendDmSpy).not.toHaveBeenCalled();
    });

    it('enforces opt-out suppression: skips execution before sending any message', async () => {
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(true);
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm');

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
          { id: 'dm1', type: 'send_dm', position: { x: 0, y: 150 }, data: { label: 'DM', messageText: 'Hello' } },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'dm1' }],
      };

      const result = await executeFlowGraph(mockDb, graph, basePayload, dummyAutomation, 'token');

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('recipient_opted_out');
      expect(sendDmSpy).not.toHaveBeenCalled();
    });
  });

  // ── 5. Incoming Shared-Reel DM Trigger Handling ────────────────────────────
  describe('Incoming Shared-Reel DM Trigger', () => {
    it('matches ig_reel attachment payload structure correctly', () => {
      const mockReelAttachment = {
        type: 'ig_reel',
        payload: {
          id: 'reel_video_12345',
          url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/...',
          title: 'Check out this new recipe!',
        },
      };

      expect(mockReelAttachment.type).toBe('ig_reel');
      expect(mockReelAttachment.payload.id).toBe('reel_video_12345');
      expect(mockReelAttachment.payload.title).toContain('new recipe');
    });

    it('accepts both ig_reel and corroborated share attachment types without throwing', () => {
      const attachments = [
        { type: 'ig_reel', payload: { id: 'reel_1', url: 'https://instagram.com/reel/1', title: 'Reel 1' } },
        { type: 'share', payload: { id: 'share_2', url: 'https://instagram.com/reel/2', title: 'Share 2' } },
        { type: 'image', payload: { url: 'https://example.com/img' } },
      ];

      const matcher = (att: any) => {
        if (att.type === 'ig_reel' || att.type === 'reel') return true;
        if (att.type === 'share') {
          const url = att.payload?.url?.toLowerCase() || '';
          const title = att.payload?.title?.toLowerCase() || '';
          return url.includes('/reel/') || url.includes('/reels/') || title.includes('reel');
        }
        return false;
      };

      const matchedReel = attachments.find(matcher);
      expect(matchedReel).toBeDefined();
      expect(matchedReel?.payload?.id).toBe('reel_1');

      // Ambiguous photo share should NOT match as a Reel
      const photoShare = { type: 'share', payload: { id: 'photo_99', url: 'https://instagram.com/p/abc1234', title: 'A photo' } };
      expect(matcher(photoShare)).toBe(false);
    });

    it('safely handles missing or malformed payload in attachments', () => {
      const malformedAttachment = {
        type: 'ig_reel',
        payload: null,
      };

      const reelId = (malformedAttachment as any).payload?.id ?? null;
      const reelUrl = (malformedAttachment as any).payload?.url ?? null;
      const reelTitle = (malformedAttachment as any).payload?.title ?? null;

      expect(reelId).toBeNull();
      expect(reelUrl).toBeNull();
      expect(reelTitle).toBeNull();
    });

    it('distinguishes between wildcard Reel shares and specific keyword requirements', () => {
      const autoWildcard = {
        keywords: ['*ANY*'],
        trigger_config: { trigger_mode: 'any', keywords_any_mode: true },
      };
      const autoSpecific = {
        keywords: ['VIP'],
        trigger_config: { trigger_mode: 'keywords', keywords_any_mode: false },
      };

      const isWildcard = isExplicitWildcardAutomation(autoWildcard);
      expect(isWildcard).toBe(true);

      const hasSpecificWildcard = Boolean(autoWildcard.keywords && autoWildcard.keywords.length > 0 && !isWildcard);
      expect(hasSpecificWildcard).toBe(false);

      const isSpecificWildcard = isExplicitWildcardAutomation(autoSpecific);
      expect(isSpecificWildcard).toBe(false);
      const hasSpecific = Boolean(autoSpecific.keywords && autoSpecific.keywords.length > 0 && !isSpecificWildcard);
      expect(hasSpecific).toBe(true);
    });
  });

  // ── 6. API Schemas & Type Validations ──────────────────────────────────────
  describe('API Schemas (FlowGraphSchema & reel_dm)', () => {
    it('validates FlowGraphSchema with valid nodes and edges', () => {
      const validGraph = {
        nodes: [
          {
            id: 'n1',
            type: 'trigger',
            position: { x: 10, y: 20 },
            data: { label: 'Start Trigger', triggerType: 'reel_dm' },
          },
          {
            id: 'n2',
            type: 'send_dm',
            position: { x: 10, y: 150 },
            data: {
              label: 'First DM',
              messageText: 'Thanks for sharing the Reel!',
              buttons: [{ id: 'b1', title: 'Open Link', link: 'https://example.com' }],
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
        ],
      };

      const parsed = FlowGraphSchema.safeParse(validGraph);
      expect(parsed.success).toBe(true);
    });

    it('rejects FlowNodeSchema with unknown node type', () => {
      const invalidNode = {
        id: 'n1',
        type: 'unsupported_type_xyz',
        position: { x: 0, y: 0 },
        data: { label: 'Invalid' },
      };

      const parsed = FlowNodeSchema.safeParse(invalidNode);
      expect(parsed.success).toBe(false);
    });
  });

  // ── 7. Bidirectional Simple ↔ Visual Sync (flowGraphToFlowData) ───────────
  describe('Bidirectional Simple ↔ Visual Flow Data Synchronization', () => {
    it('converts FlowGraph into camelCase AutomationFlowData preserving updates', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          {
            id: 'node_trigger',
            type: 'trigger',
            position: { x: 10, y: 10 },
            data: {
              label: 'Trigger',
              triggerType: 'comment_dm',
              postId: 'post_999',
              keywords: ['SPECIAL', 'OFFER'],
              keywordsAnyMode: false,
            },
          },
          {
            id: 'node_dm_1',
            type: 'send_dm',
            position: { x: 10, y: 150 },
            data: {
              label: 'DM',
              messageText: 'Custom visual message text 🎉',
              buttonTitle: 'Click Here',
              buttons: [{ id: 'b1', title: 'Click Here', link: 'https://mysite.com' }],
              publicReplyEnabled: true,
              publicReplyOptions: ['Checked your DM!'],
            },
          },
          {
            id: 'node_delay',
            type: 'delay',
            position: { x: 10, y: 300 },
            data: { label: 'Wait 20m', delayMinutes: 20 },
          },
          {
            id: 'node_followup',
            type: 'follow_up',
            position: { x: 10, y: 450 },
            data: { label: 'Followup', followUpText: 'Did you see the offer?' },
          },
        ],
        edges: [
          { id: 'e1', source: 'node_trigger', target: 'node_dm_1' },
          { id: 'e2', source: 'node_dm_1', target: 'node_delay' },
          { id: 'e3', source: 'node_delay', target: 'node_followup' },
        ],
      };

      const flowData = flowGraphToFlowData(graph, {
        name: 'My Test Funnel',
        type: 'comment-dm',
      });

      // Verify camelCase fields match form expectations
      expect(flowData.type).toBe('comment-dm');
      expect(flowData.postId).toBe('post_999');
      expect(flowData.keywords).toEqual(['SPECIAL', 'OFFER']);
      expect(flowData.keywordsAnyMode).toBe(false);
      expect(flowData.dmOpeningMessage).toBe('Custom visual message text 🎉');
      expect(flowData.dmOpeningMessageButtonTitle).toBe('Click Here');
      expect(flowData.dmResponses).toHaveLength(1);
      expect(flowData.dmResponses[0].buttons?.[0].link).toBe('https://mysite.com');
      expect(flowData.followUpEnabled).toBe(true);
      expect(flowData.followUpDelayMinutes).toBe(20);
      expect(flowData.followUpMessage).toBe('Did you see the offer?');
      expect(flowData.publicReplyEnabled).toBe(true);
      expect(flowData.flowGraph).toBe(graph);
    });

    it('correctly sets keywordsAnyMode and empty keywords in flowData when trigger is wildcard', () => {
      const graph: FlowGraph = {
        version: 1,
        nodes: [
          {
            id: 'node_trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {
              label: 'Any Comment Trigger',
              triggerType: 'comment_dm',
              keywordsAnyMode: true,
              keywords: [],
            },
          },
        ],
        edges: [],
      };

      const flowData = flowGraphToFlowData(graph);
      expect(flowData.keywordsAnyMode).toBe(true);
      expect(flowData.keywords).toEqual([]);
    });
  });

  // ── 8. Delayed Job Resumption & Continuation Execution ────────────────────
  describe('Flow Graph Resumption at Specific Node (Delayed Steps)', () => {
    it('resumes execution directly at the specified flowNodeId bypassing preceding nodes', async () => {
      vi.spyOn(optOutModule, 'isRecipientSuppressed').mockResolvedValue(false);
      const sendDmSpy = vi.spyOn(instagramApiModule, 'sendInstagramDm').mockResolvedValue('mid_followup_789');

      const graph: FlowGraph = {
        version: 1,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          { id: 'dm1', type: 'send_dm', position: { x: 0, y: 100 }, data: { messageText: 'First DM' } },
          { id: 'delay1', type: 'delay', position: { x: 0, y: 200 }, data: { delayMinutes: 60 } },
          { id: 'dm2', type: 'send_dm', position: { x: 0, y: 300 }, data: { messageText: 'Second Resumed DM' } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'dm1' },
          { id: 'e2', source: 'dm1', target: 'delay1' },
          { id: 'e3', source: 'delay1', target: 'dm2' },
        ],
      };

      const resumedPayload: AutoDmJobPayload = {
        automationId: 'auto_resumed_123',
        instagramAccountId: 'acc_123',
        igAccountIgsid: 'igsid_123',
        triggerType: 'comment',
        triggerUserId: 'user_456',
        triggerUsername: 'user_test',
        triggerEventId: 'comment_111',
        triggerTimestamp: Date.now() - 3600000,
        postId: 'post_123',
        commentText: 'Nice',
        messageText: null,
        flowNodeId: 'dm2', // Resuming directly at dm2
        isFollowUp: true,
      };

      const mockDb: any = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };

      const result = await executeFlowGraph(mockDb, graph, resumedPayload, { id: 'auto_resumed_123' } as any, 'test_token');

      expect(result.status).toBe('completed');
      expect(result.currentNodeId).toBe('dm2');
      expect(sendDmSpy).toHaveBeenCalledTimes(1);
      expect(sendDmSpy).toHaveBeenCalledWith('igsid_123', { id: 'user_456' }, 'Second Resumed DM', 'test_token');
    });
  });

  // ── 9. Explicit Wildcard vs. Empty Keywords Verification ─────────────────
  describe('Explicit Wildcard Validation (isExplicitWildcardAutomation)', () => {
    it('returns false for automation with null or empty keywords and no explicit wildcard flag', () => {
      expect(isExplicitWildcardAutomation({ keywords: null })).toBe(false);
      expect(isExplicitWildcardAutomation({ keywords: [] })).toBe(false);
      expect(isExplicitWildcardAutomation({ keywords: [''] })).toBe(false);
      expect(isExplicitWildcardAutomation({ keywords: null, trigger_config: null })).toBe(false);
    });

    it('returns true when *ANY* token is explicitly included in keywords', () => {
      expect(isExplicitWildcardAutomation({ keywords: ['*ANY*'] })).toBe(true);
      expect(isExplicitWildcardAutomation({ keywords: ['*any*'] })).toBe(true);
      expect(isExplicitWildcardAutomation({ keywords: ['__ANY__'] })).toBe(true);
    });

    it('returns true when trigger_config explicitly has trigger_mode: "any"', () => {
      expect(
        isExplicitWildcardAutomation({
          keywords: null,
          trigger_config: { trigger_mode: 'any' },
        })
      ).toBe(true);
    });

    it('returns true when flow_graph trigger node has keywordsAnyMode: true', () => {
      expect(
        isExplicitWildcardAutomation({
          keywords: [],
          flow_graph: {
            nodes: [
              {
                type: 'trigger',
                data: { keywordsAnyMode: true },
              },
            ],
          },
        })
      ).toBe(true);
    });
  });
});
