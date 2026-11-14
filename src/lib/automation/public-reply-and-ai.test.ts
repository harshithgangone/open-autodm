import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { replyToComment } from '@/lib/instagram/api';
import {
  selectOpeningVariation,
  selectPublicReplyOption,
} from '@/lib/automation/processJob';
import {
  generateOpeningVariations,
  generatePublicReplies,
  generateRuntimePublicReply,
  generateRuntimeDmResponse,
  generateResponseDraft,
  DEFAULT_OPENING_VARIATIONS,
  DEFAULT_PUBLIC_REPLIES,
  DEFAULT_RESPONSE_DRAFT,
  DEFAULT_AI_MODEL,
  type WorkersAiBinding,
} from '@/lib/ai/workersAi';

describe('Public Comment Replies & Meta API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends access_token via Authorization Bearer header, not in request URL or JSON body', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = init?.body ? JSON.parse(init.body as string) : null;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'reply_comment_99999' }),
      } as Response;
    });

    const result = await replyToComment('comment_123', 'Check your DMs! 🚀', 'EAABtest_token_secret');

    expect(result.success).toBe(true);
    expect(result.replyId).toBe('reply_comment_99999');

    // 1. URL must NOT contain access_token query param (prevents access token leakage in HTTP logs)
    expect(capturedUrl).toBe('https://graph.instagram.com/v23.0/comment_123/replies');
    expect(capturedUrl).not.toContain('access_token');

    // 2. Headers must include Bearer auth
    expect(capturedHeaders['Authorization']).toBe('Bearer EAABtest_token_secret');
    expect(capturedHeaders['Content-Type']).toBe('application/json');

    // 3. Body must ONLY contain the message, NOT access_token
    expect(capturedBody).toEqual({ message: 'Check your DMs! 🚀' });
    expect(capturedBody.access_token).toBeUndefined();
  });

  it('handles Meta API failure gracefully without throwing and returns structured error', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Application does not have the capability to make this API call.',
            type: 'OAuthException',
            code: 10,
            error_subcode: 2207008,
            fbtrace_id: 'FbTraceId123',
          },
        }),
      } as Response;
    });

    const result = await replyToComment('comment_123', 'Check your DMs! 🚀', 'EAABtest_token');

    expect(result.success).toBe(false);
    expect(result.replyId).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(10);
    expect(result.error?.subcode).toBe(2207008);
    expect(result.error?.message).toContain('capability');
  });
});

describe('Deterministic 5 Opening DM Variations Selection', () => {
  const variations = [
    'Variation 1: Hey {username}! Here is your guide 🚀',
    'Variation 2: Thanks for your interest {username}! Check it out ✨',
    'Variation 3: Hey {username}! So excited to share this with you 👇',
    'Variation 4: Dropping the details right here {username}! 📬',
    'Variation 5: All set {username}! Here is everything you need 🙌',
  ];

  it('is 100% deterministic given the same trigger event ID', () => {
    const pick1 = selectOpeningVariation(variations, 'Fallback msg', 'comment_abc_123');
    const pick2 = selectOpeningVariation(variations, 'Fallback msg', 'comment_abc_123');
    const pick3 = selectOpeningVariation(variations, 'Fallback msg', 'comment_abc_123');

    expect(pick1.text).toBe(pick2.text);
    expect(pick1.index).toBe(pick2.index);
    expect(pick1.text).toBe(pick3.text);
    expect(pick1.index).toBe(pick3.index);
  });

  it('distributes variations across different event IDs', () => {
    const indices = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const pick = selectOpeningVariation(variations, 'Fallback msg', `event_seed_${i}`);
      indices.add(pick.index);
    }
    // Should hit multiple distinct variation indices across 20 distinct seeds
    expect(indices.size).toBeGreaterThanOrEqual(3);
  });

  it('respects persistedIndex on retries for strict idempotency', () => {
    const pick = selectOpeningVariation(variations, 'Fallback msg', 'random_seed', 3);
    expect(pick.index).toBe(3);
    expect(pick.text).toBe(variations[3]);
  });

  it('falls back to dm_opening_message when variations array is empty', () => {
    const pick = selectOpeningVariation([], 'Standard opening DM', 'comment_xyz');
    expect(pick.text).toBe('Standard opening DM');
    expect(pick.index).toBe(0);
  });
});

describe('Deterministic Public Reply Selection', () => {
  it('deterministically selects a public reply template', () => {
    const options = [
      'Sent you a DM! 📥',
      'Check your inbox! ✨',
      'Just sent the link! 🚀',
    ];

    const pick1 = selectPublicReplyOption(options, DEFAULT_PUBLIC_REPLIES, 'comment_777');
    const pick2 = selectPublicReplyOption(options, DEFAULT_PUBLIC_REPLIES, 'comment_777');

    expect(pick1).toBe(pick2);
    expect(options).toContain(pick1);
  });

  it('falls back to default public replies if options are empty', () => {
    const pick = selectPublicReplyOption([], DEFAULT_PUBLIC_REPLIES, 'comment_888');
    expect(DEFAULT_PUBLIC_REPLIES).toContain(pick);
  });
});

