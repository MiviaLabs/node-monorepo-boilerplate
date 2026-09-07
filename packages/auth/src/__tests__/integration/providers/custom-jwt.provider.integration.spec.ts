/**
 * Integration tests for Custom JWT Auth Provider
 *
 * This file serves as the main entry point for Custom JWT integration tests.
 *
 * Tests have been split into smaller, focused files for maintainability:
 *
 * @see custom-jwt-token-lifecycle.integration.spec.ts - Token generation, validation, expiration, refresh
 * @see custom-jwt-tenant-isolation.integration.spec.ts - Multi-tenant token isolation
 * @see custom-jwt-session-management.integration.spec.ts - Session creation, activity, invalidation
 *
 * Shared test utilities are in:
 * @see custom-jwt-test-helpers.ts - MockCacheService, test constants, setup utilities
 */

// Re-export the test helpers for external use
export {
  MockCacheService,
  TEST_JWT_SECRET,
  TEST_TENANT_A,
  TEST_TENANT_B,
  TEST_USER_ID,
  TEST_USER_ID_2,
  type TokenServiceCacheParam,
  createTokenServiceWithMockCache
} from './custom-jwt-test-helpers';

// Import all split test files to ensure they run
import './custom-jwt-token-lifecycle.integration.spec';
import './custom-jwt-tenant-isolation.integration.spec';
import './custom-jwt-session-management.integration.spec';
