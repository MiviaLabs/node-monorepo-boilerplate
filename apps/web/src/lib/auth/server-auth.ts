/**
 * Server-Side Auth Utilities
 *
 * Proxy-compatible session validation using API backend
 *
 * IMPORTANT: This runs in the web app's protected server path.
 * It must not depend on a separate Redis cache to decide whether a session is valid.
 */

import {
  createStoredSession,
  deleteStoredSession,
  getStoredSession,
  hasStoredSessionChanged,
  type WebStoredSession
} from '~/lib/auth/session-store';
import {
  ensurePhase0Trace,
  getPhase0ApiTargetAttributes,
  getPhase0TraceAttributes,
  measurePhase0,
  recordPhase0Note
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { type AuthResponse, normalizeUser, type User } from '~/types/auth.types';

// ============================================================================
// CONSTANTS (P1: Extract magic numbers)
// ============================================================================

/** API version prefix for iam endpoints */
const API_VERSION = 'v1';

/** Maximum retry attempts for transient failures */
const MAX_RETRY_ATTEMPTS = 2;

/** Base delay for exponential backoff in milliseconds */
const RETRY_BASE_DELAY_MS = 500;

/** Request timeout in milliseconds (3 seconds) */
const REQUEST_TIMEOUT_MS = 3000;

/** HTTP status codes that should not be retried */
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404];

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error categories for session validation failures
 */
const enum ValidationErrorType {
  Network = 'network',
  ApiDown = 'api_down',
  Invalid = 'invalid',
  Timeout = 'timeout'
}

export const enum ServerSessionResolutionStatus {
  Valid = 'valid',
  Refreshed = 'refreshed',
  AuthInvalid = 'auth_invalid',
  TransientFailure = 'transient_failure',
  Missing = 'missing'
}

interface ValidationError {
  type: ValidationErrorType;
  message: string;
  retryable: boolean;
}

interface RefreshError extends Error {
  kind: ServerSessionResolutionStatus.AuthInvalid | ServerSessionResolutionStatus.TransientFailure;
  status?: number;
}

interface SessionResolutionOptions {
  source?: string;
  route?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

interface ServerSessionResolution {
  status: ServerSessionResolutionStatus;
  accessToken?: string;
  tenantId?: string;
  sessionId?: string;
  user?: User;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get API URL from environment
 * Must work in Edge runtime (middleware)
 */
function getApiUrl(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

/**
 * Normalize API URL to include /api prefix.
 *
 * Supports both:
 * - https://api.example.com
 * - https://api.example.com/api
 */
function getApiBaseUrl(): string {
  const apiUrl = getApiUrl().replace(/\/+$/, '');
  return apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
}

/**
 * Categorize an error into a ValidationError
 *
 * @param error - The caught error
 * @param response - Optional HTTP response
 * @returns Categorized validation error
 */
function categorizeError(error: unknown, response?: Response): ValidationError {
  // Timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: ValidationErrorType.Timeout,
      message: 'Session validation request timed out',
      retryable: true
    };
  }

  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: ValidationErrorType.Network,
      message: 'Network error during session validation',
      retryable: true
    };
  }

  // HTTP response errors
  if (response) {
    const status = response.status;

    // 4xx client errors (except 408 timeout, 429 rate limit)
    if (NON_RETRYABLE_STATUS_CODES.includes(status)) {
      return {
        type: ValidationErrorType.Invalid,
        message: `Session validation failed with status ${status}`,
        retryable: false
      };
    }

    // 5xx server errors or rate limiting
    if (status >= 500 || status === 429 || status === 408) {
      return {
        type: ValidationErrorType.ApiDown,
        message: `API returned status ${status}`,
        retryable: true
      };
    }
  }

  // Generic error
  return {
    type: ValidationErrorType.Network,
    message: error instanceof Error ? error.message : 'Unknown error',
    retryable: true
  };
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Safe error logging (no stack traces in production)
 *
 * @param message - Log message
 * @param error - Error details (sanitized in production)
 * @param requestId - Request correlation ID
 */
