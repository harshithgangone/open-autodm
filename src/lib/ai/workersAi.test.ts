import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_REQUEST_TIMEOUT_MS,
  DEFAULT_AI_MODEL,
  DEFAULT_FOLLOW_UP_MESSAGE,
  DEFAULT_OPENING_VARIATIONS,
  DEFAULT_PUBLIC_REPLIES,
  DEFAULT_RESPONSE_DRAFT,
  generateFollowUpDraft,
  generateOpeningVariations,
  generatePublicReplies,
  generateResponseDraft,
  generateRuntimeDmResponse,
  generateRuntimePublicReply,
  withTimeout,
  type AiGenerationResult,
  type WorkersAiBinding,
} from './workersAi';

afterEach(() => {
  vi.useRealTimers();
});

function neverResolvingAi(): WorkersAiBinding {
  return {
    run: vi.fn(() => new Promise<unknown>(() => {})),
  };
}

async function expectFallbackAfterTimeout<T>(
  invoke: (ai: WorkersAiBinding) => Promise<AiGenerationResult<T>>,
  expectedData: T,
): Promise<void> {
  vi.useFakeTimers();
  const ai = neverResolvingAi();
  const resultPromise = invoke(ai);

  await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);

  await expect(resultPromise).resolves.toMatchObject({
    data: expectedData,
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  });
  expect(ai.run).toHaveBeenCalledOnce();
}

describe('withTimeout', () => {
  it('clears the deadline timer when the operation resolves early', async () => {
    vi.useFakeTimers();

    await expect(withTimeout(() => Promise.resolve('done'), 25)).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects when an operation exceeds the deadline', async () => {
    vi.useFakeTimers();
    const resultPromise = withTimeout(() => new Promise<never>(() => {}), 25);
    const rejection = expect(resultPromise).rejects.toThrow('Workers AI request timed out after 25ms');

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves an operation error that occurs before the deadline', async () => {
    vi.useFakeTimers();

    await expect(withTimeout(() => Promise.reject(new Error('AI unavailable')), 25))
      .rejects.toThrow('AI unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Workers AI generation timeout fallbacks', () => {
  it('falls back for opening message variations when inference stalls', async () => {
    await expectFallbackAfterTimeout(
      (ai) => generateOpeningVariations('QA prompt', 2, undefined, ai),
      DEFAULT_OPENING_VARIATIONS.slice(0, 2),
    );
  });

  it('falls back for public replies when inference stalls', async () => {
    await expectFallbackAfterTimeout(
      (ai) => generatePublicReplies('QA prompt', 2, ai),
      DEFAULT_PUBLIC_REPLIES.slice(0, 2),
    );
  });

  it('falls back for response drafts when inference stalls', async () => {
    await expectFallbackAfterTimeout(
      (ai) => generateResponseDraft('QA prompt', undefined, ai),
      DEFAULT_RESPONSE_DRAFT,
    );
  });

  it('falls back for follow-up drafts when inference stalls', async () => {
    await expectFallbackAfterTimeout(
      (ai) => generateFollowUpDraft('QA prompt', undefined, ai),
      DEFAULT_FOLLOW_UP_MESSAGE,
    );
  });

  it('uses a supplied safe fallback for runtime public replies when inference stalls', async () => {
    await expectFallbackAfterTimeout(
      (ai) => generateRuntimePublicReply('instructions', 'test comment', undefined, ['QA fallback'], ai),
      'QA fallback',
    );
  });

  it('uses a supplied safe fallback for runtime DM responses when inference stalls', async () => {
    await expectFallbackAfterTimeout(
      (ai) => generateRuntimeDmResponse('instructions', 'test message', undefined, 'QA fallback DM', ai),
      'QA fallback DM',
    );
  });
});
