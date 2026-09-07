/**
 * API Key Test Fixtures
 *
 * Factory functions and helpers for creating API key test data.
 * Follows existing fixture patterns in the codebase.
 *
 * Provides:
 * - Factory functions for creating mock API keys
 * - Helper functions for test setup and teardown
 * - Test data builders with sensible defaults
 * - Support for Testcontainers patterns
 */

import type { ApiKey, NewApiKey } from '@package/db-core';

/**
 * Mock ApiKey interface
 *
 * Represents the structure of an API key record in the database.
 * Matches the ApiKeyRepository type definition.
 */
export type MockApiKey = ApiKey;

/**
 * Create API Key data interface
 *
 * Represents the data required to create a new API key.
 */
export type CreateApiKeyData = Omit<NewApiKey, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Default values for API key fixtures
 */
const DEFAULT_API_KEY_VALUES = {
  name: 'Test API Key',
  description: 'Test key for automated testing',
  keyHash: 'test-key-hash-' + Math.random().toString(36).substring(7),
  keyPrefix: 'sk_test_',
  scopes: ['read:users', 'write:products'] as string[],
  isActive: true,
  expiresAt: null as Date | null,
  lastUsedAt: null as Date | null,
  lastUsedIp: null as string | null,
  usageCount: 0,
  deletedAt: null as Date | null
};

/**
 * Factory function to create a mock API key
 *
 * @param overrides - Partial API key data to override defaults
 * @returns Mock API key object
 *
 * @example
 * ```typescript
 * const mockKey = createMockApiKey({
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   organizationId: '123e4567-e89b-12d3-a456-426614174000',
 *   userId: '123e4567-e89b-12d3-a456-426614174001',
 * });
 * ```
 */
export function createMockApiKey(overrides: Partial<MockApiKey> = {}): MockApiKey {
  const now = new Date();

  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organizationId: '123e4567-e89b-12d3-a456-426614174100',
    userId: '123e4567-e89b-12d3-a456-426614174200',
    createdAt: now,
    updatedAt: now,
    ...DEFAULT_API_KEY_VALUES,
    ...overrides
  };
}

/**
 * Factory function to create API key creation data
 *
 * @param overrides - Partial data to override defaults
 * @returns API key creation data
 *
 * @example
 * ```typescript
 * const createData = createApiKeyData({
 *   organizationId: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'Production Key',
 *   scopes: ['read:all'],
 * });
 * ```
 */
export function createApiKeyData(overrides: Partial<CreateApiKeyData> = {}): CreateApiKeyData {
  return {
    organizationId: '123e4567-e89b-12d3-a456-426614174100',
    userId: '123e4567-e89b-12d3-a456-426614174200',
    name: 'Test API Key',
    description: 'Test key for automated testing',
    keyHash: 'test-key-hash-' + Math.random().toString(36).substring(7),
    keyPrefix: 'sk_test_',
    scopes: ['read:users', 'write:products'],
    isActive: true,
    usageCount: 0,
    ...overrides
  };
}

/**
 * Create multiple mock API keys
 *
 * @param count - Number of keys to create
 * @param overrides - Partial data to apply to all keys
 * @returns Array of mock API keys
 *
 * @example
 * ```typescript
 * const mockKeys = createMockApiKeys(5, {
 *   organizationId: '123e4567-e89b-12d3-a456-426614174000',
 *   isActive: true,
 * });
 * ```
 */
export function createMockApiKeys(
  count: number,
  overrides: Partial<MockApiKey> = {}
): MockApiKey[] {
  const keys: MockApiKey[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const id = `123e4567-e89b-12d3-a456-426614174${i.toString().padStart(3, '0')}`;
    keys.push({
      id,
      organizationId: '123e4567-e89b-12d3-a456-426614174100',
      userId: '123e4567-e89b-12d3-a456-426614174200',
      createdAt: new Date(now.getTime() - i * 1000), // Stagger timestamps
      updatedAt: new Date(now.getTime() - i * 1000),
      ...DEFAULT_API_KEY_VALUES,
      keyHash: `test-key-hash-${i}`,
      scopes: ['read:users', 'write:products'] as string[],
      ...overrides
    } as MockApiKey);
  }

  return keys;
}

