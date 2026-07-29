'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface SetupStatus {
  configured: boolean;
  metaAppId: string | null;
  webhookVerifyToken: string | null;
  webhookUrl: string;
  oauthRedirectUri: string;
  appUrl: string;
  cronSnippet: string;
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => apiClient<SetupStatus>('/setup'),
    staleTime: 30 * 1000,
  });
}

export function useSaveSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { metaAppId: string; metaAppSecret: string; metaFbAppSecret?: string }) =>
      apiClient<{ success: boolean; webhookVerifyToken: string; webhookUrl: string; oauthRedirectUri: string }>('/setup', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    },
  });
}
