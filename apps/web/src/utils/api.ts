import { httpLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';

import type { RootRouter } from '~/server/api/root';

import { getRuntimeConfig } from '~/lib/runtime-config';

/**
 * Get the base URL for tRPC API calls.
 *
 * Client-side (browser):
 *   - Returns runtime config API URL if set (via server injection)
 *   - Otherwise always uses relative URLs like /api/trpc
 *   - This ensures client calls go through Next.js API routes first
 *
 * Server-side (Node.js):
 *   - Returns runtime config API URL if set
 *   - Falls back to VERCEL_URL or localhost
 *   - Used by Next.js API routes to call the backend API directly
 */
function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser: use runtime config
    const config = getRuntimeConfig();
    if (config.apiUrl) {
      return config.apiUrl;
    }

    // Empty string = use relative URL (/api/trpc) for production deployment
    // This routes through Next.js API routes instead of calling backend directly
    return '';
  }
  // Server-side: use env var or runtime config
  const config = getRuntimeConfig();
  if (config.apiUrl) {
    return config.apiUrl;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Strip trailing /api from base URL to avoid duplicates
 * Handles cases where NEXT_PUBLIC_API_URL already includes /api
 */
function getCleanBaseUrl(): string {
  const baseUrl = getBaseUrl();
  // Remove trailing /api if present (avoid duplicate /api/api/...)
  return baseUrl.replace(/\/api$/, '');
}

/**
 * Get CSRF token from meta tag injected by Next.js
 * @returns CSRF token or empty string if not found
 */
function getCsrfToken(): string {
  if (typeof window === 'undefined') return '';

  // Next.js 16 provides CSRF token via meta tag
  const metaTag = document.querySelector('meta[name="x-csrf-token"]');
  return metaTag?.getAttribute('content') ?? '';
}

export const api = createTRPCReact<RootRouter>();

export const apiClient = api.createClient({
  links: [
    httpLink({
      url: `${getCleanBaseUrl()}/api/trpc`,
      transformer: superjson,
      headers: () => {
        const csrfToken = getCsrfToken();
        // Only include CSRF token header if a token is available
        if (csrfToken) {
          return {
            'x-csrf-token': csrfToken
          };
        }
        return {};
      }
    })
  ]
});
