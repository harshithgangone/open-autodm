/**
 * Cloudflare Workers AI integration for open-autoDM.
 *
 * Uses Cloudflare Workers AI Free Tier (10,000 Neurons/day).
 * Default model: @cf/meta/llama-3.2-3b-instruct
 *
 * Designed to be 100% resilient:
 *  - Enforces prompt injection sanitization.
 *  - Strict 5s execution timeout.
 *  - Never crashes if the AI binding is unavailable (e.g. local dev / test runner).
 *  - Seamlessly falls back to high-converting predefined templates on error or quota exhaustion.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('workers-ai');

export const DEFAULT_AI_MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const AI_REQUEST_TIMEOUT_MS = 5000;

/**
 * Bound how long application code waits for Workers AI.
 *
 * The Workers AI binding's run() API does not accept an AbortSignal. This
 * deadline returns control to the existing fallback path, but it cannot
 * cancel an inference that the platform has already started.
 */
export function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = AI_REQUEST_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Workers AI request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([Promise.resolve().then(operation), timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}


export interface WorkersAiBinding {
  run: (
    model: string,
    options: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      max_tokens?: number;
      temperature?: number;
    }
  ) => Promise<{ response?: string } | unknown>;
}

export interface AiGenerationResult<T> {
  data: T;
  status: 'success' | 'fallback';
  model: string;
  error?: string;
}

/** Sanitize input strings to prevent prompt injection and tokenizer manipulation. */
export function sanitizePromptInput(input: string, maxLen = 500): string {
  if (!input) return '';
  return input
    .replace(/<\|[a-z0-9_]+\|>/gi, '') // Strip Llama special tokens
    .replace(/\[\/?INST\]/gi, '')       // Strip legacy instruction tags
    .slice(0, maxLen)
    .trim();
}

