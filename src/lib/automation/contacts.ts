/**
 * Contacts - the automation-captured audience list.
 *
 * A contact is every unique audience member who triggered an automation
 * (comment / DM keyword / story reply / button tap). Written fire-and-forget
 * from the engine so contact bookkeeping can never slow down or break a send.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('contacts');

export type ContactTriggerType = 'comment' | 'dm' | 'story_reply' | 'button';

/** Records (or increments) a contact interaction. Fire-and-forget. */
export function recordContactInteraction(params: {
  instagramAccountId: string;
  audienceIgUserId: string;
  username?: string | null;
  triggerType: ContactTriggerType;
  automationId?: string | null;
}): void {
  void (async (): Promise<void> => {
    try {
      const db = createServiceClient();
      const { error } = await db.rpc('record_contact_interaction', {
        p_account_id: params.instagramAccountId,
        p_audience_id: params.audienceIgUserId,
        p_username: params.username ?? null,
        p_trigger_type: params.triggerType,
        p_automation_id: params.automationId ?? null,
      });
      if (error) logger.warn({ err: error }, 'record_contact_interaction failed');
    } catch (err) {
      logger.warn({ err }, 'record_contact_interaction threw');
    }
  })();
}

/** Enriches a contact's username / follow status. Fire-and-forget. */
export function updateContactProfile(params: {
  instagramAccountId: string;
  audienceIgUserId: string;
  username?: string | null;
  followsBusiness?: boolean | null;
}): void {
  void (async (): Promise<void> => {
    try {
      const db = createServiceClient();
      const { error } = await db.rpc('update_contact_profile', {
        p_account_id: params.instagramAccountId,
        p_audience_id: params.audienceIgUserId,
        p_username: params.username ?? null,
        p_follows: params.followsBusiness ?? null,
      });
      if (error) logger.warn({ err: error }, 'update_contact_profile failed');
    } catch (err) {
      logger.warn({ err }, 'update_contact_profile threw');
    }
  })();
}
