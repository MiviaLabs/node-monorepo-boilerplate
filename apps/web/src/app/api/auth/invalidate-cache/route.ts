/**
 * Cache Invalidation API Route
 *
 * Invalidates server-side session cache when user logs out.
 * This ensures the in-memory cache is cleared for the session.
 *
 * IMPORTANT: This API is called by the client during logout to
 * ensure cached session validation results are cleared.
 */

import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

import { invalidateSessionCache } from '~/lib/auth/server-auth';

// ============================================================================
// COOKIE NAMES
// ============================================================================

const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

/**
 * POST /api/auth/invalidate-cache
 *
 * Invalidates the server-side session cache for the current session.
 * Called during logout to ensure cached validation results are cleared.
 *
 * @param request - Next.js request object
 * @returns JSON response indicating success or failure
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get access token from cookie (cache key for validateSession)
    const accessTokenCookie = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME);
    const accessToken = accessTokenCookie?.value;

    if (!accessToken) {
      // No session to invalidate - still return success
      return NextResponse.json(
        { success: true, message: 'No session to invalidate' },
        { status: 200 }
      );
    }

    // Invalidate the session cache (async Redis operation)
    await invalidateSessionCache(accessToken);

    return NextResponse.json(
      { success: true, message: 'Session cache invalidated' },
      { status: 200 }
    );
  } catch (error) {
    // Log error but don't expose details to client
    console.error('[invalidate-cache] Failed to invalidate session cache:', error);

    // Return success anyway - cache invalidation failure should not block logout
    return NextResponse.json(
      { success: true, message: 'Cache invalidation attempted' },
      { status: 200 }
    );
  }
}
