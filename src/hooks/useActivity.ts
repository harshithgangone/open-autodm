'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { ActivityItem } from '@/app/api/activity/route';

export type { ActivityItem };

export function useActivity(accountId?: string | null, limit = 20) {
  return useQuery({
    queryKey: ['activity', accountId ?? 'all', limit],
    queryFn: () =>
      apiClient<{ activities: ActivityItem[] }>(
        `/activity?limit=${limit}${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''}`
      ).then((r) => r.activities),
    refetchInterval: 15_000,
  });
}
