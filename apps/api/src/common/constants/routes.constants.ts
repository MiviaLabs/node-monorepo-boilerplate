/**
 * Route Pattern Constants
 *
 * Centralized route pattern constants used across middleware and guards.
 * Eliminates magic strings for route matching.
 *
 * @packageDocumentation
 */

/**
 * Public route patterns
 * Routes that don't require authentication or tenant context
 */
export const PublicRoutePatterns = {
  /** Swagger documentation routes */
  SWAGGER_DOCS: ['/docs', '/api/docs', '/api/docs/*'],

  /** Health check routes - non-versioned only, versioned routes are dynamically generated */
  HEALTH: ['/health'],

  /** Root and asset routes */
  ROOT_ASSETS: ['/', '/api', '/api/', '/favicon.ico', '/robots.txt'],

  /** Auth routes (prefix only, will be combined with version) */
  AUTH_PREFIX: '/iam',

  /** Bootstrap routes (prefix only, will be combined with version) */
  BOOTSTRAP_PREFIX: '/setup',

  /** Email webhook routes (prefix only, will be combined with version) */
  EMAIL_WEBHOOKS_PREFIX: '/webhooks/inbound-mail'
} as const;

/**
 * API path patterns
 */
export const ApiPathPatterns = {
  /** Base API path */
  BASE: '/api',
  /** Version path format */
  VERSION_FORMAT: '/api/:version'
} as const;

/**
 * Check if a path matches any of the given patterns.
 *
 * Supports exact matches and wildcard patterns ending with '/*'.
 *
 * @param path - The path to check
 * @param patterns - Array of patterns to match against (supports '/*' suffix for prefix matching)
 * @returns True if path matches any pattern
 */
export function matchesAnyPattern(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix);
    }
    return path === pattern;
  });
}

/**
 * Check if a path is a Swagger documentation route.
 *
 * @param path - The path to check
 * @returns True if path starts with '/docs' or '/api/docs'
 */
export function isSwaggerRoute(path: string): boolean {
  return path.startsWith('/docs') || path.startsWith('/api/docs');
}

/**
 * Check if a path is a health check route.
 *
 * Uses exact matching against known health routes for security.
 *
 * @param path - The path to check
 * @returns True if path exactly matches a known health route
 */
export function isHealthRoute(path: string): boolean {
  return PublicRoutePatterns.HEALTH.some((route) => path === route);
}

/**
 * Check if a path is a root or browser asset route.
 *
 * @param path - The path to check
 * @returns True if path is a root path or common browser asset request
 */
export function isRootOrAsset(path: string): boolean {
  return PublicRoutePatterns.ROOT_ASSETS.some((pattern) => pattern === path);
}

/**
 * Check if a path is a PUBLIC auth endpoint for a given version.
 *
 * Protected auth routes (e.g., /auth/me, /auth/actor, /auth/account/*) must NOT
 * be matched here because they require tenant context and authentication.
 *
 * @param path - The path to check
 * @param versionPrefix - The version prefix (e.g., 'v1', 'v2')
 * @returns True if path matches one of the known public auth routes
 */
export function isAuthRoute(path: string, versionPrefix: string): boolean {
  const publicPaths = [
    'invitations/preview',
    'invitations/accept',
    'invitations/decline',
    'enroll',
    'sessions',
    'sessions/oauth',
    'sessions/phone',
    'sessions/refresh',
    'tokens/verify'
  ] as const;

  return [`/api/${versionPrefix}/iam`, `/${versionPrefix}/iam`].some((basePath) => {
    if (
      path.startsWith(`${basePath}/credentials/recovery`) ||
      path.startsWith(`${basePath}/credentials/restore`) ||
      path.startsWith(`${basePath}/credentials/verify`)
    ) {
      return true;
    }

    return publicPaths.some((suffix) => path === `${basePath}/${suffix}`);
  });
}

/**
 * Check if a path is a PUBLIC bootstrap endpoint for a given version.
 */
export function isBootstrapRoute(path: string, versionPrefix: string): boolean {
  const publicPaths = ['status', 'install'] as const;

  return [`/api/${versionPrefix}/setup`, `/${versionPrefix}/setup`].some((basePath) =>
    publicPaths.some((suffix) => path === `${basePath}/${suffix}`)
  );
}

/**
 * Check if a path is a PUBLIC email webhook endpoint for a given version.
 *
 * Matches exactly one provider segment:
 * - /api/v1/webhooks/inbound-mail/resend
 * - /v2/webhooks/inbound-mail/resend
 *
 * Does not match extra nested segments.
 */
export function isEmailWebhookRoute(
  path: string,
  versionPrefix: string,
  apiPrefix?: string
): boolean {
  const normalizedApiPrefix = apiPrefix?.trim();
  const basePaths =
    normalizedApiPrefix && normalizedApiPrefix.length > 0
      ? [
          `/${normalizedApiPrefix}/${versionPrefix}/webhooks/inbound-mail`,
          `/${versionPrefix}/webhooks/inbound-mail`
        ]
      : [`/${versionPrefix}/webhooks/inbound-mail`];

  return basePaths.some((basePath) => {
    if (!path.startsWith(`${basePath}/`)) {
      return false;
    }

    const remainder = path.slice(basePath.length + 1);
    return remainder.length > 0 && !remainder.includes('/');
  });
}
