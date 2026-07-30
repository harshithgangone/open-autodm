'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface AnalyticsTotals {
  triggers: number;
  comments: number;
  dmKeywords: number;
  storyReplies: number;
  delivered: number;
  failed: number;
  flowsStarted: number;
  flowsCompleted: number;
  askToFollowShown: number;
  followsGained: number;
  newContacts: number;
  newContactFollowers: number;
}

export interface AnalyticsDaily {
  date: string;
  comments: number;
  dms: number;
  stories: number;
  delivered: number;
  contacts: number;
}

export interface AnalyticsPerAutomation {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  triggers: number;
  delivered: number;
  failed: number;
  flowsCompleted: number;
  follows: number;
}

export interface AnalyticsPayload {
  range: { from: string; to: string };
  totals: AnalyticsTotals;
  daily: AnalyticsDaily[];
  perAutomation: AnalyticsPerAutomation[];
  automations: { id: string; name: string; type: string }[];
  truncated: boolean;
}

export function useAnalytics(params: { from: string; to: string; automationId: string; accountId?: string | null }) {
  const search = new URLSearchParams({
    from: params.from,
    to: params.to,
    automationId: params.automationId,
  });
  if (params.accountId) search.set('accountId', params.accountId);
  return useQuery({
    queryKey: ['analytics', params.from, params.to, params.automationId, params.accountId ?? 'all'],
    queryFn: () => apiClient<AnalyticsPayload>(`/analytics?${search.toString()}`),
    staleTime: 60 * 1000,
  });
}
