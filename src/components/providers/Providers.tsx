'use client';

/**
 * AppProviders — wraps the app with all client-side providers.
 *
 * Providers included:
 *   1. ThemeProvider — existing dark/light mode provider (unchanged)
 *   2. QueryClientProvider — TanStack Query for server state caching
 *   3. Supabase auth listener — keeps Zustand store in sync with session
 *
 * This is a Client Component because it sets up listeners and providers that
 * require browser APIs. The children (which may be Server Components) are
 * passed through unaffected.
 */

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ThemeProvider';
import { createBrowserClient } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 60 seconds
      retry: 1,
    },
  },
});

function AuthListener() {
  const { setAuth, clearAuth } = useAuthStore();

  useEffect(() => {
    const supabase = createBrowserClient();

    // Fire once immediately to get the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuth(session.user, session);
      } else {
        clearAuth();
      }
    });

    // Keep the store in sync on auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuth(session.user, session);
      } else {
        clearAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth, clearAuth]);

  return null;
}

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthListener />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