function safeLogError(message: string, error: ValidationError, requestId: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(`[server-auth] ${message}`, {
      requestId,
      errorType: error.type,
      retryable: error.retryable
    });
  } else {
    console.error(`[server-auth] ${message}`, {
      requestId,
      ...error
    });
  }
}

// ============================================================================
// RESPONSE VALIDATION
// ============================================================================

/**
 * Expected API response format (BaseResponseDto wrapper)
 */
interface ApiValidationResponse {
  data?: {
    valid: boolean;
    user?: User;
  };
  valid?: boolean;
  user?: User;
}

interface ApiAuthResponse {
  data?: AuthResponse;
}

/**
 * Validate and parse API response with runtime type checking
 *
 * Handles both BaseResponseDto format ({ data: { valid, user } })
 * and direct format ({ valid, user }).
 *
 * @param json - Raw JSON response
 * @param requestId - Request ID for logging
 * @returns Parsed validation result
 */
function parseValidationResponse(
  json: unknown,
  requestId: string
): { valid: boolean; user?: User } {
  // Null/undefined check
  if (json === null || json === undefined) {
    console.warn(`[server-auth] Empty response body`, { requestId });
    return { valid: false };
  }

  // Type guard for object
  if (typeof json !== 'object') {
    console.warn(`[server-auth] Unexpected response type: ${typeof json}`, { requestId });
    return { valid: false };
  }

  const response = json as ApiValidationResponse;

  // Check BaseResponseDto format: { data: { valid, user } }
  if (response.data && typeof response.data === 'object') {
    const data = response.data;

    if (typeof data.valid === 'boolean') {
      return {
        valid: data.valid,
        user: isValidUser(data.user) ? data.user : undefined
      };
    }
  }

  // Check direct format: { valid, user }
  if (typeof response.valid === 'boolean') {
    return {
      valid: response.valid,
      user: isValidUser(response.user) ? response.user : undefined
    };
  }

  // Unexpected format
  console.warn(`[server-auth] Unexpected response format`, {
    requestId,
    hasData: 'data' in response,
    hasValid: 'valid' in response
  });
  return { valid: false };
}

function parseAuthResponse(json: unknown): AuthResponse | null {
  if (json === null || json === undefined || typeof json !== 'object') {
    return null;
  }

  const payload =
    'data' in (json as Record<string, unknown>) &&
    (json as ApiAuthResponse).data &&
    typeof (json as ApiAuthResponse).data === 'object'
      ? ((json as unknown as ApiAuthResponse).data as unknown as Record<string, unknown>)
      : (json as Record<string, unknown>);

  if (
    typeof payload.accessToken !== 'string' ||
    typeof payload.refreshToken !== 'string' ||
    typeof payload.expiresIn !== 'number' ||
    typeof payload.refreshExpiresIn !== 'number' ||
    typeof payload.user !== 'object' ||
    payload.user === null
  ) {
    return null;
  }

  return payload as unknown as AuthResponse;
}

/**
 * Type guard to validate User object structure
 *
 * @param user - Object to validate
 * @returns True if object has valid User structure
 */
function isValidUser(user: unknown): user is User {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const u = user as Record<string, unknown>;

  return (
    typeof u.userId === 'string' && typeof u.email === 'string' && typeof u.tenantId === 'string'
  );
}

// ============================================================================
// CORE VALIDATION FUNCTION
// ============================================================================

/**
 * Validate access token with backend API
 *
 * This function is called by middleware to verify access tokens.
 * It makes an HTTP request to the backend to validate the token.
 *
 * Features:
 * - Retry logic with exponential backoff (max 2 retries)
 * - 3-second timeout per request
 * - Error categorization (network, api_down, invalid, timeout)
 * - Request correlation IDs for tracing
 * - Runtime response validation
 *
 * @param accessToken - Access token from cookie
 * @param tenantId - Optional tenant ID from cookie for multi-tenancy
 * @returns Validation result with user data if valid
 */
