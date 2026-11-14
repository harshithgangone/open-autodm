'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api/client';
import type { TrafficGuardStatusResponse } from '@/lib/types';

export function useTrafficGuard(accountId: string | null) {
  const queryClient = useQueryClient();
  const lastNotifiedIncidentId = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['traffic-guard', accountId],
    queryFn: async () => {
      if (!accountId) return null;
      return apiClient<TrafficGuardStatusResponse>(`/traffic-guard/status?accountId=${accountId}`);
    },
    enabled: Boolean(accountId),
    refetchInterval: 5000, // Poll every 5s for near-realtime traffic stats
    staleTime: 4000,
  });

  // Browser notification trigger (only if permission is ALREADY granted - never prompt repeatedly)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const data = query.data;
    if (!data?.incident) return;

    if (data.incident.id !== lastNotifiedIncidentId.current) {
      lastNotifiedIncidentId.current = data.incident.id;

      if (data.traffic_status === 'high_traffic') {
        try {
          new Notification('Unusually high Instagram comment traffic', {
            body: `This account received ${data.current_60s_count}+ unique comments within 60 seconds.`,
            icon: '/icon.svg',
          });
        } catch {
          // ignore notification error
        }
      } else if (data.traffic_status === 'recovered') {
        try {
          new Notification('Instagram comment traffic has normalized', {
            body: 'Comment volume has remained below the recovery threshold. Automations ready for review.',
            icon: '/icon.svg',
          });
        } catch {
          // ignore notification error
        }
      }
    }
  }, [query.data]);

  const pauseMutation = useMutation({
    mutationFn: async ({ accountId, incidentId }: { accountId: string; incidentId: string }) => {
      return apiClient<{ success: boolean; pausedAutomationIds: string[]; heldJobsCount: number }>(
        '/traffic-guard/pause',
        {
          method: 'POST',
          body: JSON.stringify({ accountId, incidentId }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traffic-guard', accountId] });
      queryClient.invalidateQueries({ queryKey: ['automations', accountId] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async ({ accountId, incidentId }: { accountId: string; incidentId: string }) => {
      return apiClient<{ success: boolean; resumedAutomationIds: string[]; resumedJobsCount: number }>(
        '/traffic-guard/resume',
        {
          method: 'POST',
          body: JSON.stringify({ accountId, incidentId }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traffic-guard', accountId] });
      queryClient.invalidateQueries({ queryKey: ['automations', accountId] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ notificationId }: { notificationId: string }) => {
      return apiClient<{ success: boolean }>('/traffic-guard/dismiss', {
        method: 'POST',
        body: JSON.stringify({ notificationId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traffic-guard', accountId] });
    },
  });

  return {
    ...query,
    pauseAccount: pauseMutation.mutateAsync,
    isPausing: pauseMutation.isPending,
    resumeAccount: resumeMutation.mutateAsync,
    isResuming: resumeMutation.isPending,
    dismissNotification: dismissMutation.mutateAsync,
  };
}
