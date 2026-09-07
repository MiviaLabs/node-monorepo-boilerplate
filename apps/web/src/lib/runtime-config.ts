/**
 * Runtime configuration for the application.
 *
 * apiUrl is used differently on client vs server:
 *
 * Client-side (browser):
 *   - If set: Full URL to backend (for local dev with cross-origin)
 *   - If empty: Uses relative URLs (/api/trpc) - routes through Next.js API routes
 *   - For Railway: Should be empty (relative URLs)
 *
 * Server-side (Node.js):
 *   - Must be set to backend API URL
 *   - Used by Next.js API routes to proxy requests to backend
 *   - For Railway: Set to backend Railway URL
 */
export interface RuntimeConfig {
  apiUrl: string;
}

/**
 * Normalize API base URL with /api prefix.
 *
 * Accepts both:
 * - https://api.example.com
 * - https://api.example.com/api
 *
 * Returns:
 * - https://api.example.com/api
 */
function normalizeApiBaseUrl(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

/**
 * Get runtime configuration for the application.
 *
 * Client-side: Reads from data-api-url attribute injected by layout.tsx
 * Server-side: Reads from API_URL or NEXT_PUBLIC_API_URL environment variables
 *
 * Architecture: Client -> /api/trpc (Next.js) -> /api/auth/* (Next.js API routes) -> Backend API
 *
 * NOTE: No caching to avoid cross-contamination between client and server contexts
 *
 * @returns Runtime configuration object with API URL
 */
export function getRuntimeConfig(): RuntimeConfig {
  // Server-side: read from environment (no caching - always fresh read)
  if (typeof window === 'undefined') {
    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';
    return { apiUrl };
  }

  // Client-side: read from data attribute on html element
  const html = document.documentElement;
  const apiUrl = html.getAttribute('data-api-url') ?? '';

  return { apiUrl };
}

/**
 * Get the API URL from runtime configuration.
 *
 * This is used by Next.js API routes to call the backend API server-side.
 * For Railway deployment, API_URL must be set to the backend Railway URL.
 * Client-side code uses relative URLs (via getRuntimeConfig() with empty apiUrl).
 *
 * @returns API URL string
 * @throws Error if API_URL environment variable is not set
 */
export function getApiUrl(): string {
  const config = getRuntimeConfig();

  if (!config.apiUrl) {
    throw new Error(
      'API_URL environment variable is not set. ' +
        'This is required for Next.js API routes to call the backend. ' +
        'For Railway deployment, set API_URL to your backend Railway URL (e.g., https://api-dev-dev-4cee.up.railway.app). ' +
        'For local development, set API_URL=http://localhost:3000.'
    );
  }

  return config.apiUrl;
}

/**
 * Get versioned backend API base URL.
 *
 * Examples:
 * - getVersionedApiBaseUrl('v1') -> https://backend/api/v1
 *
 * @param version - API version prefix (for example, 'v1')
 * @returns Fully-qualified versioned API base URL with normalized /api prefix
 */
export function getVersionedApiBaseUrl(version: string = 'v1'): string {
  const apiUrl = getApiUrl();
  const normalizedBase = normalizeApiBaseUrl(apiUrl);
  return `${normalizedBase}/${version}`;
}
