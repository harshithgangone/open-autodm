'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface InstagramPost {
  id: string;
  type: 'reel' | 'image' | 'carousel';
  thumbnail_url: string | null;
  media_url: string | null;
  permalink: string;
  timestamp: string;
  caption: string;
  like_count: number;
  comments_count: number;
}

interface PostsPage {
  posts: InstagramPost[];
  nextCursor: string | null;
  cached: boolean;
}

const PAGE_LIMIT = 20;

export function useInstagramPosts(accountId: string | null | undefined) {
  return useInfiniteQuery<PostsPage, Error>({
    queryKey: ['instagram-posts', accountId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = `/instagram/posts/${accountId}?limit=${PAGE_LIMIT}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`;
      return apiClient<PostsPage>(url);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}