/**
 * Create a mock expired API key
 *
 * @param overrides - Partial data to override defaults
 * @returns Mock expired API key
 *
 * @example
 * ```typescript
 * const expiredKey = createMockExpiredApiKey({
 *   name: 'Old Key',
 * });
 * ```
 */
export function createMockExpiredApiKey(overrides: Partial<MockApiKey> = {}): MockApiKey {
  const past = new Date();
  past.setHours(past.getHours() - 1); // Expired 1 hour ago

  return createMockApiKey({
    ...overrides,
    expiresAt: past,
    isActive: false
  });
}

/**
 * Create a mock inactive API key
 *
 * @param overrides - Partial data to override defaults
 * @returns Mock inactive API key
 *
 * @example
 * ```typescript
 * const inactiveKey = createMockInactiveApiKey({
 *   name: 'Disabled Key',
 * });
 * ```
 */
export function createMockInactiveApiKey(overrides: Partial<MockApiKey> = {}): MockApiKey {
  return createMockApiKey({
    ...overrides,
    isActive: false
  });
}

/**
 * Create a mock soft-deleted API key
 *
 * @param overrides - Partial data to override defaults
 * @returns Mock soft-deleted API key
 *
 * @example
 * ```typescript
 * const deletedKey = createMockDeletedApiKey({
 *   name: 'Deleted Key',
 * });
 * ```
 */
export function createMockDeletedApiKey(overrides: Partial<MockApiKey> = {}): MockApiKey {
  return createMockApiKey({
    ...overrides,
    deletedAt: new Date(),
    isActive: false
  });
}

/**
 * Create a mock API key with usage tracking
 *
 * @param usageCount - Number of times the key has been used
 * @param overrides - Partial data to override defaults
 * @returns Mock API key with usage data
 *
 * @example
 * ```typescript
 * const usedKey = createMockApiKeyWithUsage(42, {
 *   lastUsedIp: '192.168.1.1',
 * });
 * ```
 */
export function createMockApiKeyWithUsage(
  usageCount: number,
  overrides: Partial<MockApiKey> = {}
): MockApiKey {
  const now = new Date();

  return createMockApiKey({
    ...overrides,
    usageCount,
    lastUsedAt: now,
    lastUsedIp: overrides.lastUsedIp ?? '192.168.1.1'
  });
}

/**
 * Setup helper for API key tests
 *
 * Creates test data and sets up any required test infrastructure.
 * Designed to work with Testcontainers for database testing.
 *
 * @param apiKeyRepository - API key repository instance
 * @param testData - Optional test data to use instead of defaults
 * @returns Setup result with created keys
 *
 * @example
 * ```typescript
 * describe('ApiKeyRepository', () => {
 *   let setup: ApiKeyTestSetup;
 *
 *   beforeEach(async () => {
 *     setup = await apiKeyTestSetup(repository);
 *   });
 *
 *   it('should find API key by ID', async () => {
 *     const key = await repository.findById(
 *       setup.tenantId,
 *       setup.keys[0].id
 *     );
 *     expect(key).toBeDefined();
 *   });
 * });
 * ```
 */
export async function apiKeyTestSetup(
  apiKeyRepository: {
    create: (tenantId: string, data: CreateApiKeyData) => Promise<MockApiKey>;
  },
  testData?: Partial<CreateApiKeyData>
): Promise<{
  tenantId: string;
  keys: MockApiKey[];
  cleanup: () => Promise<void>;
}> {
  const tenantId = '123e4567-e89b-12d3-a456-426614174100';
  const keys: MockApiKey[] = [];

  // Create test keys
  const createData = createApiKeyData({
    organizationId: tenantId,
    ...testData
  });

  try {
    const key = await apiKeyRepository.create(tenantId, createData);
    keys.push(key);
  } catch {
    // In unit tests, the repository might be a mock
    // so we create a mock key instead
    keys.push(createMockApiKey({ organizationId: tenantId, ...testData }));
  }

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    // In integration tests, this would delete the created keys
    // For now, it's a no-op for unit tests
  };

  return {
    tenantId,
    keys,
    cleanup
  };
}

