/**
 * Security Module Test Fixtures
 *
 * Factory functions and test data builders for security module tests.
 * Follows existing fixture patterns in the codebase.
 *
 * Provides:
 * - Factory functions for creating mock security events
 * - Mock execution context for guard tests
 * - Test data constants for common scenarios
 */

import { SecurityEventType } from '../../events';
import {
  SecurityAction,
  SecuritySeverity,
  type SecurityEvent
} from '../../security-monitoring.service';

import type { ExecutionContext } from '@nestjs/common';

/**
 * Default test tenant and user IDs
 */
export const TEST_TENANT_ID = 'primary-encryption-key';
export const TEST_USER_ID = 'user-456';
export const TEST_TENANT_ID_2 = 'tenant-789';
export const TEST_USER_ID_2 = 'user-012';

/**
 * Create a mock security event
 *
 * @param overrides - Partial event data to override defaults
 * @returns Mock security event object
 *
 * @example
 * ```typescript
 * const event = createMockSecurityEvent({
 *   type: SecurityEventType.AUTH_LOGIN_FAILED,
 *   severity: SecuritySeverity.HIGH,
 * });
 * ```
 */
export function createMockSecurityEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    type: SecurityEventType.AUTH_LOGIN_FAILED,
    severity: SecuritySeverity.MEDIUM,
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    timestamp: new Date(),
    ...overrides
  };
}

/**
 * Create a mock HTTP request object
 *
 * @param userOverrides - Partial user data to override defaults
 * @returns Mock request object with user context
 *
 * @example
 * ```typescript
 * const request = createMockRequest({ tenantId: 'custom-tenant' });
 * ```
 */
export function createMockRequest(
  userOverrides: Partial<{ tenantId?: string; userId?: string }> = {}
): { user?: { tenantId?: string; userId?: string } } {
  return {
    user: {
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      ...userOverrides
    }
  };
}

/**
 * Create a mock NestJS execution context
 *
 * @param request - Mock request object
 * @returns Mock ExecutionContext for guard tests
 *
 * @example
 * ```typescript
 * const ctx = createMockExecutionContext(createMockRequest());
 * const result = await guard.canActivate(ctx);
 * ```
 */
export function createMockExecutionContext(
  request: { user?: { tenantId?: string; userId?: string } } = createMockRequest()
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({})
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http'
  } as unknown as ExecutionContext;
}

/**
 * Create multiple mock security events
 *
 * @param count - Number of events to create
 * @param overrides - Partial data to apply to all events
 * @returns Array of mock security events
 *
 * @example
 * ```typescript
 * // Create 5 auth failure events
 * const events = createMockSecurityEvents(5, {
 *   type: SecurityEventType.AUTH_LOGIN_FAILED,
 * });
 * ```
 */
export function createMockSecurityEvents(
  count: number,
  overrides: Partial<SecurityEvent> = {}
): SecurityEvent[] {
  const events: SecurityEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    events.push(
      createMockSecurityEvent({
        timestamp: new Date(now - i * 1000),
        ...overrides
      })
    );
  }

  return events;
}

/**
 * Security event test data constants
 */
export const SECURITY_EVENT_TEST_DATA = {
  /**
   * Auth login failed event (threshold: 5 in 60s -> LOCKOUT)
   */
  AUTH_FAILURE: {
    type: SecurityEventType.AUTH_LOGIN_FAILED,
    severity: SecuritySeverity.MEDIUM,
    expectedAction: SecurityAction.LOCKOUT,
    threshold: 5,
    windowMs: 60000
  } as const,

  /**
   * Authorization denied event (threshold: 10 in 300s -> ALERT)
   */
  AUTH_DENIED: {
    type: SecurityEventType.AUTH_AUTHORIZATION_DENIED,
    severity: SecuritySeverity.HIGH,
    expectedAction: SecurityAction.ALERT,
    threshold: 10,
    windowMs: 300000
  } as const,

  /**
   * Brute force attempt event (threshold: 3 in 300s -> BLOCK)
   */
  BRUTE_FORCE: {
    type: SecurityEventType.THREAT_BRUTE_FORCE_ATTEMPT_DETECTED,
    severity: SecuritySeverity.CRITICAL,
    expectedAction: SecurityAction.BLOCK,
    threshold: 3,
    windowMs: 300000
  } as const,

  /**
   * Event with no configured threshold
   */
  NO_THRESHOLD: {
    type: SecurityEventType.AUTH_LOGIN_SUCCEEDED,
    severity: SecuritySeverity.LOW
  } as const
} as const;

/**
 * Expected Redis lockout key format
 *
 * @param tenantId - Tenant ID
 * @param userId - User ID
 * @returns Expected Redis key string
 */
export function getLockoutKey(tenantId: string, userId: string): string {
  return `tenant:${tenantId}:security:lockout:${userId}`;
}

/**
 * Default lockout TTL in seconds (15 minutes)
 */
export const DEFAULT_LOCKOUT_TTL = 900;
