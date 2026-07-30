/**
 * Debug event logger - powers the live debug panel on the Automations page.
 *
 * Fire-and-forget writes to the debug_events table. Never blocks or breaks
 * the automation flow; failures are swallowed after a console note.
 */

import { createServiceClient } from '@/lib/supabase/service';

export type DebugLevel = 'info' | 'warn' | 'error';
export type DebugStatus = 'ok' | 'error' | 'skipped' | 'processing';

export function debugLog(
  service: 'webhook' | 'worker' | 'instagram' | 'oauth' | 'cron',
  level: DebugLevel,
  eventType: string,
  status: DebugStatus,
  message: string,
  metadata: Record<string, unknown> = {}
): void {
  void (async (): Promise<void> => {
    try {
      const db = createServiceClient();
      await db.from('debug_events').insert({
        service,
        level,
        event_type: eventType,
        status,
        message,
        metadata,
      });
    } catch (err) {
      console.error('[debugLog] failed:', err instanceof Error ? err.message : String(err));
    }
  })();
}
