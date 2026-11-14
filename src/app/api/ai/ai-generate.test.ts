import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './generate/route';

const mockGetAuthenticatedUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: (req: Request) => mockGetAuthenticatedUser(req),
  unauthorized: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/lib/debugLog', () => ({
  debugLog: vi.fn(),
}));

describe('AI Generate API Route (/api/ai/generate)', () => {
  beforeEach(() => {
    mockGetAuthenticatedUser.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null);
    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'opening_variations' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects invalid action with 400', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invalid_action_xyz' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('handles opening_variations in custom mode and returns 5 variations', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'opening_variations',
        prompt: 'Make it super friendly and casual',
        mode: 'custom',
        count: 5,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.variations)).toBe(true);
    expect(json.variations.length).toBe(5);
  });

  it('handles opening_variations in auto mode with empty prompt safely', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'opening_variations',
        prompt: '',
        mode: 'auto',
        postCaption: 'Free fitness diet guide link in bio',
        automationName: 'Diet Guide Funnel',
        count: 5,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.variations.length).toBe(5);
  });

  it('handles public_replies with active AI binding and returns genuinely generated variations', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    (globalThis as any).__WORKERS_AI_BINDING = {
      run: vi.fn().mockResolvedValue({
        response: `Just sent you a DM with the VIP link! 🚀
Check your message requests for access! ✨
Sent to your inbox right now! 📬
All details are in your DMs! 📩
Messaged you the secret link! 🙌`,
      }),
    };

    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'public_replies',
        prompt: 'Short friendly reply with emojis',
        mode: 'custom',
        count: 5,
      }),
    });
    const res = await POST(req);
    delete (globalThis as any).__WORKERS_AI_BINDING;

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.status).toBe('success');
    expect(json.variations.length).toBe(5);
    expect(json.variations[0]).toBe('Just sent you a DM with the VIP link! 🚀');
    expect(Array.isArray(json.options)).toBe(true);
    expect(json.options[0]).toBe('Just sent you a DM with the VIP link! 🚀');
  });

  it('supports public_replies via type alias (comment_reply_options / public_reply) with context', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    (globalThis as any).__WORKERS_AI_BINDING = {
      run: vi.fn().mockResolvedValue({
        response: `Sent the guide to your inbox! 📥
Check your requests! ✨
All workout details sent! 🚀
Just messaged you! 📬
Check your DMs! 🙌`,
      }),
    };

    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'comment_reply_options',
        prompt: 'Friendly reply confirming DM sent',
        automationName: 'Free Guide Funnel',
        postCaption: 'Comment GUIDE for full workout',
        count: 5,
      }),
    });
    const res = await POST(req);
    delete (globalThis as any).__WORKERS_AI_BINDING;

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.status).toBe('success');
    expect(Array.isArray(json.variations)).toBe(true);
    expect(json.variations.length).toBe(5);
    expect(json.variations[0]).toBe('Sent the guide to your inbox! 📥');
  });

  it('returns a clear 503 failure and does NOT fabricate static defaults when AI binding is unavailable', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    delete (globalThis as any).__WORKERS_AI_BINDING;

    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'public_replies',
        prompt: 'Short friendly reply with emojis',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.status).toBe('fallback');
    expect(json.error).toContain('AI generation is currently unavailable');
    expect(json.variations).toBeUndefined();
  });

  it('returns a clear 503 failure when AI provider execution errors or times out', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    (globalThis as any).__WORKERS_AI_BINDING = {
      run: vi.fn().mockRejectedValue(new Error('Rate limit: 10,000 Neurons/day quota exceeded')),
    };

    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'public_replies',
        prompt: 'Short friendly reply with emojis',
      }),
    });
    const res = await POST(req);
    delete (globalThis as any).__WORKERS_AI_BINDING;

    expect(res.status).toBe(503);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.status).toBe('fallback');
    expect(json.error).toContain('AI generation is currently unavailable');
  });

  it('handles response_draft generation and logs under runtime_response feature', async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: 'user_123' });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: insertMock });

    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'response_draft',
        prompt: 'Explain what is inside the workout program',
        mode: 'custom',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(typeof json.draft).toBe('string');
    expect(json.draft.length).toBeGreaterThan(0);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_123',
        feature: 'runtime_response',
      })
    );
  });
});
