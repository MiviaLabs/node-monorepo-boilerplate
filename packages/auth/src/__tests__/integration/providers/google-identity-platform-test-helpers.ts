/**
 * Shared test helpers for Google Identity Platform Auth Provider integration tests
 *
 * Provides test constants, configuration, setup utilities, and emulator user creation.
 */

import { GoogleIdentityPlatformAuthProvider } from '../../../providers/google-identity-platform.provider';

// Skip integration tests if emulator is not available
export const skipIntegrationTests = process.env['FIREBASE_AUTH_EMULATOR_HOST'] === undefined;

// Firebase Auth Emulator host
const EMULATOR_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? 'localhost:9099';

// Test constants
export const TEST_TENANT_A = 'tenant-a-id';
export const TEST_TENANT_B = 'tenant-b-id';

// Base configuration for provider instances
export const BASE_OPTIONS = {
  projectId: 'test-project',
  apiKey: 'test-api-key',
  name: 'integration-test-firebase',
  timeout: 10000
};

// Test user credentials - use DEFAULT_TEST_PASSWORD for all users for consistency
export const DEFAULT_TEST_PASSWORD = 'password123';
export const TEST_USER_EMAIL = 'test@example.com';
export const TEST_USER_PASSWORD = DEFAULT_TEST_PASSWORD;
export const TEST_ADMIN_EMAIL = 'admin@example.com';
export const TEST_ADMIN_PASSWORD = DEFAULT_TEST_PASSWORD;
export const TENANT_A_USER_EMAIL = 'tenant-a-user@example.com';
export const TENANT_B_USER_EMAIL = 'tenant-b-user@example.com';
export const USER_A_EMAIL = 'user-a@example.com';

/**
 * Test user definition for emulator setup
 */
export interface TestUserDefinition {
  email: string;
  password: string;
  displayName?: string;
  tenantId?: string;
}

/**
 * Standard test users needed across test suites
 */
export const STANDARD_TEST_USERS: TestUserDefinition[] = [
  { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD, displayName: 'Test User' },
  { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD, displayName: 'Admin User' },
  { email: TENANT_A_USER_EMAIL, password: DEFAULT_TEST_PASSWORD, displayName: 'Tenant A User' },
  { email: TENANT_B_USER_EMAIL, password: DEFAULT_TEST_PASSWORD, displayName: 'Tenant B User' },
  { email: USER_A_EMAIL, password: DEFAULT_TEST_PASSWORD, displayName: 'User A' }
];

/**
 * Create a test user in the Firebase Auth Emulator
 *
 * Uses the Firebase Auth Emulator REST API to create users for testing.
 * If the user already exists, this function will silently succeed.
 */
export async function createTestUser(user: TestUserDefinition): Promise<void> {
  if (skipIntegrationTests) {
    return;
  }

  const url = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${BASE_OPTIONS.projectId}/accounts`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        displayName: user.displayName ?? user.email.split('@')[0],
        emailVerified: true,
        disabled: false
      })
    });

    // 200 = created, 400 might mean user exists (which is fine)
    if (!response.ok && response.status !== 400) {
      const errorText = await response.text();
      // Only log if it's not a duplicate error
      if (!errorText.includes('EMAIL_EXISTS')) {
        console.warn(`Warning: Could not create test user ${user.email}: ${errorText}`);
      }
    }
  } catch (error) {
    // Silently ignore - emulator might not be running
    console.warn(`Warning: Could not create test user ${user.email}:`, error);
  }
}

/**
 * Create a test user for a specific tenant in the Firebase Auth Emulator
 */
export async function createTestUserForTenant(
  user: TestUserDefinition,
  tenantId: string
): Promise<void> {
  if (skipIntegrationTests) {
    return;
  }

  const url = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${BASE_OPTIONS.projectId}/tenants/${tenantId}/accounts`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        displayName: user.displayName ?? user.email.split('@')[0],
        emailVerified: true,
        disabled: false
      })
    });

    if (!response.ok && response.status !== 400) {
      const errorText = await response.text();
      if (!errorText.includes('EMAIL_EXISTS')) {
        console.warn(
          `Warning: Could not create test user ${user.email} for tenant ${tenantId}: ${errorText}`
        );
      }
    }
  } catch (error) {
    console.warn(
      `Warning: Could not create test user ${user.email} for tenant ${tenantId}:`,
      error
    );
  }
}

/**
 * Setup all standard test users in the emulator
 *
 * Call this in the before() hook of integration tests to ensure
 * all required test users exist before running tests.
 */
export async function setupTestUsers(): Promise<void> {
  if (skipIntegrationTests) {
    return;
  }

  // Create users for the default project (no tenant)
  await Promise.all(STANDARD_TEST_USERS.map((user) => createTestUser(user)));
}

/**
 * Setup test users for a specific tenant
 *
 * Creates users within a tenant context for multi-tenancy testing.
 */
export async function setupTestUsersForTenant(tenantId: string): Promise<void> {
  if (skipIntegrationTests) {
    return;
  }

  await Promise.all(STANDARD_TEST_USERS.map((user) => createTestUserForTenant(user, tenantId)));
}

/**
 * Setup test users for both tenants used in integration tests
 */
export async function setupAllTenantTestUsers(): Promise<void> {
  if (skipIntegrationTests) {
    return;
  }

  await Promise.all([
    setupTestUsers(),
    setupTestUsersForTenant(TEST_TENANT_A),
    setupTestUsersForTenant(TEST_TENANT_B)
  ]);
}

/**
 * Setup Tenant A provider for before-hook usage
 *
 * Centralizes the common before-hook pattern:
 * - Checks skipIntegrationTests (returns null if skipped)
 * - Creates test users for TEST_TENANT_A
 * - Returns a configured provider instance
 *
 * @returns Provider instance or null if integration tests are skipped
 */
export async function setupTenantAProvider(): Promise<GoogleIdentityPlatformAuthProvider | null> {
  if (skipIntegrationTests) {
    return null;
  }
  await setupTestUsersForTenant(TEST_TENANT_A);
  return createProviderForTenant(TEST_TENANT_A);
}

/**
 * Create a provider instance for a specific tenant
 */
export function createProviderForTenant(tenantId: string): GoogleIdentityPlatformAuthProvider {
  return new GoogleIdentityPlatformAuthProvider({
    ...BASE_OPTIONS,
    tenantId
  });
}

/**
 * Create provider instances for multi-tenant testing
 */
export function createTenantProviders(): {
  providerTenantA: GoogleIdentityPlatformAuthProvider;
  providerTenantB: GoogleIdentityPlatformAuthProvider;
} {
  return {
    providerTenantA: createProviderForTenant(TEST_TENANT_A),
    providerTenantB: createProviderForTenant(TEST_TENANT_B)
  };
}

/**
 * Create a provider with custom options
 */
export function createProviderWithOptions(
  options: Partial<typeof BASE_OPTIONS> & { tenantId?: string }
): GoogleIdentityPlatformAuthProvider {
  return new GoogleIdentityPlatformAuthProvider({
    ...BASE_OPTIONS,
    ...options
  });
}

// Re-export the provider class for convenience
export { GoogleIdentityPlatformAuthProvider };
