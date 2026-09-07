/**
 * Auth Router
 *
 * tRPC procedures for authentication endpoints.
 * Provides type-safe API calls with automatic React Query caching.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

import type { AuthResponse } from '~/types/auth.types';

import { resolveServerRequestAuthContextFromHeaders } from '~/lib/auth/server-request-auth';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const BACKEND_REQUEST_TIMEOUT_MS = 15000;

class BackendTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'BackendTimeoutError';
  }
}

/**
 * Make API request to Next.js API route (which proxies to backend)
 *
 * This ensures all backend calls go through Next.js API routes,
 * not directly from tRPC handlers to the backend.
 *
 * @param endpoint - Backend endpoint path (e.g., '/iam/sessions')
 * @param options - Fetch options
 * @returns Parsed response data
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Server-side (tRPC handler): call backend directly
  // Client-side (browser): call Next.js API route which proxies to backend

  let url: string;

  if (typeof window === 'undefined') {
    // Server-side: call backend API directly
    // Backend URL from env: https://api-dev-dev-4cee.up.railway.app
    // Endpoint: /iam/enroll
    // Full URL: https://api-dev-dev-4cee.up.railway.app/v2/iam/enroll
    const apiBaseUrl = getVersionedApiBaseUrl('v1');
    url = `${apiBaseUrl}${endpoint}`;
  } else {
    // Client-side: call Next.js API route which proxies to backend
    url = `/api${endpoint}`;
  }

  let response: Response;
  try {
    response = (await Promise.race([
      fetch(url, {
        ...options,
        credentials: 'include', // Include cookies for CSRF protection
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new BackendTimeoutError(BACKEND_REQUEST_TIMEOUT_MS)),
          BACKEND_REQUEST_TIMEOUT_MS
        );
      })
    ])) as Response;
  } catch (error) {
    const isTimeout = error instanceof BackendTimeoutError;

    throw new TRPCError({
      code: isTimeout ? 'TIMEOUT' : 'BAD_GATEWAY',
      message: isTimeout
        ? 'Authentication service timeout'
        : error instanceof Error
          ? error.message
          : 'Authentication service unavailable'
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An unknown error occurred' }));

    // Map HTTP status codes to tRPC error codes
    let trpcCode: TRPCError['code'] = 'INTERNAL_SERVER_ERROR';
    if (response.status === 400) trpcCode = 'BAD_REQUEST';
    else if (response.status === 401) trpcCode = 'UNAUTHORIZED';
    else if (response.status === 403) trpcCode = 'FORBIDDEN';
    else if (response.status === 404) trpcCode = 'NOT_FOUND';
    else if (response.status === 429) trpcCode = 'TOO_MANY_REQUESTS';
    else if (response.status === 409) trpcCode = 'CONFLICT';
    else if (response.status === 502 || response.status === 503) trpcCode = 'BAD_GATEWAY';
    else if (response.status === 504) trpcCode = 'TIMEOUT';

    // Sanitize error message to avoid leaking backend details
    const message =
      response.status === 502 || response.status === 503
        ? 'Authentication service unavailable'
        : response.status === 504
          ? 'Authentication service timeout'
          : response.status >= 500
            ? 'Internal server error'
            : (error.message ?? 'Request failed');

    throw new TRPCError({
      code: trpcCode,
      message
    });
  }

  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json();
  // Unwrap { data, meta } response format from VersionInterceptor
  return (json as { data: T }).data;
}

async function getContextAuthHeaders(
  headers: Headers
): Promise<{ Authorization: string; 'x-tenant-id': string }> {
  const resolved = await resolveServerRequestAuthContextFromHeaders(headers, {
    source: 'web.trpc.auth_router',
    route: '/iam/identity'
  });
  const authorization =
    headers.get('authorization') ??
    (resolved?.accessToken ? `Bearer ${resolved.accessToken}` : null);
  const tenantHeader = headers.get('x-tenant-id') ?? resolved?.tenantId;

  if (!authorization || !tenantHeader) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  return {
    Authorization: authorization,
    'x-tenant-id': tenantHeader
  };
}

// ============================================================================
// INPUT VALIDATION SCHEMAS
// ============================================================================

/**
 * Login input schema
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

/**
 * Register input schema
 */
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  tenantId: z.string().optional(),
  invitationToken: z.string().optional()
});

/**
 * Refresh token input schema
 */
const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

/**
 * Logout input schema
 */
const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  accessToken: z.string().min(1, 'Access token is required')
});

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be in E.164 format (for example: +14155552671)')
    .or(z.literal(''))
});

/**
 * Get user roles input schema
 */
const getUserRolesSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required')
});

/**
 * Delete account input schema
 */
const deleteAccountSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  accessToken: z.string().min(1, 'Access token is required'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
  reason: z.string().optional()
});

// ============================================================================
// AUTH ROUTER
// ============================================================================

/**
 * Authentication router
 *
 * Provides type-safe procedures for:
 * - login: Authenticate user and get tokens
 * - register: Create new user account
 * - refresh: Refresh access token
 * - logout: Invalidate session
 * - getMe: Get current user profile
 * - getSessions: Get user sessions
 * - validateToken: Validate access token
 * - getUserRoles: Get user roles and permissions
 * - deleteAccount: Delete user account
 */
