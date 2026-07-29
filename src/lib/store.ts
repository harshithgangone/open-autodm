'use client';

/**
 * Zustand global auth store.
 *
 * Populated by the Supabase onAuthStateChange listener in AppProviders.
 * Components that need the current user read from this store instead of
 * calling supabase.auth.getUser() on every render.
 */

import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';

interface AuthStore {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  setAuth: (user: User | null, session: Session | null) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  isLoading: true, // true until first auth state event fires
  setAuth: (user, session) => set({ user, session, isLoading: false }),
  clearAuth: () => set({ user: null, session: null, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
