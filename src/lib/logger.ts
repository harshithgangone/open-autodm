/**
 * Lightweight structured logger.
 *
 * JSON-line output that both Vercel and Cloudflare log viewers parse natively.
 * Never log tokens, secrets, or full webhook bodies.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (ctx: Record<string, unknown>, msg: string) => void;
  info: (ctx: Record<string, unknown>, msg: string) => void;
  warn: (ctx: Record<string, unknown>, msg: string) => void;
  error: (ctx: Record<string, unknown>, msg: string) => void;
}

function emit(level: LogLevel, scope: string, ctx: Record<string, unknown>, msg: string): void {
  const line = JSON.stringify({
    level,
    scope,
    msg,
    time: new Date().toISOString(),
    ...sanitize(ctx),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Redact anything that looks like a secret and serialize Error objects. */
function sanitize(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (/token|secret|password|authorization/i.test(key)) {
      out[key] = '[redacted]';
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message };
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (ctx, msg) => emit('debug', scope, ctx, msg),
    info: (ctx, msg) => emit('info', scope, ctx, msg),
    warn: (ctx, msg) => emit('warn', scope, ctx, msg),
    error: (ctx, msg) => emit('error', scope, ctx, msg),
  };
}