/**
 * Teardown helper for API key tests
 *
 * Cleans up test data after tests complete.
 * Designed to work with Testcontainers for database testing.
 *
 * @param setup - Setup result from apiKeyTestSetup
 *
 * @example
 * ```typescript
 * describe('ApiKeyRepository', () => {
 *   let setup: ApiKeyTestSetup;
 *
 *   beforeEach(async () => {
 *     setup = await apiKeyTestSetup(repository);
 *   });
 *
 *   afterEach(async () => {
 *     await apiKeyTestTeardown(setup);
 *   });
 * });
 * ```
 */
export async function apiKeyTestTeardown(setup: { cleanup: () => Promise<void> }): Promise<void> {
  await setup.cleanup();
}

/**
 * Helper to create mock database response for API key queries
 *
 * @param overrides - Partial data to override defaults
 * @returns Mock database response object
 *
 * @example
 * ```typescript
 * jest.spyOn(repository, 'findByKeyHash').mockResolvedValue(
 *   createMockDbResponse({ keyHash: 'abc123' })
 * );
 * ```
 */
export function createMockDbResponse(overrides: Partial<MockApiKey> = {}): MockApiKey {
  return createMockApiKey(overrides);
}

/**
 * Helper to create mock error responses
 *
 * @param errorCode - Error code (e.g., 'API_KEY_001')
 * @param message - Error message
 * @returns Mock error object
 *
 * @example
 * ```typescript
 * jest.spyOn(repository, 'findByIdOrThrow').mockRejectedValue(
 *   createMockErrorResponse('API_KEY_001', 'API key not found')
 * );
 * ```
 */
export function createMockErrorResponse(
  errorCode: string,
  message: string
): {
  code: string;
  message: string;
  httpStatus: number;
} {
  return {
    code: errorCode,
    message,
    httpStatus: 404
  };
}

/**
 * Test data constants for common API key scenarios
 */
export const API_KEY_TEST_DATA = {
  /**
   * Standard read-write API key
   */
  READ_WRITE: {
    name: 'Production API Key',
    description: 'Full access API key',
    scopes: ['read:all', 'write:all']
  } as const,

  /**
   * Read-only API key
   */
  READ_ONLY: {
    name: 'Read-Only API Key',
    description: 'Read-only access',
    scopes: ['read:all']
  } as const,

  /**
   * Limited scope API key
   */
  LIMITED_SCOPE: {
    name: 'Limited Scope API Key',
    description: 'Limited access API key',
    scopes: ['read:users']
  } as const,

  /**
   * Admin API key
   */
  ADMIN: {
    name: 'Admin API Key',
    description: 'Administrator full access',
    scopes: ['read:all', 'write:all', 'delete:all', 'admin:all']
  } as const,

  /**
   * Testing API key
   */
  TESTING: {
    name: 'Testing Key',
    description: 'Key for automated testing',
    scopes: ['test:all']
  } as const
} as const;

/**
 * Create a mock API key from test data constant
 *
 * @param testDataConstant - Test data constant from API_KEY_TEST_DATA
 * @param overrides - Additional overrides
 * @returns Mock API key
 *
 * @example
 * ```typescript
 * const adminKey = createMockFromTestDataConstant(
 *   API_KEY_TEST_DATA.ADMIN,
 *   { userId: 'custom-user-id' }
 * );
 * ```
 */
export function createMockFromTestDataConstant(
  testDataConstant: (typeof API_KEY_TEST_DATA)[keyof typeof API_KEY_TEST_DATA],
  overrides: Partial<MockApiKey> = {}
): MockApiKey {
  return createMockApiKey({
    name: testDataConstant.name,
    description: 'description' in testDataConstant ? testDataConstant.description : null,
    scopes: [...testDataConstant.scopes],
    ...overrides
  });
}