/** Clean up model output: remove surrounding quotes, markdown asterisks, and trim. */
export function cleanAiOutput(text: string): string {
  return text
    .replace(/^\s*["'`]+|["'`]+\s*$/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();
}

/** Attempts to acquire the Cloudflare AI binding via OpenNext context. */
export async function getAiBinding(): Promise<WorkersAiBinding | null> {
  if ((globalThis as any).__WORKERS_AI_BINDING) {
    return (globalThis as any).__WORKERS_AI_BINDING;
  }
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx?.env as { AI?: WorkersAiBinding } | undefined;
    if (env?.AI && typeof env.AI.run === 'function') {
      return env.AI;
    }
  } catch {
    // Expected in Node.js / Vitest / non-Cloudflare environments
  }
  return null;
}

/** Default 5 opening DM variations when AI is unavailable or prompt is empty. */
export const DEFAULT_OPENING_VARIATIONS = [
  "Hey {username}! Thanks so much for reaching out! Here is the link you requested: 👇",
  "Thanks for your comment, {username}! Super excited to share this with you ✨",
  "Hey {username}! Really appreciate your interest! Here is everything you need 🚀",
  "Hey {username}! Dropping the details right here in your inbox 📬",
  "So glad you asked, {username}! Here is the link and info you wanted 🙌",
];

/** Default 5 public comment replies when AI is unavailable or as fallback options. */
export const DEFAULT_PUBLIC_REPLIES = [
  "Sent you a DM! Check your requests 📥",
  "Check your inbox! Just sent it over ✨",
  "Just messaged you the link! 🚀",
  "Sent to your DMs! Let me know if you got it 📬",
  "All sent! Check your message requests 🙌",
];

/** Default DM response draft when AI is unavailable or as fallback. */
export const DEFAULT_RESPONSE_DRAFT =
  "Here is the link and details you requested! Let me know if you need any help getting started 🙌";

export const DEFAULT_RESPONSE_DRAFTS = [
  "Here is the link and details you requested! Let me know if you need any help getting started 🙌",
  "So glad you reached out! You can access everything right here. Hope you find it super valuable! ✨",
  "Thanks for checking this out! Here are all the details and next steps. Enjoy! 🚀",
];

/** Default follow-up message when AI is unavailable or as fallback. */
export const DEFAULT_FOLLOW_UP_MESSAGE =
  "Hey {username}, did you get a chance to check the details I sent you?";

export const DEFAULT_FOLLOW_UP_DRAFTS = [
  "Hey {username}, did you get a chance to check the details I sent you?",
  "Hey {username}, just checking in to see if you had any questions about the info I sent over! ✨",
  "Quick follow-up, {username}! Did that have everything you were looking for? Happy to help 🙌",
];

/**
 * Generate 5 opening DM variations using Workers AI with automatic fallback.
 */
export async function generateOpeningVariations(
  promptContext: string,
  count = 5,
  context?: { postCaption?: string; creatorUsername?: string; automationName?: string },
  injectedAi?: WorkersAiBinding | null
): Promise<AiGenerationResult<string[]>> {
  const ai = injectedAi ?? (await getAiBinding());
  if (!ai) {
    return {
      data: DEFAULT_OPENING_VARIATIONS.slice(0, count),
      status: 'fallback',
      model: DEFAULT_AI_MODEL,
    };
  }

  const sanitizedPrompt = sanitizePromptInput(promptContext || context?.automationName || '', 600);
  const sanitizedCaption = context?.postCaption ? sanitizePromptInput(context.postCaption, 300) : '';

  const systemMessage =
    "You are an assistant creating high-converting, friendly Instagram DM opening messages for a creator. " +
    "Generate distinct variations that feel human, authentic, and inviting. " +
    "Use {username} as the placeholder for the recipient's name where appropriate. " +
    "Do NOT fabricate URLs, discount percentages, or specific pricing unless provided. " +
    "Output EXACTLY one variation per line, numbered 1 to 5. No conversational preamble.";

  const userContent =
    `Creator goal/topic: ${sanitizedPrompt || 'Sharing a valuable resource, guide, or link'}\n` +
    (sanitizedCaption ? `Context from post: ${sanitizedCaption}\n` : '') +
    `Generate ${count} distinct opening DM messages.`;

  try {
    const raw = (await withTimeout(() => ai.run(DEFAULT_AI_MODEL, {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 350,
      temperature: 0.7,
    }), AI_REQUEST_TIMEOUT_MS)) as { response?: string };

    const text = typeof raw?.response === 'string' ? raw.response : '';
    const lines = text
      .split('\n')
      .map((l) => l.replace(/^\d+[\.\)\-\s]+/, '').trim())
      .filter((l) => l.length > 5 && !l.startsWith('Here are') && !l.startsWith('Sure'));

    const cleaned = lines.map(cleanAiOutput);
    if (cleaned.length >= 2) {
      // Pad up to requested count with defaults if needed
      while (cleaned.length < count) {
        const fallback = DEFAULT_OPENING_VARIATIONS[cleaned.length % DEFAULT_OPENING_VARIATIONS.length] ?? DEFAULT_OPENING_VARIATIONS[0]!;
        if (!cleaned.includes(fallback)) cleaned.push(fallback);
      }
      return {
        data: cleaned.slice(0, count),
        status: 'success',
        model: DEFAULT_AI_MODEL,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Workers AI opening variations generation failed - using defaults');
  }

  return {
    data: DEFAULT_OPENING_VARIATIONS.slice(0, count),
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  };
}

/**
 * Generate public comment replies using Workers AI with automatic fallback.
 */
export async function generatePublicReplies(
  promptContext?: string,
  count = 5,
  injectedAi?: WorkersAiBinding | null
): Promise<AiGenerationResult<string[]>> {
  const ai = injectedAi ?? (await getAiBinding());
  if (!ai) {
    return {
      data: DEFAULT_PUBLIC_REPLIES.slice(0, count),
      status: 'fallback',
      model: DEFAULT_AI_MODEL,
    };
  }

  const sanitizedPrompt = sanitizePromptInput(promptContext ?? '', 400);

  const systemMessage =
    "You are an assistant generating short, natural public Instagram comment replies for a creator. " +
    "Replies inform the commenter that a DM has been sent. Keep each reply under 50 characters, friendly, with 1-2 emojis. " +
    "Output EXACTLY one reply per line. No numbers, no bullet points, no extra text.";

  const userContent =
    `Context/vibe: ${sanitizedPrompt || 'Notifying commenter that their requested link is in their DMs'}\n` +
    `Generate ${count} short variations.`;

  try {
    const raw = (await withTimeout(() => ai.run(DEFAULT_AI_MODEL, {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 150,
      temperature: 0.7,
    }), AI_REQUEST_TIMEOUT_MS)) as { response?: string };

    const text = typeof raw?.response === 'string' ? raw.response : '';
    const lines = text
      .split('\n')
      .map((l) => l.replace(/^\d+[\.\)\-\s]+/, '').trim())
      .filter((l) => l.length > 2 && l.length < 100);

    const cleaned = lines.map(cleanAiOutput);
    if (cleaned.length >= 2) {
      while (cleaned.length < count) {
        const fallback = DEFAULT_PUBLIC_REPLIES[cleaned.length % DEFAULT_PUBLIC_REPLIES.length] ?? DEFAULT_PUBLIC_REPLIES[0]!;
        if (!cleaned.includes(fallback)) cleaned.push(fallback);
      }
      return {
        data: cleaned.slice(0, count),
        status: 'success',
        model: DEFAULT_AI_MODEL,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Workers AI public replies generation failed - using defaults');
  }

  return {
    data: DEFAULT_PUBLIC_REPLIES.slice(0, count),
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  };
}

/**
 * Generate a response message draft using Workers AI with automatic fallback.
 */
export async function generateResponseDraft(
  promptContext?: string,
  context?: { postCaption?: string; creatorUsername?: string; automationName?: string },
  injectedAi?: WorkersAiBinding | null
): Promise<AiGenerationResult<string>> {
  const ai = injectedAi ?? (await getAiBinding());
  if (!ai) {
    return {
      data: DEFAULT_RESPONSE_DRAFT,
      status: 'fallback',
      model: DEFAULT_AI_MODEL,
    };
  }

  const sanitizedPrompt = sanitizePromptInput(promptContext ?? '', 600);
  const sanitizedCaption = context?.postCaption ? sanitizePromptInput(context.postCaption, 300) : '';
  const sanitizedName = context?.automationName ? sanitizePromptInput(context.automationName, 200) : '';

  const systemMessage =
    "You are an assistant crafting a helpful, warm, and concise Instagram DM response for a creator. " +
    "Keep it under 300 characters, authentic, human, and clear. " +
    "Do NOT fabricate specific prices, secret coupon codes, or false claims. " +
    "Output ONLY the response message text. No quotes, no preamble.";

  const userContent =
    `Creator message goal: ${sanitizedPrompt || sanitizedName || 'Delivering the requested resource, link, or helpful info'}\n` +
    (sanitizedCaption ? `Context from post: ${sanitizedCaption}\n` : '') +
    "Write a direct message response draft:";

  try {
    const raw = (await withTimeout(() => ai.run(DEFAULT_AI_MODEL, {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 180,
      temperature: 0.7,
    }), AI_REQUEST_TIMEOUT_MS)) as { response?: string };

    const text = typeof raw?.response === 'string' ? cleanAiOutput(raw.response) : '';
    if (text && text.length > 5) {
      return {
        data: text,
        status: 'success',
        model: DEFAULT_AI_MODEL,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Workers AI response draft generation failed - using default');
  }

  return {
    data: DEFAULT_RESPONSE_DRAFT,
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  };
}

/**
 * Generate a follow-up message draft using Workers AI with automatic fallback.
 */
export async function generateFollowUpDraft(
  promptContext: string,
  context?: { automationName?: string; creatorUsername?: string },
  injectedAi?: WorkersAiBinding | null
): Promise<AiGenerationResult<string>> {
  const ai = injectedAi ?? (await getAiBinding());
  if (!ai) {
    return {
      data: DEFAULT_FOLLOW_UP_MESSAGE,
      status: 'fallback',
      model: DEFAULT_AI_MODEL,
    };
  }

  const sanitizedPrompt = sanitizePromptInput(promptContext || context?.automationName || '', 600);

  const systemMessage =
    "You are an expert Instagram creator writing a friendly, polite follow-up DM check-in message. " +
    "The recipient already received an initial link or info after opting in. " +
    "Ask politely if they got a chance to check it out or if they have any questions. " +
    "Include {username} where natural. Keep it concise (under 250 characters), warm, and non-pushy. " +
    "Do NOT fabricate facts or external links. Output only the follow-up message.";

  const userContent =
    `Goal/context: ${sanitizedPrompt || 'Polite check-in on the previously shared link/guide'}\n` +
    (context?.creatorUsername ? `Creator handle: @${context.creatorUsername}\n` : '') +
    "Write the follow-up message:";

  try {
    const raw = (await withTimeout(() => ai.run(DEFAULT_AI_MODEL, {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 150,
      temperature: 0.7,
    }), AI_REQUEST_TIMEOUT_MS)) as { response?: string };

    const text = typeof raw?.response === 'string' ? cleanAiOutput(raw.response) : '';
    if (text && text.length > 5 && text.length <= 500) {
      return {
        data: text,
        status: 'success',
        model: DEFAULT_AI_MODEL,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Workers AI follow-up draft generation failed - using default');
  }

  return {
    data: DEFAULT_FOLLOW_UP_MESSAGE,
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  };
}

/**
 * Generate a dynamic runtime public comment reply based on the commenter's comment.
 */
export async function generateRuntimePublicReply(
  instructions: string | null | undefined,
  commentText: string,
  commenterUsername?: string,
  fallbackReplies: string[] = DEFAULT_PUBLIC_REPLIES,
  injectedAi?: WorkersAiBinding | null
): Promise<AiGenerationResult<string>> {
  const ai = injectedAi ?? (await getAiBinding());
  const fallbackChoice: string =
    fallbackReplies.length > 0
      ? (fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)] ?? DEFAULT_PUBLIC_REPLIES[0]!)
      : DEFAULT_PUBLIC_REPLIES[0]!;

  if (!ai || !commentText?.trim()) {
    return {
      data: fallbackChoice,
      status: 'fallback',
      model: DEFAULT_AI_MODEL,
    };
  }

  const sanitizedComment = sanitizePromptInput(commentText, 300);
  const sanitizedInstructions = instructions ? sanitizePromptInput(instructions, 400) : '';

  const systemMessage =
    "You are an Instagram creator responding with a single public comment reply to someone who commented on your post. " +
    "Keep it very brief (under 80 characters), warm, and mention that you sent them a DM. " +
    "Do not invent facts or make promises. Output only the reply text.";

  const userContent =
    (sanitizedInstructions ? `Creator instructions: ${sanitizedInstructions}\n` : '') +
    (commenterUsername ? `Commenter username: ${commenterUsername}\n` : '') +
    `User comment: "${sanitizedComment}"\n` +
    "Write a short, engaging reply:";

  try {
    const raw = (await withTimeout(() => ai.run(DEFAULT_AI_MODEL, {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 60,
      temperature: 0.6,
    }), AI_REQUEST_TIMEOUT_MS)) as { response?: string };

    const text = typeof raw?.response === 'string' ? cleanAiOutput(raw.response) : '';
    if (text && text.length > 2 && text.length <= 150) {
      return {
        data: text,
        status: 'success',
        model: DEFAULT_AI_MODEL,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Workers AI runtime public reply generation failed - using fallback');
  }

  return {
    data: fallbackChoice,
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  };
}

/**
 * Generate a dynamic runtime DM response to a user reply.
 */
export async function generateRuntimeDmResponse(
  instructions: string,
  userMessage: string,
  context?: { commenterName?: string },
  fallbackText?: string,
  injectedAi?: WorkersAiBinding | null
): Promise<AiGenerationResult<string>> {
  const ai = injectedAi ?? (await getAiBinding());
  const fallback = fallbackText || "Thanks for your message! We'll get back to you shortly.";

  if (!ai || !userMessage?.trim()) {
    return {
      data: fallback,
      status: 'fallback',
      model: DEFAULT_AI_MODEL,
    };
  }

  const sanitizedMessage = sanitizePromptInput(userMessage, 500);
  const sanitizedInstructions = sanitizePromptInput(instructions, 600);

  const systemMessage =
    "You are an AI assistant acting on behalf of an Instagram creator in direct messages. " +
    "Follow the creator's instructions carefully. Keep responses helpful, polite, concise, and under 400 characters. " +
    "Do not make up fake links, discounts, or policies. Output only the message to send.";

  const userContent =
    `Creator instructions:\n${sanitizedInstructions}\n\n` +
    (context?.commenterName ? `Recipient name: ${context.commenterName}\n` : '') +
    `User message: "${sanitizedMessage}"\n` +
    "Your response:";

  try {
    const raw = (await withTimeout(() => ai.run(DEFAULT_AI_MODEL, {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 200,
      temperature: 0.6,
    }), AI_REQUEST_TIMEOUT_MS)) as { response?: string };

    const text = typeof raw?.response === 'string' ? cleanAiOutput(raw.response) : '';
    if (text && text.length > 2 && text.length <= 1000) {
      return {
        data: text,
        status: 'success',
        model: DEFAULT_AI_MODEL,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Workers AI runtime DM response generation failed - using fallback');
  }

  return {
    data: fallback,
    status: 'fallback',
    model: DEFAULT_AI_MODEL,
  };
}