describe('Cloudflare Workers AI Generation & Fallback', () => {
  it('generates 5 opening variations via Workers AI when binding is active', async () => {
    const mockAi: WorkersAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: `1. Hey {username}! Super thrilled to connect, here is your requested link: 👇
2. Thanks for stopping by {username}! Check out the guide below ✨
3. Hey {username}! Ready to get started? Here are the full details 🚀
4. Great to see you here {username}! Here is the resource you wanted 📬
5. Hey {username}! Packed with insights, here is everything you need 🙌`,
      }),
    };

    const result = await generateOpeningVariations('fitness guide link', 5, undefined, mockAi);

    expect(result.status).toBe('success');
    expect(result.model).toBe(DEFAULT_AI_MODEL);
    expect(result.data.length).toBe(5);
    expect(result.data[0]).toContain('Hey {username}!');
    expect(result.data[4]).toContain('Hey {username}!');
    expect(mockAi.run).toHaveBeenCalledTimes(1);
  });

  it('falls back to default high-converting opening variations if AI binding is unavailable', async () => {
    const result = await generateOpeningVariations('fitness guide link', 5, undefined, null);

    expect(result.status).toBe('fallback');
    expect(result.data.length).toBe(5);
    expect(result.data).toEqual(DEFAULT_OPENING_VARIATIONS);
  });

  it('falls back gracefully if Workers AI call throws or times out', async () => {
    const failingAi: WorkersAiBinding = {
      run: vi.fn().mockRejectedValue(new Error('Rate limit: 10,000 Neurons/day quota exceeded')),
    };

    const result = await generateOpeningVariations('fitness guide link', 5, undefined, failingAi);

    expect(result.status).toBe('fallback');
    expect(result.data.length).toBe(5);
    expect(result.data).toEqual(DEFAULT_OPENING_VARIATIONS);
  });

  it('generates 5 public replies with Workers AI and falls back on error', async () => {
    const mockAi: WorkersAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: `Sent you a DM! 📥
Check your inbox! ✨
Sent over to your DMs! 🚀
Just messaged you! 📬
Check your requests! 🙌`,
      }),
    };

    const result = await generatePublicReplies('fitness guide', 5, mockAi);
    expect(result.status).toBe('success');
    expect(result.data.length).toBe(5);
    expect(result.data[0]).toBe('Sent you a DM! 📥');

    // Test fallback when AI is null
    const fallbackResult = await generatePublicReplies('fitness guide', 5, null);
    expect(fallbackResult.status).toBe('fallback');
    expect(fallbackResult.data).toEqual(DEFAULT_PUBLIC_REPLIES);
  });

  it('generates runtime contextual comment reply with fallback', async () => {
    const mockAi: WorkersAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: 'Sent you a DM with the recipe! 🥗 Check your inbox!',
      }),
    };

    const result = await generateRuntimePublicReply(
      'Be friendly and mention recipe',
      'Can I get the salad recipe please?',
      'sarah_fit',
      DEFAULT_PUBLIC_REPLIES,
      mockAi
    );

    expect(result.status).toBe('success');
    expect(result.data).toContain('recipe');

    // Test fallback
    const fallbackResult = await generateRuntimePublicReply(
      'instructions',
      '',
      undefined,
      ['Default reply 1'],
      null
    );
    expect(fallbackResult.status).toBe('fallback');
    expect(fallbackResult.data).toBe('Default reply 1');
  });

  it('generates runtime DM response with fallback', async () => {
    const mockAi: WorkersAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: 'Our workout guide is completely free! Here is your download link.',
      }),
    };

    const result = await generateRuntimeDmResponse(
      'Explain that guide is free',
      'How much does this cost?',
      { commenterName: 'Alex' },
      'Fallback message',
      mockAi
    );

    expect(result.status).toBe('success');
    expect(result.data).toContain('completely free');

    // Test fallback
    const fallbackResult = await generateRuntimeDmResponse(
      'instructions',
      '',
      undefined,
      'Fallback message',
      null
    );
    expect(fallbackResult.status).toBe('fallback');
    expect(fallbackResult.data).toBe('Fallback message');
  });

  it('generates response draft with Workers AI when prompt is provided', async () => {
    const mockAi: WorkersAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: 'Here is your free copy of our fitness blueprint! Enjoy the workout tips 🚀',
      }),
    };

    const result = await generateResponseDraft('Offer fitness blueprint', undefined, mockAi);

    expect(result.status).toBe('success');
    expect(result.data).toBe('Here is your free copy of our fitness blueprint! Enjoy the workout tips 🚀');
    expect(mockAi.run).toHaveBeenCalledTimes(1);
  });

  it('safely auto-generates response draft when prompt is empty without sending empty instructions', async () => {
    let capturedSystem = '';
    let capturedUser = '';

    const mockAi: WorkersAiBinding = {
      run: vi.fn().mockImplementation(async (_model, options) => {
        capturedSystem = options.messages[0]?.content || '';
        capturedUser = options.messages[1]?.content || '';
        return { response: 'Thanks for reaching out! Check the details below.' };
      }),
    };

    const result = await generateResponseDraft('', { automationName: 'Diet Guide Funnel', postCaption: 'Check this reel' }, mockAi);

    expect(result.status).toBe('success');
    expect(capturedSystem).not.toBe('');
    expect(capturedUser).toContain('Diet Guide Funnel');
    expect(capturedUser).toContain('Check this reel');
  });

  it('falls back to default response draft if AI is null or errors', async () => {
    const fallback1 = await generateResponseDraft('custom', undefined, null);
    expect(fallback1.status).toBe('fallback');
    expect(fallback1.data).toBe(DEFAULT_RESPONSE_DRAFT);

    const failingAi: WorkersAiBinding = {
      run: vi.fn().mockRejectedValue(new Error('AI execution failure')),
    };
    const fallback2 = await generateResponseDraft('custom', undefined, failingAi);
    expect(fallback2.status).toBe('fallback');
    expect(fallback2.data).toBe(DEFAULT_RESPONSE_DRAFT);
  });
});