export async function validateSession(
  accessToken: string,
  tenantId?: string,
  options?: {
    source?: string;
    route?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }
): Promise<{
  valid: boolean;
  user?: User;
  failureType?: ValidationErrorType;
}> {
  const trace = ensurePhase0Trace(
    new Headers(
      Object.entries({
        ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
        ...(options?.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
        ...(options?.causationId ? { 'x-causation-id': options.causationId } : {})
      })
    )
  );
  const requestId = options?.requestId ?? trace.requestId;
  const correlationId = options?.correlationId ?? trace.correlationId;
  const causationId = options?.causationId ?? trace.causationId;

  // Validate token exists before making API call
  if (!accessToken) {
    return { valid: false, failureType: ValidationErrorType.Invalid };
  }

  let lastError: ValidationError | null = null;

  const apiBaseUrl = getApiBaseUrl();
  const apiTargetAttributes = getPhase0ApiTargetAttributes(apiBaseUrl);

  recordPhase0Note('web.server_auth.validate_session.target', {
    source: options?.source ?? 'unknown',
    route: options?.route,
    ...getPhase0TraceAttributes({
      requestId,
      correlationId,
      causationId
    }),
    ...apiTargetAttributes
  });

  return measurePhase0(
    'web.server_auth.validate_session',
    {
      source: options?.source ?? 'unknown',
      route: options?.route,
      tenantIdPresent: Boolean(tenantId),
      ...getPhase0TraceAttributes({
        requestId,
        correlationId,
        causationId
      }),
      ...apiTargetAttributes
    },
    async () => {
      // Retry loop with exponential backoff
      for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        // Apply backoff delay for retries
        if (attempt > 0) {
          const delay = calculateBackoffDelay(attempt - 1);
          await sleep(delay);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const url = `${apiBaseUrl}/${API_VERSION}/iam/tokens/verify`;

          // Build headers with correlation IDs and optional tenant ID
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-request-id': requestId,
            'x-correlation-id': correlationId,
            'x-causation-id': causationId
          };

          // Add tenant ID header for multi-tenancy support
          if (tenantId) {
            headers['x-tenant-id'] = tenantId;
          }

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ token: accessToken }),
            signal: controller.signal,
            cache: 'no-store'
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const error = categorizeError(null, response);

            // Don't retry on 401/403 (invalid session)
            if (!error.retryable) {
              return { valid: false, failureType: error.type };
            }

            lastError = error;
            continue; // Retry
          }

          // Parse and validate response
          const json = await response.json();
          const result = parseValidationResponse(json, requestId);

          return result.valid
            ? result
            : {
                ...result,
                failureType: ValidationErrorType.Invalid
              };
        } catch (error) {
          clearTimeout(timeoutId);

          const categorized = categorizeError(error);

          // Don't retry non-retryable errors
          if (!categorized.retryable) {
            safeLogError('Session validation failed (not retrying)', categorized, requestId);
            return { valid: false, failureType: categorized.type };
          }

          lastError = categorized;
          // Continue to next retry attempt
        }
      }

      // All retries exhausted
      if (lastError) {
        safeLogError('Session validation failed after retries', lastError, requestId);
      }

      // Fail closed (deny access) on persistent errors
      return {
        valid: false,
        failureType: lastError?.type ?? ValidationErrorType.Network
      };
    }
  );
}

