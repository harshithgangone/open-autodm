'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export type TokenStatus = 'ok' | 'expiring' | 'expired';

export interface InstagramAccount {
  id: string;
  instagram_user_id: string;
  username: string;
  name: string | null;
  profile_picture_url: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  token_status: TokenStatus;
  token_days_remaining: number | null;
  is_paused: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  created_at: string;
}

export function useInstagramAccounts() {
  return useQuery({
    queryKey: ['instagram-accounts'],
    queryFn: () => apiClient<{ accounts: InstagramAccount[] }>('/instagram/accounts').then((r) => r.accounts),
    staleTime: 60 * 1000, // 1 minute - refetch frequently to catch revoked access
    refetchOnWindowFocus: true,
  });
}

export function useRefreshInstagramToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiClient<{ success: boolean; token_expires_at: string; token_days_remaining: number }>
        (`/instagram/refresh/${accountId}`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] });
    },
  });
}

export function useResubscribeWebhook() {
  return useMutation({
    mutationFn: (accountId: string) =>
      apiClient<{ success: boolean; subscribedFields: string; meta: string }>
        (`/instagram/resubscribe/${accountId}`, { method: 'POST' }),
  });
}

export function useCheckSubscription() {
  return useMutation({
    mutationFn: (accountId: string) =>
      apiClient<{ subscribedFields: string[]; hasComments: boolean; hasMessages: boolean; raw: string }>
        (`/instagram/subscription-status/${accountId}`),
  });
}
