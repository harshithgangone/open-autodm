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

/**
 * Active Instagram account selection - a pure client-side convenience.
 *
 * SECURITY: the server never trusts this value. Every API route that accepts
 * an accountId re-verifies that the account belongs to the authenticated user
 * before using it; this store only decides which of the user's own accounts
 * the UI is currently looking at. Persisted so the choice survives reloads.
 */

import { persist } from 'zustand/middleware';

interface AccountStore {
  activeAccountId: string | null;
  setActiveAccount: (id: string | null) => void;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set) => ({
      activeAccountId: null,
      setActiveAccount: (id) => set({ activeAccountId: id }),
    }),
    { name: 'open-autodm-active-account' }
  )
);
