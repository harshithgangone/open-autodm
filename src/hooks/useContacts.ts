'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface ContactFromDB {
  id: string;
  instagram_account_id: string;
  audience_ig_user_id: string;
  username: string | null;
  follows_business: boolean | null;
  first_interaction_at: string;
  last_interaction_at: string;
  last_trigger_type: 'comment' | 'dm' | 'story_reply' | 'button' | null;
  total_triggers: number;
  automations: { id: string; name: string } | null;
}

export function useContacts(accountId?: string | null) {
  return useQuery({
    queryKey: ['contacts', accountId ?? 'all'],
    queryFn: () =>
      apiClient<{ contacts: ContactFromDB[] }>(
        `/contacts${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`
      ).then((r) => r.contacts),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // contacts grow as automations fire - keep fresh
  });
}
