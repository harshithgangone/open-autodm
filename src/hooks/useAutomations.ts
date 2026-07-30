'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api/client';
import { createBrowserClient } from '@/lib/supabase';

export interface AutomationFromDB {
  id: string;
  name: string;
  type: 'comment_dm' | 'dm_reply' | 'story_reply';
  is_active: boolean;
  post_id: string | null;
  post_thumbnail_url: string | null;
  post_caption: string | null;
  keywords: string[] | null;
  comment_reply_options: string[];
  dm_opening_message_enabled: boolean;
  dm_opening_message: string;
  dm_opening_message_button_title: string | null;
  dm_opening_message_button_link: string | null;
  ask_to_follow_enabled: boolean;
  ask_to_follow_message: string;
  ask_to_follow_visit_profile_button: string;
  ask_to_follow_confirm_button: string;
  dm_responses: DMResponse[];
  total_dms_sent: number;
  created_at: string;
  updated_at: string;
  instagram_account_id: string;
  instagram_accounts: {
    id: string;
    username: string;
    profile_picture_url: string | null;
  } | null;
}

export interface DMResponse {
  id: string;
  type: 'text' | 'card' | 'ask_follow' | 'lead_form';
  content: string;
  buttonTitle?: string;
  buttonLink?: string;
  cardImage?: string;
  cardTitle?: string;
  cardSubtitle?: string;
  cardButtons?: { id: string; title: string; link: string }[];
}

export interface CreateAutomationPayload {
  instagramAccountId: string;
  name: string;
  type: 'comment_dm' | 'dm_reply' | 'story_reply';
  isActive?: boolean;
  postId?: string | null;
  postThumbnailUrl?: string | null;
  postCaption?: string | null;
  keywords?: string[] | null;
  commentReplyOptions?: string[];
  dmOpeningMessageEnabled?: boolean;
  dmOpeningMessage?: string;
  dmOpeningMessageButtonTitle?: string | null;
  dmOpeningMessageButtonLink?: string | null;
  askToFollowEnabled?: boolean;
  askToFollowMessage?: string;
  askToFollowVisitProfileButton?: string;
  askToFollowConfirmButton?: string;
  dmResponses?: DMResponse[];
}

export interface UpdateAutomationPayload {
  is_active?: boolean;
  name?: string;
  keywords?: string[] | null;
  comment_reply_options?: string[];
  dm_opening_message_enabled?: boolean;
  dm_opening_message?: string;
  dm_opening_message_button_title?: string | null;
  dm_opening_message_button_link?: string | null;
  post_thumbnail_url?: string | null;
  post_caption?: string | null;
  ask_to_follow_enabled?: boolean;
  ask_to_follow_message?: string;
  ask_to_follow_visit_profile_button?: string;
  ask_to_follow_confirm_button?: string;
  dm_responses?: DMResponse[];
}

/** Upload base64 card images to Supabase Storage and return responses with public URLs. */
async function processCardImages(responses: DMResponse[]): Promise<DMResponse[]> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return responses;

  return Promise.all(
    responses.map(async (r) => {
      if (r.type !== 'card' || !r.cardImage?.startsWith('data:')) return r;

      const mimeMatch = r.cardImage.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch?.[1] ?? 'image/jpeg';
      const base64Data = r.cardImage.split(',')[1];
      if (!base64Data) return r;

      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: mimeType });

      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: uploadData, error } = await supabase.storage
        .from('card-images')
        .upload(path, blob, { contentType: mimeType, upsert: false });

      if (error || !uploadData) {
        console.warn('Card image upload failed:', error?.message);
        return r;
      }

      const { data: { publicUrl } } = supabase.storage.from('card-images').getPublicUrl(uploadData.path);
      return { ...r, cardImage: publicUrl };
    }),
  );
}

export function useAutomations(accountId?: string | null) {
  return useQuery({
    queryKey: ['automations', accountId ?? 'all'],
    queryFn: () =>
      apiClient<{ automations: AutomationFromDB[] }>(
        `/automations${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`
      ).then((r) => r.automations),
  });
}

export function useCreateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateAutomationPayload) => {
      const processedResponses = await processCardImages(payload.dmResponses ?? []);
      return apiClient<{ automation: AutomationFromDB }>('/automations', {
        method: 'POST',
        body: JSON.stringify({ ...payload, dmResponses: processedResponses }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}

export function useToggleAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient<{ automation: AutomationFromDB }>(`/automations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: isActive }),
      }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ['automations'] });
      const previous = queryClient.getQueryData<AutomationFromDB[]>(['automations']);
      queryClient.setQueryData<AutomationFromDB[]>(['automations'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, is_active: isActive } : a)) ?? []
      );
      return { previous };
    },
    onError: (_err: ApiError, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['automations'], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/automations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & UpdateAutomationPayload) => {
      const processedResponses = payload.dm_responses
        ? await processCardImages(payload.dm_responses)
        : undefined;
      return apiClient<{ automation: AutomationFromDB }>(`/automations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, dm_responses: processedResponses }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}