export const authRouter = createTRPCRouter({
  /**
   * Login user
   *
   * Authenticates user credentials and returns tokens + user info.
   *
   * @param email - User email address
   * @param password - User password
   * @returns Auth response with tokens and user data
   */
  login: publicProcedure.input(loginSchema).mutation(async ({ input }) => {
    return apiRequest<AuthResponse>('/iam/sessions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }),

  /**
   * Register new user
   *
   * Creates a new user account and returns tokens + user info.
   *
   * @param email - User email address
   * @param password - User password
   * @param displayName - Optional display name
   * @param organizationName - Optional organization name
   * @param organizationSlug - Optional generated organization slug
   * @returns Auth response with tokens and user data
   */
  register: publicProcedure.input(registerSchema).mutation(async ({ input }) => {
    const { tenantId, ...payload } = input;
    return apiRequest<AuthResponse>('/iam/enroll', {
      method: 'POST',
      headers: {
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      },
      body: JSON.stringify(payload)
    });
  }),

  /**
   * Refresh access token
   *
   * Uses refresh token to get new access token.
   *
   * @param refreshToken - Refresh token
   * @returns Auth response with new tokens
   */
  refresh: publicProcedure.input(refreshSchema).mutation(async ({ input }) => {
    return apiRequest<AuthResponse>('/iam/sessions/refresh', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }),

  /**
   * Logout user
   *
   * Invalidates the current session and tokens.
   *
   * @param refreshToken - Refresh token to invalidate
   * @param accessToken - Access token for authorization
   * @returns Success message
   */
  logout: publicProcedure.input(logoutSchema).mutation(async ({ input }) => {
    return apiRequest<{ message: string }>('/iam/sessions/close', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`
      },
      body: JSON.stringify({ refreshToken: input.refreshToken })
    });
  }),

  /**
   * Get user roles and permissions
   *
   * Retrieves roles and permissions for the authenticated user.
   *
   * @param accessToken - Access token for authorization
   * @returns User roles and permissions
   */
  getUserRoles: publicProcedure.input(getUserRolesSchema).query(async ({ input }) => {
    return apiRequest<{ roles: string[]; permissions: string[] }>('/iam/roles', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.accessToken}`
      }
    });
  }),

  /**
   * Get current user profile
   *
   * Retrieves the complete profile for the authenticated user.
   *
   * @param accessToken - Access token for authorization
   * @returns User profile data
   */
  getMe: publicProcedure
    .input(
      z.object({
        accessToken: z.string().min(1, 'Access token is required')
      })
    )
    .query(async ({ input }) => {
      return apiRequest<{
        id: string;
        userId: string;
        email: string;
        displayName?: string;
        photoUrl?: string;
        avatarFileId?: number;
        roles: string[];
        permissions: string[];
        tenantId: string;
      }>('/iam/identity', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.accessToken}`
        }
      });
    }),

  /**
   * Update current user profile
   *
   * Updates display name and phone number for the authenticated user.
   * Authorization and tenant context are sourced from request headers/cookies.
   */
  updateMyProfile: publicProcedure.input(updateProfileSchema).mutation(async ({ input, ctx }) => {
    const authHeaders = await getContextAuthHeaders(ctx.headers);
    return apiRequest<{
      userId: string;
      tenantId: string;
      email?: string;
      phoneNumber?: string;
      name?: string;
      displayName?: string;
      photoUrl?: string;
      avatarFileId?: number;
      roles: string[];
      permissions: string[];
    }>('/iam/identity', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        displayName: input.displayName,
        phoneNumber: input.phoneNumber
      })
    });
  }),

  /**
   * Get user sessions
   *
   * Retrieves all active sessions for the authenticated user.
   *
   * @param accessToken - Access token for authorization
   * @returns Array of user sessions
   */
  getSessions: publicProcedure
    .input(
      z.object({
        accessToken: z.string().min(1, 'Access token is required')
      })
    )
    .query(async ({ input }) => {
      return apiRequest<unknown[]>('/iam/sessions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.accessToken}`
        }
      });
    }),

  /**
   * Validate access token
   *
   * Validates an access token and returns user information if valid.
   *
   * @param token - Access token to validate
   * @returns Validation result with user info if valid
   */
  validateToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, 'Token is required')
      })
    )
    .mutation(async ({ input }) => {
      return apiRequest<{ valid: boolean; user?: unknown }>('/iam/tokens/verify', {
        method: 'POST',
        body: JSON.stringify({ token: input.token })
      });
    }),

  /**
   * Delete user account
   *
   * Permanently deletes the user account and associated data.
   *
   * @param userId - User ID to delete
   * @param accessToken - Access token for authorization
   * @param tenantId - Tenant ID for multi-tenancy
   * @param reason - Optional reason for deletion
   * @returns Void on success
   */
  deleteAccount: publicProcedure.input(deleteAccountSchema).mutation(async ({ input }) => {
    const queryParams = input.reason ? `?reason=${encodeURIComponent(input.reason)}` : '';
    const endpoint = `/iam/account/${input.userId}${queryParams}`;

    return apiRequest<void>(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'x-tenant-id': input.tenantId
      }
    });
  })
});

// ============================================================================
// EXPORTS
// ============================================================================

export type { AuthResponse };
