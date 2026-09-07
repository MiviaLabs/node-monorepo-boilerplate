'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

import { ThemeProvider } from './theme-provider';
import { Toaster } from './toaster';

import { AuthProvider } from '~/contexts/auth-context';
import { api, apiClient } from '~/utils/api';

// ============================================================================
// REACT QUERY CONFIGURATION
// ============================================================================

/**
 * Stale time in milliseconds (5 minutes).
 * Data is considered fresh for this duration and won't be refetched.
 */
const REACT_QUERY_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cache time in milliseconds (10 minutes).
 * Cached data will be kept for this duration after the last observer unsubscribes.
 */
const REACT_QUERY_CACHE_TIME_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Number of retry attempts on failed queries.
 */
const REACT_QUERY_RETRY_COUNT = 1;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 5 minutes and won't trigger refetch
            staleTime: REACT_QUERY_STALE_TIME_MS,
            // Cached data is kept for 10 minutes after all observers unsubscribe
            gcTime: REACT_QUERY_CACHE_TIME_MS,
            // Disable automatic refetch when window regains focus to reduce API calls
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: REACT_QUERY_RETRY_COUNT
          }
        }
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <api.Provider client={apiClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </api.Provider>
      <Toaster />
    </ThemeProvider>
  );
}