function buildTraceContext(options?: SessionResolutionOptions) {
  const trace = ensurePhase0Trace(
    new Headers(
      Object.entries({
        ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
        ...(options?.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
        ...(options?.causationId ? { 'x-causation-id': options.causationId } : {})
      })
    )
  );

  return {
    requestId: options?.requestId ?? trace.requestId,
    correlationId: options?.correlationId ?? trace.correlationId,
    causationId: options?.causationId ?? trace.causationId
  };
}

function buildValidationOptions(
  options: SessionResolutionOptions | undefined,
  trace: ReturnType<typeof buildTraceContext>,
  sourceSuffix: string
): SessionResolutionOptions {
  return {
    source: [options?.source, sourceSuffix].filter(Boolean).join('.'),
    route: options?.route,
    requestId: trace.requestId,
    correlationId: trace.correlationId,
    causationId: trace.causationId
  };
}

function isValidationInvalid(
  failureType: ValidationErrorType | undefined
): failureType is ValidationErrorType.Invalid {
  return failureType === undefined || failureType === ValidationErrorType.Invalid;
}

async function refreshStoredSession(
  session: WebStoredSession,
  options?: SessionResolutionOptions
): Promise<AuthResponse> {
  const trace = buildTraceContext(options);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/${API_VERSION}/iam/sessions/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': session.tenantId,
        'x-request-id': trace.requestId,
        'x-correlation-id': trace.correlationId,
        'x-causation-id': trace.causationId
      },
      body: JSON.stringify({
        refreshToken: session.refreshToken
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    const payload = await response.json().catch(() => null);
    const auth = parseAuthResponse(payload);

    if (!response.ok || !auth) {
      const error = new Error('Failed to refresh session') as RefreshError;
      error.status = response.status;
      error.kind = [400, 401, 403].includes(response.status)
        ? ServerSessionResolutionStatus.AuthInvalid
        : ServerSessionResolutionStatus.TransientFailure;
      throw error;
    }

    return auth;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'kind' in error &&
      (error as RefreshError).kind
    ) {
      throw error;
    }

    const refreshError = new Error(
      error instanceof Error ? error.message : 'Failed to refresh session'
    ) as RefreshError;
    refreshError.kind = ServerSessionResolutionStatus.TransientFailure;
    throw refreshError;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveLatestStoredSession(
  session: WebStoredSession,
  options?: SessionResolutionOptions
): Promise<ServerSessionResolution | null> {
  if (!(await hasStoredSessionChanged(session.sessionId, session.updatedAt))) {
    return null;
  }

  const latest = await getStoredSession(session.sessionId);
  if (!latest) {
    return null;
  }

  const trace = buildTraceContext(options);
  const validated = await validateSession(
    latest.accessToken,
    latest.tenantId,
    buildValidationOptions(options, trace, 'latest')
  );

  if (!validated.valid) {
    return isValidationInvalid(validated.failureType)
      ? null
      : {
          status: ServerSessionResolutionStatus.TransientFailure,
          accessToken: latest.accessToken,
          tenantId: latest.tenantId,
          sessionId: latest.sessionId
        };
  }

  return {
    status: ServerSessionResolutionStatus.Valid,
    accessToken: latest.accessToken,
    tenantId: validated.user?.tenantId ?? latest.tenantId,
    sessionId: latest.sessionId,
    user: validated.user
  };
}

export async function resolveServerSession(
  input: {
    accessToken?: string;
    tenantId?: string;
    webSessionId?: string;
  },
  options?: SessionResolutionOptions
): Promise<ServerSessionResolution> {
  const trace = buildTraceContext(options);

  if (input.accessToken) {
    const validated = await validateSession(
      input.accessToken,
      input.tenantId,
      buildValidationOptions(options, trace, 'request')
    );

    if (validated.valid && validated.user) {
      return {
        status: ServerSessionResolutionStatus.Valid,
        accessToken: input.accessToken,
        tenantId: validated.user.tenantId ?? input.tenantId,
        sessionId: input.webSessionId,
        user: validated.user
      };
    }

    if (!input.webSessionId && !isValidationInvalid(validated.failureType)) {
      return {
        status: ServerSessionResolutionStatus.TransientFailure,
        accessToken: input.accessToken,
        tenantId: input.tenantId
      };
    }
  }

  if (!input.webSessionId) {
    return {
      status: input.accessToken
        ? ServerSessionResolutionStatus.AuthInvalid
        : ServerSessionResolutionStatus.Missing
    };
  }

  const storedSession = await getStoredSession(input.webSessionId);
  if (!storedSession) {
    return {
      status: ServerSessionResolutionStatus.AuthInvalid
    };
  }

  if (Date.parse(storedSession.refreshExpiresAt) <= Date.now()) {
    await deleteStoredSession(storedSession.sessionId);
    return {
      status: ServerSessionResolutionStatus.AuthInvalid
    };
  }

  const shouldValidateStoredSession =
    !input.accessToken ||
    storedSession.accessToken !== input.accessToken ||
    storedSession.tenantId !== input.tenantId;

  if (shouldValidateStoredSession) {
    const storedValidated = await validateSession(
      storedSession.accessToken,
      storedSession.tenantId,
      buildValidationOptions(options, trace, 'stored')
    );

    if (storedValidated.valid && storedValidated.user) {
      return {
        status: ServerSessionResolutionStatus.Valid,
        accessToken: storedSession.accessToken,
        tenantId: storedValidated.user.tenantId ?? storedSession.tenantId,
        sessionId: storedSession.sessionId,
        user: storedValidated.user
      };
    }

    if (!isValidationInvalid(storedValidated.failureType)) {
      return {
        status: ServerSessionResolutionStatus.TransientFailure,
        accessToken: storedSession.accessToken,
        tenantId: storedSession.tenantId,
        sessionId: storedSession.sessionId
      };
    }
  }

  try {
    const refreshed = await refreshStoredSession(storedSession, options);
    const refreshedUser = normalizeUser(refreshed.user as Record<string, unknown>);
    const nextSession = await createStoredSession({
      sessionId: storedSession.sessionId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tenantId: refreshedUser.tenantId,
      user: refreshed.user as Record<string, unknown>,
      expiresIn: refreshed.expiresIn,
      refreshExpiresIn: refreshed.refreshExpiresIn
    });

    const revalidated = await validateSession(
      nextSession.accessToken,
      nextSession.tenantId,
      buildValidationOptions(options, trace, 'revalidated')
    );

    if (revalidated.valid && revalidated.user) {
      return {
        status: ServerSessionResolutionStatus.Refreshed,
        accessToken: nextSession.accessToken,
        tenantId: revalidated.user.tenantId ?? nextSession.tenantId,
        sessionId: nextSession.sessionId,
        user: revalidated.user
      };
    }

    if (!isValidationInvalid(revalidated.failureType)) {
      return {
        status: ServerSessionResolutionStatus.TransientFailure,
        accessToken: nextSession.accessToken,
        tenantId: nextSession.tenantId,
        sessionId: nextSession.sessionId,
        user: refreshedUser
      };
    }

    await deleteStoredSession(nextSession.sessionId);
    return {
      status: ServerSessionResolutionStatus.AuthInvalid
    };
  } catch (error) {
    const latest = await resolveLatestStoredSession(storedSession, options);
    if (latest) {
      return latest;
    }

    const refreshError = error as RefreshError;
    if (refreshError.kind === ServerSessionResolutionStatus.AuthInvalid) {
      await deleteStoredSession(storedSession.sessionId);
      return {
        status: ServerSessionResolutionStatus.AuthInvalid
      };
    }

    return {
      status: ServerSessionResolutionStatus.TransientFailure,
      accessToken: storedSession.accessToken,
      tenantId: storedSession.tenantId,
      sessionId: storedSession.sessionId
    };
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * No-op hook kept for logout flow compatibility.
 */
export async function invalidateSessionCache(_sessionId: string): Promise<void> {
  return;
}

/**
 * No-op hook kept for testing and compatibility.
 */
export async function clearSessionCache(): Promise<void> {
  return;
}

// ============================================================================
// EXPORTS (for unit testing)
// ============================================================================

export { MAX_RETRY_ATTEMPTS, REQUEST_TIMEOUT_MS };

export type { ValidationErrorType, ValidationError };
